# Maker 3D Model Proxy Tools Design

## Context

Maker local MCP already exposes selected remote creative asset tools as static local tools so
`tools/list` does not wait for remote proxy discovery. Actual calls still go through the remote
proxy, then local post-processing downloads generated assets into the Maker project and records
CDN mappings in `.maker/assets/generated-assets.json`.

The new 3D model tools follow the same local asset workflow:

- `create_3d_model_task`
- `query_3d_model_task`

The remote service can return two different shapes:

- Phase 1 preview results for `text_to_model` and `image_to_model`.
- Final model results from Phase 2, `multiview_to_model`, or `query_3d_model_task`.

## Goals

- Expose both 3D tools from the local Maker MCP static proxy tool list.
- Download Phase 1 four-view preview images into `assets/image/`.
- Rewrite local preview image references back to CDN URLs before Phase 2 confirmation calls.
- Download final MDL zip assets into `assets/model/`.
- Download final rendered model preview images into `assets/image/`.
- Preserve Tripo GLB and rendered CDN URLs in the registry without downloading the GLB.
- Keep model generation usable when MDL conversion fails but the model itself succeeds.

## Non-Goals

- Do not introduce a separate 3D asset registry.
- Do not download Tripo GLB files by default.
- Do not change remote proxy protocol semantics.
- Do not require remote tool discovery during local MCP startup.

## Tool Exposure

Add `create_3d_model_task` and `query_3d_model_task` to
`MAKER_REMOTE_PROXY_EXPOSED_TOOL_NAMES`, with local static tool definitions.

`create_3d_model_task` supports:

- `mode`: `text_to_model`, `image_to_model`, or `multiview_to_model`.
- prompt/image inputs used by upstream.
- `confirmed_image_paths` for Phase 2 confirmation.
- `front_image`, `left_image`, `back_image`, and `right_image` for `multiview_to_model`.

`query_3d_model_task` supports:

- `task_id`.

The static definitions should describe the local behavior clearly: Phase 1 preview images and final
MDL assets are downloaded into the Maker project when URLs are available.

## Phase 1 Preview Materialization

When `create_3d_model_task` returns:

```json
{
  "phase": 1,
  "preview_urls": {
    "front": "https://...",
    "left": "https://...",
    "back": "https://...",
    "right": "https://..."
  }
}
```

local MCP downloads each present preview URL to `assets/image/`.

The response is augmented in place so each view carries local fields. The original URLs stay in
`preview_urls` so existing Agent logic can still pass them directly if needed.

Recommended response addition:

```json
{
  "preview_assets": {
    "front": {
      "localPath": "assets/image/task_front_20260611000000.png",
      "absolutePath": "/project/assets/image/task_front_20260611000000.png",
      "cdnUrl": "https://..."
    }
  }
}
```

Each preview image registry record includes:

- `tool`: `create_3d_model_task`
- `mode`
- `phase`: `1`
- `view`: `front`, `left`, `back`, or `right`
- `cdnUrl` and `previewUrl`
- `localPath`, `absolutePath`, and `createdAt`
- `taskId` when upstream provides one

## Input Rewriting

Before calling remote 3D tools, local MCP rewrites known local asset references to CDN URLs.

For `create_3d_model_task`:

- `confirmed_image_paths.front`
- `confirmed_image_paths.left`
- `confirmed_image_paths.back`
- `confirmed_image_paths.right`
- `front_image`
- `left_image`
- `back_image`
- `right_image`
- image input fields used by `image_to_model`

Supported local references:

- `assets/image/...`
- absolute paths inside the Maker project
- bare generated asset names
- already-remote `https://` URLs, which pass through unchanged

This reuses the generated asset registry rather than adding tool-specific lookup storage.

## Final Model Materialization

When a final result has `status: "success"` and `mdl_cdn_url`, local MCP downloads the MDL zip to:

```text
assets/model/<task_id>_<timestamp>.zip
```

When `rendered_image_url` exists, local MCP downloads it to:

```text
assets/image/<task_id>_render_<timestamp>.png
```

The result is augmented with:

- `mdlLocalPath`
- `mdlAbsolutePath`
- `renderedImageLocalPath`
- `renderedImageAbsolutePath`
- `download` entries for any failed best-effort downloads

The registry record for the MDL asset includes:

- `tool`: `create_3d_model_task` or `query_3d_model_task`
- `taskId`
- `cdnUrl`: `mdl_cdn_url`
- `modelCdnUrl`: `model_cdn_url`
- `renderedImageUrl`
- `localPath`, `absolutePath`, and `createdAt`
- `mdlConversionError` when present

The rendered preview image also gets its own image registry record with a back-reference to the
same `taskId`.

## Error Handling

Asset downloads are best effort. If a download fails, the original remote result stays readable and
the failed field receives a structured `download` error, matching existing image/video/audio
behavior.

`mdl_conversion_error` does not make the tool call fail. If the remote model status is successful
but no `mdl_cdn_url` is available, local MCP records the original result and exposes the conversion
error to the Agent.

## Tests

Add focused coverage for:

- Static tool list includes `create_3d_model_task` and `query_3d_model_task`.
- Proxy unavailable status reports the expanded missing tool list.
- Phase 1 preview URLs download to `assets/image/`.
- Phase 1 preview registry records include view and phase metadata.
- Phase 2 `confirmed_image_paths` local paths rewrite to CDN URLs.
- `multiview_to_model` local image paths rewrite to CDN URLs.
- Final model result downloads MDL zip to `assets/model/`.
- Final model result downloads rendered preview image to `assets/image/`.
- `mdl_conversion_error` is preserved when MDL URL is missing.
- Download failures preserve original result payloads.

## Documentation Updates

Update Maker and proxy documentation to mention:

- 3D model tools are part of the Maker creative asset proxy tool set.
- Phase 1 preview images are saved to `assets/image/`.
- Final MDL zip files are saved to `assets/model/`.
- GLB CDN URLs are preserved for reference but not downloaded by default.
