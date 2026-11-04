# Local Console

Read only when opening, stopping or troubleshooting the console.

## Local Web Console

Use the active Maker CLI/bundle for `console open`, not an unversioned npm package.
Opening the console only starts/reuses a loopback service, registers the explicit project
directory and opens its page. It does not authorize build, push, Runtime installation or preview.
Do not call init, build or preview just to open it. A missing/invalid directory is a selection
problem, not permission to clone a game. Without a known game directory, omit `--target-dir` so
the console shows the project list for the user to choose; never guess or choose the first project.

The Git page fast-forwards remote `main` only when the local branch has no unique commits and file
paths do not overlap. Uncommitted edits on other files stay in place. If local commits exist, or
the same files changed on both sides, the console does not rewrite history. Overlapping files open
a copyable prompt. Follow that prompt: explain both sides in plain language and wait for
confirmation before editing. Do not run pull, rebase, stash, reset, or checkout from that prompt,
and do not create a branch. If the page says the branch is not `main`, only tell the user Maker
uses `main`; do not switch branches unless the user asks.

The user selects the operation in the console. Each operation passes the selected project's
absolute target directory to the CLI. `console status --json` inspects the service;
`console stop --json` stops it only when no task is active. If a different Maker bundle owns
the running service, ask before stopping it. Never expose PAT or copy local session credentials
into project files. Console errors retain the CLI result; unknown results require verification,
not an automatic retry.
