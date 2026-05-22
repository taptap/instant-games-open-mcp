---
name: taptap-maker-dev-kit-guide
description: Explain the local TapTap Maker AI dev kit installed during Maker project clone. Use after a Maker project is cloned or bound, or when the user asks what CLAUDE.md, examples, templates, or urhox-libs are for.
---

# TapTap Maker AI Dev Kit

Use this skill to orient the local AI/Agent after `maker_clone_to_current_directory` installs the
AI dev kit into a Maker project directory.

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

If these entries are missing in a bound Maker project, call `maker_status` with the actual project
directory as `target_dir`. The status tool will report dev-kit state and restore missing local
dev-kit entries when possible.

These files are local development aids. Do not submit them to Maker Git unless the user explicitly
asks and understands they are local environment files.
