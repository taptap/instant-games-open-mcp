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
.workflow-template-dialog .template-close { position:absolute; top:18px; right:18px; border:0; background:transparent; font-size:24px; padding:0; width:32px; height:32px; color:#a5a7b1; }
.workflow-template-dialog [role=status]:empty { display:none; }
.workflow-template-dialog [role=status] { color:#efc878; margin:12px 0 0; flex-shrink:0; }
.workflow-template-dialog.template-library[open] { display:flex; flex-direction:column; width:min(820px,calc(100vw - 32px)); height:min(660px,85vh); overflow:hidden; padding:26px 26px 0; }
.template-library h2,.template-library>p,.template-search { flex-shrink:0; }
.template-library .template-search { padding:11px 14px; border-color:#373b45; background:#191b21; margin-bottom:8px; }
.template-library .workflow-template-body { flex:1; min-height:0; overflow:auto; overscroll-behavior:contain; padding:0 4px 18px 0; scrollbar-width:thin; scrollbar-color:#494c57 transparent; }
.template-library h3 { font-size:12px; color:#afb2bd; font-weight:600; margin:18px 0 12px; letter-spacing:.5px; }
.template-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
.workflow-template-row { position:relative; min-width:0; display:flex; gap:14px; padding:12px; border:1px solid #353943; border-radius:12px; background:#262931; transition:border-color .15s,background .15s; }
.workflow-template-row:hover { border-color:#666051; background:#2b2e36; }
.workflow-template-row:has(details[open]) { z-index:2; }
.template-cover { flex:0 0 88px; width:88px; height:100px; display:flex; align-items:center; justify-content:center; border-radius:8px; overflow:hidden; background:#1a1c22; color:#777c8a; font-size:11px; }
.template-cover img { display:block; width:100%; height:100%; object-fit:contain; }
.template-cover.cover-loading { animation:template-cover-pulse 1.3s ease-in-out infinite alternate; }
@keyframes template-cover-pulse { to { opacity:.45; } }
.template-card-content { min-width:0; flex:1; display:flex; flex-direction:column; justify-content:space-between; padding:3px 0; }
.template-card-heading { display:flex; align-items:center; gap:4px; min-width:0; }
.template-card-heading strong { min-width:0; flex:1; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.template-description { display:block; font-size:11px; margin:5px 0 14px; }
.template-card-actions { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.template-card-actions small { font-size:11px; white-space:nowrap; }
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
@media(max-width:650px) { .template-grid { grid-template-columns:1fr; } .workflow-template-dialog.template-library[open] { padding:20px 18px 0; } .template-library-footer { flex-wrap:wrap; } }
@media(prefers-reduced-motion:reduce) { .template-cover.cover-loading { animation:none; } .workflow-template-row { transition:none; } }
`;
