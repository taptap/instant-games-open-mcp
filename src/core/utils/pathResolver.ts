/**
 * 统一路径解析器
 *
 * 所有与目录相关的工具都应该使用这个解析器来处理路径
 *
 * 路径解析优先级：
 * 1. 有 Proxy:
 *    - _project_path 为绝对路径: _project_path + relativePath
 *    - _project_path 为相对路径: WORKSPACE_ROOT + _project_path + relativePath
 * 2. 无 Proxy: WORKSPACE_ROOT + relativePath
 * 3. 本地开发: process.cwd() + relativePath
 *
 * 错误信息策略：
 * - Proxy 模式：只显示 Agent 传入的路径，不暴露内部结构
 * - 本地模式：显示完整解析路径，方便调试
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import type { ResolvedContext } from '../types/context.js';
import { logger } from './logger.js';
import { EnvConfig } from './env.js';

/**
 * 工作空间根路径
 * 优先级：TAPTAP_MCP_WORKSPACE_ROOT > WORKSPACE_ROOT（向后兼容）> process.cwd()
 *
 * 注意：使用 EnvConfig.workspaceRoot 来支持新旧环境变量名的兼容
 */
const WORKSPACE_ROOT = EnvConfig.workspaceRoot;

/**
 * 计算基础路径（兼容 projectPath 绝对/相对两种模式）
 *
 * - 绝对 projectPath: 直接作为 basePath（避免重复拼接 WORKSPACE_ROOT）
 * - 相对 projectPath: 视为相对于 WORKSPACE_ROOT
 */
function resolveBasePath(ctx?: ResolvedContext): string {
  if (!ctx?.projectPath) {
    return WORKSPACE_ROOT;
  }

  const normalizedProjectPath = path.normalize(ctx.projectPath);
  if (path.isAbsolute(normalizedProjectPath)) {
    return normalizedProjectPath;
  }

  return path.join(WORKSPACE_ROOT, normalizedProjectPath);
}

/**
 * 路径输入类型
 */
export type PathInputType = 'absolute' | 'relative' | 'empty';

/**
 * 路径解析错误类型（通用，不包含业务逻辑）
 */
export type PathErrorType =
  | 'ABSOLUTE_PATH_IN_PROXY' // Proxy 模式下传了绝对路径
  | 'PATH_NOT_EXISTS' // 路径不存在
  | 'EMPTY_PATH'; // 空路径

/**
 * 路径解析错误信息
 */
export interface PathResolutionError {
  type: PathErrorType;
  userMessage: string; // 给 Agent 看的消息（不暴露内部结构）
}

/**
 * 路径解析结果（通用）
 */
export interface PathResolutionResult {
  success: boolean;
  resolvedPath?: string; // 解析后的完整路径
  inputPath: string; // 用户输入的原始路径
  inputType: PathInputType; // 输入类型
  isProxyMode: boolean; // 是否为 Proxy 模式
  error?: PathResolutionError; // 失败时的错误信息
}

/**
 * 通用路径错误消息模板
 * 设计原则：只告诉 Agent 它能控制的信息，引导正确行为
 * 注意：不包含业务特定的错误消息（如 index.html 检查）
 */
export const PATH_ERRORS = {
  ABSOLUTE_PATH_REJECTED: (inputPath: string) =>
    `❌ 参数错误：路径不接受绝对路径

您传入了："${inputPath}"
请使用相对路径，如："dist"、"build"、"."

💡 如果不确定目录名，请询问用户`,

  EMPTY_PATH: () =>
    `❌ 参数缺失：未指定路径

请指定目标目录（相对路径），如：
- "dist"（Vite、Vue CLI 默认）
- "build"（Create React App 默认）

💡 请询问用户确认目录位置`,

  PATH_NOT_EXISTS_PROXY: (relativePath: string) =>
    `❌ 目录 "${relativePath}" 不存在

可能的原因：
1. 项目尚未构建（尝试 npm run build）
2. 目录名不正确（常见：dist、build、output）

💡 请询问用户确认目录名称`,

  PATH_NOT_EXISTS_LOCAL: (relativePath: string, fullPath: string) =>
    `❌ 目录不存在：${relativePath}

解析路径：${fullPath}

请确认目录名称是否正确。`,
};

/**
 * 解析工具的工作路径
 *
 * @param relativePath - 用户传入的相对路径（可选）
 * @param context - 处理器上下文（可能包含 Proxy 注入的 _project_path）
 * @returns 解析后的绝对路径
 *
 * @example
 * ```typescript
 * // 场景 1：有 Proxy
 * // WORKSPACE_ROOT = "/data/tapcode/userspaces"
 * // ctx.projectPath = "project-123/workspace"
 * resolveWorkPath("dist", context)
 * // => "/data/tapcode/userspaces/project-123/workspace/dist"
 *
 * // 场景 2：无 Proxy，有 WORKSPACE_ROOT
 * // WORKSPACE_ROOT = "/workspace"
 * resolveWorkPath("my-game/dist", context)
 * // => "/workspace/my-game/dist"
 *
 * // 场景 3：本地开发
 * // WORKSPACE_ROOT = process.cwd() = "/Users/username/projects"
 * resolveWorkPath("dist", context)
 * // => "/Users/username/projects/dist"
 * ```
 */
export function resolveWorkPath(relativePath?: string, ctx?: ResolvedContext): string {
  // 1. 计算基础路径
  const basePath = resolveBasePath(ctx);

  // 3. 拼接用户传入的相对路径
  if (relativePath) {
    // 🔧 FIX: 如果用户传入的是绝对路径，直接使用（避免重复拼接）
    if (path.isAbsolute(relativePath)) {
      // 详细日志：绝对路径
      logger.info(`[PathResolver] Using absolute path: ${relativePath}`).catch(() => {});
      return relativePath;
    }

    // 相对路径拼接
    const resolvedPath = path.join(basePath, relativePath);

    // 详细日志：相对路径解析
    logger
      .info(
        `[PathResolver] Resolved relative path:\n` +
          `  Input: ${relativePath}\n` +
          `  Base: ${basePath}\n` +
          `  Result: ${resolvedPath}`
      )
      .catch(() => {});

    // 🔧 FIX: 智能提示 - 如果路径不存在，提供帮助信息
    if (!fs.existsSync(resolvedPath)) {
      logger
        .warning(
          `[PathResolver] ⚠️  Path does not exist: ${resolvedPath}\n` +
            `  💡 Tip: Current WORKSPACE_ROOT is ${WORKSPACE_ROOT}\n` +
            `  💡 Consider using:\n` +
            `     - Absolute path (e.g., /Users/username/project/path)\n` +
            `     - Set WORKSPACE_ROOT environment variable in MCP config\n` +
            `     - Check if the path is correct relative to ${basePath}`
        )
        .catch(() => {});
    }

    return resolvedPath;
  }

  return basePath;
}

/**
 * 获取工作空间根路径
 *
 * @returns 工作空间根路径
 */
export function getWorkspaceRoot(): string {
  return WORKSPACE_ROOT;
}

/**
 * 检查路径是否在工作空间内（安全检查）
 *
 * @param targetPath - 目标路径
 * @returns 是否在工作空间内
 */
export function isPathInWorkspace(targetPath: string): boolean {
  const normalizedTarget = path.normalize(path.resolve(targetPath));
  const normalizedRoot = path.normalize(path.resolve(WORKSPACE_ROOT));

  return normalizedTarget.startsWith(normalizedRoot);
}

/**
 * 获取路径相对于工作空间的相对路径
 *
 * @param absolutePath - 绝对路径
 * @returns 相对于工作空间的路径
 */
export function getRelativeToWorkspace(absolutePath: string): string {
  return path.relative(WORKSPACE_ROOT, absolutePath);
}

/**
 * 安全解析路径（带验证，返回结构化结果）
 *
 * 通用路径解析器，返回结构化结果，错误信息根据模式选择是否暴露内部路径。
 * 不包含业务特定的验证逻辑（如 index.html 检查），业务验证应在调用方进行。
 *
 * @param inputPath - Agent 传入的路径（应为相对路径）
 * @param ctx - 处理器上下文（可能包含 Proxy 注入的 _project_path）
 * @param options - 选项
 * @returns 结构化的解析结果
 *
 * @example
 * ```typescript
 * const result = resolvePathSafe("dist", ctx);
 * if (!result.success) {
 *   throw new Error(result.error.userMessage);
 * }
 * // 使用 result.resolvedPath
 * // 业务方自行进行额外验证（如 index.html 检查）
 * ```
 */
export function resolvePathSafe(
  inputPath: string | undefined,
  ctx: ResolvedContext | undefined,
  options: {
    allowEmpty?: boolean; // 是否允许空路径（默认 false）
    checkExists?: boolean; // 是否检查路径存在（默认 true）
  } = {}
): PathResolutionResult {
  const { allowEmpty = false, checkExists = true } = options;
  const isProxyMode = !!ctx?.projectPath;
  const trimmedInput = inputPath?.trim() ?? '';

  // 判断输入类型
  const inputType: PathInputType = !trimmedInput
    ? 'empty'
    : path.isAbsolute(trimmedInput)
      ? 'absolute'
      : 'relative';

  // 1. 计算基础路径（兼容绝对/相对 projectPath）
  const basePath = resolveBasePath(ctx);

  // 2. 处理空字符串或未传的情况
  if (inputType === 'empty') {
    if (allowEmpty) {
      // 允许空路径，返回基础路径
      logger
        .info(`[PathResolver] Empty path allowed, using base path: ${basePath}`)
        .catch(() => {});
      return {
        success: true,
        resolvedPath: basePath,
        inputPath: trimmedInput,
        inputType,
        isProxyMode,
      };
    }

    // 不允许空路径
    logger.info(`[PathResolver] Empty path not allowed`).catch(() => {});
    return {
      success: false,
      inputPath: trimmedInput,
      inputType,
      isProxyMode,
      error: {
        type: 'EMPTY_PATH',
        userMessage: PATH_ERRORS.EMPTY_PATH(),
      },
    };
  }

  // 3. Proxy 模式下禁止绝对路径
  if (isProxyMode && inputType === 'absolute') {
    logger
      .warning(`[PathResolver] Absolute path rejected in Proxy mode: ${trimmedInput}`)
      .catch(() => {});
    return {
      success: false,
      inputPath: trimmedInput,
      inputType,
      isProxyMode,
      error: {
        type: 'ABSOLUTE_PATH_IN_PROXY',
        userMessage: PATH_ERRORS.ABSOLUTE_PATH_REJECTED(trimmedInput),
      },
    };
  }

  // 4. 计算最终路径
  const resolvedPath = inputType === 'absolute' ? trimmedInput : path.join(basePath, trimmedInput);

  logger
    .info(
      `[PathResolver] Resolving path:\n` +
        `  Input: ${trimmedInput}\n` +
        `  Type: ${inputType}\n` +
        `  Base: ${basePath}\n` +
        `  Result: ${resolvedPath}\n` +
        `  Mode: ${isProxyMode ? 'Proxy' : 'Local'}`
    )
    .catch(() => {});

  // 5. 检查路径是否存在（可选）
  if (checkExists && !fs.existsSync(resolvedPath)) {
    return {
      success: false,
      resolvedPath,
      inputPath: trimmedInput,
      inputType,
      isProxyMode,
      error: {
        type: 'PATH_NOT_EXISTS',
        userMessage: isProxyMode
          ? PATH_ERRORS.PATH_NOT_EXISTS_PROXY(trimmedInput)
          : PATH_ERRORS.PATH_NOT_EXISTS_LOCAL(trimmedInput, resolvedPath),
      },
    };
  }

  // 6. 成功
  return {
    success: true,
    resolvedPath,
    inputPath: trimmedInput,
    inputType,
    isProxyMode,
  };
}
