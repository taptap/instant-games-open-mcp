# Copilot Instructions

> This file provides guidance to GitHub Copilot when working with this repository.

## Language Preference

**IMPORTANT: All responses, PR descriptions, commit message bodies, and comments MUST be written in Chinese (Simplified).**

> Note: Commit message type and scope should remain in English (e.g., `feat(proxy):`, `fix(auth):`), only the subject and body can be in Chinese.

---

## Request Handling

When mentioned with `@copilot` in PR comments, follow this unified workflow:

### Workflow: Review → Fix → Summarize

**Trigger keywords**: `审核`, `review`, `检查`, `看一下`, `帮我看`, `修复`, `fix`, `改一下`, `修改`, `实现`, `添加`

**Actions**:

1. **Review** - Analyze the code changes and identify issues
2. **Fix** - Create fixes for identified issues (if any)
3. **Summarize** - Reply with a summary in Chinese, including:
   - Issues found
   - Changes made
   - Recommendations

### Example Requests

| User says                 | Action                   |
| ------------------------- | ------------------------ |
| `@copilot 审核这个PR`     | Review → Fix → Summarize |
| `@copilot review this PR` | Review → Fix → Summarize |
| `@copilot 帮我看看代码`   | Review → Fix → Summarize |
| `@copilot 修复这个问题`   | Review → Fix → Summarize |

---

## Commit Message Convention

This repository uses [Conventional Commits](https://www.conventionalcommits.org/) specification.

**All commits MUST follow this format:**

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Rules

1. **Use proper commit format** (Note: Copilot's built-in "Initial plan" commit is an internal Coding Agent mechanism and is automatically ignored by commitlint)

   Avoid these formats for manual commits:
   - `WIP`
   - `temp`
   - `test`
   - Any message without a type prefix

2. **Use one of these types:**
   - `feat:` - New feature (triggers minor version)
   - `fix:` - Bug fix (triggers patch version)
   - `docs:` - Documentation only (no release)
   - `style:` - Code style (no release)
   - `refactor:` - Code refactoring (triggers patch version)
   - `perf:` - Performance improvement (triggers patch version)
   - `test:` - Adding tests (no release)
   - `chore:` - Maintenance tasks (no release)
   - `ci:` - CI configuration (no release)

3. **Subject rules:**
   - Use imperative mood ("add" not "added")
   - Don't capitalize first letter
   - No period at the end
   - 5-100 characters

### Examples

✅ Good:

```
feat(proxy): add cookie sticky session support
fix(auth): handle expired token refresh
refactor(api): simplify error handling
chore: update dependencies
```

❌ Bad (avoid for manual commits):

```
WIP
Added new feature
fix bug
temp commit
```

### For Planning/Investigation

If you need to commit work-in-progress or planning notes, use:

```
chore(planning): initial investigation for feature X
docs(notes): document approach for issue #123
```

---

## Code Style & Standards

### TypeScript

- Use TypeScript for all new code
- Enable strict mode (`strict: true`)
- Prefer `interface` over `type` for object shapes
- Use explicit return types for public functions
- Avoid `any` - use `unknown` if type is truly unknown

### Naming Conventions

| Type       | Convention                       | Example               |
| ---------- | -------------------------------- | --------------------- |
| Files      | camelCase                        | `cookieJar.ts`        |
| Classes    | PascalCase                       | `CookieJar`           |
| Functions  | camelCase                        | `getCookieHeader`     |
| Constants  | UPPER_SNAKE_CASE                 | `MAX_RETRY_COUNT`     |
| Interfaces | PascalCase (optional `I` prefix) | `Cookie` or `ICookie` |
| Types      | PascalCase                       | `ProxyConfig`         |

### Code Organization

```
src/
├── core/           # Core utilities (http, auth, config)
├── features/       # Feature modules (leaderboard, share, etc.)
│   └── [feature]/
│       ├── index.ts    # Module exports
│       ├── tools.ts    # MCP tool definitions
│       ├── types.ts    # TypeScript types
│       └── api.ts      # API calls (if needed)
├── mcp-proxy/      # Proxy implementation
└── server.ts       # Main server entry
```

### Documentation

- Add JSDoc comments for all public APIs
- Use English for code comments
- Include `@param`, `@returns`, `@throws` tags
- Add `@example` for complex functions

```typescript
/**
 * Creates a fetch wrapper that manages cookies automatically.
 * @param cookieJar - The CookieJar instance to use
 * @returns A fetch-compatible function
 * @example
 * const jar = new CookieJar();
 * const customFetch = createCookieFetch(jar);
 * const response = await customFetch('https://api.example.com');
 */
export function createCookieFetch(cookieJar: CookieJar): typeof fetch {
  // ...
}
```

### Error Handling

- Use custom error classes for domain-specific errors
- Always include error context (what operation failed)
- Log errors with structured information
- Never swallow errors silently

```typescript
// ✅ Good
try {
  await client.connect();
} catch (error) {
  console.error('[Proxy] Connection failed:', formatError(error));
  throw error;
}

// ❌ Bad
try {
  await client.connect();
} catch (error) {
  // silently ignore
}
```

---

## Code Review Guidelines

### Review Checklist

- [ ] Commit messages follow Conventional Commits format
- [ ] No TypeScript errors (`npm run build` passes)
- [ ] No ESLint errors (`npm run lint` passes)
- [ ] Code is properly formatted (`npm run format:check` passes)
- [ ] New public APIs have JSDoc documentation
- [ ] Error cases are handled appropriately
- [ ] No hardcoded secrets or credentials
- [ ] No unnecessary dependencies added

### When Suggesting Changes

Provide:

1. **What** - Clear description of the change
2. **Why** - Reason for the change
3. **How** - Code example if applicable

---

## Pull Request Guidelines

### PR Title Format

PR titles should follow Conventional Commits format:

```
feat(proxy): add cookie sticky session support
fix(auth): handle token refresh edge case
```

### PR Description Template

```markdown
## Summary

Brief description of changes.

## Changes

- Change 1
- Change 2

## Testing

How was this tested?

## Related Issues

Closes #123
```

### Before Submitting

1. Run `npm run build` - Ensure no TypeScript errors
2. Run `npm run lint` - Fix any linting issues
3. Run `npm run format` - Format code properly
4. Run `npm test` - Ensure tests pass
5. Update documentation if needed

---

## Architecture Rules

### Module Dependencies

```
✅ Allowed:
- features/* → core/*
- features/* → features/app/*
- mcp-proxy/* → core/*

❌ Not Allowed:
- features/A → features/B (cross-feature dependency)
- core/* → features/* (core should not depend on features)
```

### Adding New Features

1. Create feature directory under `src/features/`
2. Define types in `types.ts`
3. Define MCP tools in `tools.ts`
4. Register in `src/server.ts`

Use the scaffolding script:

```bash
./scripts/create-feature.sh
```

---

## MCP Tool Development

### Tool Definition

```typescript
export const myToolDefinition: ToolDefinition = {
  name: 'my_tool_name',
  description: 'Clear description of what the tool does. Include when to use it.',
  inputSchema: {
    type: 'object',
    properties: {
      param1: {
        type: 'string',
        description: 'Description of param1',
      },
    },
    required: ['param1'],
  },
};
```

### Tool Handler

```typescript
export async function handleMyTool(args: MyToolArgs): Promise<string> {
  // Validate inputs
  if (!args.param1) {
    throw new Error('param1 is required');
  }

  // Perform operation
  const result = await doSomething(args.param1);

  // Return JSON string
  return JSON.stringify(result, null, 2);
}
```

### Tool Guidelines

- Tool descriptions should be in English (for better AI understanding)
- Handler must return `Promise<string>` (JSON formatted)
- Include usage scenarios in description
- Validate all required inputs
- Handle errors gracefully with informative messages
