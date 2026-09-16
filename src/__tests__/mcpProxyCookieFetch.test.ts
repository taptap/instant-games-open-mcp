import { CookieJar, createCookieFetch } from '../mcp-proxy/cookieJar.js';

describe('MCP proxy cookie fetch', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('reports standalone SSE GET as unsupported without opening a network request', async () => {
    const upstreamFetch = jest.fn<Promise<Response>, Parameters<typeof fetch>>(() =>
      Promise.resolve(new Response(null, { status: 200 }))
    );
    global.fetch = upstreamFetch as typeof fetch;
    const cookieFetch = createCookieFetch(new CookieJar(), { rejectStandaloneSse: true });

    const response = await cookieFetch('https://maker.example.test/mcp', {
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
    });

    expect(response.status).toBe(405);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  test('keeps standalone SSE enabled unless the proxy explicitly disables it', async () => {
    const upstreamFetch = jest.fn<Promise<Response>, Parameters<typeof fetch>>(() =>
      Promise.resolve(new Response(null, { status: 200 }))
    );
    global.fetch = upstreamFetch as typeof fetch;
    const cookieFetch = createCookieFetch(new CookieJar());

    const response = await cookieFetch('https://mcp.example.test', {
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
    });

    expect(response.status).toBe(200);
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
  });

  test('continues forwarding POST requests with sticky session cookies', async () => {
    const cookieJar = new CookieJar();
    cookieJar.setCookiesFromResponse(
      new Response(null, { headers: { 'Set-Cookie': 'MCP_ROUTE=pod-a; Path=/' } })
    );
    const upstreamFetch = jest.fn<Promise<Response>, Parameters<typeof fetch>>(() =>
      Promise.resolve(new Response(null, { status: 202 }))
    );
    global.fetch = upstreamFetch as typeof fetch;
    const cookieFetch = createCookieFetch(cookieJar, { rejectStandaloneSse: true });

    const response = await cookieFetch('https://maker.example.test/mcp', {
      method: 'POST',
      headers: { Accept: 'application/json, text/event-stream' },
      body: '{}',
    });

    expect(response.status).toBe(202);
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
    const requestInit = upstreamFetch.mock.calls[0][1];
    expect(new Headers(requestInit?.headers).get('cookie')).toBe('MCP_ROUTE=pod-a');
  });
});
