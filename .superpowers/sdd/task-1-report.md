# Task 1 Report: Register and Decorate Audio Proxy Tools

## Implementation

- Added the five audio proxy tools to `MAKER_REMOTE_PROXY_EXPOSED_TOOL_NAMES` in the
  documented order:
  `text_to_sound_effect`, `batch_sound_effects`, `text_to_dialogue`,
  `audition_voices_for_character`, and `confirm_character_voice`.
- Added concise English workflow guidance for sound effects, dialogue, audition, and voice
  confirmation, including the existing full remote error payload policy.
- Kept the existing private `target_dir` schema decoration and forwarding behavior. Every
  newly exposed audio tool receives `target_dir` without adding it to `required`.
- Added non-mutating nested schema decoration for `text_to_dialogue`:
  `reference_audio` documents data URL, local file path, and HTTP(S) URL support, while
  `reference_audio_path` is documented as an unchanged remote project resource. The
  description also states their mutual exclusion and the uncommitted-local-audio boundary.
- Updated the remote call path to await `prepareRemoteProxyToolArgsAsync`, while retaining the
  synchronous helper export for existing callers. This lets the Local MCP convert HTTP(S)
  `reference_audio` values before forwarding them to the remote tool.
- Updated registration, allowlist-order, required-field, schema-decoration, description, and
  unavailable-proxy expectations in `makerBuildLocalChanges.test.ts`.

## Validation

- `npx jest src/__tests__/makerBuildLocalChanges.test.ts --runInBand --runTestsByPath`
  - PASS: 125 tests.
- `npm run build`
  - PASS: server, proxy, and Maker bundles built successfully with native signer skipped.
- `npm run lint`
  - Exit 0 with one pre-existing/out-of-scope warning in `src/maker/server/proxyAssets.ts`:
    `AUDIO_CONFIRM_MAX_BYTES` is assigned but unused.
- `npx prettier --check src/maker/server/mcp.ts src/__tests__/makerBuildLocalChanges.test.ts`
  - PASS after formatting the updated test file.

## Concerns

- The full lint command still reports the unrelated `proxyAssets.ts` unused-constant warning;
  fixing it is outside Task 1's allowed files and should be handled by the audio materialization
  task owner.
- Runtime audio result materialization remains in Task 2; this task only registers and describes
  the tools and wires the async argument-rewrite entry point into remote forwarding.
