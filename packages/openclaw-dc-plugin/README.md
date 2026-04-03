# TapTap DC OpenClaw Plugin

OpenClaw plugin that exposes raw TapTap DC tools and bundles a TapTap DC ops-brief skill.

## What It Does

- installs as a native OpenClaw plugin
- internally boots the published `@taptap/minigame-open-mcp` runtime
- exposes raw JSON-oriented TapTap tools for:
  - authorization
  - app selection
  - store/review/community overview
  - store snapshot
  - forum contents
  - reviews
  - like/reply review actions
- bundles a `taptap-dc-ops-brief` skill that turns those raw responses into a concise ops brief

## Install

```bash
openclaw plugins install @taptap/openclaw-dc-plugin
```

## Typical Flow

1. Call `taptap_dc_check_environment`
2. If not authorized, call `taptap_dc_start_authorization`
3. Ask the user to open `auth_url` or scan `qrcode_url`
4. Call `taptap_dc_complete_authorization`
5. Call `taptap_dc_list_apps`
6. Call `taptap_dc_select_app`
7. Call overview tools and let the bundled skill produce the brief

## Configuration

Optional plugin config:

- `environment`: `production` or `rnd`
- `workspaceRoot`
- `cacheDir`
- `tempDir`
- `logRoot`
- `verbose`

Production use should not need `client_id` / `client_secret` overrides when the embedded TapTap package already contains them.
