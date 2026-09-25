export const SEQUENCE_EDITOR_STYLES = String.raw`
.card.sequence { overflow: hidden; gap: 8px; }
.sequence-source-label { color: #aaa79f; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sequence-result-grid { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); align-content: start; gap: 8px; }
.sequence-result-grid figure { margin: 0; text-align: center; color: #929792; font-size: 11px; }
.sequence-result-grid canvas { width: 100%; height: 80px; object-fit: contain; border-radius: 5px; background: repeating-conic-gradient(#272b30 0% 25%,#20242a 0% 50%) 0/16px 16px; }
.sequence-result-empty { display: grid; place-items: center; color: #989c9b; font-size: 13px; }
.sequence-edit-button { display: none; position: absolute; top: 10px; right: 12px; border: 1px solid #8e794d; border-radius: 6px; padding: 5px 13px; background: #e8c17c; color: #221d14; cursor: pointer; }
.card.sequence.selected .sequence-edit-button { display: block; }
.sequence-animation-button { display: none; position: absolute; right: 12px; bottom: 15px; padding: 6px 10px; border-radius: 6px; background: #252c32; color: #eed8b2; border: 1px solid #776c56; cursor: pointer; }
.card.sequence.selected .sequence-animation-button { display: block; }
.card.animation { display: flex; flex-direction: column; gap: 12px; overflow: hidden; }
.animation-preview { width: 100%; flex: 1; min-height: 0; object-fit: contain; border-radius: 8px; }
.animation-controls { display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap; }
.animation-controls button { padding: 6px 10px; border: 1px solid #776c56; border-radius: 6px; background: #252c32; color: #eed8b2; cursor: pointer; }
.animation-caption { color: #aaa79f; font-size: 11px; }
.generation-result-label { color: #d8bc89; font-size: 11px; margin: 6px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.generation-result-details { color: #a6afaf; font-size: 11px; margin: 6px 0; max-height: 110px; overflow: auto; }
.generation-result-details summary { cursor: pointer; }
.generation-result-details p { font-size: 11px; white-space: pre-wrap; }
.card.video-source .video-source-preview { height: calc(100% - 110px); min-height: 80px; }
.sequence-editor-field select { padding: 9px; border: 1px solid #41494e; border-radius: 6px; background: #13191e; color: #eef3eb; }
.sequence-editor { --seq-bg: #171b20; --seq-line: #343a40; --seq-muted: #a6afaf; --seq-accent: #edc78c; padding: 0; width: min(1240px,94vw); height: min(900px,92dvh); max-width: 96vw; max-height: 96dvh; border: 1px solid #49504f; border-radius: 18px; color: #f1f2ed; background: var(--seq-bg); box-shadow: 0 28px 100px #0009; overflow: hidden; font-family: 'Avenir Next','PingFang SC','Microsoft YaHei',sans-serif; }
.sequence-editor::backdrop { background: #070b11ba; backdrop-filter: blur(6px); }
.sequence-editor-shell { height: 100%; display: flex; flex-direction: column; }
.sequence-editor button { font: inherit; cursor: pointer; padding: 9px 15px; border-radius: 8px; background: #252c32; border: 1px solid #414a50; color: inherit; }
.sequence-editor button:hover:not(:disabled) { background: #354048; }
.sequence-editor button:disabled { opacity: .45; cursor: default; }
.sequence-editor button.primary { background: var(--seq-accent); border-color: var(--seq-accent); color: #292115; font-weight: 600; }
.sequence-editor button.primary:hover:not(:disabled) { background: #f7d9a9; }
.sequence-editor button:focus-visible,.sequence-editor input:focus-visible { outline: 2px solid var(--seq-accent); outline-offset: 3px; }
.sequence-editor-header { flex: none; display: flex; justify-content: space-between; align-items: center; padding: 22px 28px 18px; border: 0; background: linear-gradient(110deg,#24312e,#171b20 65%); }
.sequence-editor-header small { display: block; color: #9fae9e; letter-spacing: 2px; font-size: 10px; }
.sequence-editor-header h2 { margin: 6px 0; font-size: 25px; letter-spacing: 1px; }
.sequence-editor-header span { font-size: 12px; color: var(--seq-muted); }
.sequence-editor-steps { display: flex; gap: 22px; padding: 12px 28px 18px; border-bottom: 1px solid var(--seq-line); font-size: 13px; color: #808e91; }
.sequence-editor-steps .active { color: var(--seq-accent); }
.sequence-editor-steps .complete { color: #a1c8b2; }
.sequence-editor-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0,1fr) 270px; }
.sequence-editor-preview { min-height: 0; min-width: 0; padding: 22px; display: flex; flex-direction: column; gap: 12px; }
.sequence-editor-stage { flex: 1; min-height: 140px; display: flex; justify-content: center; align-items: center; overflow: hidden; border: 1px solid #394044; border-radius: 10px; }
.checkerboard { background: repeating-conic-gradient(#262d32 0% 25%,#21272c 0% 50%) 0/24px 24px; }
.sequence-editor-canvas { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; }
.sequence-editor-video { width: 100%; height: 100%; object-fit: contain; }
.sequence-preview-controls { display: flex; align-items: center; gap: 12px; flex: none; font-size: 12px; color: var(--seq-muted); }
.sequence-preview-controls button { padding: 6px 12px; }
.sequence-editor-strip { display: flex; gap: 8px; overflow: auto; flex: none; max-height: 126px; min-height: 20px; padding-bottom: 5px; }
.sequence-editor-tile { flex: 0 0 92px; }
.sequence-editor-tile button { padding: 4px; width: 100%; font-size: 11px; }
.sequence-editor-tile.active button { border-color: var(--seq-accent); }
.sequence-editor-tile canvas { display: block; width: 82px; height: 62px; object-fit: contain; background: repeating-conic-gradient(#272e33 0% 25%,#1a2025 0% 50%) 0/12px 12px; }
.sequence-editor-tile label { display: flex; align-items: center; font-size: 10px; white-space: nowrap; color: #e4bc87; }
.sequence-editor-panel { border-left: 1px solid var(--seq-line); padding: 22px; overflow: auto; background: #1d2329; }
.sequence-editor-panel h3 { margin: 0 0 24px; font-size: 17px; font-weight: 600; }
.sequence-editor-panel p { font-size: 13px; line-height: 1.8; color: var(--seq-muted); }
.sequence-editor-field { display: flex; flex-direction: column; gap: 8px; margin: 0 0 20px; font-size: 12px; color: #bcc5c4; }
.sequence-editor-field input { box-sizing: border-box; min-width: 0; width: 100%; padding: 9px; border-radius: 6px; border: 1px solid #41494e; background: #13191e; color: #eef3eb; font: inherit; accent-color: var(--seq-accent); }
.sequence-editor-field input[type=color] { height: 40px; padding: 4px; }
.sequence-editor-check { display: flex; align-items: center; gap: 7px; margin-bottom: 16px; font-size: 12px; }
.sequence-editor-check input { accent-color: var(--seq-accent); }
.sequence-editor-panel summary { font-size: 12px; cursor: pointer; color: var(--seq-muted); margin-bottom: 16px; }
.sequence-editor-footer { padding: 16px 24px; border-top: 1px solid var(--seq-line); display: flex; align-items: center; justify-content: space-between; gap: 14px; background: #171d22; flex: none; }
.sequence-editor-status { font-size: 12px; color: var(--seq-muted); }
.sequence-editor-status progress { display: block; width: 200px; height: 5px; margin-top: 8px; accent-color: var(--seq-accent); }
.sequence-editor-error { color: #f2ac96; font-size: 12px; max-width: 55%; }
.sequence-editor-actions { display: flex; gap: 8px; }
.sequence-confirm { position: absolute; inset: 0; z-index: 2; display: flex; justify-content: center; align-items: center; flex-wrap: wrap; align-content: center; padding: 30px; gap: 14px; background: #12191aee; }
.sequence-confirm p { width: 100%; text-align: center; line-height: 1.8; }
@media (max-width: 700px) {
  .sequence-editor { width: 96vw; height: 94dvh; border-radius: 12px; }
  .sequence-editor-header { padding: 14px; }
  .sequence-editor-header h2 { font-size: 20px; }
  .sequence-editor-steps { gap: 12px; padding: 12px; font-size: 11px; }
  .sequence-editor-body { grid-template-columns: 1fr; overflow: auto; display: block; }
  .sequence-editor-preview { height: 45dvh; padding: 12px; }
  .sequence-editor-panel { padding: 16px; border-left: 0; border-top: 1px solid var(--seq-line); }
  .sequence-editor-panel h3 { margin-bottom: 12px; }
  .sequence-editor-footer { flex-wrap: wrap; padding: 12px; }
  .sequence-editor-actions { width: 100%; justify-content: flex-end; }
  .sequence-editor-error { max-width: 100%; }
}
`;
