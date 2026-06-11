# Maker 3D Model Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local Maker MCP support for `create_3d_model_task` and `query_3d_model_task`,
including preview/model asset download and local-path-to-CDN argument rewriting.

**Architecture:** Keep the current static Maker proxy pattern: local MCP lists a fixed allowlist,
connects to the remote proxy only on call, then post-processes JSON text results. Extend
`proxyAssets.ts` with focused 3D helpers while reusing the generated asset registry lookup and
best-effort download behavior already used by images, video, and music.

**Tech Stack:** TypeScript, MCP SDK, Jest tests in `src/__tests__/makerBuildLocalChanges.test.ts`,
Markdown docs.

---

## File Map

- Modify `src/maker/server/mcp.ts`
  - Add static tool names and JSON schemas for the two 3D tools.
  - Keep remote discovery out of startup.
- Modify `src/maker/server/proxyAssets.ts`
  - Add `assets/model` handling.
  - Rewrite 3D image inputs through the existing registry lookup.
  - Materialize Phase 1 preview images and final MDL/rendered preview assets.
- Modify `src/__tests__/makerBuildLocalChanges.test.ts`
  - Cover tool listing, status missing tools, argument rewriting, and asset materialization.
- Modify `docs/MAKER.md`, `docs/PROXY.md`, `README.md`
  - Document the expanded creative asset tool set and local 3D asset directories.
- Modify `skills/taptap-maker-local/SKILL.md`, `src/maker/cli/skill.ts`,
  `src/maker/cli/devKit.ts`
  - Keep bundled Maker guide text aligned with the new 3D asset workflow.

---

### Task 1: Expose Static 3D Proxy Tools

**Files:**

- Modify: `src/maker/server/mcp.ts`
- Test: `src/__tests__/makerBuildLocalChanges.test.ts`

- [ ] **Step 1: Write failing tests for static tool exposure**

  Add expectations beside existing remote proxy tool list tests:

  ```ts
  expect(result.tools.map((item) => item.name)).toEqual([
    'maker_status_lite',
    'maker_build_current_directory',
    'generate_image',
    'batch_generate_images',
    'edit_image',
    'create_video_task',
    'text_to_music',
    'create_3d_model_task',
    'query_3d_model_task',
  ]);

  expect([...MAKER_REMOTE_PROXY_EXPOSED_TOOL_NAMES]).toEqual([
    'generate_image',
    'batch_generate_images',
    'edit_image',
    'create_video_task',
    'text_to_music',
    'create_3d_model_task',
    'query_3d_model_task',
  ]);
  ```

  Add schema checks:

  ```ts
  const createModelTool = result.tools.find((item) => item.name === 'create_3d_model_task');
  const queryModelTool = result.tools.find((item) => item.name === 'query_3d_model_task');

  expect(createModelTool?.inputSchema.properties).toHaveProperty('mode');
  expect(createModelTool?.inputSchema.properties).toHaveProperty('confirmed_image_paths');
  expect(createModelTool?.inputSchema.properties).toHaveProperty('front_image');
  expect(queryModelTool?.inputSchema.required).toEqual(['task_id']);
  ```

- [ ] **Step 2: Run test to verify it fails**

  Run:

  ```bash
  npm test -- --runTestsByPath src/__tests__/makerBuildLocalChanges.test.ts --runInBand
  ```

  Expected: FAIL because the 3D tool names are missing from the static allowlist.

- [ ] **Step 3: Add static 3D tool definitions**

  In `src/maker/server/mcp.ts`, extend `MAKER_REMOTE_PROXY_EXPOSED_TOOL_NAMES`:

  ```ts
  export const MAKER_REMOTE_PROXY_EXPOSED_TOOL_NAMES = [
    'generate_image',
    'batch_generate_images',
    'edit_image',
    'create_video_task',
    'text_to_music',
    'create_3d_model_task',
    'query_3d_model_task',
  ] as const;
  ```

  Add `makerRemoteProxyToolDefinitions.create_3d_model_task` with `mode`,
  `prompt`, `image`, `confirmed_image_paths`, `front_image`, `left_image`,
  `back_image`, `right_image`, `seed`, and optional upstream passthrough fields.

  Add `makerRemoteProxyToolDefinitions.query_3d_model_task` with required
  `task_id`.

- [ ] **Step 4: Run test to verify it passes**

  Run:

  ```bash
  npm test -- --runTestsByPath src/__tests__/makerBuildLocalChanges.test.ts --runInBand
  ```

  Expected: static tool exposure tests pass, with possible later failures from unimplemented
  materialization tests.

---

### Task 2: Rewrite 3D Tool Image Inputs

**Files:**

- Modify: `src/maker/server/proxyAssets.ts`
- Test: `src/__tests__/makerBuildLocalChanges.test.ts`

- [ ] **Step 1: Write failing tests for input rewriting**

  Add tests that first generate a registry image, then call `prepareRemoteProxyToolArgs`:

  ```ts
  const args = prepareRemoteProxyToolArgs({
    toolName: 'create_3d_model_task',
    targetDir: tempDir,
    args: {
      mode: 'text_to_model',
      confirmed_image_paths: {
        front: 'model_front',
        left: 'assets/image/model_left.png',
        back: 'https://example.test/back.png',
        right: path.join(tempDir, 'assets/image/model_right.png'),
      },
      front_image: 'model_front',
    },
  });

  expect((args.confirmed_image_paths as Record<string, string>).front).toBe(
    'https://example.test/model-front.png'
  );
  expect((args.confirmed_image_paths as Record<string, string>).back).toBe(
    'https://example.test/back.png'
  );
  expect(args.front_image).toBe('https://example.test/model-front.png');
  ```

  Add a `multiview_to_model` test for `front_image`, `left_image`, `back_image`, and
  `right_image`.

- [ ] **Step 2: Run test to verify it fails**

  Run:

  ```bash
  npm test -- --runTestsByPath src/__tests__/makerBuildLocalChanges.test.ts --runInBand
  ```

  Expected: FAIL because `create_3d_model_task` args currently pass through unchanged.

- [ ] **Step 3: Implement 3D argument rewriting**

  In `prepareRemoteProxyToolArgs`, add:

  ```ts
  if (options.toolName === 'create_3d_model_task') {
    return rewrite3dModelAssetArgs(options.targetDir, options.args);
  }
  ```

  Implement `rewrite3dModelAssetArgs` using `rewriteGeneratedAssetReference` and
  `IMAGE_ASSET_DIRS` for:
  - `confirmed_image_paths.front`
  - `confirmed_image_paths.left`
  - `confirmed_image_paths.back`
  - `confirmed_image_paths.right`
  - `front_image`
  - `left_image`
  - `back_image`
  - `right_image`
  - `image`

- [ ] **Step 4: Run test to verify it passes**

  Run:

  ```bash
  npm test -- --runTestsByPath src/__tests__/makerBuildLocalChanges.test.ts --runInBand
  ```

  Expected: 3D argument rewrite tests pass.

---

### Task 3: Materialize 3D Preview and Final Assets

**Files:**

- Modify: `src/maker/server/proxyAssets.ts`
- Test: `src/__tests__/makerBuildLocalChanges.test.ts`

- [ ] **Step 1: Write failing tests for Phase 1 preview downloads**

  Add a test:

  ```ts
  const result = await materializeRemoteProxyToolAssets({
    toolName: 'create_3d_model_task',
    targetDir: tempDir,
    now: new Date('2026-06-11T08:09:10Z'),
    fetchImpl: fakeAssetFetch('preview-bytes'),
    result: proxyTextResult({
      phase: 1,
      mode: 'text_to_model',
      task_id: 'model-task-1',
      preview_urls: {
        front: 'https://example.test/front.png',
        left: 'https://example.test/left.png',
        back: 'https://example.test/back.png',
        right: 'https://example.test/right.png',
      },
    }),
  });

  const parsed = JSON.parse(result.content[0]?.type === 'text' ? result.content[0].text : '{}');
  expect(parsed.preview_assets.front.localPath).toBe(
    'assets/image/model-task-1_front_20260611080910.png'
  );
  ```

- [ ] **Step 2: Write failing tests for final model downloads**

  Add a test:

  ```ts
  const result = await materializeRemoteProxyToolAssets({
    toolName: 'query_3d_model_task',
    targetDir: tempDir,
    now: new Date('2026-06-11T08:09:11Z'),
    fetchImpl: fakeAssetFetch('model-bytes'),
    result: proxyTextResult({
      task_id: 'model-task-2',
      status: 'success',
      model_cdn_url: 'https://cdn.tripo3d.ai/model.glb',
      rendered_image_url: 'https://cdn.tripo3d.ai/preview.png',
      mdl_cdn_url: 'https://oss-cdn.example.test/model.zip',
    }),
  });

  const parsed = JSON.parse(result.content[0]?.type === 'text' ? result.content[0].text : '{}');
  expect(parsed.mdlLocalPath).toBe('assets/model/model-task-2_20260611080911.zip');
  expect(parsed.renderedImageLocalPath).toBe('assets/image/model-task-2_render_20260611080911.png');
  ```

  Add one test where `status: "success"` has `mdl_conversion_error` but no `mdl_cdn_url`, and
  assert the error remains in the payload with no failed tool result.

- [ ] **Step 3: Run tests to verify they fail**

  Run:

  ```bash
  npm test -- --runTestsByPath src/__tests__/makerBuildLocalChanges.test.ts --runInBand
  ```

  Expected: FAIL because 3D tools are not materialized yet.

- [ ] **Step 4: Implement 3D materialization**

  Add `MODEL_ASSET_DIRS = ['assets/model']`.

  Extend `shouldMaterializeRemoteProxyTool` and `materializeParsedProxyResult` for:
  - `create_3d_model_task`
  - `query_3d_model_task`

  Implement:
  - `materialize3dModelResult`
  - `materialize3dPreviewResult`
  - `materialize3dFinalResult`

  Use `materializeAsset` for downloads. Add local fields using stable names:
  - Phase 1: `preview_assets.<view>.localPath`, `absolutePath`, `download`, `cdnUrl`
  - Final: `mdlLocalPath`, `mdlAbsolutePath`, `renderedImageLocalPath`,
    `renderedImageAbsolutePath`

  Keep `model_cdn_url`, `rendered_image_url`, `mdl_cdn_url`, and `mdl_conversion_error` unchanged.

- [ ] **Step 5: Run test to verify it passes**

  Run:

  ```bash
  npm test -- --runTestsByPath src/__tests__/makerBuildLocalChanges.test.ts --runInBand
  ```

  Expected: all maker local proxy asset tests pass.

---

### Task 4: Update Maker Documentation and Bundled Skill Text

**Files:**

- Modify: `README.md`
- Modify: `docs/MAKER.md`
- Modify: `docs/PROXY.md`
- Modify: `skills/taptap-maker-local/SKILL.md`
- Modify: `src/maker/cli/skill.ts`
- Modify: `src/maker/cli/devKit.ts`
- Test: `src/__tests__/makerSkillInstall.test.ts`, `src/__tests__/makerDevKit.test.ts`

- [ ] **Step 1: Write failing doc text expectations**

  Extend existing tests to expect:

  ```ts
  expect(skillText).toContain('create_3d_model_task');
  expect(skillText).toContain('query_3d_model_task');
  expect(skillText).toContain('assets/model');
  ```

  Extend status or guide expectations where they list image/video/audio tools.

- [ ] **Step 2: Run tests to verify failure**

  Run:

  ```bash
  npm test -- --runTestsByPath src/__tests__/makerSkillInstall.test.ts src/__tests__/makerDevKit.test.ts --runInBand
  ```

  Expected: FAIL until bundled skill text mentions the new 3D tools and model directory.

- [ ] **Step 3: Update docs and skill text**

  Update public docs to say:
  - Maker proxy tools include image, video, music, and 3D model generation.
  - Phase 1 3D previews save to `assets/image/`.
  - Final MDL zip files save to `assets/model/`.
  - GLB URLs are retained in metadata but not downloaded by default.

  Update bundled skill/dev-kit strings to include the two 3D tools and `assets/model`.

- [ ] **Step 4: Run focused tests**

  Run:

  ```bash
  npm test -- --runTestsByPath src/__tests__/makerSkillInstall.test.ts src/__tests__/makerDevKit.test.ts --runInBand
  ```

  Expected: PASS.

---

### Task 5: Final Verification and Commit

**Files:**

- Verify all modified files.

- [ ] **Step 1: Run formatting and focused tests**

  Run:

  ```bash
  npm run format:check
  npm test -- --runTestsByPath src/__tests__/makerBuildLocalChanges.test.ts src/__tests__/makerSkillInstall.test.ts src/__tests__/makerDevKit.test.ts --runInBand
  ```

  Expected: PASS.

- [ ] **Step 2: Inspect final diff**

  Run:

  ```bash
  git status --short
  git diff --stat
  git diff -- src/maker/server/mcp.ts src/maker/server/proxyAssets.ts
  ```

  Expected: only 3D model proxy tool changes, docs, tests, and bundled guide text are changed.

- [ ] **Step 3: Commit implementation**

  Use a release-triggering type because this adds user-visible Maker MCP capability:

  ```bash
  git add README.md docs/MAKER.md docs/PROXY.md skills/taptap-maker-local/SKILL.md \
    src/maker/cli/skill.ts src/maker/cli/devKit.ts src/maker/server/mcp.ts \
    src/maker/server/proxyAssets.ts src/__tests__/makerBuildLocalChanges.test.ts \
    src/__tests__/makerSkillInstall.test.ts src/__tests__/makerDevKit.test.ts \
    docs/superpowers/plans/2026-06-11-maker-3d-model-tools.md

  git commit -m "feat(maker): support 3d model proxy assets" \
    -m "- Expose create_3d_model_task and query_3d_model_task from local Maker MCP." \
    -m "- Download Phase 1 preview images and final MDL/rendered assets locally." \
    -m "- Rewrite local 3D image inputs to CDN URLs for remote proxy calls." \
    -m "- Update Maker docs and bundled guide text for 3D model assets." \
    -m "- Verified focused Maker proxy and bundled guide tests."
  ```
