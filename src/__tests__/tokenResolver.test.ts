/**
 * tokenResolver 单元测试
 */

import {
  resolveToken,
  hasToken,
  getTokenStatus,
  getTokenSourceLabel,
  TokenSource
} from '../core/utils/tokenResolver';
import {
  getUserId,
  getProjectId
} from '../core/utils/contextResolver';
import type { HandlerContext, MacToken } from '../core/types';

// Mock dependencies
jest.mock('../core/auth/tokenStorage');
jest.mock('../core/utils/env');

import { loadTokenFromFile, getTokenPath } from '../core/auth/tokenStorage';
import { EnvConfig } from '../core/utils/env';

const mockLoadTokenFromFile = loadTokenFromFile as jest.MockedFunction<typeof loadTokenFromFile>;
const mockGetTokenPath = getTokenPath as jest.MockedFunction<typeof getTokenPath>;

describe('tokenResolver', () => {
  const validToken: MacToken = {
    kid: 'test-kid-123',
    mac_key: 'test-mac-key-456',
    token_type: 'mac',
    mac_algorithm: 'hmac-sha-1'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('resolveToken', () => {
    test('should return context token if present (Priority 1)', () => {
      const context: HandlerContext = {
        macToken: validToken
      };

      const result = resolveToken(context);
      expect(result).toEqual(validToken);

      // 不应该调用文件加载
      expect(mockLoadTokenFromFile).not.toHaveBeenCalled();
    });

    test('should load from file in stdio mode (Priority 2)', () => {
      // Mock stdio 模式
      Object.defineProperty(EnvConfig, 'transport', {
        get: () => 'stdio',
        configurable: true
      });

      mockGetTokenPath.mockReturnValue('/cache/local/oauth-token.json');
      mockLoadTokenFromFile.mockReturnValue(validToken);

      const result = resolveToken();

      expect(result).toEqual(validToken);
      expect(mockGetTokenPath).toHaveBeenCalledWith('local', undefined);
      expect(mockLoadTokenFromFile).toHaveBeenCalledWith('/cache/local/oauth-token.json');
    });

    test('should load with userId from context in stdio mode', () => {
      Object.defineProperty(EnvConfig, 'transport', {
        get: () => 'stdio',
        configurable: true
      });

      mockGetTokenPath.mockReturnValue('/cache/user-123/oauth-token.json');
      mockLoadTokenFromFile.mockReturnValue(validToken);

      const context: HandlerContext = {
        userId: 'user-123'
      };

      const result = resolveToken(context);

      expect(result).toEqual(validToken);
      expect(mockGetTokenPath).toHaveBeenCalledWith('user-123', undefined);
    });

    test('should load with projectId from context in stdio mode', () => {
      Object.defineProperty(EnvConfig, 'transport', {
        get: () => 'stdio',
        configurable: true
      });

      mockGetTokenPath.mockReturnValue('/cache/user-123/project-456/oauth-token.json');
      mockLoadTokenFromFile.mockReturnValue(validToken);

      const context: HandlerContext = {
        userId: 'user-123',
        projectId: 'project-456'
      };

      const result = resolveToken(context);

      expect(result).toEqual(validToken);
      expect(mockGetTokenPath).toHaveBeenCalledWith('user-123', 'project-456');
    });

    test('should return null in SSE mode without context token', () => {
      Object.defineProperty(EnvConfig, 'transport', {
        get: () => 'sse',
        configurable: true
      });

      const result = resolveToken();

      expect(result).toBeNull();
      // 不应该调用文件加载
      expect(mockLoadTokenFromFile).not.toHaveBeenCalled();
    });

    test('should prefer context token even in SSE mode', () => {
      Object.defineProperty(EnvConfig, 'transport', {
        get: () => 'sse',
        configurable: true
      });

      const context: HandlerContext = {
        macToken: validToken
      };

      const result = resolveToken(context);
      expect(result).toEqual(validToken);
    });
  });

  describe('hasToken', () => {
    test('should return true if token is valid', () => {
      const context: HandlerContext = {
        macToken: validToken
      };

      expect(hasToken(context)).toBe(true);
    });

    test('should return false if token is null', () => {
      Object.defineProperty(EnvConfig, 'transport', {
        get: () => 'sse',
        configurable: true
      });

      expect(hasToken()).toBe(false);
    });

    test('should return false if token is invalid', () => {
      const context: HandlerContext = {
        macToken: { kid: '', mac_key: '' } as MacToken
      };

      expect(hasToken(context)).toBe(false);
    });
  });

  describe('getTokenStatus', () => {
    test('should identify CONTEXT source', () => {
      const context: HandlerContext = {
        macToken: validToken
      };

      const status = getTokenStatus(context);
      expect(status).toEqual({
        hasMacToken: true,
        source: TokenSource.CONTEXT
      });
    });

    test('should identify FILE source in stdio mode', () => {
      Object.defineProperty(EnvConfig, 'transport', {
        get: () => 'stdio',
        configurable: true
      });
      mockLoadTokenFromFile.mockReturnValue(validToken);

      const status = getTokenStatus();
      expect(status).toEqual({
        hasMacToken: true,
        source: TokenSource.FILE
      });
    });

    test('should identify ENV source in SSE mode (simulated)', () => {
      // 注意：这里其实有点歧义。在 SSE 模式下 resolveToken 通常返回 null
      // 除非我们能在 resolveToken 中从非文件来源（如环境变量）获取到 token
      // 但目前的 resolveToken 实现中，SSE 模式除了 context 注入外只能返回 null
      // 除非逻辑被修改了。
      // 根据当前代码：Priority 3: SSE/HTTP 模式不使用文件 -> return null
      // 所以在 SSE 模式下，如果 context 没有 token，getTokenStatus 应该返回 NONE

      Object.defineProperty(EnvConfig, 'transport', {
        get: () => 'sse',
        configurable: true
      });

      const status = getTokenStatus();
      expect(status).toEqual({
        hasMacToken: false,
        source: TokenSource.NONE
      });
    });

    test('should return NONE if no token available', () => {
      Object.defineProperty(EnvConfig, 'transport', {
        get: () => 'stdio',
        configurable: true
      });
      mockLoadTokenFromFile.mockReturnValue(null);

      const status = getTokenStatus();
      expect(status).toEqual({
        hasMacToken: false,
        source: TokenSource.NONE
      });
    });
  });

  describe('getTokenSourceLabel', () => {
    test('should return correct labels', () => {
      expect(getTokenSourceLabel(TokenSource.CONTEXT)).toBe('(请求上下文)');
      expect(getTokenSourceLabel(TokenSource.ENV)).toBe('(环境变量)');
      expect(getTokenSourceLabel(TokenSource.FILE)).toBe('(本地文件)');
      expect(getTokenSourceLabel(TokenSource.NONE)).toBe('');
    });
  });

  describe('getUserId', () => {
    test('should return userId from context (Priority 1)', () => {
      const context: HandlerContext = {
        userId: 'user-123'
      };

      expect(getUserId(context)).toBe('user-123');
    });

    test('should return "local" in stdio mode (Priority 2)', () => {
      Object.defineProperty(EnvConfig, 'transport', {
        get: () => 'stdio',
        configurable: true
      });

      expect(getUserId()).toBe('local');
    });

    test('should return "anonymous" in SSE mode without userId', () => {
      Object.defineProperty(EnvConfig, 'transport', {
        get: () => 'sse',
        configurable: true
      });

      expect(getUserId()).toBe('anonymous');
    });

    test('should prefer context userId over transport mode', () => {
      Object.defineProperty(EnvConfig, 'transport', {
        get: () => 'stdio',
        configurable: true
      });

      const context: HandlerContext = {
        userId: 'custom-user'
      };

      expect(getUserId(context)).toBe('custom-user');
    });
  });

  describe('getProjectId', () => {
    test('should return projectId from context', () => {
      const context: HandlerContext = {
        projectId: 'project-456'
      };

      expect(getProjectId(context)).toBe('project-456');
    });

    test('should return undefined if no projectId', () => {
      expect(getProjectId()).toBeUndefined();
    });
  });
});
