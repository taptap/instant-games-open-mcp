# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.7] - 2025-10-10

### Fixed
- 🐛 **Critical fix for create_leaderboard API** - Changed Content-Type from form-encoded to JSON
  - Server was rejecting form-encoded requests with `score_type=0`
  - Server's form parser treats `score_type=0` as missing/empty
  - Now using `application/json` instead of `application/x-www-form-urlencoded`
  - Fixes "「score_type」必填" error even when parameter was provided
  - Tested with verbose logs showing correct parameter transmission

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
