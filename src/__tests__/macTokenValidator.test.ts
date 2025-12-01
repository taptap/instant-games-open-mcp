/**
 * macTokenValidator 单元测试
 */

import {
  isValidMacToken,
  validateMacToken,
  parseMacToken,
  isEmptyMacToken,
} from '../core/utils/macTokenValidator';
import type { MacToken } from '../core/types';

describe('macTokenValidator', () => {
  const validToken: MacToken = {
    kid: 'test-kid-123',
    mac_key: 'test-mac-key-456',
    token_type: 'mac',
    mac_algorithm: 'hmac-sha-1',
  };

  describe('isValidMacToken', () => {
    test('should return true for valid token', () => {
      expect(isValidMacToken(validToken)).toBe(true);
    });

    test('should return false for null', () => {
      expect(isValidMacToken(null)).toBe(false);
    });

    test('should return false for undefined', () => {
      expect(isValidMacToken(undefined)).toBe(false);
    });

    test('should return false for empty object', () => {
      expect(isValidMacToken({})).toBe(false);
    });

    test('should return false when kid is missing', () => {
      expect(
        isValidMacToken({
          mac_key: 'test',
          token_type: 'mac',
          mac_algorithm: 'hmac-sha-1',
        })
      ).toBe(false);
    });

    test('should return false when mac_key is missing', () => {
      expect(
        isValidMacToken({
          kid: 'test',
          token_type: 'mac',
          mac_algorithm: 'hmac-sha-1',
        })
      ).toBe(false);
    });

    test('should return false when kid is empty string', () => {
      expect(
        isValidMacToken({
          kid: '',
          mac_key: 'test',
          token_type: 'mac',
          mac_algorithm: 'hmac-sha-1',
        })
      ).toBe(false);
    });
  });

  describe('validateMacToken', () => {
    test('should not throw for valid token', () => {
      expect(() => validateMacToken(validToken, 'test')).not.toThrow();
    });

    test('should throw for null with descriptive error', () => {
      expect(() => validateMacToken(null, 'test source')).toThrow(
        'Invalid MAC Token from test source: token is null or undefined'
      );
    });

    test('should throw for non-object with descriptive error', () => {
      expect(() => validateMacToken('invalid', 'test source')).toThrow(
        'Invalid MAC Token from test source: token must be an object, got string'
      );
    });

    test('should throw for empty object with field details', () => {
      expect(() => validateMacToken({}, 'test source')).toThrow(
        /Invalid MAC Token from test source:.*kid.*mac_key.*token_type.*mac_algorithm/
      );
    });

    test('should throw when only kid is missing', () => {
      expect(() =>
        validateMacToken(
          {
            mac_key: 'test',
            token_type: 'mac',
            mac_algorithm: 'hmac-sha-1',
          },
          'test'
        )
      ).toThrow(/kid \(string\) is required/);
    });
  });

  describe('parseMacToken', () => {
    test('should parse valid JSON string', () => {
      const jsonStr = JSON.stringify(validToken);
      const result = parseMacToken(jsonStr, 'test');
      expect(result).toEqual(validToken);
    });

    test('should return null for empty string', () => {
      expect(parseMacToken('', 'test')).toBeNull();
    });

    test('should return null for whitespace-only string', () => {
      expect(parseMacToken('   ', 'test')).toBeNull();
    });

    test('should return null for invalid JSON', () => {
      // Suppress stderr during test
      const stderrWrite = process.stderr.write;
      process.stderr.write = jest.fn();

      const result = parseMacToken('invalid json', 'test');
      expect(result).toBeNull();

      process.stderr.write = stderrWrite;
    });

    test('should return null for invalid token structure', () => {
      // Suppress stderr during test
      const stderrWrite = process.stderr.write;
      process.stderr.write = jest.fn();

      const result = parseMacToken('{"invalid": "structure"}', 'test');
      expect(result).toBeNull();

      process.stderr.write = stderrWrite;
    });

    test('should parse token with extra fields', () => {
      const tokenWithExtra = {
        ...validToken,
        extra_field: 'extra_value',
      };
      const jsonStr = JSON.stringify(tokenWithExtra);
      const result = parseMacToken(jsonStr, 'test');
      expect(result).toEqual(tokenWithExtra);
    });
  });

  describe('isEmptyMacToken', () => {
    test('should return true for null', () => {
      expect(isEmptyMacToken(null)).toBe(true);
    });

    test('should return true for undefined', () => {
      expect(isEmptyMacToken(undefined)).toBe(true);
    });

    test('should return true for empty object', () => {
      expect(isEmptyMacToken({})).toBe(true);
    });

    test('should return true when kid is missing', () => {
      expect(
        isEmptyMacToken({
          mac_key: 'test',
          token_type: 'mac',
        })
      ).toBe(true);
    });

    test('should return true when mac_key is missing', () => {
      expect(
        isEmptyMacToken({
          kid: 'test',
          token_type: 'mac',
        })
      ).toBe(true);
    });

    test('should return false for valid token', () => {
      expect(isEmptyMacToken(validToken)).toBe(false);
    });

    test('should return false for partial but usable token', () => {
      expect(
        isEmptyMacToken({
          kid: 'test',
          mac_key: 'test',
        })
      ).toBe(false);
    });
  });
});
