# Maker Assets and Game Services

Read only for asset generation/editing, ads, test QR or online game feedback.

## Maker Creative Asset Tool Policy

Maker MCP provides image, video, music, sound-effect, dialogue/voice, and 3D asset tools for Maker
projects. These tools keep generated files inside the project, record remote mappings for later
editing, and can forward resolvable local reference media as data URLs when the remote tool schema
supports it. Follow the selected tool schema when one of these tools is used.

- Use `generate_image` for one image.
- Use `batch_generate_images` for multiple images.
- Use `edit_image` for modifying project images.
- Use `create_video_task` for game videos and image/video referenced generation.
- Only call `create_video_task` after the user explicitly requests video generation. Do not generate
  video proactively while implementing gameplay, filling asset gaps, or improving the game.
- Estimate video cost as duration times 200 credits per second for `model="2.0"`, 300 for
  `model="2.5"`, and for `model="wan"` 42 at 480p, 84 at 720p, and 168 at 1080p. When resolution is
  omitted, wan is billed as 1080p, so use 168 credits per second. If duration is omitted or `duration=-1`, estimate
  at the model maximum. When the estimate exceeds 1000 credits, show the estimate and say actual
  billing is determined at generation, wait for explicit confirmation, then repeat the same request
  with `user_confirmed=true`. Do not pass `user_confirmed=true` before confirmation or at or below
  1000 credits.
- Use `query_video_task` to refresh video task status, release completed task quota, and fetch final videos.
- Use `text_to_music` for game music with Suno.
- Use `text_to_sound_effect` for one sound effect with Doubao Seed Audio.
- Use `batch_sound_effects` for multiple sound effects with Doubao Seed Audio.
- Use `text_to_dialogue` for final character dialogue with ElevenLabs Eleven v3.
- `text_to_dialogue` reuses confirmed local ElevenLabs voice mappings. After confirmation, pass only `character_name` and `text`.
- For ElevenLabs auditions, pass a detailed `character_description` and an `audition_line` of at least 100 characters. `candidate_count` is optional and accepts 1 to 3.
- After `audition_voices_for_character` returns previews, show them to the user and wait
  for the user to choose. Do not select or confirm a voice automatically.
- Call `confirm_character_voice` only after the user explicitly chooses one preview.
- After confirmation, follow `next_step_hint`: call `text_to_dialogue` with the character name and
  text only.
- Generated sound effects and dialogue are saved in the project.
- Voice audition previews are not saved to the project.
- Local MCP does not transcode generated audio to OGG.
- Follow each tool schema for supported local path, remote URL, and data URL inputs.
- Local proxy may convert resolvable local reference media to data URLs before forwarding.
- If a Maker proxy tool returns an error or `isError`, report the full remote result/error payload.
  Include the server response payload so developers can diagnose the issue.
- Use `create_3d_asset` for the complete 3D asset lifecycle. Start with `action="start"`, poll
  with `action="query"`, and use `action="continue"` only after explicit user approval of a
  returned review step. Use `action="post_process"` for rigging, texturing, retopology, or format
  conversion when supported by the remote schema.
- Preserve and inspect the complete remote 3D response. When `local_delivery.status` is `success`,
  use the returned local model path. The local proxy materializes only the `model_files` copy/extract
  instructions returned by the local runtime; report `delivery_failures` when no model can be delivered.
- For any ad-related request such as 广告, rewarded videos, play ads, ad ID, ad placement,
  ad status, ad config, or `ShowRewardVideoAd`, first read `maker://ads-integration-guide`, then
  follow it: confirm project -> `get_ad_config` -> verify remote/local configuration ->
  project SDK docs -> implementation -> real-device validation.
- Keep the same explicit `target_dir` throughout. Remote success does not update local settings;
  if local `@runtime.ad` is missing or differs, follow the guide before proceeding.
- Do not infer ad readiness from local SDK docs, `.maker-mcp/config.json`, or runtime callbacks.
  If the primary local project configs are missing, keep ad config unavailable and do not call the
  remote tool. Build only for an explicit user build/submit/remote Web preview request. If a successful build
  still leaves local configs missing, explain the known limitation and do not automatically rebuild.
- Local window preview uses CLI and does not authorize commit or push.
- If `get_ad_config` reports missing `app_id` or `developer_id`, call `generate_test_qrcode` once
  to generate test QR code metadata, then call `get_ad_config` again. Do not use publish-only tools
  for this recovery path.
- If status or doctor reports `Maker project initialization` with `missing_project_json` or
  `missing_taptap_identity`, follow that `next_action` before using tools that depend on remote
  project config. `.project` directory presence alone is never proof of initialization; empty,
  voice-mapping-only, and primary-config-incomplete directories remain buildable new-project state.
- For the current Maker game's online player feedback, including player-submitted game bug reports,
  real-device game logs, or screenshots, or server/Lua logs for a specified game session,
  call the Maker proxy `get_debug_feedbacks` tool only when it is exposed by the current Maker tool list.
  This includes 当前 Maker 游戏的玩家反馈、
  玩家提交的游戏故障、真机游戏日志或截图、指定游戏会话的服务端/Lua 日志. It does not include
  AI client, plugin, or other product feedback.
- Use local runtime log files only for the current local build/runtime session. Do not use local logs
  as a substitute for remote player-submitted feedback.
- Before `edit_image`, resolve dragged or referenced images to a local project image path or CDN
  URL. If the user references an attached/local image, inspect the attachment or workspace file path
  first. If the image is under `assets/image`, pass that path. If only a file name is given, search
  `assets/image` for the matching file.
- Do not call `edit_image` without an image path or CDN URL.

Generated assets should be saved by Maker MCP under `assets/image`, `assets/video`, or
`assets/audio`. `create_3d_asset` local runtime `model_files` instructions are materialized under
`assets/model`; use `local_delivery` for the usable model path and `preview_assets` for local review images.
