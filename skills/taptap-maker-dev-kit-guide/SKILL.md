---
name: taptap-maker-dev-kit-guide
description: Explain the local TapTap Maker AI dev kit installed during Maker project clone. Use after a Maker project is cloned or bound, or when the user asks what CLAUDE.md, examples, templates, or urhox-libs are for.
---

# TapTap Maker AI Dev Kit

Use this skill to orient the local AI/Agent after `taptap-maker init` installs the AI dev kit into a
Maker project directory.

## What To Tell The Local Agent

After the Maker project is cloned, point the local AI/Agent at these local resources:

- `CLAUDE.md`: the main AI development guide entry. Read this first before changing Maker game code.
- `examples/`: runnable or copyable examples for common Maker development patterns.
- `templates/`: starter templates for creating new files or common game structures.
- `urhox-libs/`: engine APIs, capabilities, and local reference material for Maker runtime features.

Keep the explanation short. The goal is to help the local AI discover the installed development
resources, not to duplicate their contents in chat.

## Usage Guidance

When a user asks to develop or modify a Maker project after clone:

1. Check whether the current directory contains the dev-kit entries above.
2. Tell the local AI/Agent that `CLAUDE.md` is the first document to read.
3. Use `examples/` when the user asks for implementation patterns.
4. Use `templates/` when creating new game files or scaffolding.
5. Use `urhox-libs/` when engine API behavior or capability names are needed.

If these entries are missing in a bound Maker project, read `maker://status` or call
`maker_status_lite` with the actual project directory as `target_dir` to confirm state, then run
`taptap-maker dev-kit update` in that project directory to restore missing local dev-kit entries.
If status includes `Maker remote sync`, follow that section before editing: pull first only when the
workspace is clean, otherwise let the local AI help the user submit, stash, or cancel before pulling.

These files are local development aids. Do not submit them to Maker Git unless the user explicitly
asks and understands they are local environment files.

## Testing And Result Check

Keep validation simple for Maker users. 用户可以直接说“提交”或“构建”:

- If the user says “提交”, “推送”, “构建”, “预览”, or “跑一下”, use
  `maker_build_current_directory`. The tool commits when needed, pushes to Maker remote, and then
  runs the remote build.
- If push fails, do not start a separate build or generic Git push. Explain the returned recovery
  details, follow the returned classification-specific recovery (`remote_rejected`,
  `branch_not_allowed`, `forbidden_path`, or `auth`), then retry `maker_build_current_directory`.
- After submit or build finishes, tell the user to open the TapMaker 网页端查看结果.

Do not create local-only test scripts just to verify Maker changes. The expected validation path is
chat request -> Maker MCP submit/build tool -> TapMaker web result check.
