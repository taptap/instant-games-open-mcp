export const TEMPLATE_LIBRARY_STYLES = `
.workflow-template-dialog { box-sizing:border-box; width:min(480px,calc(100vw - 32px)); max-height:85vh; overflow:auto; border:1px solid #3b3e47; border-radius:16px; background:#202228; color:#eeeef1; padding:26px; box-shadow:0 24px 80px #0007; font-family:inherit; }
.workflow-template-dialog::backdrop { background:#08090db3; }
.workflow-template-dialog h2 { margin:0 36px 8px 0; font-size:20px; letter-spacing:.3px; }
.workflow-template-dialog p,.workflow-template-dialog small { color:#9fa2ae; line-height:1.6; }
.workflow-template-dialog p { font-size:13px; margin:0 0 18px; }
.workflow-template-dialog button,.workflow-template-dialog input { box-sizing:border-box; font:inherit; font-size:13px; color:inherit; background:#2a2d35; border:1px solid #41454f; border-radius:8px; padding:8px 12px; }
.workflow-template-dialog button { cursor:pointer; }
.workflow-template-dialog button:hover:not(:disabled) { background:#383c46; }
.workflow-template-dialog button:disabled { opacity:.35; cursor:default; }
.workflow-template-dialog :focus-visible { outline:2px solid var(--canvas-accent); outline-offset:3px; }
.workflow-template-dialog input { width:100%; margin-bottom:16px; }
.merge-icons-editor input { margin-bottom:0; }
.merge-icons-editor fieldset { min-width:0; border:1px solid #41454f; border-radius:8px; padding:12px; }
.merge-icons-editor legend { color:#9fa2ae; font-size:13px; padding:0 6px; }
.merge-icons-editor label { font-size:13px; }
.merge-icons-editor textarea { font:inherit; font-size:13px; color:inherit; background:#2a2d35; border:1px solid #41454f; border-radius:8px; padding:8px 12px; resize:vertical; margin-top:8px; }
.merge-icons-editor [data-error] { color:#ef9699; margin:12px 0; }
.workflow-template-dialog .template-close { position:absolute; top:18px; right:18px; border:0; background:transparent; font-size:24px; padding:0; width:32px; height:32px; color:#a5a7b1; }
.workflow-template-dialog [role=status]:empty { display:none; }
.workflow-template-dialog [role=status] { color:#efc878; margin:12px 0 0; flex-shrink:0; }
.workflow-template-dialog.template-library[open] { display:flex; flex-direction:column; position:fixed; inset:0; margin:0; width:100vw; max-width:none; height:100dvh; max-height:none; overflow:hidden; padding:28px 32px 0; border:0; border-radius:0; background:#1b1e24; }
dialog button.canvas-close-icon { flex:none; align-self:flex-start; margin-left:auto; width:32px; height:32px; padding:0; border:0; border-radius:6px; background:transparent; color:inherit; font:24px/1 sans-serif; }
dialog button.canvas-close-icon:hover:not(:disabled) { background:var(--canvas-soft,#383c46); }
.canvas-close-heading { display:flex; align-items:flex-start; gap:12px; justify-content:space-between; }
.template-library .template-close { top:24px; right:28px; }
.template-library h2 { font-size:26px; }
.template-library-toolbar { display:flex; align-items:center; gap:24px; flex-shrink:0; }
.template-library-total { margin-left:auto; white-space:nowrap; font-size:13px; color:#afb2bd; }
.template-categories { display:flex; gap:8px; flex-shrink:0; overflow:auto; padding:12px 0 18px; }
.template-categories button { white-space:nowrap; border-radius:24px; padding:8px 18px; background:transparent; }
.workflow-template-dialog .template-categories button[aria-pressed=true] { color:var(--canvas-accent); background:var(--canvas-accent-soft); border-color:#2f5753; font-weight:600; }
.template-library h2,.template-library>p,.template-search { flex-shrink:0; }
.template-library .template-search { padding:12px 16px; border-color:#41454f; background:#14171c; margin:0; width:min(720px,75%); }
.template-library .workflow-template-body { flex:1; min-height:0; overflow:auto; overscroll-behavior:contain; padding:0 4px 18px 0; scrollbar-width:thin; scrollbar-color:#494c57 transparent; }
.template-card-heading:has(.template-new-badge) strong { flex:0 1 auto; }
.template-new-badge { flex:none; border-radius:4px; padding:1px 5px; color:var(--canvas-accent); background:var(--canvas-accent-soft); font-size:11px; line-height:1.4; }
.template-library h3 { font-size:12px; color:#afb2bd; font-weight:600; margin:0 0 12px; letter-spacing:.5px; }
.template-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,520px),1fr)); gap:16px; margin-bottom:24px; }
.workflow-template-row { position:relative; min-width:0; display:flex; flex-direction:column; height:360px; box-sizing:border-box; gap:14px; padding:16px; border:1px solid #353943; border-radius:12px; background:#242830; transition:border-color .15s,background .15s; }
.workflow-template-row:hover { border-color:#666051; background:#2b2e36; }
.workflow-template-row:has(details[open]) { z-index:2; }
.template-previews { min-width:0; min-height:0; flex:1; display:flex; gap:8px; }
.template-previews figure { position:relative; flex:1; min-width:0; min-height:0; margin:0; height:100%; }
.template-previews figcaption { position:absolute; top:8px; left:8px; max-width:calc(100% - 24px); font-size:10px; color:#e5e7eb; background:#16191ddb; padding:4px 6px; border-radius:4px; pointer-events:none; }
.template-cover { width:100%; height:100%; display:flex; align-items:center; justify-content:center; border:1px solid #363b44; box-sizing:border-box; border-radius:8px; overflow:hidden; background-color:#191c22; background-image:conic-gradient(#20242b 25%,transparent 0 50%,#20242b 0 75%,transparent 0); background-size:16px 16px; color:#9197a5; font-size:11px; }
.template-cover img { display:block; width:100%; height:100%; object-fit:contain; }
.template-cover.cover-model { position:relative; }
.template-cover iframe { display:block; border:0; width:100%; height:100%; }
.template-cover.cover-animation { position:relative; background-color:#22252c; background-image:conic-gradient(#2c3038 25%,transparent 0 50%,#2c3038 0 75%,transparent 0); background-size:12px 12px; }
.template-cover canvas { display:block; width:100%; height:100%; object-fit:contain; }
.template-cover canvas:focus-visible { outline:2px solid #d8b55b; outline-offset:-2px; }
.template-animation-hint { position:absolute; bottom:3px; padding:2px 5px; border-radius:4px; background:#14161bcc; color:#d9dce3; font-size:10px; pointer-events:none; }
.template-cover.cover-loading { animation:template-cover-pulse 1.3s ease-in-out infinite alternate; }
@keyframes template-cover-pulse { to { opacity:.45; } }
.template-card-content { min-width:0; min-height:0; flex:1; display:flex; flex-direction:column; gap:10px; }
.template-chapter-card { container-type:inline-size; }
.template-chapter-card .template-previews { container-type:size; align-items:center; justify-content:center; }
.template-chapter-card .template-previews figure { flex:none; width:min(100cqw,calc(100cqh * 16 / 9)); height:auto; aspect-ratio:16 / 9; }
.template-chapter-card .template-cover { border:0; }
@container (min-width:560px) {
  .template-chapter-card .template-card-content { flex-direction:row; align-items:center; gap:20px; width:min(100%,740px); align-self:center; }
  .template-chapter-card .template-previews { align-self:stretch; }
  .template-chapter-card .template-description { flex:0 0 29%; display:block; font-size:14px; line-height:1.65; }
}
.template-card-heading { display:flex; align-items:center; gap:4px; min-width:0; }
.template-card-heading strong { min-width:0; flex:1; font-size:17px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.template-description { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; flex-shrink:0; font-size:13px; margin:0; overflow:hidden; overflow-wrap:anywhere; }
.workflow-template-row.template-result-previews { gap:6px; padding:12px 12px 8px; }
.template-result-previews .template-card-content { gap:4px; }
.template-result-previews .template-previews { display:grid; grid-template-columns:minmax(0,2.6fr) repeat(2,minmax(0,1fr)); grid-template-rows:repeat(2,minmax(0,1fr)); }
.template-result-previews .template-previews figure:first-child { grid-row:1/3; }
.template-result-previews .template-previews figure { display:grid; grid-template-rows:minmax(0,1fr) auto; gap:3px; }
.template-result-previews .template-previews figcaption { position:static; max-width:none; padding:0; background:none; line-height:14px; }
.template-result-previews .template-animation-hint { display:none; }
.template-result-previews .template-description { font-size:11px; line-height:15px; max-height:30px; }
.template-result-previews .template-card-metadata { gap:2px 6px; }
.template-result-previews .template-card-metadata small,.template-result-previews .template-card-metadata a { font-size:11px; line-height:15px; }
@media(max-width:450px) { .workflow-template-row.template-result-previews { height:500px; } .template-result-previews .template-previews { grid-template-columns:repeat(2,minmax(0,1fr)); grid-template-rows:minmax(0,2fr) repeat(2,minmax(0,1fr)); } .template-result-previews .template-previews figure:first-child { grid-column:1/3; grid-row:1; } }
.template-card-actions { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.template-card-actions small { font-size:12px; white-space:nowrap; }
.template-card-metadata { display:flex; align-items:center; flex-wrap:wrap; gap:6px 10px; margin-right:auto; min-width:0; }
.template-card-metadata a { font-size:12px; color:var(--canvas-accent); overflow-wrap:anywhere; text-underline-offset:3px; }
.workflow-template-dialog .template-preview { padding:6px 10px; background:transparent; white-space:nowrap; }
.template-workflow-preview[open] { display:flex; flex-direction:column; width:92vw; max-width:1500px; height:86dvh; max-height:94dvh; overflow:hidden; padding:20px; }
.template-workflow-preview.expanded[open] { width:100vw; max-width:none; height:100dvh; max-height:none; border-radius:0; }
.template-workflow-preview h2 { font-size:18px; margin:0 36px 6px 0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; flex-shrink:0; }
.template-workflow-preview>p { margin:0 0 10px; }
.template-preview-toolbar { display:flex; align-items:center; gap:8px; margin-bottom:12px; flex-shrink:0; flex-wrap:wrap; }
.template-preview-toolbar span { min-width:40px; text-align:center; font-size:12px; color:#b8bdc8; }
.template-preview-toolbar .template-add { margin-left:auto; }
.template-workflow-preview [hidden] { display:none !important; }
.template-reader { flex:1; min-height:0; overflow:auto; overscroll-behavior:contain; padding:0 8px 20px; }
.template-reader nav { display:flex; flex-wrap:wrap; gap:6px; margin:14px 0; }
.template-reader button[aria-pressed=true],.template-preview-toolbar button[aria-pressed=true] { color:var(--canvas-accent); border-color:currentColor; }
.template-reader h3 { margin:10px 0 4px; font-size:18px; }
.template-reader p { line-height:1.6; margin:4px 0 12px; }
.template-reader-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr)); gap:12px; }
.template-reader figure { margin:0; min-width:0; }
.template-reader figure>div { min-height:64px; background:#181b21; border-radius:8px; padding:6px; text-align:center; }
.template-reader figure button:has(img) { cursor:zoom-in; display:block; width:100%; padding:0; border:0; background:none; }
.template-reader figure img,.template-reader figure canvas { display:block; object-fit:contain; width:100%; height:clamp(120px,24vh,280px); }
.template-reader-hero figure img { height:auto; }
.template-reader-split-atlas { grid-template-columns:repeat(6,minmax(0,1fr)); align-items:center; }
.template-reader-split-atlas figure { grid-column:span 3; }
.template-reader-split-atlas figure:first-child { grid-column:span 2; }
.template-reader-split-atlas figure:nth-child(2) { grid-column:span 4; }
.template-reader-split-atlas figure:nth-child(-n+2) img { height:auto; }
@media(max-width:600px) { .template-reader-split-atlas { display:flex; flex-direction:column; align-items:stretch; } }
.template-reader-grid:not(.template-character-gallery):has(>figure:nth-child(7)) { grid-template-columns:repeat(4,minmax(0,1fr)); }
.template-reader-grid:not(.template-character-gallery):has(>figure:nth-child(7)) figure:nth-child(-n+2) { grid-column:span 2; }
.template-reader-grid:not(.template-character-gallery):has(>figure:nth-child(7)) figure:nth-child(n+3) img { height:clamp(62px,10vh,108px); }
@media(max-width:600px) { .template-reader-grid:not(.template-character-gallery):has(>figure:nth-child(7)) { grid-template-columns:repeat(2,minmax(0,1fr)); } }
.template-reader figcaption,.template-reader summary { padding:6px 0; font-size:13px; }
.template-reader-grid.template-character-gallery { display:flex; flex-direction:column; container-type:inline-size; }
.template-character-references,.template-character-variations { display:grid; gap:12px; align-items:start; }
.template-character-references { grid-template-columns:repeat(2,minmax(0,1fr)); }
.template-character-variations { grid-template-columns:repeat(3,minmax(0,1fr)) repeat(2,minmax(0,.54fr)); }
.template-character-gallery figure>div { display:grid; place-items:center; box-sizing:border-box; min-height:0; aspect-ratio:16/9; }
.template-character-gallery figure button:has(img),.template-character-gallery figure img,.template-character-gallery figure canvas { width:100%; height:100%; min-height:0; min-width:0; }
.template-character-gallery figure>div { grid-template: minmax(0,1fr) / minmax(0,1fr); }
.template-character-variations figure:nth-last-child(-n+2)>div { aspect-ratio:.96; }
.template-character-gallery figcaption button { display:block; margin-top:4px; padding:3px 8px; }
@container (max-width:760px) {
  .template-character-variations { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .template-character-variations figure:nth-child(3) { grid-column:1/-1; }
  .template-character-variations figure:nth-last-child(-n+2)>div { aspect-ratio:1; }
}
@container (max-width:460px) {
  .template-character-references { grid-template-columns:minmax(0,1fr); }
}
.template-reader summary { cursor:pointer; }
.template-reader-lightbox { max-width:94vw; max-height:94dvh; padding:44px 12px 12px; background:#20252e; }
.template-reader-lightbox img { display:block; object-fit:contain; max-width:88vw; max-height:80dvh; margin-top:8px; }
.template-preview-viewport { position:relative; flex:1; min-height:0; overflow:hidden; border:1px solid #3b404b; border-radius:10px; background:#14171c radial-gradient(#303541 1px,transparent 1px); background-size:22px 22px; cursor:grab; touch-action:none; user-select:none; }
.template-preview-viewport:active { cursor:grabbing; }
.template-preview-world { position:absolute; inset:0; transform-origin:0 0; pointer-events:none; }
.template-preview-wires { position:absolute; left:0; top:0; width:1px; height:1px; overflow:visible; z-index:1; }
.template-preview-wires path { fill:none; stroke:#d7b56d; stroke-width:2; }
.template-preview-card { position:absolute; box-sizing:border-box; display:flex; flex-direction:column; gap:8px; padding:10px; border:1px solid #4b5261; border-radius:10px; background:#20252e; overflow:hidden; z-index:2; }
.template-preview-card>strong { font-size:14px; line-height:20px; flex-shrink:0; }
.template-preview-content { flex:1; min-height:0; overflow:hidden; white-space:pre-wrap; overflow-wrap:anywhere; font-size:13px; color:#adb4c1; }
.template-preview-content img, .template-preview-content canvas { width:100%; height:100%; object-fit:contain; display:block; }
.template-preview-content iframe { width:100%; height:100%; border:0; pointer-events:auto; }
.template-preview-assets { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); align-content:start; align-items:start; gap:10px; max-height:520px; overflow-y:auto; overscroll-behavior:contain; pointer-events:auto; touch-action:pan-y; cursor:auto; }
.template-preview-category { min-width:0; padding:6px; border:1px solid #ffffff12; border-radius:6px; }
.template-preview-category.large { grid-column:1/-1; }
.template-preview-category>strong { display:block; font-size:12px; margin-bottom:6px; }
.template-preview-category summary { cursor:pointer; padding:6px 0; font-size:12px; }
.template-preview-asset-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; }
.template-preview-category.large .template-preview-asset-grid { grid-template-columns:repeat(3,minmax(0,1fr)); }
.template-preview-asset { min-width:0; height:64px; border-radius:4px; background:#161a20; }
.template-preview-category.large .template-preview-asset { height:100px; }
.bundle-gallery.bundle-gallery { grid-template-columns:repeat(12,minmax(0,1fr)); grid-auto-flow:row dense; align-items:stretch; align-content:start; gap:12px; padding:12px; box-sizing:border-box; }
.bundle-gallery > [data-group] { grid-column:span 4; min-width:0; padding:12px; border-radius:10px; }
.bundle-gallery > [data-group="controls"] { grid-column:span 6; }
.bundle-gallery > [data-group="equipment"] { grid-column:span 2; }
.bundle-gallery > [data-group="artwork"] { grid-column:span 7; }
.bundle-gallery > [data-group="background"] { grid-column:span 5; }
.bundle-gallery > [data-group="panels"] { grid-column:1/-1; order:1; }
.bundle-gallery [data-group] > strong { font-size:18px; }
.bundle-gallery [data-group] > .bundle-tiles { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; margin-top:8px; }
.bundle-gallery [data-group="artwork"] > .bundle-tiles { grid-template-columns:repeat(5,minmax(0,1fr)); }
.bundle-gallery :is([data-group="background"],[data-group="panels"],[data-group="equipment"]) > .bundle-tiles { grid-template-columns:1fr; }
.bundle-gallery .bundle-tiles > :is(img,.template-preview-asset) { box-sizing:border-box; width:100%; height:var(--tile); padding:7px; object-fit:contain; background:#14181e; border-radius:7px; }
.bundle-gallery :is([data-group="artwork"],[data-group="background"]) .bundle-tiles > :is(img,.template-preview-asset) { height:calc(var(--tile) * 2.5); }
.bundle-gallery [data-group="equipment"] .bundle-tiles > * { height:calc(var(--tile) * 2 + 8px); }
.bundle-gallery [data-group="panels"] .bundle-tiles > :is(img,.template-preview-asset) { height:calc(var(--tile) * .8); }
.bundle-gallery [data-group] > .bundle-tiles { max-height:calc(var(--tile) * 2 + 8px); overflow-y:auto; overscroll-behavior:contain; scrollbar-width:thin; }
.bundle-gallery :is([data-group="artwork"],[data-group="background"]) > .bundle-tiles { max-height:calc(var(--tile) * 2.5); }
.bundle-gallery [data-group="equipment"] > .bundle-tiles:has(>:nth-child(2)) { grid-template-columns:repeat(2,minmax(0,1fr)); }
.bundle-gallery [data-group="equipment"] > .bundle-tiles:has(>:nth-child(2)) > * { height:var(--tile); }
.bundle-gallery [data-group="panels"] > .bundle-tiles { max-height:calc(var(--tile) * .8); }
.bundle-gallery [data-group="panels"] > .bundle-tiles:has(>:nth-child(2)) { grid-template-columns:repeat(3,minmax(0,1fr)); }
.template-comparison-viewport { container-type:inline-size; }
.template-preview-world.template-comparison { inset:0 auto auto 0; width:min(1440px,calc(100% - 28px)); display:grid; grid-template-columns:minmax(0,2fr) minmax(0,3fr); align-items:start; gap:16px 48px; }
.template-flow-inputs,.template-flow-result { display:grid; gap:16px; min-width:0; }
.template-flow-result { align-self:center; }
.template-flow-inputs:has(>article:nth-child(2)) .portrait-input { max-width:235px; }
.template-flow-inputs.multiple { grid-template-columns:repeat(2,minmax(0,1fr)); }
.template-flow-inputs.multiple article:last-child:nth-child(odd) { grid-column:1/-1; }
.template-flow-inputs .portrait-input { width:min(100%,290px); justify-self:end; }
.template-comparison .template-preview-card { position:relative; min-width:0; }
.template-comparison .template-preview-content { flex:none; }
.template-preview-world.template-voxel-flow { grid-template-columns:minmax(0,.58fr) minmax(0,1.45fr) minmax(0,1fr); grid-template-areas:"input views model" "style views model" "guide guide guide"; align-items:center; gap:28px 44px; }
.template-voxel-flow .template-preview-card>iframe { width:100%; aspect-ratio:1; border:0; pointer-events:auto; }
.template-model-toggle,.template-preview-content button { pointer-events:auto; justify-self:center; }
.template-preview-card.canvas-mark { background:none; padding:0; border:0; overflow:visible; }
.template-preview-card.canvas-mark svg,.template-preview-card.canvas-mark .mark-box { width:100%; height:100%; box-sizing:border-box; }
.template-preview-card.canvas-mark :is(.mark-point,.mark-edge,.mark-corner) { display:none; }
@container (max-width:680px) {
  .template-preview-world.template-comparison { grid-template-columns:minmax(0,1fr); gap:32px; }
  .template-flow-inputs .portrait-input { justify-self:center; }
  .template-preview-world.template-voxel-flow { grid-template-columns:repeat(2,minmax(0,1fr)); grid-template-areas:"input style" "views views" "model model" "guide guide"; }
}
.template-preview-card.preview-section { z-index:0; background:#252a3433; border:1px dashed #59616e; }
.workflow-template-dialog .template-add,:root[data-theme="light"] .workflow-template-dialog .template-add { border:1px solid transparent; color:var(--canvas-accent-foreground); background:var(--canvas-accent); padding:6px 12px; font-weight:600; white-space:nowrap; }
.workflow-template-dialog .template-add:hover:not(:disabled),:root[data-theme="light"] .workflow-template-dialog .template-add:hover:not(:disabled) { background:var(--canvas-accent); color:var(--canvas-accent-foreground); filter:brightness(1.08); }
.template-more { position:relative; }
.template-more summary { list-style:none; cursor:pointer; color:#aeb1bd; font-size:20px; line-height:22px; border-radius:5px; width:24px; text-align:center; }
.template-more summary::-webkit-details-marker { display:none; }
.template-more summary:hover { background:#ffffff12; }
.template-actions-menu { position:absolute; z-index:3; right:0; top:26px; padding:5px; width:112px; border:1px solid #474b57; background:#22252d; border-radius:9px; box-shadow:0 8px 24px #0006; }
.template-actions-menu button { display:block; border:0; background:transparent; width:100%; text-align:left; }
.template-actions-menu .template-delete { color:#ef9699; }
.template-library .template-empty { padding:24px 12px; text-align:center; font-size:12px; border:1px dashed #3b3f49; border-radius:12px; margin:0; }
.template-library-footer { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 0; border-top:1px solid #363943; flex-shrink:0; }
.template-library-footer small { font-size:11px; }
.template-library-footer nav { display:flex; align-items:center; gap:10px; font-size:12px; color:#b5b8c4; white-space:nowrap; }
.template-library-footer button { padding:3px 9px; font-size:20px; background:transparent; border-color:#393d47; }
#canvas-context-menu { max-height:calc(100vh - 24px); overflow:auto; }
@media(max-width:650px) { .template-grid { grid-template-columns:1fr; } .workflow-template-dialog.template-library[open] { padding:20px 16px 0; } .template-library-footer { flex-wrap:wrap; } .template-library-total { font-size:11px; } .template-library-toolbar { gap:12px; } .template-card-content { gap:8px; } .template-description { font-size:12px; } .workflow-template-row { height:340px; } .template-library .template-close { top:18px; right:14px; } }
@media(max-width:450px) { .template-library-toolbar { flex-wrap:wrap; } .template-library .template-search { width:100%; } .template-library-total { margin-left:0; margin-right:auto; } .template-card-actions { flex-wrap:wrap; } .template-card-metadata { width:100%; margin-right:0; } }
@media(prefers-reduced-motion:reduce) { .template-cover.cover-loading { animation:none; } .workflow-template-row { transition:none; } }
`;
