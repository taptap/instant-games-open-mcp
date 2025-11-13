/**
 * 统一路径解析器
 *
 * 所有与目录相关的工具都应该使用这个解析器来处理路径
 *
 * 路径解析优先级：
 * 1. 有 Proxy: WORKSPACE_ROOT + _project_path + relativePath
 * 2. 无 Proxy: WORKSPACE_ROOT + relativePath
 * 3. 本地开发: process.cwd() + relativePath
 */

import * as path from 'node:path';
import type { HandlerContext } from '../types/index.js';

/**
 * 工作空间根路径
 * 优先级：环境变量 > process.cwd()
 */
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || process.cwd();

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
 * // context.projectPath = "project-123/workspace"
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
export function resolveWorkPath(relativePath?: string, context?: HandlerContext): string {
  // 1. 基础路径：WORKSPACE_ROOT
  let basePath = WORKSPACE_ROOT;

  // 2. 如果有 Proxy 注入的 projectPath
  if (context?.projectPath) {
    // 如果 projectPath 是绝对路径，直接使用
    // 如果是相对路径，拼接到 WORKSPACE_ROOT
    if (path.isAbsolute(context.projectPath)) {
      basePath = context.projectPath;
    } else {
      basePath = path.join(WORKSPACE_ROOT, context.projectPath);
    }
  }

  // 3. 拼接用户传入的相对路径
  if (relativePath) {
    return path.join(basePath, relativePath);
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
