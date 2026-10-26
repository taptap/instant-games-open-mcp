---
name: taptap-maker-local
description: Initialize, clone, inspect, preview, sync or submit a TapTap Maker game; open its local console (打开make mcp控制台) or diagnose Maker MCP. Not for unrelated code edits or maintenance of the Maker MCP repository itself.
---

# TapTap Maker Local Workflow

Use the existing Maker capability routing index and this entry to select the current workflow.
Read only the matching reference below, not this entire directory. References are relative to
this Skill; paths starting with docs/ refer to the active Maker distribution's documentation.
If an operation changes (for example, preview fails or the user requests a build), load that
workflow then. Do not preload other Maker or ai-dev-kit Skills just because they are installed.

## Shared Boundaries

- Use the user's current game workspace and its verified binding; never guess a project from a
  dialogue directory or pick one from a project list for the user. Pass the real absolute project
  path as target_dir or --target-dir. If the workspace is missing or ambiguous, use
  [Project Context](references/project.md).
- Start/resume/status: read maker://status, or call maker_status_lite when resources are unavailable.
  Reuse current task evidence; do not repeat status for every edit. Status is read-only.
- Reuse the active distribution's CLI and exposed tool schemas/next_action; do not reimplement
  authentication or APIs. When bundled, follow taptap-maker-plugin-lifecycle for plugin setup;
  initialize with --skip-mcp-install and update through the active plugin's marketplace.
- Local preview and generic tests do not authorize commit, push or remote build. Resolve ambiguous
  preview/run intent from context, asking only when needed. Follow explicit user authorization.
- Do not infer or set a service environment from preview, build, test, or local-development intent.
  Do not add environment parameters to Maker calls or user MCP config.
- Preserve user files, project identity and secrets. Do not put PAT directly in argv or logs.
  Never blindly retry an unknown remote mutation or paid operation; inspect its existing result.
- Always explain the next irreversible step before taking it. Explain results briefly: process
  launch is not gameplay success, and successful push is not successful build. Missing evidence
  is unknown, not PASS.

## Main Intent Table

| Current task                                                      | Read / use                                                                                                                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| initialize / clone / create / login recovery                      | [Initialization Workflow](references/initialize.md); use taptap-maker init, --create only for explicit new-project intent.                        |
| status / workspace selection / resume after upgrade               | [Project Context](references/project.md); maker://status or maker_status_lite.                                                                    |
| missing/outdated AI dev kit                                       | [AI Dev Kit Preparation](references/dev-kit.md); existing dev-kit update workflow.                                                                |
| open console / 打开make mcp控制台                                 | [Local Web Console](references/console.md); active CLI console open --target-dir <PROJECT> --json; omit target-dir only to show the project list. |
| local preview / refresh / stop / preview task iteration           | [Local Window Preview](references/preview.md); CLI preview, never remote build.                                                                   |
| runtime tests / screenshot acceptance / run-lua-validate          | [Local Validation](references/validation.md); Maker preview validate adapter and the project's run-lua-validate Skill.                            |
| Windows preview launch failure                                    | [Windows Preview Diagnostics](references/preview-windows.md); collect evidence before environment changes.                                        |
| submit / push / remote build / pull / conflicts                   | [Maker Git Workflow Policy](references/git.md); maker_build_current_directory for submit/build, CLI git sync for pull.                            |
| image / video / audio / 3D / ads / test QR / online game feedback | [Maker Creative Asset Tool Policy](references/assets.md); follow exposed tools and their confirmation gates.                                      |
| MCP unavailable / missing tools / proxy failure / issue report    | [MCP Diagnostics](references/diagnostics.md); diagnose first, obtain consent before reporting.                                                    |
| generic code validation / tests / lint                            | Use the relevant local check; load the validation workflow only if Runtime evidence is needed. No automatic remote build.                         |
| package/plugin update                                             | Use the active distribution's update-taptap-mcp Skill; keep the existing session usable.                                                          |
