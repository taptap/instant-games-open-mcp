# Maker Python Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare a reliable local Python runtime for Maker Lua diagnostics without making Python a hard blocker for Maker MCP's main build flow.

**Architecture:** Add a focused `src/maker/system/python.ts` module that first reuses trusted existing Python and falls back to uv-managed Python under `~/.taptap-maker/`. CLI commands expose doctor/setup/path. MCP status surfaces readiness and build tool descriptions guide agents to run setup when Lua diagnostics are needed.

**Tech Stack:** TypeScript, Node `spawnSync`, Maker CLI, Maker MCP status, Jest.

---

### Task 1: Python Runtime Module

**Files:**

- Create: `src/maker/system/python.ts`
- Test: `src/__tests__/makerPythonRuntime.test.ts`

- [x] Write failing tests for Windows Store alias rejection, existing Python reuse, pip-missing status, and uv-managed setup.
- [x] Implement `checkMakerPythonEnvironment`, `setupMakerPythonEnvironment`, `getMakerPythonConfigPath`, and `formatMakerPythonEnvironmentStatus`.
- [x] Keep uv and managed Python inside `~/.taptap-maker/`, using `UV_INSTALL_DIR`, `INSTALLER_NO_MODIFY_PATH`, and `UV_PYTHON_INSTALL_DIR`.
- [x] Run `npm test -- makerPythonRuntime.test.ts --runInBand`.

### Task 2: CLI Commands

**Files:**

- Modify: `src/maker/cli/commands.ts`
- Modify: `src/maker/index.ts`
- Test: `src/__tests__/makerCliCommands.test.ts`

- [x] Add `taptap-maker python doctor`, `taptap-maker python setup`, and `taptap-maker python path`.
- [x] Include Python environment in `taptap-maker doctor` JSON and text output.
- [x] Update help output in both CLI command paths.
- [x] Run `npm test -- makerCliCommands.test.ts --runInBand`.

### Task 3: MCP Status And Agent Guidance

**Files:**

- Modify: `src/maker/server/mcp.ts`
- Test: `src/__tests__/makerBuildLocalChanges.test.ts`

- [x] Add `Python environment` to `maker://status` / `maker_status_lite`.
- [x] Update tool descriptions to guide agents to run `taptap-maker python setup` before local Lua diagnostics when needed.
- [x] Keep missing Python non-blocking for remote build flow.
- [x] Run `npm test -- makerBuildLocalChanges.test.ts --runInBand`.

### Task 4: Documentation And Verification

**Files:**

- Modify: `docs/MAKER.md`
- Modify: `docs/MAKER_CLI_MCP_SKILL_REWORK_OVERVIEW.md`

- [x] Document the Python runtime strategy and commands.
- [x] Run `npm run build`.
- [x] Run focused Jest suites.
