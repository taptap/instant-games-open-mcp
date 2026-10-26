# Local Window Preview

Read only for a local preview task. For one-shot validation read [validation.md](validation.md);
for Windows launch failures also read [preview-windows.md](preview-windows.md).

## Local Window Preview

Use the active distribution's Maker CLI and the current real Maker project absolute path as
`--target-dir`; never guess a business project from the dialogue directory. Every command supports
`--json`. Local preview does not require Git clean, commit or push. Single-player preview needs
no PAT or remote build. Multiplayer preview uses the existing Maker login and a previously built
remote test version; it never builds or uploads server code automatically.

1. For an explicit local-preview request, run `taptap-maker preview status --target-dir <PROJECT> --json`.
   If Runtime is missing, follow host approval for downloading/installing with
   `taptap-maker preview install --target-dir <PROJECT> --json`, then start. Installation requires
   Python and curl; do not install dependencies or bypass client approval silently.
   Explain that preparation and Runtime may download public indexes/assets. Start/refresh prepare
   a copy only when preparation is needed; plain source previews do not copy. Prepared source is
   reused at `<PROJECT>/.maker-preview/source`, overwritten after the old Runtime exits, and ignored
   by Git. History keeps evidence, not source snapshots. `preview prepare` rejects active previews.
   The console distinguishes all-project usage from current-project usage and offers explicit cleanup. Platform support,
   installation recovery and cache behavior are documented in `docs/MAKER_LOCAL_PREVIEW.md`.

2. Run `taptap-maker preview start --target-dir <PROJECT> --json`. Report process launch only,
   not game readiness. Never substitute validate/headless mode or remote build.
3. During a user-requested local-preview iteration, after a batch changes the running game's
   code/resources, query preview status once for that project. Skip this for documentation-only
   edits, unrelated files, or work outside that preview task.
   If `process_alive=true`, automatically run preview refresh and collect logs/check.
   This includes a failed-but-live Runtime after Lua fixes within the same preview task.
   If stopped, missing, or ownership is unknown, do not start or revive the session.
4. Explicit refresh also only refreshes an active session. Tell the user it is a restart and loses
   in-memory state. Merge related edits into batches; do not restart on every file save. The CLI
   coalesces overlapping refreshes, with stop/cancel taking priority. No default file watcher exists;
   edits from other editors/agents need explicit refresh unless they follow this same preview task.
5. For stop, run `taptap-maker preview stop --target-dir <PROJECT> --json`. Manual window close
   is detected by status. Never kill by process name or trust a stored PID alone.
6. Fetch current evidence with `preview logs` and `preview check`, each with
   the same `--target-dir`. Incremental logs use the returned `--session-id`, `--reload-id`,
   `--cursor` and optionally `--limit` (1–500). Reset cursor after a reload. Keep local evidence
   separate from `.maker/logs/runtime/`, which belongs to the remote watcher.

### AI Local Preview Launch Playbook

Goal: open the shared local `UrhoXRuntime` window for the current bound Maker project. Do not
commit, push, or remote-build. Do not rewrite PATH, switch Node, or disable antivirus unless the
collected evidence names that cause.

Launch chain (normal paths):

1. Agent debugging: keep CLI `preview run --target-dir <PROJECT> --json` running in the
   foreground. It directly owns Runtime, emits a preview.started event on stderr and returns
   final JSON on stdout. Query logs/status/check or stop using its session identity. Default
   safety limit is 10 minutes; --duration-ms 1000..600000 selects a shorter smoke test.
2. User preview: `preview start` submits the registered project to the same console task
   used by the browser. `console open` automatically starts/reuses the console with Node.
   The console directly owns Runtime; finishing the request CLI does not stop the game.
3. No intermediate preview CLI or supervisor process. Existing session/control-channel,
   project classification, prepare and manifest code remain shared in process. The legacy
   supervisor_pid field identifies the owning Node. Normal paths never invoke WMI/CIM.
4. An entire IDE process-tree teardown can still terminate preview. Optional external
   `console serve` is for that separate requirement, not a mandatory first-use step.
5. Runtime logs include bounded, identity-checked current-round Lua logs. Live-window screenshots
   and game assertion JSON remain unsupported in run/start/check; use `preview validate` for
   the original Skill's one-shot evidence. Process status JSON is not gameplay validation.
6. Never auto-retry an unknown launch or disable antivirus. Only explicit --legacy-wmi
   selects the old launcher. Never kill by process name or an unverified historical PID.
   Evidence files, all under Maker home preview/runtime directories returned by status/start JSON:

- `supervisor.log`
- current-round `prepare.log`
- Runtime `logs/game` and `logs/lua`
- `session.json` (`supervisor_pid`, `runtime_pid`, `runtime_launch_pending`, `port`)

Classify from evidence, then act:

| Evidence                                                         | Meaning                                              | Next action                                                                                                                               |
| ---------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `install_state: missing`                                         | Runtime not installed                                | Host-approved `preview install`, then start                                                                                               |
| `Local prepare failed` + Python/Builder/timeout in `prepare.log` | Manifest/copy failed; Runtime was not started        | Read `prepare.log`. Retry `preview prepare --json`. Do not treat as CIM/antivirus. Public-index download and managed Python must be ready |
| NATIVE_LAUNCH_FAILED + EACCES                                    | Node background process creation was denied          | Check the security product event for this exact process; do not disable protection or switch back to WMI automatically.                   |
| Empty supervisor.log + control-channel TIMEOUT                   | Only meaningful for an explicit legacy launcher      | Normal in-process preview uses owner stderr and status; an absent standalone log is not evidence of antivirus blocking.                   |
| supervisor exit is unverified                                    | Process ownership is unknown                         | Do not kill by PID or name; inspect session identity and logs.                                                                            |
| `preferred loopback port` / recovery ports in use                | Lock-recovery mutex collided with another local bind | Retry the same CLI. Do not kill the occupying process                                                                                     |
| Runtime PID exists / window opened                               | Launch succeeded                                     | Report process launch only; use `preview logs` / `preview check` for evidence                                                             |

Console open starts/reuses a Node console automatically; no mandatory manual Host step.
Stop an incompatible older console explicitly after its previews are stopped. A separate browser
window does not prove that its service will survive the entire IDE shutting down. Only that
separate requirement calls for the optional external console serve entry.
Never kill by process name. Never use a stored PID without matching session identity. Stop with
`preview stop` or `console stop`. Closing the browser does not stop a Host-owned Runtime; ending Agent preview run stops only its owned Runtime.

Process launch and clean logs do not prove gameplay or visual correctness. Do not promise
live-window screenshots, input automation or cloud/server emulation. One-shot validation
screenshots use the separate `preview validate` adapter.

Only an AI authorized to modify the game may fix it. Bound automatic fixes to two attempts and an
agreed time budget, permit cancellation, refresh after each attempt, and return remaining failures
and evidence. Without modification authorization only report.

Multiplayer settings automatically select a remote test server using PAT authentication on the
Maker side and skip_login/WebSocket direct connect in Runtime. A refresh creates a new test game,
not a restored room. Local server changes require an explicit remote build before taking effect.
Missing game configuration requires a successful build and test QR generation; authentication or
allocation failures must not silently fall back to single-player. No local Server/cloud mock or
game-save isolation is provided. Do not classify shared scripts by filename suffix,
inject stubs, delete old dist/manifest files, copy whole resource libraries, or silently fetch
official-res/uuid assets. Explain missing references/cache state and seek approval for retrieval.
