/**
 * tokenResolver 单元测试
 */

import {
  resolveToken,
  hasToken,
  getUserId,
  getProjectId
} from '../core/utils/tokenResolver';
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
