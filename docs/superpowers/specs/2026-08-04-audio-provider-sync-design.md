# Audio Provider Sync Design

## Goal

Synchronize the local Maker MCP proxy with the Maker server's default ElevenLabs
audio contract while preserving explicit `AUDIO_PROVIDER=doubao` compatibility.

## Design

- Treat the remote `tools/list` audio schemas as authoritative.
- Detect the exposed audio contract from the returned schema and use it to select
  the reviewed public descriptions and provider-specific schema decoration.
- Do not inject or require Doubao-only `voice_profile`, `reference_audio`, or
  `delivery_instruction` fields when the remote contract is ElevenLabs.
- Keep local asset materialization, ElevenLabs voice mapping injection, and Doubao
  reference-audio persistence as separate provider paths.
- Keep the change limited to the proxy server, its contract tests, and Maker docs.

## Expected ElevenLabs Surface

- Sound effects: `duration_seconds` from 0.5 to 30 and `prompt_influence` from 0
  to 1 with default 0.3.
- Dialogue: confirmed ElevenLabs voice mappings, optional `stability` from 0 to 1,
  and no Doubao reference-audio fields in the public schema.
- Voice audition: Voice Design with `candidate_count` from 1 to 3 and an audition
  line of at least 100 characters; no `voice_profile` requirement.

## Compatibility

When the remote schema exposes Doubao fields, existing Doubao descriptions,
validation, reference-audio rewriting, and mapping persistence remain available.

## Verification

Add regression coverage for both schema shapes, then run the focused audio tests,
the TypeScript build, lint, and the complete Jest suite.
