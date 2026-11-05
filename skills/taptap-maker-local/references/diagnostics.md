# MCP Diagnosis and Issue Reporting

Read only for MCP startup, missing tools, proxy failures or an authorized issue report.

### Proxy Tools Missing From The Current Session

If Maker MCP is completely unavailable, tools are missing, the process exits immediately, or the
client reports `-32000`, `Connection closed`, or `command not found`, do not call Maker MCP tools
for the initial diagnosis. Work offline first:

1. Find the MCP config file the current client actually reads and back it up.
2. Attempt `taptap-maker mcp verify --json`. It verifies the stable self runtime by default; use
   `--mode npx` only when diagnosing npm startup. If the command itself fails, keep that failure as
   diagnostic evidence. If `taptap-maker` is not on PATH, reuse that config's absolute command and
   ordered args, append `mcp verify --json`, and run the same argv directly.
3. This command uses the same stable launcher as MCP install and completes MCP
   initialize and tools/list, and returns launcher_kind, command, stage, tools, stderr, error, and
   failure_type. It does not read the client's active config or validate WorkBuddy trust, client
   config caching, or Roots.
   In explicit npx mode, EPERM/EACCES or an unwritable npm cache is
   `npm_environment_error`; prefer `mcp install --launcher self` instead of blindly changing
   `~/.npm` ownership.
4. First identify the active AI client from reliable evidence, then inspect and reproduce only that
   client's active config path, command, ordered args, cwd, workspace/Roots, Node/npm/npx paths,
   client PATH, exit status, and stderr.
5. Only when the active client is confirmed to be WorkBuddy, verify both the `taptap-maker` server
   entry and the account-level enable/trust state. Do not edit account trust storage automatically;
   ask the user to enable it in WorkBuddy.
6. Never use one client's configuration or trust state to diagnose another client. `doctor` does not
   inspect the active AI client's loaded tools or configuration.
7. On Windows, configs written by the CLI default to absolute Node plus the versioned self runtime.
   Explicit npx mode uses absolute Node/npm. Treat existing `cmd.exe` or `npx.cmd` configs as legacy
   diagnostic evidence; do not persist them as a repair. Never replace cwd with a
   `cd /d "<project>" && npx.cmd ...` command string, including for Chinese project paths.
8. For DSH, inspect `$DSH_HOME/cordis.patch.yml` (default `~/.dsh/cordis.patch.yml`) and any active
   profile `cordis.yml`/`cordis.patch.yml`. The generated Maker plugin uses the stable self runtime,
   `failOnStartupError: true`, and `toolCallTimeoutMs: 3600000`; DSH hot-reloads the patch without an
   IDE restart. A new plugin row must be inside a Cordis `insert` patch; a bare top-level id patch
   cannot create the row over an empty root. A fixed project `cwd` is invalid. If calls fail at about 60 seconds, repair the
   active plugin config with `taptap-maker install` before diagnosing Maker server
   latency.
9. User-level MCP config must not contain a project cwd. If WorkBuddy or DSH does not expose Roots, pass
   `target_dir` on the concrete Maker tool call and record the process actual cwd only as diagnostic
   evidence.
   If cwd fallback is unbound, project-related proxy calls return `evaluated_target_dir` and
   `project_context_source` before remote access. Fix Roots or pass the correct `target_dir`.
10. Do not assume Windows 8.3 short paths exist or differ from the original long path. Verify the
    result first; an unchanged or missing short path is not a usable cwd workaround.
11. Reproduce the configured Windows launch with the same direct argv boundary when possible.
    Separate outer shell quoting or stderr decoding failures from the MCP child process result, and
    record both without treating wrapper failures as server evidence.
12. Remember that multiple AI conversations share user-level MCP config. One conversation can break
    every other conversation by rewriting the shared command or manually adding a project cwd.
13. Classify the root cause from evidence before repairing it. Do not automatically change trust
    storage, PATH, cwd, credentials, or game code. Use `taptap-maker install` only after evidence
    confirms that the active config entry is damaged; it auto-detects clients and keeps unchanged
    entries untouched. Reconnect and verify again in both the current and a new conversation.

If the MCP connection is established but a tool or resource call fails, including `-32003`, use a
separate evidence-first runtime-error workflow. Do not assign a fixed meaning to `-32003`; preserve
the exact client error. `mcp verify` is not the primary check for an already connected session
because it tests only the local launcher and stdio MCP path. Collect the failed tool/resource, redacted
request parameters, current `tools/list`, exact error code/message/data, complete sanitized
`remote_result`, request/correlation IDs, timestamp with timezone, OS/architecture, AI client and
`@taptap/maker` package versions, and stable reproduction steps. Preserve useful nested error,
warning, debug, and remote status fields while removing credentials. Do not rewrite command, cwd,
PATH, trust state, credentials, or game code unless the collected evidence identifies that cause.

Only after the base Maker MCP connection works should you use the following MCP-based context checks.

If the user is in a bound Maker project but `generate_image`, `batch_generate_images`, `edit_image`,
`create_video_task`, `query_video_task`, `text_to_music`, `text_to_sound_effect`,
`batch_sound_effects`, `text_to_dialogue`, `audition_voices_for_character`,
`confirm_character_voice`, `create_3d_asset`,
`generate_test_qrcode`, `get_ad_config`, or `get_debug_feedbacks` are missing from the current AI
tool list, do not diagnose project cwd as the registration cause. Current Maker MCP registers every
whitelisted proxy tool from local definitions before resolving cwd, project binding, auth, or the
remote proxy:

1. Capture the active client's exact `tools/list` and loaded `@taptap/maker` version.
2. Verify the configured launcher with `taptap-maker mcp verify --json`; a successful current
   launcher plus a stale active tool list indicates client/session caching, not missing project auth.
3. Reconnect the active Maker MCP once from the client UI or start a new session so it loads the
   current package. Do not rewrite a user-level cwd to make proxy tools appear.
4. After the tools are present, read status. `MCP project context cwd` with `status: mismatch` means
   calls without `target_dir` may select an unbound or wrong project; the tools remain registered.
   Use the active workspace/MCP Roots or pass the real project directory as `target_dir` for that call.

When Maker proxy tools are missing, explain that this is likely a session/configuration problem and
that requests specifically requiring those tools cannot use them in the current session.

### Maker MCP Issue Reporting

Use this flow only for likely Maker infrastructure or integration defects. Examples include MCP
startup failure, `Connection closed`, unexpected missing tools, proxy connection failure, request
timeout, repeated reconnect failure, HTTP 5xx/unavailable responses, or an unclassified internal
server error. Diagnose enough to distinguish these from expected user or project errors before
offering a report.

Do not propose issue reporting for expected user or project errors such as invalid parameters,
missing project files, expired login with a documented recovery, user cancellation, project Lua
compile errors, or other business validation errors with a concrete next action.

Ask once per distinct failure fingerprint in the current conversation. Use the failed operation,
error code, and stable error message as the fingerprint. If the user declines, do not ask again for
that fingerprint during the conversation. A materially different infrastructure failure may be
offered once separately.

Before collecting or submitting, ask in the user's language. Explain that the report contains the
sanitized error, only the active client's Maker MCP entry, local runtime/Maker status, and current
workspace context. State that it excludes PAT/token values, other MCP servers, project source, and
the complete conversation. A suitable Chinese prompt is:

> Maker MCP 似乎遇到了连接或服务异常。是否允许我收集已脱敏的报错、Maker MCP 配置和运行环境，
> 并提交到官方 GitHub Issue，帮助开发团队定位和修复？不会上传 PAT/token、完整聊天或项目源码。

Only after explicit consent, create a compact JSON object with the useful current-session evidence:
summary, exact sanitized error, failed operation, error code/data, sanitized `remote_result`,
request/correlation ID, reproduction steps, visible Maker tools, client version, and workspace roots.
Do not include the complete conversation. Send that JSON through stdin, never argv, while running:

```text
npx -y --package @taptap/maker@<exact-version> taptap-maker mcp report --ide <client> --target-dir <project> --context-stdin --consent --json
```

Prefer the active client's exact Maker MCP `command` plus ordered `args`, then append the `mcp
report` arguments above. This preserves the installed beta/stable version and, on Windows, the
absolute `node.exe` plus `npm-cli.js` launcher. Use the npx fallback only when it contains the exact
installed Maker version. Never use an unversioned package spec,
assume `taptap-maker` or `npx` is on PATH, or build a `cmd /c`, `cd && npx`, or PowerShell wrapper.
For DSH, read only the active Maker plugin from the user/profile Cordis YAML and reuse its
`config.command` plus ordered `config.args`; do not upload other DSH plugins or environment values.
If neither an exact configured launcher nor an exact version is available, explain that automatic
collection cannot start, show the manual Issue URL, and continue the original task.

Do not ask for a second confirmation after the user consents. If the result is `created`, show the
returned Issue URL. If the result is `manual_required`, clearly tell the user that automatic GitHub
submission was unavailable, show the returned sanitized title/body, and provide the returned manual
Issue URL. This fallback is informational: it must not block troubleshooting or the user's original
Maker task. If the result is `consent_required`, do not submit; ask for consent because the required
authorization was not provided.
