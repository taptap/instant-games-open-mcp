# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
