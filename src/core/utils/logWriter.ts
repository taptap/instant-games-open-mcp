/**
 * 日志文件写入器
 *
 * 功能：
 * - 同时输出到 stderr 和文件（Tee 模式）
 * - 按日期轮转
 * - 自动清理过期日志
 * - 异步写入，不阻塞主流程
 *
 * Proxy 和 Server 共用此模块，构建时分别打包到各自的 bundle 中。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { type LogLevel, LOG_LEVEL_PRIORITY } from '../types/log.js';

// 重新导出 LogLevel 供其他模块使用
export type { LogLevel } from '../types/log.js';

/**
 * 日志配置
 */
export interface LogWriterConfig {
  /** 日志目录（完整路径，包含子目录） */
  logDir: string;
  /** 日志文件前缀（如 'server' 或 'proxy'） */
  prefix: string;
  /** 是否启用文件日志 */
  enabled: boolean;
  /** 文件日志级别 */
  level: LogLevel;
  /** 日志保留天数 */
  maxDays: number;
}

/**
 * 默认日志根目录
 */
export const DEFAULT_LOG_ROOT = '/tmp/taptap-mcp/logs';

/**
 * 计算稳定的 hash（同一输入总是产生相同输出）
 *
 * @param input - 输入字符串
 * @returns 8 字符的 hash
 */
export function computeStableHash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').substring(0, 8);
}

/**
 * 日志文件写入器
 */
export class LogWriter {
  private config: LogWriterConfig;
  private currentDate: string = '';
  private writeStream: fs.WriteStream | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(config: LogWriterConfig) {
    this.config = config;
  }

  /**
   * 初始化日志目录和文件
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    // 防止并发初始化
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    if (!this.config.enabled) {
      this.initialized = true;
      return;
    }

    try {
      // 创建日志目录
      await fs.promises.mkdir(this.config.logDir, { recursive: true });

      // 清理过期日志
      await this.cleanupOldLogs();

      this.initialized = true;
    } catch (error) {
      // 日志写入失败不应影响主流程，输出到 stderr
      process.stderr.write(
        `[LogWriter] Failed to initialize log directory: ${error instanceof Error ? error.message : String(error)}\n`
      );
      // 标记为已初始化但禁用文件写入
      this.initialized = true;
      this.config.enabled = false;
    }
  }

  /**
   * 获取当前日期字符串 (YYYY-MM-DD)
   */
  private getCurrentDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * 获取当前日期的日志文件路径
   */
  private getLogFilePath(date?: string): string {
    const d = date || this.getCurrentDate();
    return path.join(this.config.logDir, `${this.config.prefix}-${d}.log`);
  }

  /**
   * 获取或创建写入流
   */
  private getWriteStream(): fs.WriteStream | null {
    if (!this.config.enabled) return null;

    const date = this.getCurrentDate();

    // 日期变化时，创建新文件
    if (date !== this.currentDate) {
      if (this.writeStream) {
        this.writeStream.end();
        this.writeStream = null;
      }
      this.currentDate = date;

      try {
        this.writeStream = fs.createWriteStream(this.getLogFilePath(date), {
          flags: 'a',
          encoding: 'utf8',
        });

        // 处理流错误
        this.writeStream.on('error', (error) => {
          process.stderr.write(`[LogWriter] Write stream error: ${error.message}\n`);
          this.writeStream = null;
        });
      } catch (error) {
        process.stderr.write(
          `[LogWriter] Failed to create write stream: ${error instanceof Error ? error.message : String(error)}\n`
        );
        return null;
      }
    }

    return this.writeStream;
  }

  /**
   * 判断是否应该写入文件
   */
  private shouldWriteToFile(level: LogLevel): boolean {
    if (!this.config.enabled) return false;
    return LOG_LEVEL_PRIORITY[level] <= LOG_LEVEL_PRIORITY[this.config.level];
  }

  /**
   * 写入日志（异步）
   *
   * @param level - 日志级别
   * @param message - 格式化后的完整日志消息（包含时间戳、级别等）
   */
  async write(level: LogLevel, message: string): Promise<void> {
    // 确保初始化
    if (!this.initialized) {
      await this.initialize();
    }

    // 1. 始终输出到 stderr
    process.stderr.write(message);

    // 2. 根据级别决定是否写入文件
    if (this.shouldWriteToFile(level)) {
      const stream = this.getWriteStream();
      if (stream && !stream.destroyed) {
        stream.write(message);
      }
    }
  }

  /**
   * 同步写入（用于不能 await 的场景）
   */
  writeSync(level: LogLevel, message: string): void {
    // 1. 始终输出到 stderr
    process.stderr.write(message);

    // 2. 同步写入文件（仅当已初始化且启用时）
    if (this.shouldWriteToFile(level) && this.initialized && this.config.enabled) {
      try {
        const filePath = this.getLogFilePath();
        // 确保目录存在
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.appendFileSync(filePath, message, 'utf8');
      } catch {
        // 忽略写入错误
      }
    }
  }

  /**
   * 清理过期日志文件
   */
  private async cleanupOldLogs(): Promise<void> {
    if (this.config.maxDays <= 0) return;

    try {
      const files = await fs.promises.readdir(this.config.logDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.maxDays);

      const prefix = this.config.prefix;
      const pattern = new RegExp(`^${prefix}-(\\d{4}-\\d{2}-\\d{2})\\.log$`);

      for (const file of files) {
        const match = file.match(pattern);
        if (match) {
          const fileDate = new Date(match[1]);
          if (fileDate < cutoffDate) {
            await fs.promises.unlink(path.join(this.config.logDir, file));
            process.stderr.write(`[LogWriter] Deleted old log: ${file}\n`);
          }
        }
      }
    } catch {
      // 清理失败不影响主流程
    }
  }

  /**
   * 关闭写入流
   */
  close(): void {
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
  }

  /**
   * 获取当前日志文件路径（用于调试）
   */
  getCurrentLogFile(): string | null {
    if (!this.config.enabled) return null;
    return this.getLogFilePath();
  }

  /**
   * 获取配置信息（用于调试）
   */
  getConfig(): Readonly<LogWriterConfig> {
    return { ...this.config };
  }
}

/**
 * 创建 LogWriter 实例的工厂函数
 */
export function createLogWriter(
  config: Partial<LogWriterConfig> & { logDir: string; prefix: string }
): LogWriter {
  return new LogWriter({
    logDir: config.logDir,
    prefix: config.prefix,
    enabled: config.enabled ?? false,
    level: config.level ?? 'info',
    maxDays: config.maxDays ?? 7,
  });
}
