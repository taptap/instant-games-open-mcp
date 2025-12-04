# TapTap Native Signer

原生签名模块，用于安全地封装 `CLIENT_SECRET`，避免在 npm 源码中暴露敏感信息。

## 安全模型

```
┌─────────────────────────────────────────────────────────────┐
│                    编译时 (CI/CD)                           │
├─────────────────────────────────────────────────────────────┤
│  BUILD_CLIENT_ID + BUILD_CLIENT_SECRET                      │
│           ↓                                                 │
│  XOR 混淆加密 → 嵌入到 Rust 二进制                          │
│           ↓                                                 │
│  多平台编译 → .node 文件 (6个平台)                          │
└─────────────────────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────────────────────┐
│                    运行时 (用户机器)                         │
├─────────────────────────────────────────────────────────────┤
│  Node.js 加载 .node 二进制                                  │
│           ↓                                                 │
│  调用 computeTapSign() → 在内存中解密 → 计算签名            │
│           ↓                                                 │
│  返回签名结果 (SECRET 不暴露给 JS 层)                       │
└─────────────────────────────────────────────────────────────┘
```

**保护措施：**

- ✅ SECRET 在编译时 XOR 加密
- ✅ 二进制经过 `strip` 移除符号表
- ✅ Release 构建启用 LTO（链接时优化）
- ✅ 可选的反调试检测
- ⚠️ 专业逆向仍可能破解（这是客户端凭证保护的固有限制）

## 快速开始

### 1. 安装 Rust

```bash
# macOS / Linux
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 验证安装
rustc --version
cargo --version
```

### 2. 安装依赖

```bash
cd native
npm install
```

### 3. 本地构建（开发测试）

```bash
# 设置环境变量
export BUILD_CLIENT_ID="your_client_id"
export BUILD_CLIENT_SECRET="your_client_secret"

# 构建（Debug 模式）
npm run build:debug

# 构建（Release 模式，带优化）
npm run build
```

### 4. 测试

```javascript
const { computeTapSign, getClientId, verifyIntegrity, getVersion } = require('./index.js');

// 验证模块完整性
console.log('Integrity:', verifyIntegrity());
console.log('Version:', getVersion());
console.log('Client ID:', getClientId());

// 计算签名
const signature = computeTapSign(
  'POST',
  '/api/v1/apps?client_id=xxx',
  'x-tap-nonce:abc123\nx-tap-ts:1234567890',
  '{"name":"test"}'
);
console.log('Signature:', signature);
```

## CI/CD 构建

### GitHub Actions 配置

1. **添加 Secrets**（在 GitHub 仓库设置中）：
   - `BUILD_CLIENT_ID`: TapTap Client ID
   - `BUILD_CLIENT_SECRET`: TapTap Client Secret
   - `NPM_TOKEN`: npm 发布 token（可选）

2. **触发构建**：
   - 推送到 `main` 分支的 `native/` 目录变更会自动触发
   - 或手动触发 workflow

3. **下载产物**：
   - 构建完成后，从 Actions 页面下载 `native-signer-all-platforms` artifact
   - 包含所有平台的 `.node` 文件

### 支持的平台

| 平台    | 架构                  | 文件名                                |
| ------- | --------------------- | ------------------------------------- |
| macOS   | x64 (Intel)           | `taptap-signer.darwin-x64.node`       |
| macOS   | arm64 (Apple Silicon) | `taptap-signer.darwin-arm64.node`     |
| Linux   | x64 (glibc)           | `taptap-signer.linux-x64-gnu.node`    |
| Linux   | x64 (musl/Alpine)     | `taptap-signer.linux-x64-musl.node`   |
| Linux   | arm64 (glibc)         | `taptap-signer.linux-arm64-gnu.node`  |
| Linux   | arm64 (musl)          | `taptap-signer.linux-arm64-musl.node` |
| Windows | x64                   | `taptap-signer.win32-x64-msvc.node`   |

## API 参考

### `computeTapSign(method, url, headersPart, body): string`

计算 X-Tap-Sign 签名。

**参数：**

- `method`: HTTP 方法 (GET, POST 等)
- `url`: 请求 URL 路径（包含 query string）
- `headersPart`: 排序后的 X-Tap-\* headers，格式 `key:value\nkey:value`
- `body`: 请求体（GET 请求传空字符串）

**返回：** Base64 编码的 HMAC-SHA256 签名

### `getClientId(): string`

获取编译时嵌入的 CLIENT_ID。

### `verifyIntegrity(): boolean`

验证模块完整性，检查 SECRET 是否可以正确解密。

### `getVersion(): string`

获取模块版本号。

## 集成到主项目

主项目通过 `src/core/network/nativeSigner.ts` 集成：

```typescript
import {
  computeTapSign,
  getClientId,
  isNativeSignerAvailable,
} from '../core/network/nativeSigner.js';

// 检查原生签名器是否可用
if (await isNativeSignerAvailable()) {
  console.log('Using native signer');
} else {
  console.log('Falling back to JS implementation');
}

// 获取 CLIENT_ID（优先使用原生模块）
const clientId = await getClientId();

// 计算签名（优先使用原生模块）
const signature = await computeTapSign(method, url, headersPart, body);
```

## 故障排除

### 构建失败

1. **缺少 Rust**

   ```
   error: rustc not found
   ```

   解决：安装 Rust（见上方快速开始）

2. **缺少环境变量**

   ```
   BUILD_CLIENT_ID must be set during build
   ```

   解决：设置 `BUILD_CLIENT_ID` 和 `BUILD_CLIENT_SECRET` 环境变量

3. **napi-rs 版本不兼容**
   ```
   Error: Cannot find module '@napi-rs/cli'
   ```
   解决：`cd native && npm install`

### 运行时错误

1. **找不到二进制文件**

   ```
   Failed to load native binding for darwin-arm64
   ```

   解决：确保对应平台的 `.node` 文件存在于 `native/` 目录

2. **完整性检查失败**
   ```
   Integrity check failed: missing secrets
   ```
   解决：二进制可能损坏，重新构建

## 开发说明

### 目录结构

```
native/
├── Cargo.toml          # Rust 项目配置
├── build.rs            # 编译时 SECRET 加密
├── package.json        # npm 配置
├── index.js            # JS 加载器（自动选择平台）
├── index.d.ts          # TypeScript 类型定义
├── src/
│   └── lib.rs          # Rust 签名实现
└── *.node              # 编译后的二进制文件
```

### 添加反调试

在 `src/lib.rs` 中取消注释反调试检查：

```rust
#[napi]
pub fn compute_tap_sign(...) -> Result<String> {
    // 取消注释以启用反调试
    #[cfg(not(debug_assertions))]
    if is_debugger_present() {
        return Err(Error::from_reason("Security check failed"));
    }
    // ...
}
```

### 更新 SECRET

1. 更新 GitHub Secrets 中的 `BUILD_CLIENT_SECRET`
2. 触发 CI 重新构建
3. 下载新的二进制文件
4. 更新 npm 包版本并发布

## 许可证

MIT
