/**
 * Reviewed public descriptions for local Maker tools and remote proxy tools.
 * Remote input schemas, handlers, and result contracts remain authoritative.
 */

export const MAKER_STATUS_LITE_PUBLIC_DESCRIPTION = [
  'Compatibility tool for clients that cannot read the maker://status resource; prefer the resource when it is available.',
  'Use it when starting or resuming Maker work, or when the current project context and readiness are uncertain.',
  'Pass target_dir when the project cannot be resolved from MCP Roots or the server working directory; if multiple Maker projects remain ambiguous, ask the user instead of guessing.',
  'By default the check may perform remote Git, package, dev-kit, proxy, and authentication probes. skip_remote_sync skips only remote Git and dev-kit freshness checks; it is not an offline or read-only mode.',
  'Follow the returned next_action and next_step.',
].join(' ');

export const MAKER_BUILD_CURRENT_DIRECTORY_PUBLIC_DESCRIPTION = [
  'Submit and remotely build the current bound Maker project. First read maker://status or maker_status_lite and resolve exactly one bound Maker project.',
  'Use this tool for explicit Maker build, preview, submit, or push requests. Code tests and lint do not trigger this remote workflow unless the user also explicitly asks to build, run, or preview the Maker game.',
  'Normal mode commits local changes when needed, pushes existing or new commits, and then starts the remote build; a clean workspace creates the required wake-up commit.',
  'Unsafe remote-sync or branch states stop before commit and push. A push failure stops before build, while a build failure after a successful push means the code is already on Maker remote; follow the structured result for recovery.',
  'After a successful build, read runtime_logs.local_file for gameplay diagnostics and runtime_logs.state_file for watcher health when those fields are returned.',
  'Do not combine Maker submission with generic branch, PR/MR, or separate commit/push workflows.',
  'Set confirm_remote_build_without_submit=true only after the user explicitly requests building the already committed remote version without submitting local changes.',
].join(' ');

const MAKER_REMOTE_PROXY_PUBLIC_DESCRIPTIONS: Readonly<Record<string, string>> = {
  generate_image: [
    'Generate one new image asset for a Maker game. Use batch_generate_images for multiple new images and edit_image to modify an existing image.',
    'Optional reference images may guide style or content; supported sources, generation controls, and final target_size requirements are defined by the input schema.',
    'Keep each reference image supplied through local paths or data URLs at 10 MiB or less.',
    'The local proxy attempts to materialize successful results into the Maker project and retain remote mapping; use returned workspace/local paths when present.',
  ].join(' '),
  batch_generate_images: [
    'Generate two or more new image assets in parallel in one call. Use generate_image for one new image and edit_image to modify an existing image.',
    'Each image request uses the fields and constraints defined by the input schema.',
    'Keep each reference image supplied through local paths or data URLs at 10 MiB or less. A batch may partially succeed; preserve successful images and report failed items with their returned errors.',
    'The local proxy attempts to materialize successful results into the Maker project and retain remote mapping; use returned workspace/local paths when present.',
  ].join(' '),
  edit_image: [
    'Modify an existing image from text instructions. Use generate_image for one new image and batch_generate_images for multiple new images.',
    'The required original image accepts a local Maker project path, an HTTP(S) URL, or an image data URL. Additional reference images and output controls are defined by the input schema.',
    'Keep each local-path or data URL image at 10 MiB or less.',
    'The local proxy attempts to materialize successful results into the Maker project and retain remote mapping; use returned workspace/local paths when present.',
  ].join(' '),
  create_video_task: [
    'Create a video generation task. The remote service normally performs server-side polling and waits for the final result in this call.',
    'If the wait budget expires, the result returns a task_id; continue other work and use query_video_task no sooner than 120 seconds later.',
    'Mode-specific inputs and limits are defined by the input schema. Image, video, and audio references may use local project files, HTTP(S) URLs, or data URLs supported by the schema.',
    'Keep image references at 30 MiB or less, video references at 50 MiB or less, and audio references at 15 MiB or less.',
    'The local proxy attempts to materialize successful video results into the Maker project; prefer returned workspace paths when present, unless the user needs an external share URL.',
  ].join(' '),
  query_video_task: [
    'Query video task status by task_id after create_video_task returns a pending task or reports a concurrency limit.',
    'If the task is still pending or running, continue other work and query again no sooner than 120 seconds later; do not poll continuously.',
    'Querying a completed task releases its task quota. The local proxy attempts to materialize successful video and last-frame results into the Maker project.',
    'Prefer workspace_video_path and workspace_last_frame_path when present; mention CDN URLs only when the user needs an external share link.',
  ].join(' '),
  text_to_music: [
    'Generate AI music for a Maker game, including background music or vocal tracks; do not use this tool for sound effects.',
    'The remote call polls server-side every 20 seconds and may wait up to 50 minutes. If generation is still running when the call times out, the result includes the task ID for operational tracking.',
    'Simple and custom generation controls are defined by the input schema.',
    'The local proxy attempts to materialize successful audio and metadata into the Maker project and record them for later Maker references; use returned local paths when present.',
  ].join(' '),
  text_to_sound_effect: [
    'Generate one game sound effect from a Chinese or English description.',
    'For the current Seed Audio provider, each call produces one output of at most 120 seconds. Split longer audio across multiple generations because this tool does not stitch outputs.',
    'duration_seconds is an approximate target and the actual duration may differ.',
    'The local proxy attempts to materialize successful audio in the provider original format under assets/audio/sfx and record it for later Maker references; use returned local paths when present.',
  ].join(' '),
  batch_sound_effects: [
    'Generate multiple game sound effects in one batch.',
    'For the current Seed Audio provider, each item is an independent output of at most 120 seconds. Split longer audio across items or calls because this tool does not stitch outputs.',
    'The result preserves per-item failures while the local proxy attempts to materialize successful audio in the provider original format under assets/audio/sfx and record it for later Maker references; use returned local paths when present.',
  ].join(' '),
  text_to_dialogue: [
    'Generate final character dialogue audio for a Maker game.',
    'Each input needs a confirmed voice mapping or a reference_audio override. When neither is available, call audition_voices_for_character and then confirm_character_voice before retrying.',
    'When reference_audio is omitted, the local proxy automatically reuses a confirmed local Doubao reference; the legacy provider still requires its confirmed voice mapping. Supported reference inputs and line-specific delivery controls are defined by the input schema.',
    'For Doubao, each input produces at most 120 seconds of audio. Split longer dialogue across inputs or calls because this tool does not stitch outputs.',
    'The local proxy attempts to materialize successful dialogue under assets/audio/voice; use returned local paths when present.',
  ].join(' '),
  audition_voices_for_character: [
    'Create temporary voice previews for one game character.',
    'Before calling, inspect the available character definition and relevant project context, then prepare a representative audition line that matches the character personality and speaking style.',
    'voice_profile.gender is required and must be passed explicitly as male or female.',
    'Doubao returns exactly three previews; the legacy provider follows candidate_count. Show every returned preview to the user and wait for an explicit choice before calling confirm_character_voice.',
    'Complete audition and confirmation for one character before starting another in the same project; do not run them in parallel.',
    'Preview files are temporary and are not saved as final game assets.',
  ].join(' '),
  confirm_character_voice: [
    'Confirm a voice selection and persist the character voice mapping for later text_to_dialogue calls.',
    'Call this tool only after audition_voices_for_character and only after the user explicitly selects a candidate or explicitly accepts the recommended candidate.',
    'Omit selected_index only after the user explicitly accepts the recommendation; absence of a user choice is not acceptance.',
    'Process one character at a time and do not call this tool in parallel for the same project.',
  ].join(' '),
  create_3d_asset: [
    'Manage the complete Maker 3D asset lifecycle. Use action="start" to begin, action="query" to check progress, action="get_options" to inspect step options, action="continue" after review, and action="post_process" for supported follow-up operations.',
    'Use direct generation when no review checkpoint is needed, and reviewed generation when the user needs a preview before final generation.',
    'For reviewed generation, show every returned preview and wait for explicit user approval before action="continue"; never approve a review step automatically.',
    'Supported prompt, image, strategy, quality, and post-processing fields are defined by the input schema.',
    'Local image inputs are normalized for the remote service. The local proxy attempts to materialize completed model delivery under assets/model and review images under assets/image; use local_delivery, preview_assets, and other returned local paths when present.',
  ].join(' '),
  generate_test_qrcode: [
    'Generate a mobile test QR code only when the user explicitly requests a test QR code or scan test, or when get_ad_config reports missing app_id or developer_id and requests this recovery step.',
    'Do not call this tool automatically during initialization, build, or publish workflows. When an explicit build is needed, use maker_build_current_directory separately.',
    'Call without confirmed_screen_orientation first. Reuse an existing project orientation; only when the tool reports it missing, ask the user in a separate conversation turn to choose landscape or portrait and then retry.',
    'An existing orientation is immutable. This operation may upload a test version, create the TapTap app identity, and return a displayable QR code.',
  ].join(' '),
  add_test_whitelist: [
    'Add one TapTap user to the current game test whitelist.',
    'Use this only after maker_build_current_directory has initialized the project and generate_test_qrcode has established the TapTap app identity.',
    'Call it only with the TapTap user_id explicitly provided by the user; never infer an account ID.',
  ].join(' '),
  get_ad_config: [
    'After Maker project status confirms the primary local project configs are initialized, use this as the first remote step for ad-related requests.',
    'It is the source of truth for current ad activation and configuration, and synchronizes the result into .project/settings.json at @runtime.ad.',
    'The local preflight does not call the remote tool while project.json or settings.json is missing. Missing local configs do not authorize an automatic build.',
    'Use maker_build_current_directory only for an explicit user build, submit, or preview request, then check project status again. If configs remain missing, report the limitation and do not rebuild automatically.',
    'Do not infer ad readiness from local SDK docs, .maker-mcp/config.json, or runtime callbacks, and only implement or test ad behavior after the returned configuration is usable.',
    'If app_id or developer_id is missing, call generate_test_qrcode once and then retry this tool. If ad.status != 1, report warning and ad.url, follow the returned next_action, and retry only after the user completes that step.',
  ].join(' '),
  get_debug_feedbacks: [
    'Fetch online player feedback for the current Maker project, or query server and Lua session logs when game_session_id is provided.',
    'The default feedback mode fetches unprocessed records and marks the returned records as processed. For a read-only feedback query, set fetch_and_mark_processed=false; use the input schema to select other filters or an exact feedback record.',
    'Downloaded feedback attachments are saved in the local project. Read only the returned local_dir, local_log_paths, and local_screenshot_paths; do not treat remote attachment paths as local files.',
    'Session-log mode returns its own saved paths and progress information; use the returned result to continue when more history is available.',
  ].join(' '),
};

/** Return a reviewed public description for an exposed Maker remote proxy tool. */
export function getMakerRemoteProxyPublicDescriptionOverride(toolName: string): string | undefined {
  return MAKER_REMOTE_PROXY_PUBLIC_DESCRIPTIONS[toolName];
}
