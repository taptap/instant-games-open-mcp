/**
 * CookieJar - 管理 HTTP Cookie 用于会话粘性
 *
 * 用于解决 K8s 多副本部署时的会话路由问题：
 * 1. Ingress 在响应中植入 Cookie（如 MCP_ROUTE=pod-hash）
 * 2. Proxy 在后续请求中携带该 Cookie
 * 3. Ingress 根据 Cookie 将请求路由到同一个 Pod
 */

/**
 * 解析后的 Cookie 结构
 */
interface ParsedCookie {
  name: string;
  value: string;
  expires?: Date;
  maxAge?: number;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

/**
 * Cookie 管理器
 */
export class CookieJar {
  private cookies: Map<string, ParsedCookie> = new Map();
  private verbose: boolean;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  /**
   * 从响应的 Set-Cookie 头中提取并存储 Cookie
   */
  setCookiesFromResponse(response: Response): void {
    // 注意：fetch API 的 response.headers.get('set-cookie') 可能只返回第一个
    // 使用 getSetCookie() 方法获取所有 Set-Cookie 头（Node.js 18+）
    const setCookieHeaders = this.getSetCookieHeaders(response);

    for (const setCookieHeader of setCookieHeaders) {
      const cookie = this.parseSetCookie(setCookieHeader);
      if (cookie) {
        // 检查 Cookie 是否过期
        if (cookie.expires && cookie.expires < new Date()) {
          this.cookies.delete(cookie.name);
          if (this.verbose) {
            console.error(`[CookieJar] Cookie expired and removed: ${cookie.name}`);
          }
        } else {
          this.cookies.set(cookie.name, cookie);
          if (this.verbose) {
            console.error(
              `[CookieJar] Cookie stored: ${cookie.name}=${cookie.value.substring(0, 20)}...`
            );
          }
        }
      }
    }
  }

  /**
   * 获取所有 Set-Cookie 头
   */
  private getSetCookieHeaders(response: Response): string[] {
    const headers = response.headers;

    // Node.js 18+ 支持 getSetCookie() 方法
    if (typeof (headers as any).getSetCookie === 'function') {
      return (headers as any).getSetCookie();
    }

    // 降级方案：使用 get('set-cookie')，但可能只返回第一个
    const setCookie = headers.get('set-cookie');
    if (setCookie) {
      // 尝试按逗号分隔（但这不是完美的解析，因为 Cookie 值可能包含逗号）
      // 更安全的做法是检查是否有日期格式来避免错误分割
      return this.splitSetCookieHeader(setCookie);
    }

    return [];
  }

  /**
   * 分割 Set-Cookie 头（处理多个 Cookie 合并的情况）
   */
  private splitSetCookieHeader(header: string): string[] {
    const cookies: string[] = [];
    let current = '';
    const depth = 0;

    for (let i = 0; i < header.length; i++) {
      const char = header[i];

      if (char === ',' && depth === 0) {
        // 检查是否是日期中的逗号（如 "Expires=Mon, 01 Jan 2024"）
        const remaining = header.substring(i + 1).trim();
        if (/^\d{2}\s/.test(remaining)) {
          // 这是日期中的逗号，继续
          current += char;
          continue;
        }
        // 这是 Cookie 分隔符
        if (current.trim()) {
          cookies.push(current.trim());
        }
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      cookies.push(current.trim());
    }

    return cookies;
  }

  /**
   * 解析 Set-Cookie 头
   */
  private parseSetCookie(setCookieHeader: string): ParsedCookie | null {
    const parts = setCookieHeader.split(';').map((p) => p.trim());
    if (parts.length === 0) return null;

    // 第一部分是 name=value
    const [nameValue, ...attributes] = parts;
    const eqIndex = nameValue.indexOf('=');
    if (eqIndex === -1) return null;

    const name = nameValue.substring(0, eqIndex).trim();
    const value = nameValue.substring(eqIndex + 1).trim();

    if (!name) return null;

    const cookie: ParsedCookie = { name, value };

    // 解析属性
    for (const attr of attributes) {
      const attrLower = attr.toLowerCase();
      const attrEqIndex = attr.indexOf('=');

      if (attrLower.startsWith('expires=')) {
        const dateStr = attr.substring(8);
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          cookie.expires = date;
        }
      } else if (attrLower.startsWith('max-age=')) {
        const maxAge = parseInt(attr.substring(8), 10);
        if (!isNaN(maxAge)) {
          cookie.maxAge = maxAge;
          // 计算过期时间
          cookie.expires = new Date(Date.now() + maxAge * 1000);
        }
      } else if (attrLower.startsWith('domain=')) {
        cookie.domain = attr.substring(7);
      } else if (attrLower.startsWith('path=')) {
        cookie.path = attr.substring(5);
      } else if (attrLower === 'secure') {
        cookie.secure = true;
      } else if (attrLower === 'httponly') {
        cookie.httpOnly = true;
      } else if (attrLower.startsWith('samesite=')) {
        const sameSite = attr.substring(9);
        if (['Strict', 'Lax', 'None'].includes(sameSite)) {
          cookie.sameSite = sameSite as 'Strict' | 'Lax' | 'None';
        }
      }
    }

    return cookie;
  }

  /**
   * 生成 Cookie 请求头值
   */
  getCookieHeader(): string | undefined {
    // 清理过期的 Cookie
    this.cleanExpiredCookies();

    if (this.cookies.size === 0) return undefined;

    const cookieStr = Array.from(this.cookies.values())
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');

    if (this.verbose) {
      console.error(`[CookieJar] Sending cookies: ${cookieStr.substring(0, 50)}...`);
    }

    return cookieStr;
  }

  /**
   * 清理过期的 Cookie
   */
  private cleanExpiredCookies(): void {
    const now = new Date();
    for (const [name, cookie] of this.cookies.entries()) {
      if (cookie.expires && cookie.expires < now) {
        this.cookies.delete(name);
        if (this.verbose) {
          console.error(`[CookieJar] Cookie expired: ${name}`);
        }
      }
    }
  }

  /**
   * 清空所有 Cookie（重连时可能需要）
   */
  clear(): void {
    this.cookies.clear();
    if (this.verbose) {
      console.error('[CookieJar] All cookies cleared');
    }
  }

  /**
   * 获取当前存储的 Cookie 数量
   */
  get size(): number {
    return this.cookies.size;
  }

  /**
   * 检查是否有 Cookie
   */
  get hasCookies(): boolean {
    return this.cookies.size > 0;
  }
}

/**
 * 创建支持 Cookie 的 fetch 包装函数
 *
 * @param cookieJar Cookie 管理器实例
 * @param verbose 是否输出详细日志
 * @returns 包装后的 fetch 函数
 */
export function createCookieFetch(cookieJar: CookieJar): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // 克隆 init 以避免修改原始对象
    const modifiedInit: RequestInit = { ...init };

    // 添加 Cookie 到请求头
    const cookieHeader = cookieJar.getCookieHeader();
    if (cookieHeader) {
      const headers = new Headers(modifiedInit.headers);
      headers.set('Cookie', cookieHeader);
      modifiedInit.headers = headers;
    }

    // 发送请求
    const response = await fetch(input, modifiedInit);

    // 保存响应中的 Cookie
    cookieJar.setCookiesFromResponse(response);

    return response;
  };
}
