# LuaTween UI Integration

Use for a UI motion selection copied from the Maker console, or a request to add LuaTween
effects to an existing game. A selection authorizes local integration and requested testing,
not asset generation, publication, remote build, or replacement of the game's entry point.

## Read the selected reference

- Resolve the user's current game and target widget first. The console's demo resource label
  is not a game directory. If the target is genuinely ambiguous, ask which UI should receive
  the effect; do not ask the user to choose a library or manually install it.
- Read the copied selection: family, scene/clip or skin/effect ID, and intended target.
  Apply only the chosen effect to existing UI unless the user requests the complete example.
- Read the supplied `/ui-motion/runtime-reference` JSON (or downloaded reference package).
  `files` contains `{path, content}`; these are delivery paths, not already-installed files.
  Read `docs/LuaTween-integration.md`, `docs/luatween/README.md`, and the relevant sections
  of `docs/luatween/LuaTween.md`. `library` identifies the exact source and SHA-256.
- For motion-lab selections read `scripts/MotionLabRecipes.lua` and the selected entry in
  `assets/ui/motion-lab-v1/catalog.json`. For NanoVG scenes read
  `assets/ui/nanovg-showcase-v1/showcase.json` and the selected `motion/*.json`. For image UI
  read the selected `/ui-motion/original-reference?id=...`, UI.json,
  `scripts/ImageMotionRecipes.lua` and the matching `S01–S05RedesignDemo.lua`.
  In a downloaded package, use `ui-motion-native/catalog.json` and its matching files
  instead of fetching the original computer's image UI reference URL.
- If a loopback link is stale, use the active distribution's `console status/open --no-open
--json` to find its current origin, then verify the library identity before continuing.
  An AI running on another computer cannot use the original computer's loopback URL: use
  the downloaded reference JSON instead. Do not silently switch to a different library.

## Place only what the game needs

1. Before writing, search the whole game for LuaTween source, require paths (including
   aliases/wrappers), its update owner, and existing motion/event bindings on the target
   widget. A missing `scripts/LuaTween.lua` alone does not mean the library is absent.
   The bundled file adds usage comments only; `library.upstreamSha256` identifies the
   original without those comments. A comment-only hash difference is not incompatibility.
   Reuse an identical or verified compatible original module at its existing path, with
   its existing update owner and bindings. For partial integration, add only missing pieces;
   repeating the same request must not duplicate the library, scheduler or event binding.
   If the module is custom or incompatible, explain the conflict and confirm how to proceed
   before replacing shared code; never overwrite it silently or add a second scheduler.
2. If absent, copy the exact `files` entry `scripts/LuaTween.lua` into the game's `scripts/`
   directory, or follow its established Lua module layout. Verify the supplied SHA-256.
   Default usage is `local LuaTween = require('LuaTween')`. Do not alter the original library.
3. Keep the selected effect in the game's existing UI module (or its normal component
   directory). Reuse the reference's timing, easing and property/path sequence with real
   `To`, `Value`, `Path` or `Sequence` calls. Adapt bindings to the target widget; do not
   reimplement interpolation or tween only a clock while manually interpolating properties.
4. Import only needed recipe/adapter dependencies. Do not copy every demo, skin, native
   host, browser renderer or Fengari into the game. If the user only wants motion, retain
   the game's visuals. If they want the example UI too, preserve its editable layers and
   import only the chosen design's PNG/fonts/UI.json, retaining font licenses.
5. Media entries provide `path`, stable `url` and `sha256`; download only required files
   and verify them before use. Treat supplied paths as project-relative and check containment
   and existing files before extraction. Never bulk-overwrite a project with the reference.

## Connect and verify in the game

- Attach the trigger to the actual button, panel or scene. Ordinary playback must use the
  project's single `LuaTween.Update(dt)` owner. If absent, add one at the appropriate host
  update hook; never add an Update subscription per animated component.
- Preserve base transforms and the target's input behavior. Handle repeated triggers,
  pause/resume and re-entry. On close/destroy, kill only this component's owned handles;
  never use global `KillAll`/`Clear`. Seeking for inspection must not trigger game rewards,
  network calls or other business completion callbacks.
- Test through the project's normal local preview/validation workflow. Actually trigger
  the target control, trigger repeatedly, close while moving, reopen and verify the effect
  again. Check that unrelated animations still run and the existing UI remains usable.
  Network games retain their network preview requirements; do not bypass them.
- A passing unit test, loaded window or screenshot alone is not interaction acceptance.
  Report actual observations and any unverified visual/input paths honestly.
- Tell the user which UI now has the effect, how to trigger it, where the library and
  integration code live, and what was verified. Do not require them to read the library.
