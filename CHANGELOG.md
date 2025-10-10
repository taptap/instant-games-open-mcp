# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
