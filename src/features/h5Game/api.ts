/**
 * H5 Game API Functions
 * Only H5-specific APIs (upload parameters)
 * All common app management APIs are in app/api.ts
 */

import { HttpClient } from '../../core/network/httpClient.js';
import type { ResolvedContext } from '../../core/types/context.js';

/**
 * Upload parameters for H5 game package
 */
export interface UploadParams {
  h5_package_id: number;
  url: string;
  method: string;
  headers: Record<string, string>;
}

/**
 * 获取 H5 游戏包上传参数
 * This is H5-specific functionality
 */
export async function getH5PackageUploadParams(
  app_id?: number,
  ctx?: ResolvedContext
): Promise<UploadParams> {
  const client = new HttpClient(ctx);
  const params = app_id ? { app_id: app_id.toString() } : undefined;

  return await client.get<UploadParams>('/level/v1/upload', { params });
}

/**
 * Request payload for debug feedback pulling.
 */
export interface GetDebugFeedbacksRequest {
  developer_id: number;
  app_id: number;
  limit?: number;
  status?: number;
  fetch_and_mark_processed?: boolean;
  moment_id?: string; // When provided, returns only the matching feedback
}

/**
 * Single debug feedback item from server.
 */
export interface FeedbackInfo {
  feedback_id: number;
  version_id: number;
  moment_id?: string; // Large ID, returned as string to avoid precision loss
  log_file_urls: string[];
  description: string;
  runtime_version: string;
  screenshots: string[];
  fps: number;
  memory_usage_mb: number;
  device_model: string;
  status: number;
}

/**
 * Response payload for debug feedback list API.
 */
export interface GetDebugFeedbacksResponse {
  list: FeedbackInfo[];
  total: number;
}

/**
 * Quote large-integer literals (>= 16 digits) in raw JSON text so that
 * subsequent JSON.parse keeps them as strings instead of lossy numbers.
 *
 * Why pre-process the raw text:
 *   JSON.parse converts number tokens to JS Number BEFORE reviver runs,
 *   so any value > 2^53-1 is already rounded by the time a reviver sees it.
 *   The only safe interception point is the textual JSON token.
 *
 * Threshold of 16 digits:
 *   Number.MAX_SAFE_INTEGER (9007199254740991) has 16 digits. Any integer with
 *   16+ digits *may* exceed it. We err on the safe side and quote them all;
 *   downstream code that expects an ID can use String() either way.
 *
 * Implementation: a tiny string-state machine that skips JSON string literals
 * (including escapes), so digits inside string values are never touched.
 */
function quoteLargeIntegersInJson(jsonText: string): string {
  let result = '';
  let i = 0;
  let inString = false;
  const len = jsonText.length;

  while (i < len) {
    const ch = jsonText[i];

    if (inString) {
      result += ch;
      if (ch === '\\' && i + 1 < len) {
        // Preserve any escape sequence verbatim (\", \\, \n, \uXXXX, ...)
        result += jsonText[i + 1];
        i += 2;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      i++;
      continue;
    }

    if (ch === '"') {
      inString = true;
      result += ch;
      i++;
      continue;
    }

    // Number-literal start (digit or leading minus followed by digit)
    const isDigit = ch >= '0' && ch <= '9';
    const isNegStart =
      ch === '-' && i + 1 < len && jsonText[i + 1] >= '0' && jsonText[i + 1] <= '9';
    if (isDigit || isNegStart) {
      let j = i;
      if (jsonText[j] === '-') j++;
      while (j < len && jsonText[j] >= '0' && jsonText[j] <= '9') j++;
      const next = jsonText[j];
      // Only quote pure integers (skip floats / scientific notation)
      const isInteger = next !== '.' && next !== 'e' && next !== 'E';
      const numStr = jsonText.substring(i, j);
      const digitCount = numStr.startsWith('-') ? numStr.length - 1 : numStr.length;
      if (isInteger && digitCount >= 16) {
        result += '"' + numStr + '"';
      } else {
        result += numStr;
      }
      i = j;
      continue;
    }

    result += ch;
    i++;
  }

  return result;
}

/**
 * Custom JSON parser used by getDebugFeedbacks: preserves large integer IDs
 * (e.g. moment_id) as strings to avoid IEEE-754 precision loss.
 */
export function parseJsonPreservingLargeInts(text: string): unknown {
  return JSON.parse(quoteLargeIntegersInJson(text));
}

/**
 * Pull debug feedback list from TapTap Open API.
 * Uses a custom JSON parser so that large numeric IDs (e.g. moment_id) keep
 * their full precision when serialized back to feedback.json.
 */
export async function getDebugFeedbacks(
  request: GetDebugFeedbacksRequest,
  ctx?: ResolvedContext
): Promise<GetDebugFeedbacksResponse> {
  const client = new HttpClient(ctx);
  const params: Record<string, string> = {
    developer_id: request.developer_id.toString(),
    app_id: request.app_id.toString(),
  };

  if (request.limit !== undefined) {
    params.limit = request.limit.toString();
  }
  if (request.status !== undefined) {
    params.status = request.status.toString();
  }
  if (request.fetch_and_mark_processed !== undefined) {
    params.fetch_and_mark_processed = request.fetch_and_mark_processed ? 'true' : 'false';
  }
  if (request.moment_id !== undefined && request.moment_id !== '') {
    params.moment_id = request.moment_id;
  }

  return await client.get<GetDebugFeedbacksResponse>('/open/debug/v1/get-debug-feedbacks', {
    params,
    parseJson: parseJsonPreservingLargeInts,
  });
}
