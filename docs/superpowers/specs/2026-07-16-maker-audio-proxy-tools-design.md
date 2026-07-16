# Maker Audio Proxy Tools Design

## Goal

Expose and fully adapt the five audio-related Maker MCP tools in the Local MCP:
`text_to_sound_effect`, `batch_sound_effects`, `text_to_dialogue`,
`audition_voices_for_character`, and `confirm_character_voice`.

## Scope

- Add the five names to the existing remote proxy allowlist and decorate their
  schemas with the existing private `target_dir` field.
- Rewrite only `text_to_dialogue.inputs[].reference_audio` before forwarding:
  preserve data URLs, read local audio files, or download HTTP(S) audio into a
  complete data URL. Reject `reference_audio` plus `reference_audio_path` on one
  input and reject unsupported/oversized sources.
- Materialize service-generated audio into the bound project using the returned
  `targetDirectory` and `suggestedFileName`, preserving the provider format and
  updating `.maker/assets/generated-assets.json`.
- Keep audition candidates remote-only; never download them into project assets.
- On successful voice confirmation, atomically persist Doubao reference MP3 plus
  `.project/audio-voice-mapping.json`, or merge ElevenLabs data into
  `.project/elevenlabs-voice-mapping.json`. Preserve unrelated characters and
  roll back on any failure.
- Preserve existing remote error handling and diagnostics for malformed payloads
  or `isError` results.

## Architecture

`src/maker/server/mcp.ts` remains the registration and schema decoration layer.
`src/maker/server/proxyAssets.ts` owns all local argument rewriting and result
materialization. Existing path guards, fetch injection, collision suffixing, and
asset registry helpers are reused. No OGG conversion, credit accounting, or
server workspace writes are added to Local MCP.

The result pipeline parses each text content item independently. A valid audio
contract is transformed with local metadata (`localPath`, `absolutePath`, and
download status); malformed JSON or unknown payload shapes are returned as-is.
Batch results process successful items even when the top-level result is partial
failure. Confirmation updates are staged through temporary files and rename,
with old file/config snapshots restored if a later step fails.

## Validation and tests

- Registration tests assert all five tools are exposed and receive `target_dir`.
- Argument tests cover data URL identity, local/HTTP source conversion, MIME
  detection, mutual exclusion, unsupported extensions, and size limits.
- Materialization tests use a local fetch stub/server and assert bytes, paths,
  collision behavior, registry entries, partial batch success, and traversal
  protection.
- Audition tests assert candidates and generated voice IDs are preserved without
  creating files.
- Doubao confirmation tests assert reference bytes, mapping merge, defaults,
  timestamps, and rollback; ElevenLabs tests assert mapping-only persistence.
