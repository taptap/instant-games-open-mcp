# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- 🐛 **MCP Proxy Bug Fixes**
  - Fixed reconnection state management bug that prevented retry after failed reconnect
  - Fixed connection state not being reset when `connect()` fails
  - Fixed resource leak by adding cleanup for monitor timers on process exit
  - Enhanced Token validation to check `mac_algorithm` field

## [1.4.0] - 2025-11-11

### 🚀 Major Release - Context Resolver & Multi-Tenant Support

**This release implements ContextResolver system and enhances multi-tenant support with proper tenant isolation through projectPath.**

### Added

- 🎯 **ContextResolver System**
  - New `src/core/utils/contextResolver.ts` - Centralized context resolution
  - Replaces scattered `ensureAppInfo()` calls with unified resolver
  - Priority-based resolution: private params > context > cache
  - Single source of truth for all context fields

- 📋 **Extended Private Parameters** (v1.3.0+)
  - `_developer_id`: Developer ID injection
  - `_app_id`: App ID injection
  - `_project_path`: Project path injection (for H5 upload)
  - `_tenant_id`: Tenant ID for multi-tenant scenarios
  - `_trace_id`: Distributed tracing support
  - `_request_id`: Request-level logging

- 📖 **Documentation**
  - Updated `docs/MCP_PROXY_GUIDE.md` - Added multi-tenant isolation guide
  - Explained tenant isolation through `_project_path`
  - Clarified cache file separation per tenant

### Changed

- 🏗️ **Architecture Refactor**
  - **API Layer**: All API functions use `ContextResolver` instead of `ensureAppInfo()`
  - **Handler Layer**: Simplified context resolution logic
  - **Type System**: Extended `HandlerContext` with new fields (developerId, appId, userId, tenantId, etc.)
  - **Private Parameters**: All utility functions support extended field set

- 🔧 **Core Components**
  - `HandlerContext`: Added 8 new fields for complete context support
  - `getEffectiveContext()`: Merges all private parameter types
  - `stripPrivateParams()`: Handles all new private parameter fields
  - Fixed duplicate `HandlerContext` definitions (consolidated to `core/types/`)

- 📊 **Code Quality**
  - Eliminated circular dependencies between `app` and `leaderboard` modules
  - Removed async API calls from context resolution (lazy loading from cache)
  - Cleaner error messages with actionable guidance

### Removed

- ❌ **Deprecated Patterns**
  - Direct `ensureAppInfo()` calls in leaderboard module
  - Inline `HandlerContext` interface definitions (consolidated)
  - Unnecessary `context.macToken` parameter passing (use `context` directly)

### Technical Details

**Priority Resolution Flow:**
```
Private Params > HandlerContext > Local Cache
```

**Multi-Tenant Isolation:**
- ✅ Each tenant has isolated `projectPath`
- ✅ Cache files stored in `{projectPath}/.taptap-minigame/`
- ✅ MCP Proxy injects tenant-specific context
- ✅ Supports RuntimeContainer architecture

### Migration Guide

**Before (v1.3.0):**
```typescript
const appInfo = await ensureAppInfo(context.projectPath, true, context);
const developerId = appInfo.developer_id;
```

**After (v1.4.0):**
```typescript
const resolved = contextResolver.resolve(context);
const developerId = resolved.developerId;
```

## [1.3.0] - 2025-11-10

### 🚀 Major Release - Private Parameter Protocol for MCP Proxy

**This is a major architectural enhancement enabling MCP Proxy mode with multi-account authentication support.**

### Added

- 🔐 **Private Parameter Protocol**
  - Support for MCP Proxy mode multi-account authentication
  - Completely transparent to AI Agent (private params not in tool definitions)
  - Dual injection modes: arguments or HTTP Header
  - Four-tier authentication priority system
  - Complete business layer isolation

- 📝 **New Documentation**
  - `docs/PRIVATE_PROTOCOL.md` - Complete private parameter protocol specification
  - `docs/MCP_PROXY_GUIDE.md` - Comprehensive MCP Proxy development guide
  - Full test scripts and troubleshooting guides

- 🧪 **Testing**
  - `test-private-params.sh` - Automated testing script for both injection modes
  - Validates parameter injection, priority, and security

### Changed

- 🏗️ **Architecture Optimization**
  - Unified `HandlerContext` parameter passing (removed inconsistencies)
  - HttpClient accepts `HandlerContext` instead of separate params
  - Server layer centralized private parameter processing
  - Business layer completely unaware of private parameters

- ✨ **API Improvements**
  - All API functions accept `context?: HandlerContext`
  - Removed unused `env` field from `HandlerContext`
  - Simplified HttpClient constructor (3 lines)

- 📊 **Code Reduction**
  - Removed RequestStorage class (-20 lines)
  - Removed HTTP Server token storage logic (-15 lines)
  - Removed _currentSessionKey mechanism (-10 lines)
  - Removed PrivateToolParams from business layer (-15 declarations)
  - Total: -70+ lines of code

### Technical Details

**Private Parameter Injection:**
- Method 1: Direct parameter injection in `arguments._mac_token` (recommended)
- Method 2: HTTP Header `X-TapTap-Mac-Token` (HTTP/SSE mode only)

**Authentication Priority:**
```
1. arguments._mac_token (highest)
2. HTTP Header X-TapTap-Mac-Token
3. context.macToken (env/OAuth)
4. global ApiConfig (lowest)
```

**Data Flow:**
```
Server Layer (extracts & strips private params)
    ↓ stripPrivateParams()
Business Layer (only sees business params)
    ↓ context.macToken
HttpClient → HTTP Request
```

**Security:**
- Private parameters automatically stripped from logs
- TypeScript type safety maintained
- Session isolation for HTTP Header injection

### Documentation

- Added comprehensive MCP Proxy development guide
- Updated architecture documentation in CLAUDE.md
- Enhanced README.md with v1.3.0 features

## [1.2.0] - 2025-11-03

### 🚀 Major Release - Multi-Client Concurrency & Smart Auto-Authorization

**This is a major release bringing significant improvements: multi-client concurrent connections, intelligent auto-authorization for SSE mode, three transport modes support, and complete H5 game management.**

### Added

- 🔌 **Multi-Client Concurrent Connections**
  - Independent Server and Transport instances for each session
  - Session ID-based request routing via `mcp-session-id` header
  - Active session tracking in `/health` endpoint
  - Support for unlimited concurrent clients

- 📊 **Client Connection Logging**
  - `logger.logClientConnection(sessionId)` - Log client connections
  - `logger.logClientDisconnection(sessionId)` - Log client disconnections
  - Verbose mode displays full connection events (session ID + timestamp)
  - Dual output: stderr (local debugging) + MCP notification (client monitoring)

- 🔐 **Smart Auto-Authorization (SSE Mode)**
  - One-step authorization flow in SSE mode (vs two-step in stdio/http)
  - Real-time progress updates every 10 seconds
  - Progress types: auth_url, polling, success, timeout, error
  - Clear operation instructions for AI agents
  - Automatic polling with 2-minute timeout

- 📡 **Three Transport Modes**
  - `TDS_MCP_TRANSPORT=sse` → SSE streaming (`Content-Type: text/event-stream`)
  - `TDS_MCP_TRANSPORT=http` → JSON responses (`Content-Type: application/json`)
  - `TDS_MCP_TRANSPORT=stdio` → stdio mode (default, maximum compatibility)

- 🎮 **H5 Game Module** (17 tools total)
  - Complete H5 game upload and publishing workflow
  - `upload_and_publish_h5_game` - Upload game package and publish
  - `get_h5_game_status` - Check game publication status
  - `update_h5_game_info` - Update game metadata
  - `gather_h5_game_info` - Collect game information

- 📦 **Modular Architecture**
  - `features/app/` - Application management (8 tools)
  - `features/leaderboard/` - Leaderboard (5 tools + 7 resources)
  - `features/h5Game/` - H5 game management (4 tools)
  - Clean separation of concerns and dependencies

### Changed

- 🔧 **Request Handler Refactoring**
  - `setupHandlers()` → `setupHandlersForServer(server)` (supports multiple instances)
  - Each session has isolated handler configuration
  - Prevents cross-session interference

- 🎯 **Authorization Strategy by Transport**
  - SSE mode: Auto-authorization with progress streaming
  - HTTP/stdio modes: Two-step authorization (backward compatible)
  - Smart mode selection based on `TDS_MCP_TRANSPORT`

- 📝 **Startup Logging Enhancement**
  - Display response mode (SSE Streaming / JSON Only)
  - Show active sessions count
  - Clarify transport capabilities

- 🏗️ **Architecture Improvements**
  - Unified format for all tools and resources
  - Modular design with clear boundaries
  - Scaffolding script for rapid feature development

### Fixed

- ✅ **Multi-Client Initialize Support**
  - Removed "Server already initialized" error
  - Each client gets independent session
  - No more 400 errors on repeated initialize

- ✅ **HTTP JSON Mode Compatibility**
  - Correctly uses two-step auth (avoids 2-min blocking without progress)
  - Progress notifications silently fail (graceful degradation)
  - All features work correctly without SSE streaming

### Migration Guide

**For SSE Mode Users** (OpenHands, Claude Code, etc.):
```bash
# One-step auto-authorization (new feature)
TDS_MCP_TRANSPORT=sse TDS_MCP_PORT=3000 npm start
# Tool call → auth URL + auto-wait → user authorizes → automatic completion
```

**For HTTP JSON Mode Users**:
```bash
# JSON-only responses
TDS_MCP_TRANSPORT=http TDS_MCP_PORT=3000 npm start
# Returns: Content-Type: application/json
```

**For Local Development** (Claude Desktop, Cursor, VSCode):
```bash
# Default stdio mode (unchanged)
npx @mikoto_zero/minigame-open-mcp
```

**No Breaking Changes** - All existing configurations continue to work.

## [1.1.4] - 2025-10-15

### Note
- 🔄 **Re-release of v1.1.3 fixes without Resources/Prompts**
  - v1.1.3 was already published with Resources/Prompts
  - v1.1.4 contains the same API fixes but removes Resources/Prompts
  - Simplified to Tools-only architecture for production stability

## [1.1.3] - 2025-10-15

### Fixed
- 🔧 **Critical API documentation fixes** - Aligned with LeaderboardManager source code
  - Fixed method signatures: all methods use object parameters `({ param1, param2 })`
  - Fixed parameter names: `continuationToken` → `nextPage`
  - Fixed parameter names: unified `leaderboardId` (lowercase 'b')
  - Added complete parameter examples including `undefined` values
  - Prevents AI from generating incomplete or incorrect code

### Removed
- 🗑️ **Removed Resources and Prompts** - Simplified to Tools-only architecture
  - Removed all Resources support (8 resources deleted)
  - Removed all Prompts support (2 prompts deleted)
  - Deleted files: resourceDefinitions.ts, promptDefinitions.ts, promptHandlers.ts
  - Back to simple, reliable Tools-only approach
  - Reduces complexity and potential confusion

### Added
- ⚠️ **Important usage notes in documentation**
  - Emphasized: 'tap' is a GLOBAL object (NO imports needed)
  - Emphasized: NO npm packages required
  - Emphasized: All methods accept SINGLE object parameter
  - Works in TapTap Minigame AND H5 game environments

### Changed
- 📝 **Updated description** - Now supports both Minigame and H5 games
  - Package description: "TapTap Open API MCP Server - Documentation and Management APIs for TapTap Minigame and H5 Games"
  - API title: "TapTap Leaderboard API (Minigame & H5)"
- 📊 **Simplified architecture** - Tools-only (17 tools)
  - Easier to understand and use
  - Proven to work reliably
  - For experimental Resources/Prompts, see v1.2.0-beta versions

## [1.1.2] - 2025-10-14

### Fixed
- 🔄 **Republish v1.1.0 as stable version** - Skip the deprecated warnings from v1.1.1
  - This version is identical to v1.1.0 in functionality
  - Provides clean Tools, Resources, and Prompts without deprecation warnings
  - Recommended for production use (v1.1.1 skipped)
  - All 17 Tools remain available and fully functional

### Note
- v1.1.1 introduced deprecation warnings but has been skipped
- v1.1.2 provides the same features as v1.1.0 without warnings
- For experimental breaking changes, see v1.2.0-beta.1

## [1.1.0] - 2025-10-14

### Added
- 🎯 **MCP Resources Support** - Added read-only documentation resources
- 🎨 **MCP Prompts Support** - Added reusable workflow templates

### Note
- This version was superseded by v1.1.2-v1.1.4 for production use
- Resources/Prompts are available in v1.2.0-beta versions

## [1.0.16] - 2025-10-14

### Improved
- 🤖 **Smart AI Agent behavior** - Context-aware leaderboard creation

(Earlier versions omitted for brevity)
