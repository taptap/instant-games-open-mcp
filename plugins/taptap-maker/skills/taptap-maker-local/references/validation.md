# Local Runtime Validation

Read only for runtime tests, assertions or screenshot acceptance using preview validate.

### Local run-lua-validate

Use the project's `run-lua-validate` Skill for runtime checks, screenshots, assertions and
controlled-state visual verification. Keep its review/fix/retest workflow; Maker supplies the
local execution adapter, not another test framework.

On a bound macOS/Windows Maker project, use this distribution's CLI instead of the Skill's
standalone Runtime installer/launch commands. Query `preview status` first; an active preview
must be explicitly stopped with user authorization. For the command mapping and options read
`docs/MAKER_LOCAL_PREVIEW.md` section `run-lua-validate 本地接入`.
Example: `preview validate --target-dir <PROJECT> --mode both --screenshot-frame <N> --json`,
where N is selected for the current test, not a fixed readiness guarantee.
Use the returned report/log/artifact paths with the original Skill's review rules.
`COMPLETED` means evidence collected, not game PASS. Preserve failures and inspect partial
evidence. No Computer Use capture, engine modification or remote-build fallback is required.
When the user requests Validate and the project Skill is unavailable, the Agent must first
enable/install the existing local Skill; do not immediately download or update ai-dev-kit:

1. Check `<PROJECT>/skills/run-lua-validate/SKILL.md` and
   `<PROJECT>/.installer/skills/run-lua-validate/SKILL.md`. If neither exists, explain that
   the source is missing and guide `dev-kit update --target-dir <PROJECT>` through this
   distribution. Do not invent or rewrite the original Skill.
2. If source exists, inspect `<PROJECT>/.installer/local-skill-filter.json` as JSON.
   When `exclude_skills.win32` (Windows) or `exclude_skills.darwin` (macOS) contains
   `run-lua-validate`, tell the user before removing only that entry for this platform.
   Preserve all other values. A missing filter needs no repair; malformed/unwritable
   configuration must be reported, not replaced with an empty configuration.
3. Run the existing project installer: Windows uses
   `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "<PROJECT>/tools/install-skills.ps1" all`;
   macOS uses `bash "<PROJECT>/tools/install-skills.sh" all`.
   Check its exit status and the installed Skill file, not just its success message.
4. For Codex, ensure `<PROJECT>/.agents/skills/run-lua-validate/SKILL.md` is readable.
   If the old installer only installs `.codex`, copy the original Skill directory, including
   supporting files, from `.installer/skills` (or `skills` if still there) into the missing
   `.agents/skills/run-lua-validate` directory. If the installer is absent, likewise install
   only this Skill into the current host's documented project Skill directory.
   Do not overwrite an existing directory or broken link; inspect/report conflicts first.
5. Read the installed `SKILL.md` and its needed references, then continue validation using
   the local mapping below. If the host needs a Skill refresh/new session for discovery,
   explain that; do not claim the current session has loaded it merely because installation
   succeeded. Report permission/install failures rather than pretending the Skill is ready.

These are Agent-executed local setup steps, not a new CLI command or automatic download.
Skill distribution belongs to UrhoX ai-dev-kit. Maker detects legacy exclusions, warns before
removing only this Skill from the current platform's list, and preserves all other entries.
If original Skill files were already deleted, guide the user to `dev-kit update` through the
current distribution; a repaired exclusion is not proof of an installed Skill. Do not rewrite
the Skill, auto-upgrade, or block Runtime execution because compatibility repair failed.

Local iterations are Agent-controlled: choose test states, assertion scripts, screenshot timing
and the number of runs from the acceptance goal. Repeat `preview validate` sequentially as needed;
each invocation launches its own Runtime, not a capture of an existing preview window. Do not
add a fixed frame/count policy or interpret loading-screen captures as acceptance. Inspect the
collected JSON/logs/images, then fix and rerun using the original Skill's rules.

For screenshots, Maker checks near-total black/transparent pixels and observed engine bootstrap
ordering. An unsafe capture is marked `screenshot_assessment.status=NOT_READY`; when the run
completed safely without actual runtime errors it waits three seconds and retries at a later
frame, up to two retries. Each attempt keeps its own evidence/run ID; the final result includes
`attempt_run_ids`. Do not overwrite earlier failed evidence or treat the raw game report as fixed.
Automatic retries scale the default timeout with the frame count, capped at 580 seconds; an
explicit `--validate-timeout` is never increased. If the next run's estimated Runtime duration
exceeds the budget, no retry launches: inspect retained evidence and explicitly adjust the timeout.
The estimate uses the preceding Runtime duration and is not a guarantee of future loading speed.
`REVIEW_REQUIRED` only means these narrow checks found no issue, not that loading/gameplay passed.
Open every PNG. If visual inspection still shows game-specific loading, wait three seconds,
choose a later screenshot frame and adjust validate frames/timeout to cover it, then rerun the
same test. Waiting before relaunch at the same early frame is not a readiness fix. Stop and inspect
errors or repeated lack of progress; do not loop forever, change the engine, or hide a game FAIL.

The stderr `validation.started` event returns `run_id`, `evidence_directory`, `log_path` and
`invocation_path` before preparation. Poll the returned run's `run.json` and bounded log tails
while the CLI is running; do not start another Runtime to poll progress. The final stdout JSON
remains the command result. Missing final evidence means incomplete/unknown, never PASS.
The Maker console's Build/Test > Validate tab reads the same local evidence and does not launch
or control validation. All loaded rounds appear newest first in a scrollable process
list; scrolling to the bottom loads older pages. Logs/JSON show a three-line collapsed preview,
screenshots show thumbnails linked to the original. It shows collected evidence, not proof the
Agent inspected an image.

Validation evidence is project-realpath isolated and retains the latest three completed runs,
with active or unverified runs additionally protected. Each invocation checks cleanup eligibility
after it finishes; there is no age-based or 24-hour cleanup delay.
Failures do not advance that timestamp or change the validation result. There is no background
timer, console lifecycle trigger, or automatic cross-project cleanup. For durable acceptance output, pass
`--output-dir <ABSOLUTE_DIRECTORY_OUTSIDE_PREVIEW_CACHE>` on each invocation: completed or failed
run artifacts are copied into a unique run subdirectory, never automatically cleaned. Verify
`archive_directory` in the result; archive failures remain explicit. Prepared game source is not
part of the archive. A 5 GiB cache warning is not permission to delete recent acceptance evidence.
