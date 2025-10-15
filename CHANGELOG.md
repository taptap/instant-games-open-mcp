# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
  - 8 new Resources for LeaderboardManager API documentation
  - URI scheme: `docs://leaderboard/api/*` for API docs
  - URI scheme: `docs://leaderboard/overview` for complete overview
  - URI scheme: `docs://leaderboard/patterns` for best practices
  - Resources provide structured, cacheable documentation data
  - Better semantic clarity: "read documentation" vs "call tool"
  - Improved AI Agent efficiency with direct resource access

- 🎨 **MCP Prompts Support** - Added reusable workflow templates
  - `leaderboard-integration` - Complete interactive integration guide
  - `leaderboard-troubleshooting` - Common issues and solutions guide
  - Support for parameterized prompts (e.g., specific error codes)
  - User-triggered workflows for standardized tasks
  - Pre-built templates for consistent user experience

### Improved
- 📊 **Better MCP Architecture** - Proper separation of concerns
  - Tools: Only for operations with side effects (5 tools)
  - Resources: Read-only documentation and data (8 resources)
  - Prompts: User-triggered workflow templates (2 prompts)
  - Follows MCP design philosophy and best practices
  - Enhanced startup messages showing all three capabilities

- 🔄 **Backward Compatible** - All existing Tools still work
  - Documentation Tools still available for compatibility
  - Gradual migration path for existing users
  - No breaking changes to existing integrations

### Changed
- 🏗️ **Server Architecture** - Enhanced with new handlers
  - Added `resourceDefinitions.ts` for Resource configuration
  - Added `promptDefinitions.ts` for Prompt configuration
  - Added `promptHandlers.ts` for Prompt template logic
  - New request handlers: `ListResources`, `ReadResource`, `ListPrompts`, `GetPrompt`
  - Server now declares all three MCP capabilities

- 📈 **Version Bump** - Minor version increase (1.0.16 → 1.1.0)
  - Follows semantic versioning
  - New features without breaking changes
  - Ready for gradual adoption of Resources and Prompts

## [1.0.16] - 2025-10-14

### Improved
- 🤖 **Smart AI Agent behavior** - Context-aware leaderboard creation with intelligent suggestions
  - AI now analyzes project files and code to infer game type
  - Provides intelligent configuration suggestions based on context
  - Only requires user confirmation instead of answering multiple questions
  - Supports three response modes:
    - ✅ User confirms → Create immediately
    - 🔄 User wants modifications → Adjust settings and confirm again
    - ❌ User rejects → Ask detailed questions and provide new suggestions
  - Fallback to detailed questions when context is unclear
  - Significantly improved user experience with fewer steps

### Fixed
- 🐛 **Fixed TypeScript warning** - Renamed unused `args` parameter to `_args` in startLeaderboardIntegration

## [1.0.15] - 2025-10-14

### Fixed
- 🐛 **Fix leaderboard_id undefined bug** - Corrected API response field mapping
  - API returns `id` and `leaderboard_open_id`, not `leaderboard_id` and `open_id`
  - Updated `CreateLeaderboardResponse` interface to match actual API response
  - Fixed: `leaderboard_id` → `id` (排行榜数据库 ID)
  - Fixed: `open_id` → `leaderboard_open_id` (客户端使用的开放 ID)
  - Now returns correct IDs when creating leaderboards

### Changed
- 🚀 **Auto-publish leaderboards** - Simplified user experience by removing whitelist mode complexity
  - Leaderboards are now automatically published after creation
  - Removed all whitelist status indicators from UI
  - Removed whitelist-related user prompts and guidance
  - Users no longer need to manually publish leaderboards
  - `publish_leaderboard` tool still available for special use cases

### Improved
- ✨ **Simplified workflow** - Streamlined leaderboard creation and integration process
  - Updated creation success message to show auto-publish status
  - Removed "发布排行榜上线" option from integration workflow
  - Cleaner leaderboard list display without status badges
  - Better user experience with fewer manual steps

## [1.0.14] - 2025-10-14

### Added
- 🚀 **New publish_leaderboard tool** - Control leaderboard visibility
  - Publish leaderboard to production (visible to all users)
  - Set to whitelist-only mode (visible to whitelist users only)
  - Auto-fetches developer_id and app_id
  - Comprehensive error handling and user guidance

### Improved
- 💡 **Enhanced integration workflow** - Smart status detection and guidance
  - Display leaderboard publish status (🚀 published / 🔒 whitelist-only)
  - Auto-detect whitelist mode and prompt for publishing
  - Show publish reminders for leaderboards in testing mode
  - Added "发布排行榜上线" to feature list

### Changed
- 📝 **Updated create_leaderboard messages** - Inform users about default whitelist mode
  - Explain new leaderboards start in whitelist-only mode
  - Provide clear steps for testing and publishing
  - Guide users through complete workflow

## [1.0.13] - 2025-10-10

### Changed
- 🔄 **Rename environment variables** - Align with tapcode-mcp-h5 naming convention
  - `TAPTAP_MAC_TOKEN` → `TDS_MCP_MAC_TOKEN`
  - `TAPTAP_CLIENT_ID` → `TDS_MCP_CLIENT_ID`
  - `TAPTAP_CLIENT_SECRET` → `TDS_MCP_CLIENT_TOKEN`
  - `TAPTAP_ENV` → `TDS_MCP_ENV`
  - `TAPTAP_PROJECT_PATH` → `TDS_MCP_PROJECT_PATH`
  - `TAPTAP_MINIGAME_MCP_VERBOSE` → (unchanged, kept as is)
  - Updated all documentation and code to use TDS_MCP_* prefix
  - Maintains consistency with tapcode-mcp-h5 project

## [1.0.12] - 2025-10-10

### Fixed
- 📝 **Fix documentation inconsistencies** - Corrected code examples to prevent AI confusion
  - Fixed: Use `leaderboardId` (not `leaderboardName`) consistently
  - Fixed: All API calls must use object parameters, not direct strings
  - Fixed: submitScores must wrap scores in `{ scores: [...] }` object
  - Fixed: loadCurrentPlayerLeaderboardScore takes `{ leaderboardId, collection }` object
  - Fixed: loadPlayerCenteredScores takes `{ leaderboardId, before, after }` object
  - Fixed: openLeaderboard takes `{ leaderboardId, collection }` object
  - Added warning in Quick Start section about correct parameter format
  - Prevents AI agents from generating incorrect code with wrong field names

## [1.0.11] - 2025-10-10

### Fixed
- 🐛 **Add period_time auto-default logic** - Required when period_type is not 1 (ALWAYS)
  - When period_type is 2/3/4 (Daily/Weekly/Monthly), period_time is REQUIRED
  - Auto-defaults to "08:00:00" (8 AM) if not provided
  - Prevents 500 Internal Server Error caused by missing period_time

### Improved
- 📝 **Enhanced period_type documentation**
  - Clarified: 3=Weekly (resets every Monday)
  - Clarified: 4=Monthly (resets on 1st of month)
  - Added warning about period_time requirement
  - Updated all examples to include period_time when needed

## [1.0.10] - 2025-10-10

### Fixed
- 🐛 **Revert to form-urlencoded** - Server requires form format, not JSON
  - JSON format causes "必填" errors even with string/number variations
  - Server's form parser handles numeric enum values correctly (when not 0)
  - Reverted Content-Type to application/x-www-form-urlencoded
  - All parameters sent as numbers (except text fields)
  - **Critical**: All enum values must be >= 1 (not 0)

### Notes
- About isError=false: This is MCP protocol behavior - tools that return strings (including error messages) are considered "successful execution". Only thrown exceptions result in isError=true. The error message in the output is sufficient for AI agents to detect and handle failures.

## [1.0.9] - 2025-10-10

### Fixed
- 🐛 **Hotfix for JSON parameter types** - Attempted fix (reverted in 1.1.0)
  - IDs (developer_id, app_id, display_limit) should remain as numbers
  - Enums (period_type, score_type, score_order, calc_type) should be strings
  - This approach didn't work - server still rejected requests

## [1.0.8] - 2025-10-10

### Changed
- 🔄 **Republish 1.0.7 fixes as 1.0.8** - Contains all fixes from 1.0.7

## [1.0.7] - 2025-10-10

### Fixed
- 🐛 **Critical fix for create_leaderboard** - Multiple fixes for API compatibility
  1. **Corrected enum values** - 0 is invalid (UNSPECIFIED)
     - period_type: 1=Always, 2=Daily, 3=Weekly, 4=Monthly
     - score_type: 1=Integer, 2=Time
     - score_order: 1=Descending, 2=Ascending
     - calc_type: 1=Sum, 2=Best, 3=Latest
  2. **Convert parameters to strings** - Server expects string values in JSON
     - All numeric parameters converted via String()
     - Fixes "cannot unmarshal number into Go struct field" error
  3. **Enhanced error messages** - Context-aware error handling
     - Detects parameter errors and provides correct enum values
     - Detects authentication errors with specific guidance
     - Detects permission errors
     - Better troubleshooting information for AI agents

### Improved
- 📝 **Enhanced start_leaderboard_integration tool**
  - Added clarification: NO npm packages or JS SDKs required
  - Emphasized use of global 'tap' object
  - Updated enum value descriptions to correct values
  - Better workflow guidance

### Added
- 📚 **Documentation improvements**
  - Added TOOLS-COMPARISON.md explaining three tools' differences
  - Added API-ENUM-VALUES.md with complete enum reference

## [1.0.6] - 2025-10-09

### Improved
- 📝 **Enhanced tool descriptions** - Significantly improved `create_leaderboard` tool description
  - Added clear list of 5 REQUIRED parameters with explanations
  - Added common configuration examples (high score, racing, cumulative)
  - Emphasized that score_type MUST be a number (0, 1, or 2)
  - Added detailed parameter descriptions with real-world examples
  - Better guidance for AI agents to provide correct parameters

## [1.0.5] - 2025-10-09

### Fixed
- 🐛 **Critical bug fix** - Fixed API field name mismatch (`levels` vs `crafts`)
  - API returns `levels` field, but code was accessing `crafts` field
  - Caused "Cannot read properties of undefined (reading '0')" error
  - Updated type definitions and all field accesses
  - Added backward compatibility support for both field names

## [1.0.4] - 2025-10-09

### Enhanced
- 🔍 **Significantly improved verbose logging** - More detailed HTTP request/response logs
  - Request logs now show:
    - Separate method and URL display
    - Authorization header highlighted independently (with MAC signature redacted)
    - Header count display (e.g., "6 total")
    - JSON request body auto-parsing and formatting
    - Clear empty body indication
  - Response logs now show:
    - Full response headers with count
    - Smart JSON/text detection and formatting
    - Clear empty body indication
  - Enhanced log format with 100-character separators for better readability
  - Added VERBOSE-LOG-EXAMPLE.md with comprehensive logging examples

### Changed
- Updated logger separator width from 80 to 100 characters
- Enhanced security: MAC signatures now show as `***REDACTED***`

## [1.0.3] - 2025-10-09

### Added
- 🔍 **Verbose logging mode** controlled by `TAPTAP_MINIGAME_MCP_VERBOSE` environment variable
  - Tool call logging with input/output tracking
  - HTTP request logging with headers and body
  - HTTP response logging with status and data
  - Automatic sensitive data masking (MAC tokens, signatures)
  - ISO timestamp for all log entries
  - Formatted output with clear separators

### Changed
- Enhanced server startup messages to show verbose mode status
- Updated documentation in README.md and CLAUDE.md
- Improved debugging experience for developers

### Fixed
- Better error tracking with detailed logs

## [1.0.2] - 2025-10-09

### Changed
- Refactored MCP server to TapTap Minigame version
- Optimized module imports and error handling
- Updated authentication to use MAC Token format

### Added
- Developer and app management tools
- Automatic ID fetching and caching

## [1.0.1] - 2025-10-08

### Added
- Environment and leaderboard management handlers
- Support for listing developers and apps
- Optimized leaderboard integration workflow

## [1.0.0] - 2025-10-08

### Added
- Initial release
- Complete LeaderboardManager API documentation (6 APIs)
- Server-side leaderboard management (create, list)
- Intelligent workflow guidance tool
- Auto ID management with local caching
- Multi-environment support (production, rnd)
- MAC Token authentication
- Request signing with HMAC-SHA256
