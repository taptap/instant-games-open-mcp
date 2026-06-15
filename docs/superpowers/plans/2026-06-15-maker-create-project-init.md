# Maker Create Project Init Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Maker project creation to the local `taptap-maker init` flow.

**Architecture:** Keep project creation in the CLI initialization layer, not the public MCP runtime tool surface. Add a Maker `/apps` POST helper next to the existing app list and clone helpers, then reuse the current config save, clone, dev-kit, and MCP install path.

**Tech Stack:** TypeScript, Node built-in `fetch`, Jest, Maker CLI.

---

### Task 1: Test the init selection surface

**Files:**

- Modify: `src/__tests__/makerProjectsResponse.test.ts`
- Modify: `src/maker/cli/commands.ts`

- [ ] Add a failing test that `formatMakerProjectList()` always contains:

```text
0. Create a new Maker project
```

even when the list is truncated.

- [ ] Run:

```bash
npm test -- --runInBand src/__tests__/makerProjectsResponse.test.ts
```

Expected: fail because the create row is not present yet.

- [ ] Update `formatMakerProjectList()` so the create row is always appended after visible apps.

- [ ] Re-run the same test and confirm it passes.

### Task 2: Test non-interactive project creation

**Files:**

- Modify: `src/__tests__/makerCliCommands.test.ts`
- Modify: `src/maker/cli/projects.ts`
- Modify: `src/maker/cli/commands.ts`

- [ ] Add a failing test for:

```bash
taptap-maker init --create --name "My Local Game" --skip-mcp-install
```

Expected behavior:

- `createMakerProject()` is called with `{ name: "My Local Game", gameType: "sce" }`
- `cloneMakerProject()` receives the created app id
- `.maker-mcp/config.json` is saved with the created app id

- [ ] Run:

```bash
npm test -- --runInBand src/__tests__/makerCliCommands.test.ts
```

Expected: fail because `createMakerProject()` and `--create` do not exist.

- [ ] Add `createMakerProject()` to `src/maker/cli/projects.ts`.

- [ ] Extend CLI argument parsing and `resolveProjectSelection()` to support `--create` and `--name`.

- [ ] Re-run the same test and confirm it passes.

### Task 3: Preserve existing safety behavior

**Files:**

- Modify: `src/__tests__/makerCliCommands.test.ts`
- Modify: `src/maker/cli/commands.ts`

- [ ] Add a test that an already-bound directory rejects creating a new project into the same directory.

- [ ] Run:

```bash
npm test -- --runInBand src/__tests__/makerCliCommands.test.ts
```

Expected: fail until the create path reuses the existing binding guard.

- [ ] Ensure the create branch still calls `ensureInitTargetCanRecordProject()` before clone.

- [ ] Re-run the same test and confirm it passes.

### Task 4: Sync docs

**Files:**

- Modify: `docs/MAKER.md`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `skills/taptap-maker-local/SKILL.md`

- [ ] Document that `taptap-maker init` can create a new Maker project.

- [ ] Document the new explicit path:

```bash
taptap-maker init --create --name "my-local-game"
```

- [ ] State that new project development must happen in a new independent directory when the current directory is already bound.

### Task 5: Verify

**Files:**

- No new files.

- [ ] Run targeted tests:

```bash
npm test -- --runInBand src/__tests__/makerProjectsResponse.test.ts src/__tests__/makerCliCommands.test.ts
```

- [ ] Run repository checks:

```bash
npm run build
npm run lint
```

- [ ] Inspect `git diff --check`.
