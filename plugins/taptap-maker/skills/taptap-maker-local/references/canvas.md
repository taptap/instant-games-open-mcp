# Canvas Capability Guide

Read this entry for canvas authoring or when resuming without prior context. Use the active
Maker CLI/bundle, not an unversioned package or another installation's documentation.

## Discover and resume

1. Read `canvas capabilities` for the installed version's actions, inputs, parameter schema
   and limits. `actions` lists page automation actions; CLI queries also include `list`,
   `pages`, `sessions`, `templates`, `model-settings`, `status`, `wait` and `models`.
2. Use the verified project path. Follow [Local Console](console.md) for opening the page and
   session coordination. `canvas pages --target-dir <PROJECT>` identifies this project's pages.
3. Use live `inspect` (optionally `--id <NODE_OR_GROUP>`) to recover current IDs, revision,
   inputs, tasks and blockers. `inspect --saved` is not live task status. Keep the page open
   for editing and execution; never directly edit `.maker` files.
4. Each edit uses the current page ID, canvas ID and revision. Wait for the returned operation
   to finish with `wait`/`status`, then inspect before the next edit. `queued` is not completion.
   Resume original operation/task IDs after interruption; do not replay paid generation.

## Feature routing

Read only the matching section or guide. An unavailable provider, blocked card or missing
template search result does not establish that the whole feature is unsupported.

| User goal                                                | UI / CLI support                                                             | Read next                                       |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------- |
| Create/edit a canvas or custom workflow                  | Both; CLI supports advertised card types and editable fields                 | [Canvas editing](#canvas-editing)               |
| Reuse templates, save personal templates                 | Both add copies; library save/replace and ZIP exchange are UI-only           | [Templates](#templates)                         |
| Import/replace images, set references, generate images   | Both, subject to the selected provider                                       | [Images and references](#images-and-references) |
| First-frame / first-last-frame / multi-reference video   | Both; mode and source order matter                                           | [Canvas Video](canvas-video.md)                 |
| Extract frames, configure and export animation           | Both for advertised settings/export; brush and per-frame editing are UI-only | [Sequences](#sequences)                         |
| Slice an atlas and export PNG resources                  | Both through existing resource cards; review before confirmation             | [Atlases and UI](#atlases-and-ui)               |
| Recognize UI, prepare Bbox batches, assemble editable UI | Existing Bbox workflow and CLI; follow linked Skills                         | [Atlases and UI](#atlases-and-ui)               |
| Character views and 3D generation                        | Both; review before model confirmation                                       | [Models](#models)                               |
| Query tasks, recover saving, export results              | CLI supports these; no generic task/draft unlock                             | [Recovery and delivery](#recovery-and-delivery) |

## Canvas editing

Use `create`, `open`, `rename`, `add-node`, `update-nodes`, `duplicate`, `group`,
`connect`, `set-references`, `disconnect`, `delete-nodes`, `save`, `undo` and `redo`.
Read `capabilities.nodeTypes`, `editable` and `inputs` for supported fields. Derived cards
require their source; specialized resource cards are not all directly addable with `add-node`.
Search suitable templates rather than inventing unsupported node types. Adding, arranging
and configuring cards does not itself authorize generation.

## Templates

Search `canvas templates --target-dir <PROJECT> --q KEYWORD`. Check both `presets` and
`items`; `total` counts personal templates only. Try alternate keywords before concluding
there is no match. Read matched descriptions and associated Skills, then use `add-template`.
Copies can be edited independently. AI can also assemble custom workflows from supported cards.
To save one to My Templates, select at least two cards with an internal connection and use
the UI's Save as Template menu. External connections are excluded; unresolved tasks and
missing dependencies can block saving. Personal templates belong to the current project.
Library save/replace and ZIP import/export are UI-only; `canvas save` saves the canvas,
not a template. Builtin templates cannot be overwritten. Do not write template JSON directly.

## Images and references

Read `canvas model-settings --target-dir <PROJECT>` before generation; obey the selected
provider and [Asset Policy](assets.md). Use `import --file` for a new card, `fill-slot` for an
empty image slot, or `replace-image` for an existing image. Import is not template-node completion.
`set-references` replaces the entire ordered reference list; `[]` clears it. Sources must be
saved, ready image cards with no dependency cycle. Set prompts/parameters with `update-nodes`;
these edits preserve old results but may mark them stale. Read `parameterSchema.image` for
settings; model support is checked against the selected provider. For video references, read
[Canvas Video](canvas-video.md) before changing connections.

## Sequences

Use animation templates or create `sequence` from a ready `video-source` card and `animation`
from a ready `sequence` card. Read `parameterSchema.sequence` and `sequenceSettings` for frame range, FPS,
size and background-removal settings. Run the processing step, inspect its result, then export
`atlas` or `frames`. Brush/per-frame edits and manual duplicate removal stay in the UI;
do not claim CLI automatic duplicate removal.

## Atlases and UI

Read `capabilities.imageAssetsWorkflow` and the matching template. On an existing resource
card use `preview-image-assets`, visually inspect the preview, then `confirm-image-assets`
with the current reviewId/revision and export. Preview completion is not final asset approval.
For editable game UI, read `maker-ui-workflow` at the path supplied by Maker status; for Bbox
prelayout read `maker-ui-bbox-workflow`. `capabilities.uiWorkflow` describes the supported
steps. Preserve text removal and source dependencies; PNG export alone is not editable UI.

## Models

Read `capabilities.modelWorkflow`: character image -> `model-views` -> inspect every preview
-> user approval -> `confirm-model` with current reviewId -> query/export. Never use group
execution to bypass approval. `canvas models` reads saved attempts; `query` checks the original
task. Follow the existing payment and review gates.

## Recovery and delivery

Read `capabilities.recovery` and live `inspect`. `status`/`wait` track a CLI operation; `query`
checks the original generation task where supported. Unknown is not failed. `save` retries
saving current page state without rerunning generation; it does not discard drafts or unlock
tasks. Resolve remaining UI-only blockers in the UI rather than deleting task records.
For existing results, use `export` with a supported `exportFormats` entry; `--output-dir`
must be an existing absolute directory. Use `download` for an original export operation.
Export does not itself prove that a result is installed into the game. Follow the documented
delivery paths for Bbox UI assembly and 3D models rather than moving cached files manually.
