# Maker Audio Proxy Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Local MCP integration for the five Maker audio proxy tools with secure project-local resource handling and tests.

**Architecture:** Keep remote tool registration and schema decoration in `src/maker/server/mcp.ts`. Keep local audio argument rewriting, result parsing, downloads, registry updates, and voice-mapping transactions in `src/maker/server/proxyAssets.ts`, reusing existing path and fetch helpers. Add focused tests in existing registration coverage and a new audio-specific test file to avoid test-file contention between workers.

**Tech Stack:** TypeScript, Node.js `fs/promises` and `path`, Jest, MCP SDK `Client.callTool` result contracts.

## Global Constraints

- Expose exactly these five remote names: `text_to_sound_effect`, `batch_sound_effects`, `text_to_dialogue`, `audition_voices_for_character`, `confirm_character_voice`.
- Never forward private `target_dir` to the remote service.
- Do not convert OGG or write server workspace assets from Local MCP.
- Reject unsafe paths and preserve existing `RemoteProxyToolResultError` behavior.
- Keep descriptions/tool schemas in English and user-facing responses in Chinese only where existing project conventions require it.
- Add or update tests for every new branch and run `npm run build`, `npm run lint`, and focused Jest tests.

### Task 1: Register and decorate audio proxy tools

**Files:**
- Modify: `src/maker/server/mcp.ts:126-455`
- Modify: `src/__tests__/makerBuildLocalChanges.test.ts` registration/listing expectations

**Interfaces:**
- Consumes the existing `MAKER_REMOTE_PROXY_EXPOSED_TOOL_NAMES`, `decorateRemoteProxyToolDefinition`, and schema helpers.
- Produces five exposed names, `target_dir` schema decoration, and concise audio-specific workflow descriptions. `text_to_dialogue` must mention local path/data URL/HTTP(S) reference support and the `reference_audio`/`reference_audio_path` boundary.

- [ ] Add the five names to `MAKER_REMOTE_PROXY_EXPOSED_TOOL_NAMES` in the documented order.
- [ ] Extend audio descriptions in `decorateRemoteProxyToolDefinition` without mutating upstream business parameters.
- [ ] Ensure all five decorated schemas receive the existing private `target_dir` property and required-field behavior remains unchanged.
- [ ] Update registration/listing tests to include the five remote tool fixtures and expected allowlist order.
- [ ] Run `npx jest src/__tests__/makerBuildLocalChanges.test.ts --runInBand --runTestsByPath` and confirm the registration assertions pass.
- [ ] Commit with a Conventional Commit header and a body listing behavior and validation.

### Task 2: Implement local audio rewrite, materialization, and confirmation persistence

**Files:**
- Modify: `src/maker/server/proxyAssets.ts`
- Create: `src/__tests__/makerAudioProxyTools.test.ts`

**Interfaces:**
- Extend `prepareRemoteProxyToolArgs({ toolName, targetDir, args })` for `text_to_dialogue`.
- Extend `materializeRemoteProxyToolAssets({ toolName, targetDir, result, now, fetchImpl })` for the five tools.
- Preserve existing `RemoteProxyToolResult` shape and add only documented local metadata.

- [ ] Add audio MIME/extension tables for MP3, WAV, OGG, M4A, and AAC and enforce the 20 MiB reference source limit.
- [ ] Implement data URL preservation and local/HTTP(S) reference loading for `text_to_dialogue`; reject bare base64, unsupported formats, and mutually exclusive fields before remote call.
- [ ] Parse `audio_files` contracts for sound effects/dialogue, validate target directories and basenames, download without overwriting, preserve original format, and update `.maker/assets/generated-assets.json` per item.
- [ ] Process partial batch success and per-item download failures independently; keep CDN URLs and diagnostics in returned JSON.
- [ ] Leave audition candidates untouched except for structured result propagation; never create project files.
- [ ] Implement Doubao confirmation transaction: validate target path, download and validate MP3 <= 1 MiB, atomically replace the reference file and merge version 4 mapping while preserving existing characters/defaults/timestamps; restore snapshots on failure.
- [ ] Implement ElevenLabs confirmation mapping merge with version `"1.0"`, no audio download, and visible `cleanupWarning` preservation.
- [ ] Add focused tests for argument rewrite, real bytes/downloads, path attacks, partial batch, audition no-op, Doubao commit/rollback, and ElevenLabs mapping-only behavior.
- [ ] Run `npx jest src/__tests__/makerAudioProxyTools.test.ts --runInBand` and existing proxy tests, then `npm run build` and `npm run lint`.
- [ ] Commit with a Conventional Commit header and a body listing behavior, safety boundaries, and validation.

### Task 3: Integrate, document, and verify

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/PROXY.md`

**Interfaces:**
- Documents the five Local MCP tools, project asset directories, reference-audio input rules, and confirmation mapping files without exposing credential paths.

- [ ] Add a concise Local Maker audio proxy section to `docs/PROXY.md` and link it from `README.md` where proxy tools are described.
- [ ] Update `AGENTS.md` tool overview and local asset policy to include the five names and no-OGG rule.
- [ ] Run `npm run build`, `npm run lint`, `npm run format:check`, and the complete relevant Jest suite.
- [ ] Review the combined diff for path traversal, accidental remote argument mutation, and documentation consistency.
- [ ] Commit documentation and final verification changes with a Conventional Commit body.

