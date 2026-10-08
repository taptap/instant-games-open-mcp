export const CANVAS_THEME_STYLES = `
:root { color-scheme: dark; }
:root[data-theme="light"] {
  color-scheme: light;
  --canvas-bg: #f5f7f6;
  --canvas-panel: #ffffff;
  --canvas-soft: #edf2ef;
  --canvas-line: #cdd6d0;
  --canvas-text: #252e29;
  --canvas-muted: #64716a;
  --canvas-accent: #806510;
}
:root[data-theme="light"] body { background:var(--canvas-bg); color:var(--canvas-text); }
:root[data-theme="light"] #board { background-color:var(--canvas-bg); background-image:radial-gradient(#cdd6d0 1px,transparent 1px); }
:root[data-theme="light"] :is(.workspace-tabs-row,.workspace-toolbar,.workspace-bottom,.workspace-menu-panel,.workspace-tab,.canvas-card-header) {
  background:var(--canvas-soft); color:var(--canvas-text); border-color:var(--canvas-line);
}
:root[data-theme="light"] :is(.card.canvas-card,.workflow-template-dialog,.workflow-template-dialog.template-library,.workflow-template-row,.template-preview-card,.sequence-editor,.model-menu-actions,.image-download-options,#selection-toolbar,#selection-menu,#canvas-context-menu) {
  background:var(--canvas-panel); color:var(--canvas-text); border-color:var(--canvas-line);
}
:root[data-theme="light"] :is(button,select,input,textarea,.workspace-menu summary,.prompt-editor) {
  background-color:var(--canvas-panel); color:var(--canvas-text); border-color:var(--canvas-line);
}
:root[data-theme="light"] :is(button:hover:not(:disabled),.workspace-menu summary:hover,.workspace-menu-panel button:hover,.workflow-template-row:hover) { background-color:var(--canvas-soft); }
:root[data-theme="light"] :is(.workspace-tab[data-active="true"],.workspace-add summary,.generation-action-primary,.selection-actions button.active,.template-categories button[aria-pressed=true]) {
  background:#fcf1bd; color:#58480e; border-color:#c7ab48;
}
:root[data-theme="light"] :is(.card .canvas-card-title,.card.section strong,.prompt-heading,.generation-result-label,.workspace-library-list [aria-current="true"]) { color:var(--canvas-accent); }
:root[data-theme="light"] :is(.card p,.canvas-card-meta,.canvas-card-menu,.selection-label,.generation-field,.generation-reference small,.generation-status,.generation-result-details,.sequence-source-label,.sequence-info,.sequence-status,.sequence-field,.sequence-result-empty,.sequence-result-grid figure,.sequence-frame-tile,.animation-caption,.workflow-template-dialog p,.workflow-template-dialog small,.template-library h3,.template-library-total,.template-preview-content,.template-preview-toolbar span,.canvas-log-preview,.canvas-log-list,.workspace-tab button:last-child:not([role="tab"])) { color:var(--canvas-muted); }
:root[data-theme="light"] .card.section { background:rgba(215,191,111,.12); border-color:#ad8e35; }
:root[data-theme="light"] .card.canvas-card.selected { outline-color:#a7831b; border-color:#a7831b; }
:root[data-theme="light"] .template-preview-viewport { background:#f5f7f6 radial-gradient(#cdd6d0 1px,transparent 1px); background-size:22px 22px; border-color:var(--canvas-line); }
:root[data-theme="light"] .wire { stroke:#947722; }
:root[data-theme="light"] .wire-focused { stroke:#71570b; }
:root[data-theme="light"] .sequence-editor { --seq-bg:var(--canvas-panel); --seq-line:var(--canvas-line); --seq-muted:var(--canvas-muted); --seq-accent:var(--canvas-accent); }
:root[data-theme="light"] :is(.sequence-editor-panel,.sequence-editor-tabs,.sequence-editor-steps,.sequence-editor-footer,.sequence-editor-tile,.sequence-step,.prompt-editor) { background:var(--canvas-soft); color:var(--canvas-text); }
:root[data-theme="light"] :is(.sequence-step.active,.sequence-editor-tabs button[aria-selected=true]) { background:#fcf1bd; color:#58480e; }
:root[data-theme="light"] :is(.sequence-step.complete,.generation-status-succeeded,.workspace-toolbar #status[data-state="saved"]) { color:#176c50; }
:root[data-theme="light"] :is(.generation-error,.generation-status-failed,.generation-status-unknown,.sequence-error,.workspace-toolbar #status[data-state="error"]) { color:#b3352c; }
:root[data-theme="light"] :is(#error,.generation-status-running,.template-card-metadata a) { color:var(--canvas-accent); }
:root[data-theme="light"] :is(.sequence-editor-header,.card .group-queue,.card .group-queue .group-queue-task) { background:var(--canvas-soft); color:var(--canvas-text); border-color:var(--canvas-line); }
:root[data-theme="light"] :is(.sequence-editor-header small,.canvas-log summary,.canvas-log-info,.canvas-group-state,.card .group-queue .group-queue-status) { color:var(--canvas-muted); }
:root[data-theme="light"] :is(.canvas-log-error,.canvas-group-state[data-state=failed]) { color:#b3352c; }
:root[data-theme="light"] :is(.canvas-log-warning,.canvas-group-state[data-state=loading],.canvas-group-state[data-state=waiting],.canvas-group-state[data-state=unknown]) { color:var(--canvas-accent); }
:root[data-theme="light"] .canvas-group-state[data-state=ready] { color:#176c50; }
:root[data-theme="light"] .card .card-state-overlay { background:#fffffff0; color:var(--canvas-text); }
:root[data-theme="light"] :is(.card-state-caption,.card-state-hint) { color:var(--canvas-muted); }
`;
