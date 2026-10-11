import fs from 'node:fs';
import path from 'node:path';
import { getMakerHome } from '../storage.js';
import { writePrivateJson } from '../system/privateJson.js';
import { ConsoleError } from './types.js';

export const UI_VISION_MODEL = 'gpt-6.1-sol';
export const UI_VISION_BASE_URL = 'https://api.openai.com/v1';
export const UI_VISION_ENDPOINT = UI_VISION_BASE_URL + '/chat/completions';
export type VisionSource = 'local' | 'server' | 'custom';
export interface VisionSettings {
  source: VisionSource;
  baseUrl?: string;
  apiKey?: string;
  endpoint?: string;
}
export function validateVisionSource(value: unknown): VisionSource {
  if (value === 'local' || value === 'server' || value === 'custom') return value;
  throw new ConsoleError('识图来源无效。');
}
function validateUrl(value: unknown): URL {
  let url: URL;
  try {
    if (typeof value !== 'string') throw new Error();
    url = new URL(value);
  } catch {
    throw new ConsoleError(
      'Base URL 无效：请输入完整的 HTTPS 地址，例如 https://api.openai.com/v1。'
    );
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))
  )
    throw new ConsoleError(
      'Base URL 无效：只能使用 HTTPS（本机调试可用 HTTP），不能含用户名、密码、查询参数或片段。'
    );
  return url;
}
export function validateVisionBaseUrl(value: unknown): string {
  const url = validateUrl(value);
  let pathname = url.pathname.replace(/\/+$/, '');
  if (pathname.endsWith('/chat/completions'))
    pathname = pathname.slice(0, -'/chat/completions'.length);
  return url.origin + (pathname || '/');
}
export function validateVisionEndpoint(value: unknown): string {
  return validateVisionBaseUrl(value).replace(/\/+$/, '') + '/chat/completions';
}
export function visionChatCompletionsUrl(baseUrl: string): string {
  return validateVisionEndpoint(baseUrl);
}
function filename() {
  return path.join(getMakerHome(), 'ui-vision.json');
}
export function readVisionSettings(): VisionSettings | undefined {
  const file = filename();
  if (!fs.existsSync(file)) return undefined;
  try {
    if (!fs.lstatSync(file).isFile()) throw new Error();
    const input = JSON.parse(fs.readFileSync(file, 'utf8'));
    return validateSettings(input);
  } catch {
    throw new ConsoleError('本机识图设置无法读取，请在控制台设置中重新保存。');
  }
}
function validateSettings(input: Partial<VisionSettings>): VisionSettings {
  if (!input || typeof input !== 'object') throw new ConsoleError('识图设置无效。');
  const hasLegacyApi = typeof input.apiKey === 'string' || typeof input.endpoint === 'string';
  const source =
    input.source === undefined
      ? hasLegacyApi
        ? 'custom'
        : 'local'
      : validateVisionSource(input.source);
  if (source !== 'custom') {
    const storedBaseUrl = input.baseUrl || input.endpoint;
    const storedApiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
    if (storedBaseUrl === undefined && input.apiKey === undefined) return { source };
    if (storedBaseUrl !== undefined && typeof storedBaseUrl !== 'string')
      throw new ConsoleError('本机识图设置中的 Base URL 无效。');
    if (
      (input.apiKey !== undefined && !storedApiKey) ||
      storedApiKey.length > 4096 ||
      /[\r\n]/.test(String(input.apiKey || ''))
    )
      throw new ConsoleError('本机识图设置中的 API Key 无效。');
    return {
      source,
      ...(storedBaseUrl ? { baseUrl: validateVisionBaseUrl(storedBaseUrl) } : {}),
      ...(storedApiKey ? { apiKey: storedApiKey } : {}),
    };
  }
  const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
  if (
    typeof input.apiKey !== 'string' ||
    !apiKey ||
    input.apiKey.length > 4096 ||
    /[\r\n]/.test(input.apiKey)
  )
    throw new ConsoleError('API Key 无效：请填写 API Key，且不能包含换行。');
  const baseUrl = input.baseUrl || input.endpoint;
  if (typeof baseUrl !== 'string') throw new ConsoleError('请填写有效的 Base URL。');
  return {
    source,
    baseUrl: validateVisionBaseUrl(baseUrl),
    apiKey,
  };
}
export function visionSettingsForDisplay() {
  let settings: VisionSettings | undefined;
  let error: string | undefined;
  try {
    settings = readVisionSettings();
  } catch {
    error = '本机识图设置无效，请重新填写接口和 API Key 后保存。';
  }
  return {
    source: settings?.source || 'local',
    baseUrl: settings?.baseUrl || UI_VISION_BASE_URL,
    configured: Boolean(settings),
    ...(error ? { error } : {}),
  };
}
export function saveVisionSettings(input: Record<string, unknown>) {
  if (fs.existsSync(filename()) && !fs.lstatSync(filename()).isFile())
    throw new ConsoleError('识图设置文件不能是符号链接或目录。');
  let previous: VisionSettings | undefined;
  try {
    previous = readVisionSettings();
  } catch (error) {
    if (!input.apiKey) throw error;
  }
  const source =
    input.source === undefined || input.source === ''
      ? previous?.source || 'custom'
      : validateVisionSource(input.source);
  const settings =
    source === 'custom'
      ? validateSettings({
          source,
          baseUrl: (input.baseUrl || input.endpoint) as string,
          apiKey:
            input.apiKey === '' || input.apiKey === undefined
              ? previous?.apiKey || ''
              : (input.apiKey as string),
        })
      : {
          source,
          ...(previous?.baseUrl ? { baseUrl: previous.baseUrl } : {}),
          ...(previous?.apiKey ? { apiKey: previous.apiKey } : {}),
        };
  if (
    settings.source === 'custom' &&
    previous &&
    previous.baseUrl !== settings.baseUrl &&
    !input.apiKey
  )
    throw new ConsoleError('修改接口地址时必须重新填写 API Key，避免把已有密钥发送到另一服务。');
  writePrivateJson(filename(), settings);
  return visionSettingsForDisplay();
}
export function deleteVisionSettings() {
  const file = filename();
  if (fs.existsSync(file) && !fs.lstatSync(file).isFile())
    throw new ConsoleError('识图设置文件无效。');
  fs.rmSync(file, { force: true });
  return visionSettingsForDisplay();
}
