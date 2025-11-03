# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2025-11-03

### 🚀 Major Release - Multi-Client Concurrency & Smart Auto-Authorization

**This is a major release bringing significant improvements: multi-client concurrent connections, intelligent auto-authorization for SSE mode, and three transport modes support.**

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

- 📡 **Transport Mode Differentiation**
  - `TDS_MCP_TRANSPORT=sse` → SSE streaming (`Content-Type: text/event-stream`)
  - `TDS_MCP_TRANSPORT=http` → JSON responses (`Content-Type: application/json`)
  - `TDS_MCP_TRANSPORT=stdio` → stdio mode (default, maximum compatibility)

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

### Fixed

- ✅ **Multi-Client Initialize Support**
  - Removed "Server already initialized" error
  - Each client gets independent session
  - No more 400 errors on repeated initialize

- ✅ **HTTP JSON Mode Compatibility**
  - Correctly uses two-step auth (avoids 2-min blocking without progress)
  - Progress notifications silently fail (graceful degradation)
  - All features work correctly without SSE streaming

### Technical Details

**Files Changed**:
- `src/core/auth/deviceFlow.ts` - Added `AuthProgressCallback` interface and `startAutoAuthorization()`
- `src/core/utils/logger.ts` - Added `logClientConnection()` and `logClientDisconnection()`
- `src/server.ts` - Multi-client session management and smart auth strategy

**Commits**:
- e1e89eb: Multi-client concurrency + connection logging
- f9f6652: SSE mode smart auto-authorization
- b7d371e: Transport mode differentiation (sse vs http)
- e5796f0: HTTP JSON mode auth strategy fix

### Migration Guide

**For SSE Mode Users** (OpenHands, etc.):
```bash
# Before: Two-step authorization
TDS_MCP_TRANSPORT=sse npm start
# Tool call → error + auth URL → user authorizes → call complete_oauth_authorization → retry

# After: One-step auto-authorization
TDS_MCP_TRANSPORT=sse npm start
# Tool call → auth URL + auto-wait → user authorizes → automatic completion
```

**For HTTP JSON Mode Users**:
```bash
# Use 'http' instead of 'sse' for JSON-only responses
TDS_MCP_TRANSPORT=http npm start
# Returns: Content-Type: application/json (not text/event-stream)
```

**No Breaking Changes** - stdio mode and existing configurations continue to work.

## [1.2.0-beta.12] - 2025-10-24

### 🏗️ Major Architecture Refactoring - App Module Abstraction

**This is a significant architectural improvement separating application management from business features.**

### Added
- 🎯 **App Module** - New independent application management module
  - `features/app/` - Dedicated module for app operations
  - 5 tools: `get_current_app_info`, `check_environment`, `complete_oauth_authorization`, `list_developers_and_apps`, `select_app`
  - Reusable by all business features (leaderboard, future cloudSave, etc.)
  - Clean separation of concerns

- ✨ **Unified Format** (v1.2.0-beta.11+)
  - Tools/Resources use unified object array format
  - `ToolRegistration[]` - definition + handler combined
  - `ResourceRegistration[]` - uri + handler combined
  - Eliminates manual sync issues

- 📚 **Generic Documentation Helpers**
  - `core/utils/docHelpers.ts` - Reusable doc generation utilities
  - `generateAPIDoc()`, `generateOverview()`, `searchDocumentation()`
  - Reduces code duplication across features

### Changed
- 📦 **Module Structure**
  - `app`: 5 tools, 0 resources (foundation module)
  - `leaderboard`: 5 tools, 7 resources (depends on app module)
  - Clean dependency hierarchy: business → app → core

- 📝 **Documentation Consolidation**
  - Integrated architecture docs into CLAUDE.md
  - Simplified CONTRIBUTING.md (393→277 lines, -30%)
  - Deleted temporary architecture docs (docs/architecture/)
  - Single source of truth for developers

- 🔧 **Scaffolding Script Enhanced**
  - `create-feature.sh` updated with `ensureAppInfo` examples
  - Generates unified format code templates
  - Better developer experience

### Removed
- 🗑️ **Deprecated Compatibility Layer**
  - Deleted `core/handlers/appHandlers.ts` (compatibility layer)
  - All app operations now through `features/app/` module
  - No legacy code burden

### Technical Details
- **Code Impact**: Net -57 lines (cleaner architecture)
  - New: `features/app/` (~430 lines)
  - Removed: redundant code (~487 lines)
- **Module Count**: 2 feature modules (app + leaderboard)
- **Dependency Flow**: `leaderboard → app → core`

### Migration
- No breaking changes for end users
- Developers: Import `ensureAppInfo` from `../app/api.js` (not `../leaderboard/api.js`)
- New features can now reuse app module for common operations

### Documentation
- ✅ README.md - Updated architecture diagram
- ✅ CLAUDE.md - Added design patterns and dev guide
- ✅ CONTRIBUTING.md - Simplified to high-level guidance
- ✅ Scaffolding script - Updated templates

## [1.2.0-beta.10] - 2025-10-22

### 🎯 Major Architecture Refactoring - Minimalist Design

**Final Architecture**: 10 Tools + 7 Resources (Prompts removed)

### Added
- 🔐 **OAuth 2.0 Device Code Flow** - Zero-config authentication
  - Lazy loading: Server starts immediately, auth triggered when needed
  - Token saved to `~/.config/taptap-minigame/token.json`
  - `complete_oauth_authorization` tool to complete auth flow
  - Perfect for Cursor/Claude Code (no environment variables needed)

- 📱 **New Tools for better UX**
  - `get_integration_guide` - Complete workflow guide (replaces Prompt)
  - `get_current_app_info` - Current app information with miniapp_id

### Removed
- 🗑️ **All Prompts** (AI doesn't auto-use them per MCP spec)
- 🗑️ **search_leaderboard_docs Tool** (AI should read Resources instead)
- 🗑️ **Redundant Resources**: patterns, quickstart, workflow, app-info

### Changed
- 📊 **Extreme Simplification**
  - Tools: 17 → 10 (unified entry points)
  - Resources: 11 → 7 (API docs only)
  - Prompts: 2 → 0 (removed, AI doesn't use)

- 🎯 **Clear Responsibilities**
  - Tools: Entry points for AI (guides + operations)
  - Resources: API documentation (reference material)

- 🔧 **check_environment Enhancement**
  - Now checks local token file
  - Shows correct status even without env vars

- 🌍 **miniapp_id Support**
  - Cached and displayed in all relevant tools
  - Used for building preview links

### Fixed
- ✅ **OAuth Non-Blocking** - Server starts in < 1 second
- ✅ **VSCode Compatibility** - AI calls `get_integration_guide` Tool
- ✅ **Claude Code Compatibility** - AI reads Resources
- ✅ **API Documentation** - Aligned with source code
- ✅ **NO SDK Emphasis** - Multiple reinforcements

### Migration from beta.1-beta.9
- Replace Prompt usage → Call `get_integration_guide` Tool
- Replace Resource `guide://leaderboard/integration-workflow` → Call Tool
- Replace Resource `app://current-app-info` → Call `get_current_app_info` Tool

## [1.2.0] - 2025-10-15

### ⚠️ BREAKING CHANGES
- Based on v1.1.4 (includes all API fixes and Minigame & H5 support)
- 🗑️ **Removed 9 deprecated documentation Tools** - Forces AI agents to use Resources and Prompts
  - Removed: `start_leaderboard_integration` → Use Prompt `leaderboard-integration`
  - Removed: `get_leaderboard_manager` → Use Resource `docs://leaderboard/api/get-manager`
  - Removed: `open_leaderboard` → Use Resource `docs://leaderboard/api/open`
  - Removed: `submit_scores` → Use Resource `docs://leaderboard/api/submit-scores`
  - Removed: `load_leaderboard_scores` → Use Resource `docs://leaderboard/api/load-scores`
  - Removed: `load_current_player_score` → Use Resource `docs://leaderboard/api/load-player-score`
  - Removed: `load_player_centered_scores` → Use Resource `docs://leaderboard/api/load-centered-scores`
  - Removed: `get_leaderboard_overview` → Use Resource `docs://leaderboard/overview`
  - Removed: `get_leaderboard_patterns` → Use Resource `docs://leaderboard/patterns`

### Changed
- 📊 **New tool count: 8 tools** (down from 17)
  - Kept only operational tools (create, list, publish, etc.)
  - Kept `search_leaderboard_docs` (requires dynamic parameters)
  - All documentation now exclusively through Resources (9 resources)
  - All workflows now exclusively through Prompts (2 prompts)

### Improved
- 🚀 **Forces proper MCP architecture** - AI agents must use the right primitives
  - Resources for read-only documentation
  - Prompts for user-triggered workflows
  - Tools only for operations with side effects
- ⚡ **Better performance** - Resources are cacheable by MCP clients
- 🎯 **Clearer separation of concerns** - Follows MCP design philosophy

### Migration Guide
If you were using the removed Tools, update to:
- Documentation: Use `readResource("docs://leaderboard/api/...")`
- Workflows: Use `getPrompt("leaderboard-integration")`
- Operations: Continue using Tools like `create_leaderboard`

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
