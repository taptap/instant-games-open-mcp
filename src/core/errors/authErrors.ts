/**
 * 统一的认证错误处理模块
 * 集中管理所有认证相关的错误类型和用户引导文案
 */

/**
 * 认证错误类型枚举
 */
export type AuthErrorCode =
  | 'TOKEN_EXPIRED' // Token已过期
  | 'TOKEN_MISSING' // 缺少Token
  | 'TOKEN_INVALID' // Token格式无效
  | 'TOKEN_REVOKED' // Token被撤销
  | 'UNAUTHORIZED' // 未授权访问
  | 'AUTH_IN_PROGRESS' // 授权进行中
  | 'NETWORK_ERROR' // 网络错误
  | 'CONFIG_ERROR'; // 配置错误

/**
 * 统一的认证错误类
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: AuthErrorCode,
    public readonly userGuidance?: string
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * 生成统一的OAuth授权引导文案
 * 所有传输模式使用相同的指导流程
 */
export function generateOAuthGuidance(authUrl?: string): string {
  const urlText = authUrl || '[授权链接将在下一步提供]';

  return `🔐 需要 TapTap 授权

请按以下步骤操作：

1️⃣ 打开授权链接：
   ${urlText}

2️⃣ 使用 TapTap App 扫描二维码完成授权

3️⃣ 授权成功后，调用 complete_oauth_authorization 工具完成认证

💡 提示：如果授权链接过期，请重新调用任意需要授权的工具获取新链接`;
}

/**
 * 根据错误类型生成用户指导
 */
export function generateAuthGuidance(
  errorCode: AuthErrorCode,
  context?: {
    authUrl?: string;
    retryAvailable?: boolean;
  }
): string {
  const { authUrl, retryAvailable = true } = context || {};

  switch (errorCode) {
    case 'TOKEN_EXPIRED':
      return `🔐 授权已失效

您的 MAC Token 已过期或无效。

📋 解决方案：
${retryAvailable ? '1. 调用 clear_auth_data 工具清除过期的认证数据\n2. 调用需要认证的工具会自动触发新的授权流程\n3. 使用 TapTap App 扫码重新授权' : '请重新进行OAuth授权流程'}

💡 提示：如果使用的是环境变量中的 Token，请更新 TAPTAP_MCP_MAC_TOKEN 环境变量并重启服务器。`;

    case 'TOKEN_MISSING':
      return `🔐 缺少认证信息

当前没有有效的 TapTap 认证信息。

${generateOAuthGuidance(authUrl)}`;

    case 'TOKEN_INVALID':
      return `🔐 认证信息无效

提供的 MAC Token 格式不正确或已损坏。

📋 解决方案：
1. 检查 TAPTAP_MCP_MAC_TOKEN 环境变量的格式
2. 清除现有认证数据：clear_auth_data
3. 重新进行OAuth授权`;

    case 'TOKEN_REVOKED':
      return `🔐 认证被撤销

您的 TapTap 授权已被撤销或账号权限变更。

📋 解决方案：
1. 重新进行OAuth授权流程
2. 检查开发者账号权限设置
3. 联系TapTap支持确认账号状态`;

    case 'UNAUTHORIZED':
      return `🔐 权限不足

当前操作需要更高的权限。

📋 解决方案：
1. 确认已使用正确的开发者账号授权
2. 检查应用权限设置
3. 联系TapTap支持申请相应权限`;

    case 'AUTH_IN_PROGRESS':
      return `⏳ OAuth 授权正在进行中...

另一个工具正在等待授权，请完成授权后重试。

💡 提示：如果长时间未完成，可以调用 clear_auth_data 重置授权状态`;

    case 'NETWORK_ERROR':
      return `🌐 网络连接问题

无法连接到 TapTap 认证服务器。

📋 解决方案：
1. 检查网络连接
2. 确认防火墙设置
3. 稍后重试操作
4. 联系网络管理员`;

    case 'CONFIG_ERROR':
      return `⚙️ 配置错误

缺少必要的认证配置信息。

📋 解决方案：
1. 检查 TAPTAP_MCP_CLIENT_ID 环境变量
2. 确认 TAPTAP_MCP_CLIENT_SECRET 已正确配置
3. 参考文档重新配置环境变量`;

    default:
      return `❌ 认证错误：${errorCode}`;
  }
}

/**
 * 创建认证错误的工厂函数
 */
export function createAuthError(
  code: AuthErrorCode,
  message?: string,
  context?: {
    authUrl?: string;
    retryAvailable?: boolean;
  }
): AuthError {
  const userGuidance = generateAuthGuidance(code, context);
  const errorMessage = message || `认证错误: ${code}`;

  return new AuthError(errorMessage, code, userGuidance);
}

/**
 * 判断错误是否为认证相关错误
 */
export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}

/**
 * 从HTTP响应中提取认证错误
 */
export function extractAuthErrorFromResponse(
  response: Response,
  responseData?: any,
  responseText?: string
): AuthError | null {
  // 检查 text/plain 格式的 RBAC 错误
  if ((response.status === 403 || response.status === 401) && responseText) {
    if (responseText.includes('access denied') || responseText.includes('RBAC')) {
      return createAuthError('UNAUTHORIZED');
    }
  }

  if (response.status === 401) {
    return createAuthError('TOKEN_EXPIRED');
  }

  if (response.status === 403) {
    return createAuthError('UNAUTHORIZED');
  }

  if (responseData?.data?.error === 'access_denied' || responseData?.error === 'access_denied') {
    return createAuthError('TOKEN_REVOKED');
  }

  return null;
}
