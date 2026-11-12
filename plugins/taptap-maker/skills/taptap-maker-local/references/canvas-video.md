# Canvas Video

Read for canvas video authoring, reference-count errors or video task recovery. For page,
project, revision and operation handling, follow [Canvas Capability Guide](canvas.md).
These are canvas CLI capabilities, not a promise that every remote video tool option is
exposed by the canvas. Use the installed version's `canvas capabilities` as the parameter source.

## Modes and prerequisites

| Mode                    | Image input                         | Canvas models |
| ----------------------- | ----------------------------------- | ------------- |
| `first_frame`           | Exactly one image                   | `2.0`, `2.5`  |
| `first_last_frame`      | Exactly two images, first then last | `2.0`, `2.5`  |
| `multi_modal_reference` | Up to 9 images for 2.0, 30 for 2.5  | `2.0`, `2.5`  |

For model `2.5`, first-frame and first/last-frame modes require `ratio=adaptive`.
Use saved, ready image cards. Missing assets, stale upstream results and unresolved tasks
must be handled before execution. The local canvas does not expose every input type of the
remote tool; multi-reference here does not authorize inventing audio/video reference fields.

A saved `first_frame` mode still limits references to one after changing the model to 2.5.
Mode may come from the fixed template, generation draft or saved generation parameters; it
is not an immutable model/card limitation. Ordinary cards support first/last-frame generation
using `parameters.mode` and ordered references. Fixed first/last-frame templates retain
their explicit frame roles and cannot switch to another mode. Do not infer support only
from edge names or rewrite edges manually. Legacy fixed templates may require a new template
copy when the CLI explicitly reports that their video sources cannot be changed.

## Configure first/last frames

1. Inspect the video and its sources. Reuse the intended card, or create a `video` card with
   `add-node` if the user requested a new one. Read the current mode and blockers.
2. Use `update-nodes` with the current revision and this input (replace IDs):

   ```json
   {
     "nodes": [
       {
         "id": "VIDEO_ID",
         "parameters": { "model": "2.5", "mode": "first_last_frame", "ratio": "adaptive" }
       }
     ]
   }
   ```

3. Wait for the edit's operation to succeed, inspect the new revision, then use
   `set-references` with this input:

   ```json
   { "id": "VIDEO_ID", "sourceIds": ["FIRST_IMAGE_ID", "LAST_IMAGE_ID"] }
   ```

4. Wait and inspect again. Confirm mode, ordered references, prompt, duration and other
   effective settings; use `update-nodes` for any remaining requested changes. Partial
   parameter updates merge with saved settings. Setting parameters/references does not generate.
5. Only after video-generation authorization, follow [Asset Policy](assets.md) for cost
   confirmation and use `run` on the video card with `--allow-paid`. Keep the page open,
   track the returned operation and inspect the actual card/task result. Do not run the
   whole group unless the user requested its downstream steps as well.

Use `--input-file` with UTF-8 JSON to avoid shell quoting differences, especially on Windows.
Each edit also needs `--target-dir`, `--page-id`, `--canvas-id` and the latest `--revision`;
reuse the conversation's `--session-id`. Never reuse a revision blindly across saved edits.
If the card is already configured correctly, skip redundant edits. In the UI, select the
input mode in the video's parameter panel before selecting the two reference images.

## Diagnose without resubmitting

- Reference limit of 1: inspect `generationDraft.parameters.mode` and
  `generation.parameters.mode`. Switch from `first_frame` before attaching two images.
  This error alone does not mean model 2.5 or the CLI lacks first/last-frame support.
- Unconfirmed task or unsaved draft: inspect the specific blocker. `query` may recover a
  queryable original task; it does not discard drafts or acknowledge a terminal failure.
  Explicitly unexecuted failures without a task ID are exempt from the corresponding task
  block. Remaining failures/unknown states may need UI handling; no generic CLI unlock exists.
- Missing task ID, query timeout or unknown result: preserve the attempt/operation identity.
  Do not automatically create a new canvas/card to evade the blocker and resubmit paid work.
  For diagnosis, use a separate canvas for non-generating configuration checks. A new paid
  attempt requires checking the original result where possible and explicit user authorization.
- Content rejection: preserve the actual upstream error. It is separate from reference
  configuration. Do not promise that changing style or model will pass review, or silently
  change the requested character/style and pay for another attempt.
- Operation success: inspect for the saved video asset and actual task state. A successful
  query is not proof of a completed video. Export the existing result rather than regenerating.
