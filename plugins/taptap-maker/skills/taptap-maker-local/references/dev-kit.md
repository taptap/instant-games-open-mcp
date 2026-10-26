# AI Dev Kit Maintenance

Read only for missing/outdated dev-kit files or an explicit dev-kit update.

## AI Dev Kit Preparation

`taptap-maker init` checks out the Maker project before preparing local development environment
files in the current working directory. Init reinstalls the dev kit after checkout and allows
dev-kit files to overwrite same-path local helper files; the managed `.gitignore` block keeps
those files local-only. The `.gitignore` file itself is a required Maker project file that should be
submitted to Maker Git.

`taptap-maker doctor`, `maker://status`, and `maker_status_lite` check the dev-kit top-level
entries and version state for an already bound Maker project. If `CLAUDE.md`, `examples/`,
`templates/`, or `urhox-libs/` are missing, or if the status reports `update_available: yes`, run
`taptap-maker dev-kit update` to refresh the managed dev kit files and the managed `.gitignore`
block. The update command replaces dev-kit managed entries so version metadata and local files stay
consistent. Do not call the version API directly from the skill; use the CLI/MCP status output.

The CLI checks the latest AI dev kit version for the current environment, downloads that version,
and records the installed version locally. If the version check is temporarily unavailable, the CLI
falls back to its built-in default download URL instead of blocking initialization.

After clone, use the bundled `taptap-maker-dev-kit-guide` skill to explain the installed dev-kit
resources to the local AI/Agent:

- `CLAUDE.md` is the AI development guide entry.
- `examples/` contains Maker development examples.
- `templates/` contains reusable templates.
- `urhox-libs/` contains engine APIs and capability references.

The CLI is responsible for deterministic file operations:

- extract the ZIP into the current directory after checkout
- skip the ZIP top-level `scripts` directory because it conflicts with Maker project code
- delete the downloaded `ai-dev-kit.zip` after extraction
- refresh the checked-out `.gitignore` managed block for installed dev-kit entries
- keep the dev-kit helper files ignored while submitting the `.gitignore` rules to Maker Git

Do not hand-write a custom download/unzip script while this CLI command is available.

If dev-kit network access is unavailable after clone succeeds, explain that the Maker project is
already checked out, but local AI development docs/API/demo support may be incomplete. Ask whether
the user wants to retry `taptap-maker init` for a full post-checkout dev-kit reinstall or continue
without the dev kit.
