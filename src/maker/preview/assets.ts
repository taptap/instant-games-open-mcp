import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream';

export interface PreviewAssetServer {
  url: string;
  close(): Promise<void>;
}

// Only the prepared client manifest and its local files are exposed, never source or credentials.
export async function startPreviewAssetServer(
  source: string,
  signal?: AbortSignal
): Promise<PreviewAssetServer> {
  if (signal?.aborted) throw new Error('CANCELLED');
  const root = fs.realpathSync(path.join(source, 'dist'));
  const files = new Map<string, string>();
  const allow = (relative: string): void => {
    const filename = path.resolve(root, relative);
    if (
      !filename.startsWith(root + path.sep) ||
      fs.realpathSync(filename) !== filename ||
      !fs.statSync(filename).isFile()
    )
      throw new Error('Invalid local preview asset.');
    files.set(relative.split(path.sep).join('/'), filename);
  };
  allow('latest.json');
  const latest = JSON.parse(fs.readFileSync(files.get('latest.json')!, 'utf8'));
  if (
    typeof latest.version !== 'string' ||
    !/^[^/\\]+$/.test(latest.version) ||
    typeof latest.client !== 'string' ||
    !/^[a-f0-9]+$/i.test(latest.client)
  )
    throw new Error('Invalid preview version.');
  const manifestName = latest.version + '/manifest-' + latest.client + '.json';
  allow(manifestName);
  const manifest = JSON.parse(fs.readFileSync(files.get(manifestName)!, 'utf8'));
  if (
    manifest.target !== 'client' ||
    !Array.isArray(manifest.files) ||
    manifest.files.length > 100000
  )
    throw new Error('Invalid preview client manifest.');
  for (const file of manifest.files) {
    if (file.source && file.source !== 'project') continue;
    const name = file.uuid + '-' + file.hash + file.ext;
    if (
      typeof file.uuid !== 'string' ||
      typeof file.hash !== 'string' ||
      typeof file.ext !== 'string' ||
      /[/\\]/.test(name)
    )
      throw new Error('Invalid preview asset name.');
    allow('assets/' + name);
  }
  if (fs.existsSync(path.join(root, 'project.json'))) allow('project.json');

  const prefix = '/' + randomBytes(32).toString('hex') + '/';
  let host = '';
  let closing: Promise<void> | undefined;
  const server = http.createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (
      request.headers.host !== host ||
      request.headers.origin ||
      request.headers['sec-fetch-site']
    ) {
      response.writeHead(403).end();
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const pathname = (request.url || '').split('?')[0];
    const filename = pathname.startsWith(prefix)
      ? files.get(pathname.slice(prefix.length))
      : undefined;
    if (!filename || closing) {
      response.writeHead(404).end();
      return;
    }
    let descriptor: number | undefined;
    try {
      if (fs.realpathSync(filename) !== filename) throw new Error('Asset changed.');
      descriptor = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      const stat = fs.fstatSync(descriptor);
      if (!stat.isFile()) throw new Error('Asset is not a file.');
      let start = 0;
      let end = stat.size - 1;
      if (request.headers.range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range);
        start = match ? Number(match[1]) : NaN;
        end = match?.[2] ? Math.min(Number(match[2]), end) : end;
        if (
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start > end ||
          start < 0
        ) {
          fs.closeSync(descriptor);
          descriptor = undefined;
          response.writeHead(416, { 'Content-Range': 'bytes */' + stat.size }).end();
          return;
        }
        response.statusCode = 206;
        response.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      }
      response.setHeader('Accept-Ranges', 'bytes');
      response.setHeader('Content-Length', Math.max(0, end - start + 1));
      response.setHeader(
        'Content-Type',
        filename.endsWith('.json') ? 'application/json' : 'application/octet-stream'
      );
      if (request.method === 'HEAD' || stat.size === 0) {
        fs.closeSync(descriptor);
        descriptor = undefined;
        response.end();
      } else {
        const stream = fs.createReadStream(filename, {
          fd: descriptor,
          autoClose: true,
          start,
          end,
        });
        descriptor = undefined;
        pipeline(stream, response, () => {});
      }
    } catch {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      if (!response.headersSent) response.writeHead(404).end();
      else response.destroy();
    }
  });
  server.maxConnections = 32;
  server.requestTimeout = 10000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 1000;
  server.setTimeout(30000, (socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Preview assets did not start.');
  host = '127.0.0.1:' + address.port;
  const close = (): Promise<void> => {
    if (!closing) {
      signal?.removeEventListener('abort', onAbort);
      closing = new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    }
    return closing;
  };
  const onAbort = (): void => {
    void close();
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) {
    await close();
    throw new Error('CANCELLED');
  }
  return { url: 'http://' + host + prefix, close };
}
