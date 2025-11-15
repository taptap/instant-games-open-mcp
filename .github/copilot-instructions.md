# Copilot Instructions for TapTap MCP Server

This file provides instructions for GitHub Copilot when reviewing code in this repository.

## Language Preference

**IMPORTANT**: Always respond in Chinese (简体中文) when providing code review feedback.
- Use Chinese for all comments, explanations, and suggestions
- Technical terms can remain in English when appropriate
- Code examples and snippets should include Chinese comments

## Project Overview

This is a Model Context Protocol (MCP) server for TapTap Open API, providing:
- Leaderboard management APIs
- H5 game management
- OAuth 2.0 authentication
- Multi-tenant support

## Code Review Focus Areas

### 1. Architecture and Design

**Modular Architecture**:
- Each feature is self-contained in `src/features/[feature]/`
- Business modules can depend on `core/` and `features/app/`
- Business modules must NOT depend on each other
- Always check: does new code follow the module dependency rules?

**Unified Format**:
- All Tools must use `ToolRegistration[]` format with `definition` + `handler`
- All Resources must use `ResourceRegistration[]` format
- Check: are tools/resources using the unified format?

### 2. TypeScript and Type Safety

- All async functions must use `async/await` syntax
- Avoid `any` types unless absolutely necessary (MCP SDK exceptions allowed)
- All functions and interfaces should have JSDoc comments
- Check: are types properly defined and documented?

### 3. Security

**Authentication**:
- All API requests must go through `HttpClient` class
- MAC Token and request signature are handled automatically
- Never hardcode tokens or secrets
- Check: are credentials properly managed?

**Private Parameters**:
- Private parameters (starting with `_`) are for MCP Proxy only
- Business logic must NOT access private parameters directly
- Use `getEffectiveContext()` to merge private params into context
- Check: is private parameter protocol followed?

### 4. Error Handling

- All API errors must be properly caught and logged
- User-facing error messages should be clear and actionable
- Include context in error messages (which tool, what operation)
- Check: is error handling comprehensive and informative?

### 5. Code Quality

**Naming Conventions**:
- Use camelCase for variables and functions
- Use PascalCase for classes and types
- Use UPPER_CASE for constants
- Check: does naming follow conventions?

**Code Organization**:
- Keep functions small and focused (< 50 lines ideally)
- Avoid code duplication - extract to shared utilities
- Check: can this code be simplified or deduplicated?

### 6. Testing

- Critical business logic should have unit tests
- Test files should be in `src/__tests__/` or co-located with source
- Check: does this change need tests?

### 7. Documentation

**When to update documentation**:
- New features → Update README.md and CLAUDE.md
- API changes → Update relevant docs
- Architecture changes → Update CLAUDE.md
- Check: does documentation need updating?

### 8. CI/CD Compliance

**Commit Messages**:
- Must follow Conventional Commits format
- Types: feat, fix, docs, refactor, chore, test, ci
- Breaking changes must include `!` or `BREAKING CHANGE:`
- Check: would this commit message pass commitlint?

**Branch Strategy**:
- Feature branches only (no direct commits to main)
- PR must pass all CI checks before merge
- Check: is this following the PR workflow?

## Common Issues to Flag

1. ❌ Direct API calls without using HttpClient
2. ❌ Business logic accessing private parameters
3. ❌ Missing error handling in async operations
4. ❌ Hardcoded values that should be environment variables
5. ❌ Missing JSDoc comments on public functions
6. ❌ Module circular dependencies
7. ❌ Unused imports or variables
8. ❌ Console.log statements (should use logger)
9. ❌ Missing input validation in tool handlers
10. ❌ Inconsistent code formatting

## Best Practices to Encourage

1. ✅ Use existing core utilities (cache, logger, docHelpers)
2. ✅ Follow the unified format for tools and resources
3. ✅ Reuse app module for common operations
4. ✅ Add TypeScript types for better safety
5. ✅ Include usage examples in comments
6. ✅ Keep business logic separate from API calls
7. ✅ Use context resolver for multi-tenant support
8. ✅ Log important operations in verbose mode
9. ✅ Handle edge cases gracefully
10. ✅ Write self-documenting code

## Review Tone

**Language**: Always respond in Chinese (简体中文)

**Style**:
- Be constructive and educational (建设性和教育性)
- Explain WHY a change is needed, not just WHAT to change (解释为什么需要改变，而不仅仅是改什么)
- Suggest alternatives when pointing out issues (指出问题时提供替代方案)
- Recognize good patterns when you see them (认可好的代码模式)
- Focus on meaningful improvements, not nitpicks (关注有意义的改进，而非吹毛求疵)

**Example Response Format**:
```
❌ 问题：这里缺少错误处理
💡 建议：添加 try-catch 块来处理可能的 API 失败
📝 原因：如果 API 调用失败，当前代码会导致未捕获的异常
✅ 示例：[提供代码示例]
```

## Priority Levels

**Critical** (must fix):
- Security vulnerabilities
- Breaking changes without proper marking
- Logic errors that cause incorrect behavior

**Important** (should fix):
- Performance issues
- Missing error handling
- Architectural violations

**Nice to have** (optional):
- Code style improvements
- Additional documentation
- Test coverage improvements
