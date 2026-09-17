/**
 * Same-origin gDEV fortune embed helper.
 * Proxies the public GitHub Pages site so the console iframe can report content height.
 */
export const FORTUNE_EMBED_PREFIX = '/gdev-fortune/';
export const FORTUNE_UPSTREAM_ORIGIN = 'https://liangdong-ttm.github.io';
const FORTUNE_MAX_BYTES = 512 * 1024;

export const FORTUNE_SIZE_SCRIPT = `(function(){
function measure(){
  var root=document.querySelector('main.container')||document.body;
  return Math.max(root.scrollHeight||0,root.offsetHeight||0,document.documentElement.scrollHeight||0);
}
function report(){
  var height=Math.ceil(measure());
  if(height>0&&parent!==window) parent.postMessage({type:'gdev-fortune:size',height:height},location.origin);
}
window.addEventListener('load',report);
document.addEventListener('DOMContentLoaded',report);
if(typeof ResizeObserver==='function') new ResizeObserver(report).observe(document.querySelector('main.container')||document.body);
})();`;

export function fortuneEmbedCsp(): string {
  return [
    "default-src 'none'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

export function fortuneUpstreamUrl(pathname: string, search = ''): URL {
  if (
    !pathname.startsWith(FORTUNE_EMBED_PREFIX) ||
    pathname.includes('..') ||
    pathname.includes('\\')
  ) {
    throw new Error('Invalid fortune embed path.');
  }
  const target = new URL(pathname + search, FORTUNE_UPSTREAM_ORIGIN);
  if (
    target.origin !== FORTUNE_UPSTREAM_ORIGIN ||
    !target.pathname.startsWith(FORTUNE_EMBED_PREFIX)
  ) {
    throw new Error('Fortune embed path escaped the upstream site.');
  }
  return target;
}

export function rewriteFortuneHtml(html: string): string {
  const script = `<script>${FORTUNE_SIZE_SCRIPT}</script>`;
  return html.includes('</body>') ? html.replace('</body>', `${script}</body>`) : html + script;
}

export function fortuneResponseTooLarge(bytes: number): boolean {
  return bytes > FORTUNE_MAX_BYTES;
}
