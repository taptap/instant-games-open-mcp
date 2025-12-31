/**
 * 日志相关类型定义
 *
 * 这是一个纯类型文件，不依赖任何外部包。
 * Server 和 Proxy 共用这些类型。
 */

/**
 * RFC 5424 日志级别（syslog severity levels）
 *
 * 数字越小优先级越高（更严重）
 *
 * @see https://datatracker.ietf.org/doc/html/rfc5424#section-6.2.1
 */
export type LogLevel =
  | 'emergency' // 0 - 系统不可用
  | 'alert' // 1 - 必须立即采取行动
  | 'critical' // 2 - 临界条件
  | 'error' // 3 - 错误条件
  | 'warning' // 4 - 警告条件
  | 'notice' // 5 - 正常但重要的条件
  | 'info' // 6 - 信息性消息
  | 'debug'; // 7 - 调试级别消息

/**
 * 日志级别优先级（RFC 5424 标准，数字越小优先级越高）
 */
export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  emergency: 0,
  alert: 1,
  critical: 2,
  error: 3,
  warning: 4,
  notice: 5,
  info: 6,
  debug: 7,
};

/**
 * 日志配置接口
 */
export interface LogConfig {
  /** 日志根目录 */
  root?: string;
  /** 是否启用文件日志 */
  enabled?: boolean;
  /** 日志级别 */
  level?: LogLevel;
  /** 日志保留天数 */
  maxDays?: number;
}
