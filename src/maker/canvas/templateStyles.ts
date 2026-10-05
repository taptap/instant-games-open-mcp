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
.workflow-template-dialog :focus-visible { outline:2px solid #efce69; outline-offset:3px; }
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
.template-library .template-close { top:24px; right:28px; }
.template-library h2 { font-size:26px; }
.template-library-toolbar { display:flex; align-items:center; gap:24px; flex-shrink:0; }
.template-library-total { margin-left:auto; white-space:nowrap; font-size:13px; color:#afb2bd; }
.template-categories { display:flex; gap:8px; flex-shrink:0; overflow:auto; padding:12px 0 18px; }
.template-categories button { white-space:nowrap; border-radius:24px; padding:8px 18px; background:transparent; }
.workflow-template-dialog .template-categories button[aria-pressed=true] { color:#292313; background:#efce69; border-color:#efce69; font-weight:600; }
.template-library h2,.template-library>p,.template-search { flex-shrink:0; }
.template-library .template-search { padding:12px 16px; border-color:#41454f; background:#14171c; margin:0; width:min(720px,75%); }
.template-library .workflow-template-body { flex:1; min-height:0; overflow:auto; overscroll-behavior:contain; padding:0 4px 18px 0; scrollbar-width:thin; scrollbar-color:#494c57 transparent; }
.template-library h3 { font-size:12px; color:#afb2bd; font-weight:600; margin:0 0 12px; letter-spacing:.5px; }
.template-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,520px),1fr)); gap:16px; margin-bottom:24px; }
.workflow-template-row { position:relative; min-width:0; display:flex; flex-direction:column; height:316px; box-sizing:border-box; gap:14px; padding:16px; border:1px solid #353943; border-radius:12px; background:#242830; transition:border-color .15s,background .15s; }
.workflow-template-row:hover { border-color:#666051; background:#2b2e36; }
.workflow-template-row:has(details[open]) { z-index:2; }
.template-previews { min-width:0; min-height:0; display:flex; gap:8px; height:100%; }
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
.template-card-content { min-width:0; min-height:0; flex:1; display:grid; grid-template-columns:minmax(0,2fr) minmax(0,1fr); grid-template-rows:minmax(0,1fr); gap:16px; }
.template-card-heading { display:flex; align-items:center; gap:4px; min-width:0; }
.template-card-heading strong { min-width:0; flex:1; font-size:17px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.template-description { display:block; font-size:13px; margin:0; align-self:center; max-height:100%; overflow:auto; overflow-wrap:anywhere; }
.template-card-actions { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.template-card-actions small { font-size:12px; white-space:nowrap; }
.workflow-template-dialog .template-add { border:0; color:#f1d681; background:#efd07517; padding:6px 10px; font-weight:600; white-space:nowrap; }
.workflow-template-dialog .template-add:hover:not(:disabled) { background:#efcf71; color:#292313; }
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
@media(max-width:650px) { .template-grid { grid-template-columns:1fr; } .workflow-template-dialog.template-library[open] { padding:20px 16px 0; } .template-library-footer { flex-wrap:wrap; } .template-library-total { font-size:11px; } .template-library-toolbar { gap:12px; } .template-card-content { grid-template-columns:minmax(0,1fr); grid-template-rows:minmax(0,1fr) auto; gap:8px; } .template-description { font-size:12px; max-height:42px; } .workflow-template-row { height:340px; } .template-library .template-close { top:18px; right:14px; } }
@media(prefers-reduced-motion:reduce) { .template-cover.cover-loading { animation:none; } .workflow-template-row { transition:none; } }
`;
