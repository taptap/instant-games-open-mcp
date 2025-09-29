"""配置管理"""

from pydantic import Field
from pydantic_settings import BaseSettings
from typing import Optional


class TapTapSettings(BaseSettings):
    """TapTap API 配置"""

    # TapTap API 配置
    api_key: Optional[str] = Field(default=None, description="TapTap API 密钥（可选）")
    api_base_url: str = Field(
        default="https://api.taptap.com/v1",
        description="TapTap API 基础 URL"
    )
    environment: str = Field(default="production", description="环境：production/staging/development")

    # MCP 服务器配置
    server_name: str = Field(default="taptap-minigame", description="MCP 服务器名称")
    server_version: str = Field(default="1.0.0", description="服务器版本")
    log_level: str = Field(default="INFO", description="日志级别")

    # 缓存配置
    redis_url: Optional[str] = Field(default=None, description="Redis 连接 URL")
    cache_ttl: int = Field(default=300, description="缓存过期时间（秒）")

    # 限流配置
    rate_limit_requests_per_minute: int = Field(default=100, description="每分钟请求限制")
    rate_limit_requests_per_hour: int = Field(default=1000, description="每小时请求限制")

    # 数据库配置
    database_url: Optional[str] = Field(default=None, description="数据库连接 URL")

    # 监控配置
    prometheus_port: int = Field(default=8000, description="Prometheus 指标端口")
    enable_metrics: bool = Field(default=True, description="启用指标收集")

    # 开发配置
    debug: bool = Field(default=False, description="调试模式")
    dev_mode: bool = Field(default=False, description="开发模式")

    class Config:
        env_prefix = "TAPTAP_"
        case_sensitive = False
        env_file = ".env"


# 全局设置实例
settings = TapTapSettings()