# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
