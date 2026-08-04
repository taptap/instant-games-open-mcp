# Audio Provider Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the local Maker proxy's exposed audio descriptions, schemas, and request preparation with the default ElevenLabs server contract while retaining explicit Doubao compatibility.

**Architecture:** Infer the active audio contract from the remote tools returned by `tools/list`. Use that contract when selecting public descriptions and only apply provider-specific schema decoration or validation when the corresponding fields exist. Keep asset materialization and mapping persistence provider-specific as they are today.

**Tech Stack:** TypeScript, Jest, MCP remote tool schemas, Markdown docs.

## Global Constraints

- ElevenLabs is the default public audio contract.
- Explicit `AUDIO_PROVIDER=doubao` remains supported.
- Remote input schemas remain authoritative; local-only `target_dir` remains private and is not forwarded.
- Do not add unrelated refactors or new provider abstractions.

### Task 1: Add failing provider-aware contract tests

**Files:**
- Modify: `src/__tests__/makerAudioToolDescriptions.test.ts`
- Modify: `src/__tests__/makerAudioProxyTools.test.ts`
- Modify: `src/__tests__/makerBuildLocalChanges.test.ts`

- [ ] Add tests asserting ElevenLabs descriptions mention `prompt_influence`, 0.5-30 second effects, `stability`, Eleven v3 prompting, Voice Design, and do not expose Doubao-only wording.
- [ ] Add tests asserting an ElevenLabs audition schema does not gain `voice_profile` or a required `voice_profile.gender`.
- [ ] Add tests asserting ElevenLabs audition preparation accepts no `voice_profile` and ElevenLabs dialogue preparation injects `_local_voice_id` from `.project/elevenlabs-voice-mapping.json`.
- [ ] Add a remote schema fixture for the explicit Doubao shape and assert its existing fields and validation remain intact.
- [ ] Run `npx jest src/__tests__/makerAudioToolDescriptions.test.ts src/__tests__/makerAudioProxyTools.test.ts src/__tests__/makerBuildLocalChanges.test.ts --runInBand` and confirm the new assertions fail for the current implementation.

### Task 2: Make descriptions and schema decoration provider-aware

**Files:**
- Modify: `src/maker/server/toolDescriptions.ts`
- Modify: `src/maker/server/mcp.ts`

- [ ] Add a small provider inference helper based on the remote audio schema, using ElevenLabs markers such as `prompt_influence`/`stability` and Doubao markers such as `voice_profile`/`reference_audio`.
- [ ] Select ElevenLabs public descriptions by default and retain the current Doubao wording for a Doubao schema.
- [ ] Only decorate `voice_profile` and reference-audio properties when those properties exist in the remote schema.
- [ ] Preserve `target_dir` injection and all non-audio tool behavior.
- [ ] Re-run the focused description and build-local schema tests and confirm they pass.

### Task 3: Remove the ElevenLabs audition blocker

**Files:**
- Modify: `src/maker/server/proxyAssets.ts`
- Modify: `src/__tests__/makerAudioProxyTools.test.ts`

- [ ] Change audition argument preparation so the local proxy does not require `voice_profile.gender` for an ElevenLabs-shaped call.
- [ ] Keep provider-specific Doubao reference rewriting and ElevenLabs `_local_voice_id` injection unchanged.
- [ ] Preserve the existing error behavior for malformed explicitly supplied provider fields.
- [ ] Run the focused proxy tests and confirm both provider paths pass.

### Task 4: Update documentation and baseline

**Files:**
- Modify: `docs/MAKER.md`
- Modify: `src/__tests__/fixtures/maker-tool-descriptions-baseline.json`
- Modify: `src/__tests__/makerToolDescriptionScenarios.test.ts` only if the baseline contract requires a test adjustment.

- [ ] Document ElevenLabs as the default, the restart requirement after changing `AUDIO_PROVIDER`, the ElevenLabs parameters, and the retained explicit Doubao path.
- [ ] Regenerate or manually update the public audio schema baseline without changing unrelated tool entries.
- [ ] Run `npm run format:check` for changed TypeScript and Markdown-adjacent generated content.

### Task 5: Full verification

**Files:** None.

- [ ] Run focused audio tests.
- [ ] Run `npm run build`.
- [ ] Run `npm run lint`.
- [ ] Run `npm test -- --runInBand`.
- [ ] Review `git diff`, `git status`, and the final test output before reporting completion.
