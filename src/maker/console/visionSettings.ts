import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getMakerHome } from '../storage.js';
import { writePrivateJson } from '../system/privateJson.js';
import { ConsoleError } from './types.js';

export const UI_VISION_MODEL = 'gpt-6.1-sol';
export const UI_VISION_BASE_URL = 'https://api.openai.com/v1';
export const UI_VISION_ENDPOINT = UI_VISION_BASE_URL + '/chat/completions';
export type VisionSource = 'local' | 'server' | 'custom' | 'chatgpt-web';
export interface VisionSettings {
  source: VisionSource;
  baseUrl?: string;
  apiKey?: string;
  endpoint?: string;
  model?: string;
}
export function validateVisionSource(value: unknown): VisionSource {
  if (value === 'local' || value === 'server' || value === 'custom' || value === 'chatgpt-web')
    return value;
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
    if (input.version === 2) {
      const settings = readModelSettings();
      if (!settings.visionConfigured) return undefined;
      const profile = settings.profiles.find((item) => item.id === settings.vision.profileId);
      return {
        source: settings.vision.source,
        ...(profile
          ? { baseUrl: profile.baseUrl, apiKey: profile.apiKey, model: profile.model }
          : {}),
      };
    }
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
  const shared = readModelSettingsForLegacySave(input);
  shared.vision.source = settings.source;
  shared.visionConfigured = true;
  if (settings.baseUrl && settings.apiKey) {
    const id = shared.vision.profileId || randomUUID();
    const old = shared.profiles.find((profile) => profile.id === id);
    const profile = {
      id,
      name: old?.name || '识图 API',
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: old?.model || UI_VISION_MODEL,
    };
    shared.profiles = shared.profiles.filter((item) => item.id !== id).concat(profile);
    shared.vision.profileId = id;
  }
  writePrivateJson(filename(), shared);
  return visionSettingsForDisplay();
}
export function deleteVisionSettings() {
  const file = filename();
  if (fs.existsSync(file) && !fs.lstatSync(file).isFile())
    throw new ConsoleError('识图设置文件无效。');
  const settings = readModelSettings();
  settings.vision = { source: 'local' };
  settings.visionConfigured = false;
  writePrivateJson(file, settings);
  return visionSettingsForDisplay();
}

export interface ApiProfile {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}
export interface ModelSettings {
  version: 2;
  visionConfigured: boolean;
  vision: { source: VisionSource; profileId?: string };
  generation: { source: 'maker' | 'local' | 'custom'; profileId?: string };
  profiles: ApiProfile[];
}
function emptyModelSettings(): ModelSettings {
  return {
    version: 2,
    visionConfigured: false,
    vision: { source: 'local' },
    generation: { source: 'maker' },
    profiles: [],
  };
}
function profileText(value: unknown, label: string, limit: number): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > limit ||
    Array.from(value).some((character) => character.charCodeAt(0) < 32)
  )
    throw new ConsoleError(label + ' 无效：请填写有效内容，且不能包含换行。');
  return value.trim();
}
export function readModelSettings(): ModelSettings {
  if (!fs.existsSync(filename())) return emptyModelSettings();
  try {
    if (!fs.lstatSync(filename()).isFile()) throw new Error();
    const input = JSON.parse(fs.readFileSync(filename(), 'utf8'));
    if (input.version !== 2) {
      const legacy = validateSettings(input);
      const settings = emptyModelSettings();
      settings.vision = { source: legacy.source };
      settings.visionConfigured = true;
      if (legacy.apiKey && legacy.baseUrl) {
        settings.profiles.push({
          id: 'legacy-vision',
          name: '识图 API',
          baseUrl: legacy.baseUrl,
          apiKey: legacy.apiKey,
          model: UI_VISION_MODEL,
        });
        settings.vision.profileId = 'legacy-vision';
      }
      return settings;
    }
    if (!Array.isArray(input.profiles) || input.profiles.length > 50) throw new Error();
    const profiles: ApiProfile[] = input.profiles.map((profile: ApiProfile) => ({
      id: profileText(profile.id, '配置 ID', 80),
      name: profileText(profile.name, '名称', 80),
      baseUrl: validateVisionBaseUrl(profile.baseUrl),
      apiKey: profileText(profile.apiKey, 'API Key', 4096),
      model: profileText(profile.model, '模型名称', 120),
    }));
    if (new Set(profiles.map((profile) => profile.id)).size !== profiles.length) throw new Error();
    validateVisionSource(input.vision?.source);
    if (!['maker', 'local', 'custom'].includes(input.generation?.source)) throw new Error();
    for (const choice of [input.vision, input.generation]) {
      if (
        (choice.profileId !== undefined || choice.source === 'custom') &&
        !profiles.some((profile) => profile.id === choice.profileId)
      )
        throw new Error();
    }
    return {
      version: 2,
      visionConfigured: input.visionConfigured === true,
      vision: input.vision,
      generation: input.generation,
      profiles,
    };
  } catch {
    throw new ConsoleError('本机模型设置无法读取，请检查设置文件；不会覆盖已有 API 配置。');
  }
}
function readModelSettingsForLegacySave(input: Record<string, unknown>): ModelSettings {
  try {
    return readModelSettings();
  } catch (error) {
    if (!input.apiKey) throw error;
    const raw = fs.readFileSync(filename(), 'utf8');
    if (raw.includes('"version"')) throw error;
    return emptyModelSettings();
  }
}
export function modelSettingsForDisplay() {
  const settings = readModelSettings();
  return {
    vision: settings.vision,
    generation: settings.generation,
    profiles: settings.profiles.map(({ id, name, baseUrl, model }) => ({
      id,
      name,
      baseUrl,
      model,
      hasKey: true,
    })),
  };
}
export function generationProvider() {
  const settings = readModelSettings();
  return {
    ...settings.generation,
    profile: settings.profiles.find((profile) => profile.id === settings.generation.profileId),
  };
}
export function updateModelSettings(input: Record<string, unknown>) {
  const settings = readModelSettings();
  if (input.action === 'save-profile') {
    const id = input.id === undefined ? randomUUID() : profileText(input.id, '配置 ID', 80);
    const previous = settings.profiles.find((profile) => profile.id === id);
    if (input.id !== undefined && !previous)
      throw new ConsoleError('API 配置已不存在，请刷新后重试。');
    const baseUrl = validateVisionBaseUrl(input.baseUrl);
    if (previous && previous.baseUrl !== baseUrl && !input.apiKey)
      throw new ConsoleError('修改接口地址时必须重新填写 API Key，避免把已有密钥发送到另一服务。');
    const profile: ApiProfile = {
      id,
      baseUrl,
      name: profileText(input.name, '名称', 80),
      model: profileText(input.model, '模型名称', 120),
      apiKey: profileText(input.apiKey || previous?.apiKey, 'API Key', 4096),
    };
    if (settings.profiles.some((item) => item.id !== id && item.name === profile.name))
      throw new ConsoleError('配置名称已存在，请换一个名称。');
    if (!previous && settings.profiles.length >= 50)
      throw new ConsoleError('最多保存 50 个 API 配置，请先删除不再使用的配置。');
    settings.profiles = settings.profiles.filter((item) => item.id !== id).concat(profile);
  } else if (input.action === 'delete-profile') {
    if (
      [settings.vision, settings.generation].some(
        (choice) => choice.source === 'custom' && choice.profileId === input.id
      )
    )
      throw new ConsoleError('该 API 正在使用，请先切换识图或生图方式再删除。');
    if (!settings.profiles.some((profile) => profile.id === input.id))
      throw new ConsoleError('API 配置不存在。');
    settings.profiles = settings.profiles.filter((profile) => profile.id !== input.id);
    for (const choice of [settings.vision, settings.generation])
      if (choice.profileId === input.id) delete choice.profileId;
  } else if (input.action === 'select') {
    if (input.kind !== 'vision' && input.kind !== 'generation')
      throw new ConsoleError('模型用途无效。');
    const allowed =
      input.kind === 'vision'
        ? ['local', 'server', 'custom', 'chatgpt-web']
        : ['maker', 'local', 'custom'];
    if (!allowed.includes(String(input.source))) throw new ConsoleError('模型来源无效。');
    const choice = settings[input.kind];
    if (input.source === 'custom') {
      if (!settings.profiles.some((profile) => profile.id === input.profileId))
        throw new ConsoleError('请选择已保存的 API，或先新增配置。');
      choice.profileId = String(input.profileId);
    }
    choice.source = input.source as typeof choice.source;
    if (input.kind === 'vision') settings.visionConfigured = true;
  } else throw new ConsoleError('设置操作无效。');
  writePrivateJson(filename(), settings);
  return modelSettingsForDisplay();
}
