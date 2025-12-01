/**
 * OAuth 全局状态管理
 * 用于在 server.ts 和 handlers 之间共享 OAuth 状态
 */

/**
 * OAuth 待完成状态
 */
interface PendingOAuthState {
  deviceCode: string;
  environment: string;
}

/**
 * 全局 OAuth 状态
 */
class OAuthStateManager {
  private pendingState: PendingOAuthState | null = null;
  private authInProgress: boolean = false;

  /**
   * 设置待完成的 OAuth 状态
   */
  setPendingState(state: PendingOAuthState | null): void {
    this.pendingState = state;
  }

  /**
   * 获取待完成的 OAuth 状态
   */
  getPendingState(): PendingOAuthState | null {
    return this.pendingState;
  }

  /**
   * 清除待完成的 OAuth 状态
   */
  clearPendingState(): void {
    this.pendingState = null;
  }

  /**
   * 设置授权进行中标志
   */
  setAuthInProgress(inProgress: boolean): void {
    this.authInProgress = inProgress;
  }

  /**
   * 检查是否有授权正在进行
   */
  isAuthInProgress(): boolean {
    return this.authInProgress;
  }
}

// 导出单例
export const oauthState = new OAuthStateManager();
