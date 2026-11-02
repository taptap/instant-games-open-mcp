// The :not(#id) term adds ID weight so this opt-in skin wins over host theme CSS appended later.
const M = ':root.canvas-appearance-web:not(#canvas-web-scope)';
const L = ':root.canvas-appearance-web[data-theme="light"]:not(#canvas-web-scope)';
// Focus rings follow the tooltip helper's last-input flag on :root (Chrome 74 has no :focus-visible).
const P = ':root.canvas-appearance-web:not(.canvas-web-keyboard):not(#canvas-web-scope)';
const K = ':root.canvas-appearance-web.canvas-web-keyboard:not(#canvas-web-scope)';

// Chrome 74: no flex gap, inset, aspect-ratio, :is()/:where() or color-mix(); spacing uses margins, :focus-visible stays in its own rule.
const IMAGE_ICON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='1.35' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2'/%3E%3Ccircle cx='9' cy='9' r='2'/%3E%3Cpath d='m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21'/%3E%3C/svg%3E\")";
// lucide SendHorizontal / Plus / Check, as drawn in Mivo's composer at 16px.
const SEND_ICON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904z'/%3E%3Cpath d='M6 12h16'/%3E%3C/svg%3E\")";
const ADD_ICON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M5 12h14M12 5v14'/%3E%3C/svg%3E\")";
const CHECK_ICON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E\")";
// lucide Plus at 12px / stroke 1.5, as drawn inside Mivo's side handle.
const PLUS_ICON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='1.5' stroke-linecap='round'%3E%3Cpath d='M5 12h14M12 5v14'/%3E%3C/svg%3E\")";
// lucide Video, drawn like IMAGE_ICON for the empty video slot.
const VIDEO_ICON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='1.35' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5'/%3E%3Crect x='2' y='6' width='14' height='12' rx='2'/%3E%3C/svg%3E\")";
const SPRING = 'cubic-bezier(.34,1.56,.64,1)';

/** Opt-in Mivo-like skin for host appearance 'web'; layout and DOM stay the page defaults. */
export const CANVAS_WEB_STYLES = `
${M} {
  /* Selection follows the host theme accent (Web maps --maker-primary); Mivo violet is only the fallback. */
  --web-accent: var(--canvas-accent, #6957e8);
  --web-accent-ring: rgba(105,87,232,.18);
  /* Replaced at runtime by the live accent at 60% (installCanvasWebTooltips). */
  --web-focus-ring: rgba(105,87,232,.6);
  /* Mivo tokens.css menu mixes over the dark palette, precomputed for Chrome 74. */
  --web-menu-bg: #383636;
  --web-menu-line: #575757;
  --web-menu-ink: #b9b8b8;
  --web-menu-hover: rgba(212,212,212,.09);
  --web-sweep: rgba(255,255,255,.06);
  --web-panel: var(--canvas-panel, #2a2828);
  --web-soft: var(--canvas-soft, #312f2f);
  --web-line: var(--canvas-line, #434343);
  --web-text: var(--canvas-text, #d4d4d4);
  --web-muted: var(--canvas-muted, #aaa8a8);
  --web-wash: rgba(255,255,255,.08);
  --web-shadow: 0 18px 48px rgba(0,0,0,.34);
  --web-float-bg: rgba(28,28,27,.96);
  --web-float-ink: #fffaf0;
  --web-float-wash: rgba(255,250,240,.12);
  --web-port-bg: rgba(39,48,44,.9);
  --web-port-ink: rgba(212,212,212,.75);
  --web-wire: #9da8b5;
  /* Frosted chips: panel tone at 62%, solid panel where backdrop-filter is missing (Chrome 74). */
  --web-glass: rgba(42,40,40,.62);
  --web-glass-edge: rgba(255,255,255,.08);
  --web-tab-shadow: 0 1px 2px rgba(0,0,0,.28);
  /* Mivo tokens.css: ink #d4d4d4, panel #2a2828, panel-2 #312f2f, line #434343, quiet #bfc1c4 (color-mix precomputed for Chrome 74). */
  --web-slot-bg: #343432;
  --web-slot-line: #545454;
  --web-slot-glyph: #636263;
  --web-pill-bg: #2a2828;
  --web-pill-hover: #312f2f;
  --web-pill-ink: #d4d4d4;
  --web-pill-line: #6f6f6f;
  /* Composer: cindy-theme lift of Mivo tokens (ink 5%/16%/30% into panel-2/line), precomputed. */
  --web-composer-bg: #393737;
  --web-composer-line: #5a5a5a;
  --web-composer-focus: #6f6f6f;
  --web-composer-ink: #d4d4d4;
  --web-composer-muted: #aaa8a8;
  --web-composer-placeholder: #868789;
  --web-composer-hover: rgba(212,212,212,.1);
  --web-chip-line: #434343;
  --web-chip-bg: #312f2f;
  --web-chip-x: rgba(212,212,212,.72);
  --web-add-line: #6f6f6f;
  --web-add-bg: #3b3939;
  --web-send-bg: #eeeeee;
  --web-send-ink: #252222;
  --web-send-hover: #d2d1d1;
  --web-group-bg: rgba(255,255,255,.025);
  --web-scrim: rgba(42,40,40,.94);
}
${L} {
  --web-wash: rgba(35,35,35,.07);
  --web-shadow: 0 18px 48px rgba(35,35,35,.12);
  --web-float-bg: var(--web-panel);
  --web-float-ink: var(--web-text);
  --web-float-wash: rgba(35,35,35,.07);
  --web-port-bg: rgba(255,255,255,.96);
  --web-port-ink: rgba(35,35,35,.62);
  --web-wire: #8e98a5;
  --web-glass: rgba(255,255,255,.62);
  --web-glass-edge: rgba(35,35,35,.08);
  --web-tab-shadow: 0 1px 2px rgba(35,35,35,.1), 0 1px 1px rgba(35,35,35,.04);
  /* Mivo ships no light palette; the same mixes are applied to the light host tokens. */
  --web-slot-bg: #f2f2f2;
  --web-slot-line: #b9c2bc;
  --web-slot-glyph: #c4c9c6;
  --web-pill-bg: var(--web-panel);
  --web-pill-hover: var(--web-soft);
  --web-pill-ink: var(--web-text);
  --web-pill-line: #9ba49e;
  /* Same mixes over the light host tokens; the send pill inverts like Mivo's action pair. */
  --web-composer-bg: #f4f5f4;
  --web-composer-line: #b2bbb5;
  --web-composer-focus: #9ba49e;
  --web-composer-ink: var(--web-text);
  --web-composer-muted: var(--web-muted);
  --web-composer-placeholder: #a2aaa6;
  --web-composer-hover: rgba(37,46,41,.1);
  --web-chip-line: var(--web-line);
  --web-chip-bg: var(--web-soft);
  --web-chip-x: rgba(37,46,41,.72);
  --web-add-line: #9ba49e;
  --web-add-bg: #e1e6e3;
  --web-send-bg: #252e29;
  --web-send-ink: #ffffff;
  --web-send-hover: #434b47;
  --web-menu-bg: var(--web-panel);
  --web-menu-line: var(--web-line);
  --web-menu-ink: var(--web-text);
  --web-menu-hover: rgba(35,35,35,.07);
  --web-sweep: rgba(35,35,35,.05);
  --web-group-bg: rgba(35,35,35,.025);
  --web-scrim: rgba(255,255,255,.94);
}

${M} .workspace-toolbar { width: 48px; padding: 7px 5px; gap: 0; border: 1px solid var(--web-line); border-radius: 24px; background: var(--web-panel); box-shadow: var(--web-shadow); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); }
${M} .workspace-toolbar .workspace-toolbar-grip { display: flex; align-items: center; justify-content: center; height: 16px; min-height: 16px; margin-bottom: 2px; background: transparent; color: var(--web-muted); font-size: 0; line-height: 0; }
${M} .workspace-toolbar .workspace-toolbar-grip:hover { color: var(--web-text); }
${M} .workspace-toolbar .workspace-toolbar-grip svg { display: block; }
${M} .workspace-actions { gap: 0; align-items: center; }
${M} .workspace-actions > * + * { margin-top: 4px; }
${M} .workspace-actions > button, ${M} .workspace-actions summary { box-sizing: border-box; width: 36px; height: 36px; min-height: 36px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--web-muted); font-weight: 400; }
${M} .workspace-actions > button:hover:not(:disabled), ${M} .workspace-actions summary:hover { background: var(--web-wash); color: var(--web-text); }
${M} .workspace-actions > button[aria-pressed="true"], ${M} .workspace-actions > button[aria-pressed="true"]:hover:not(:disabled), ${M} .workspace-actions .workspace-add[open] > summary { background: var(--web-text); color: var(--web-panel); }
${M} .workspace-tool-sep { width: 20px; height: 1px; margin: 6px auto; background: var(--web-line); }
/* The save button carries saved/unsaved/saving/failed; the status text stays for screen readers only. */
${M} .workspace-toolbar #status { position: absolute; width: 1px; height: 1px; margin: 0; padding: 0; overflow: hidden; clip: rect(0 0 0 0); border: 0; white-space: nowrap; }
${M} .workspace-actions > #save { position: relative; }
${M} .workspace-actions > #save::after { content: ''; position: absolute; top: 7px; right: 7px; box-sizing: border-box; width: 8px; height: 8px; border: 1.5px solid var(--web-panel); border-radius: 50%; background: transparent; opacity: 0; }
${M} .workspace-actions > #save[data-save-state="unsaved"]::after { background: #d29a3a; opacity: 1; }
${M} .workspace-actions > #save[data-save-state="saving"]::after { background: var(--web-accent); opacity: 1; -webkit-animation: web-save-pulse 1s ease-in-out infinite; animation: web-save-pulse 1s ease-in-out infinite; }
${M} .workspace-actions > #save[data-save-state="failed"] { color: #e5675b; }
${M} .workspace-actions > #save[data-save-state="failed"]::after { background: #e5675b; opacity: 1; }
@-webkit-keyframes web-save-pulse { 50% { opacity: .35; } }
@keyframes web-save-pulse { 50% { opacity: .35; } }
/* Pan mode and held Space own the cursor everywhere on the board, above card-level cursors. */
${M} #board.pan-tool, ${M} #board.pan-tool * { cursor: grab !important; }
${M} #board.grabbing, ${M} #board.grabbing * { cursor: grabbing !important; }
${M} .workspace-menu-panel { padding: 6px; border: 1px solid var(--web-line); border-radius: 12px; background: var(--web-panel); box-shadow: var(--web-shadow); }
${M} .workspace-menu-panel button { border: 0; border-radius: 8px; background: transparent; color: var(--web-text); padding: 8px 10px; }
${M} .workspace-menu-panel button:hover:not(:disabled) { background: var(--web-wash); }
${M} .workspace-view-controls { gap: 0; }
${M} .workspace-view-controls > * + * { margin-left: 4px; }
${M} .workspace-view-controls button { height: 28px; min-height: 28px; padding: 0 10px; border: 0; border-radius: 14px; background: transparent; color: var(--web-muted); }
${M} .workspace-view-controls button:hover:not(:disabled) { background: var(--web-wash); color: var(--web-text); }

${M} #selection-menu { padding: 5px; border: 1px solid rgba(255,250,240,.08); border-radius: 12px; background: var(--web-float-bg); color: var(--web-float-ink); box-shadow: 0 18px 38px rgba(0,0,0,.22); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); }
${L} #selection-menu { border-color: var(--web-line); }
${M} #selection-menu .selection-actions { gap: 0; }
${M} #selection-menu .selection-actions > * + * { margin-left: 3px; }
${M} #selection-menu button, ${M} #selection-menu summary { min-height: 28px; height: 28px; padding: 0 9px; border: 0; border-radius: 7px; background: transparent; color: var(--web-float-ink); font-size: 12px; font-weight: 700; }
${M} #selection-menu button:hover:not(:disabled), ${M} #selection-menu button.active, ${M} #selection-menu summary:hover { background: var(--web-float-wash); color: var(--web-float-ink); }
/* Icon actions share one glyph size; the label lives in aria-label and the tooltip. */
${M} #selection-menu .web-icon-action { display: inline-flex; align-items: center; justify-content: center; width: 32px; padding: 0; }
${M} #selection-menu .web-icon-action svg { display: block; width: 16px; height: 16px; }
/* 调整抠图 rides on the 抠图 icon as a narrow chevron, so one-click stays the primary target. */
${M} #selection-menu .web-icon-action + .web-cutout-adjust { width: 16px; min-width: 16px; margin-left: 0; padding: 0; display: inline-flex; align-items: center; justify-content: center; color: var(--web-float-ink); opacity: .72; }
${M} #selection-menu .web-cutout-adjust:hover:not(:disabled) { opacity: 1; }
${M} #selection-menu .web-cutout-adjust svg { display: block; width: 12px; height: 12px; }
${M} #selection-menu button:focus-visible, ${M} #selection-menu summary:focus-visible { outline: 2px solid var(--web-accent); outline-offset: 1px; }

${M} .card.image.canvas-card { overflow: visible; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
${M} .card.image.canvas-card.selected { outline: none; }
${M} .card.image .canvas-card-header { padding: 0 2px 6px; align-items: flex-end; border: 0; background: transparent; }
${M} .card.image .canvas-card-heading { display: block; }
${M} .card.image .canvas-card-title { color: var(--web-muted); font-size: 13px; font-weight: 400; line-height: 20px; }
${M} .card.image .canvas-card-meta { display: none; }
${M} .card.image .canvas-card-menu { width: 22px; height: 22px; margin-bottom: -1px; border-radius: 6px; background: transparent; color: var(--web-muted); opacity: 0; }
${M} .card.image:hover .canvas-card-menu, ${M} .card.image.selected .canvas-card-menu { opacity: 1; }
${M} .card.image .canvas-card-menu:focus-visible { opacity: 1; }
${M} .card.image .canvas-card-menu:hover { background: var(--web-wash); color: var(--web-text); }
/* Mivo .dom-node image: square media, resting drop shadow; selection outline stays 2px on screen. */
${M} .card.image .canvas-card-content { border-radius: 0; background: transparent; box-shadow: 0 14px 32px rgba(35,35,35,.18); }
${M} .card.image.selected .canvas-card-content { outline: calc(2px * var(--web-inv, 1)) solid var(--web-accent); outline-offset: 0; box-shadow: 0 18px 44px rgba(35,35,35,.22); }
/* Soft ring in the host accent: an opacity layer stands in for color-mix on Chrome 74. */
${M} .card.image.selected::before { content: ''; position: absolute; left: 0; right: 0; top: 40px; bottom: 0; z-index: 0; box-shadow: 0 0 0 calc(4px * var(--web-inv, 1)) var(--web-accent); opacity: .18; pointer-events: none; }
${M} .card.image.web-empty .canvas-card-content { background: transparent; box-shadow: none; }
${M} .card.image.web-empty.selected .canvas-card-content { box-shadow: none; }
${M} .card.image.web-empty.selected::before { border-radius: 12px; opacity: .1; }
${M} .web-multi-selection .card.image.selected .canvas-card-content { box-shadow: none; }
${M} .web-multi-selection .card.selected:not(.image) { outline: calc(2px * var(--web-inv, 1)) solid var(--web-accent); outline-offset: 0; }
${M} .web-multi-selection .card.image.selected::before { opacity: .14; }
/* Small round corner handles; all four resize, each with its diagonal cursor and a wider hit area. */
${M} .card.image .web-node-handle { position: absolute; z-index: 6; box-sizing: border-box; width: calc(10px * var(--web-inv, 1)); height: calc(10px * var(--web-inv, 1)); min-height: 0; margin: 0; padding: 0; border: calc(2px * var(--web-inv, 1)) solid var(--web-accent); border-radius: 50%; background: #fffaf0; box-shadow: 0 1px 3px rgba(0,0,0,.25); opacity: 1; pointer-events: auto; -webkit-transform: translate(-50%, -50%); transform: translate(-50%, -50%); }
${M} .card.image .web-node-handle::after { content: ''; position: absolute; left: 50%; top: 50%; width: calc(20px * var(--web-inv, 1)); height: calc(20px * var(--web-inv, 1)); border-radius: 50%; -webkit-transform: translate(-50%, -50%); transform: translate(-50%, -50%); }
${M} .card.image .web-node-handle.is-nw, ${M} .card.image .web-node-handle.is-se { cursor: nwse-resize; }
${M} .card.image .web-node-handle.is-ne, ${M} .card.image .web-node-handle.is-sw { cursor: nesw-resize; }
${M} .card.image .web-node-handle:disabled { opacity: .45; cursor: default; }
${M} .card.image > .resize-handle { display: none; }
${M} .card.image .image-size-info { left: 8px; bottom: 8px; padding: 2px 7px; border-radius: 999px; background: rgba(0,0,0,.5); color: #fffaf0; font-size: 11px; opacity: 0; transition: opacity .12s; }
${M} .card.image:hover .image-size-info, ${M} .card.image.selected .image-size-info { opacity: 1; }
/* Fixed height + line-height keeps the pill shape identical whatever font the host theme loads. */
${M} .card.image > .generation-credits { height: 20px; padding: 0 8px; border: 1px solid var(--web-glass-edge); border-radius: 999px; background: var(--web-float-bg); color: var(--web-float-ink); box-shadow: 0 2px 8px rgba(0,0,0,.18); font-size: 11px; font-weight: 500; line-height: 18px; }
${L} .card.image > .generation-credits { box-shadow: 0 2px 8px rgba(35,35,35,.12); }
/* Mivo side plus: 80px hot zone 25px outside the frame edge, 20px ring resting on the edge; scale(inv) keeps it screen-sized. */
${M} .card .port.canvas-port { --web-rest: 0px; top: calc(50% + 20px); width: 80px; height: 80px; margin-top: -40px; border: 0; border-radius: 50%; background: transparent; color: rgba(212,212,212,.7); font-size: 0; opacity: 0; pointer-events: none; outline: none; -webkit-transform: scale(var(--web-inv, 1)); transform: scale(var(--web-inv, 1)); transition: opacity .12s; }
${M} .card .port.canvas-port-output { right: calc(-40px - 25px * var(--web-inv, 1)); --web-rest: -25px; }
${M} .card .port.canvas-port-input { left: calc(-40px - 25px * var(--web-inv, 1)); --web-rest: 25px; }
${M} .card.image:not(.web-slot) .port.canvas-port-input { display: none !important; }
${M} .card.selected .port.canvas-port { opacity: 1; pointer-events: auto; }
${M} .web-multi-selection .card.selected .port.canvas-port { opacity: 0; pointer-events: none; }
${M} .card .port.canvas-port:focus-visible { opacity: 1; }
${M} .card .port.canvas-port::before, ${M} .card .port.canvas-port::after { content: ''; position: absolute; left: 30px; top: 30px; box-sizing: border-box; width: 20px; height: 20px; border-radius: 50%;
  -webkit-transform: translate(var(--web-mx, var(--web-rest)), var(--web-my, 0px)); transform: translate(var(--web-mx, var(--web-rest)), var(--web-my, 0px)); transition: transform .4s ${SPRING}; }
${M} .card .port.canvas-port::before { border: 1.2px solid currentColor; background: rgba(39,48,44,.9); }
${M} .card .port.canvas-port::after { background: currentColor; -webkit-mask: ${PLUS_ICON} center / 12px 12px no-repeat; mask: ${PLUS_ICON} center / 12px 12px no-repeat; }
${M} .card .port.canvas-port.is-magnet::before, ${M} .card .port.canvas-port.is-magnet::after { -webkit-transform: translate(var(--web-mx), var(--web-my)) scale(1.1); transform: translate(var(--web-mx), var(--web-my)) scale(1.1); transition: transform 80ms ease-out; }
${M} .card .port.canvas-port:focus-visible::before { box-shadow: 0 0 0 3px var(--web-accent-ring); }
${L} .card .port.canvas-port { color: rgba(37,46,41,.7); }
${L} .card .port.canvas-port::before { background: rgba(255,255,255,.9); }
/* Mivo empty slot: clicking the frame only selects; the top 上传 pill is the single file entry. */
${M} .card.image .image-empty { left: 0; top: 0; width: 100%; height: 100%; -webkit-transform: none; transform: none; box-sizing: border-box; border: 1px solid var(--web-slot-line); border-radius: 12px; background: var(--web-slot-bg); color: var(--web-slot-glyph); opacity: 1; pointer-events: none; }
${M} .card.image .image-empty > * { display: none; }
${M} .card.image .image-empty::before { content: ''; display: block; width: 22%; height: 22%; max-width: 48px; max-height: 48px; min-width: 28px; min-height: 28px; background: currentColor; -webkit-mask: ${IMAGE_ICON} center / contain no-repeat; mask: ${IMAGE_ICON} center / contain no-repeat; }
${M} .card.image .web-slot-upload { position: absolute; z-index: 7; display: inline-flex; align-items: center; box-sizing: border-box; height: 32px; min-height: 32px; margin: 0; padding: 0 12px 0 10px; border: 1px solid var(--web-pill-line); border-radius: 999px; background: var(--web-pill-bg); color: var(--web-pill-ink); box-shadow: 0 18px 48px rgba(35,35,35,.12); font-size: 12px; font-weight: 700; line-height: 1; white-space: nowrap; cursor: pointer; -webkit-transform-origin: center bottom; transform-origin: center bottom; }
${M} .card.image .web-slot-upload svg { flex: none; margin-right: 6px; }
${M} .card.image .web-slot-upload:hover, ${M} .card.image .web-slot-upload:focus-visible { background: var(--web-pill-hover); }
${M} .wire { stroke: var(--web-wire); stroke-width: 2; opacity: .88; }
${M} #board .wire[data-flow-state=running] { stroke: var(--flow-running, #e9bb4f); opacity: .55; }
${M} #board .wire[data-flow-state=success] { stroke: var(--flow-success, var(--web-accent)); opacity: .9; }
${M} #board .wire[data-flow-state=waiting] { stroke-dasharray: 6 7; opacity: .4; }
${M} #world .card[data-flow-state=running] { box-shadow: 0 0 22px #e9bb4f55; }
${M} #wires .wire-focused, ${M} #wires .wire-muted { stroke: var(--web-wire); stroke-width: 2; opacity: .88; }
${M} .wire-controls .wire-focused { stroke: var(--web-accent); opacity: 1; }
/* Hover/selection: faint 3px accent line under a wider 5px comet that reads as flowing light. */
${M} .wire-controls .wire-active { stroke: var(--web-accent); stroke-width: 3; stroke-linecap: round; opacity: .3; }
${M} .wire-controls .wire-glow { fill: none; stroke: var(--web-accent); stroke-width: 5; stroke-linecap: round; -webkit-animation: web-wire-flow 1.08s linear infinite; animation: web-wire-flow 1.08s linear infinite; }
@-webkit-keyframes web-wire-flow { to { stroke-dashoffset: -260; } }
@keyframes web-wire-flow { to { stroke-dashoffset: -260; } }
@media (prefers-reduced-motion: reduce) { ${M} .wire-controls .wire-glow { -webkit-animation: none; animation: none; } }
/* Cut control: 28px frosted chip at the wire midpoint; hover tints with the accent instead of a border. */
${M} .wire-controls .wire-scissors { position: absolute; display: flex; align-items: center; justify-content: center; box-sizing: border-box; width: 28px; height: 28px; min-height: 28px; margin: -14px 0 0 -14px; padding: 0; overflow: hidden; border: 1px solid var(--web-glass-edge); border-radius: 50%; background: var(--web-panel); color: var(--web-muted); box-shadow: 0 2px 8px rgba(0,0,0,.28); pointer-events: auto; cursor: pointer; transition: color .12s, border-color .12s; }
@supports ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {
  ${M} .wire-controls .wire-scissors { background: var(--web-glass); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); }
}
${M} .wire-controls .wire-scissors::before { content: ''; position: absolute; left: 0; top: 0; width: 100%; height: 100%; border-radius: 50%; background: var(--web-accent); opacity: 0; transition: opacity .12s; pointer-events: none; }
/* Explicit size: the overlay's svg { width:100% } rule would otherwise stretch the icon to the chip. */
${M} .wire-controls .wire-scissors svg { position: relative; display: block; flex: none; width: 14px; height: 14px; }
${M} .wire-controls .wire-scissors:hover { border-color: transparent; color: var(--web-accent); }
${M} .wire-controls .wire-scissors:hover::before { opacity: .14; }
${M} .wire-controls .wire-scissors:focus-visible { outline: none; border-color: transparent; color: var(--web-accent); box-shadow: 0 0 0 3px var(--web-accent-ring); }
${M} .wire-controls .wire-scissors:focus-visible::before { opacity: .14; }
${L} .wire-controls .wire-scissors { box-shadow: 0 2px 8px rgba(35,35,35,.14); }
${M} .web-wire-preview { position: absolute; left: 0; top: 0; z-index: 5; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
${M} .web-wire-preview path { fill: none; stroke-linecap: round; }
${M} .web-wire-preview-glow { stroke: rgba(90,172,254,.4); stroke-width: 6; }
${M} .web-wire-preview-line { stroke: var(--web-text); stroke-width: 2; }
${M} .card.web-wire-target .canvas-card-content { box-shadow: 0 0 0 3px var(--web-accent), 0 0 0 9px rgba(105,87,232,.28); }

/* Composer = Mivo ImageSlotComposer (.region-edit-input-panel, cindy-theme lift): ref row, borderless prompt, pill selects + round send. */
${M} #selection-toolbar { padding: 8px; gap: 0; border: 1px solid var(--web-composer-line); border-radius: 10px; background: var(--web-composer-bg); color: var(--web-composer-ink); box-shadow: 0 18px 48px rgba(35,35,35,.12); overflow: visible; -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }
${M} #selection-toolbar:focus-within { border-color: var(--web-composer-focus); }
${M} #selection-toolbar .generation-panel { display: flex; flex-direction: row; flex-wrap: wrap; align-items: stretch; margin-top: 0; gap: 0; }
${M} #selection-toolbar .generation-panel > * { flex: 0 0 100%; box-sizing: border-box; margin-top: 6px; }
${M} #selection-toolbar .generation-references { order: 1; display: flex; flex-wrap: wrap; align-items: center; margin-top: 0; padding: 2px 4px 0; gap: 0; }
${M} #selection-toolbar .generation-references > * { margin: 0 8px 0 0; }
${M} #selection-toolbar .generation-reference { position: relative; flex: 0 0 44px; width: 44px; height: 44px; }
${M} #selection-toolbar .generation-reference img { display: block; box-sizing: border-box; width: 44px; height: 44px; border: 1px solid var(--web-chip-line); border-radius: 10px; object-fit: cover; background: var(--web-chip-bg); }
${M} #selection-toolbar .generation-reference small { display: none; }
${M} #selection-toolbar .generation-reference-remove { position: absolute; top: 2px; right: 2px; z-index: 2; display: none; align-items: center; justify-content: center; width: 18px; height: 18px; min-height: 18px; margin: 0; padding: 0; border: 0; border-radius: 999px; background: transparent; color: var(--web-chip-x); font-size: 12px; line-height: 1; cursor: pointer; }
${M} #selection-toolbar .generation-reference:hover .generation-reference-remove, ${M} #selection-toolbar .generation-reference-remove:focus-visible { display: inline-flex; }
${M} #selection-toolbar .generation-reference-remove:hover { background: #332f2b; color: #fffdf8; }
${M} #selection-toolbar .generation-reference-add { position: relative; flex: 0 0 44px; box-sizing: border-box; width: 44px; height: 44px; min-height: 44px; padding: 0; border: 1px dashed var(--web-add-line); border-radius: 10px; background: var(--web-add-bg); color: var(--web-composer-muted); font-size: 0; cursor: pointer; }
${M} #selection-toolbar .generation-reference-add::before { content: ''; position: absolute; left: 13px; top: 13px; width: 16px; height: 16px; background: currentColor; -webkit-mask: ${ADD_ICON} center / contain no-repeat; mask: ${ADD_ICON} center / contain no-repeat; }
${M} #selection-toolbar .generation-reference-add:hover:not(:disabled) { background: var(--web-composer-hover); color: var(--web-composer-ink); }
${M} #selection-toolbar .generation-reference-add:disabled { opacity: .48; cursor: not-allowed; }
${M} #selection-toolbar .generation-prompt, ${M} #selection-toolbar .prompt-editor { order: 2; }
${M} #selection-toolbar .generation-prompt { display: block; width: 100%; min-height: 96px; max-height: 160px; padding: 9px; border: 0; border-radius: 6px; background: none; color: var(--web-composer-ink); font: inherit; font-size: 13px; line-height: 1.5; resize: none; outline: none; box-shadow: none; }
${M} #selection-toolbar .generation-prompt::placeholder { color: var(--web-composer-placeholder); opacity: 1; }
${M} #selection-toolbar .prompt-editor { border: 0; background: none; }
${M} #selection-toolbar .prompt-section-input { border: 0; background: none; color: var(--web-composer-ink); font-size: 13px; line-height: 1.5; }
${M} #selection-toolbar .generation-fields { order: 3; flex: 1 1 0; display: flex; flex-wrap: wrap; align-items: stretch; min-width: 0; gap: 0; padding: 0 0 2px 4px; }
${M} #selection-toolbar .generation-fields > small, ${M} #selection-toolbar .generation-fields > details { display: none; }
${M} #selection-toolbar .generation-fields > * + * { margin-left: 8px; }
${M} #selection-toolbar .generation-field { position: relative; display: inline-flex; flex-direction: row; align-items: stretch; margin: 0; gap: 0; color: var(--web-composer-ink); }
${M} #selection-toolbar .generation-field::after { content: ''; position: absolute; top: 50%; right: 7px; width: 4.5px; height: 4.5px; border-right: 1.25px solid currentColor; border-bottom: 1.25px solid currentColor; -webkit-transform: translateY(-65%) rotate(45deg); transform: translateY(-65%) rotate(45deg); opacity: .7; pointer-events: none; }
${M} #selection-toolbar .generation-field > span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
${M} #selection-toolbar .generation-mode { -webkit-appearance: none; appearance: none; box-sizing: border-box; width: auto; max-width: 220px; height: 32px; min-height: 30px; padding: 0 20px 0 8px; border: 1px solid transparent; border-radius: 8px; background: none; color: var(--web-composer-ink); font: inherit; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
${M} #selection-toolbar .generation-mode option { background: var(--web-composer-bg); color: var(--web-composer-ink); }
${M} #selection-toolbar .generation-mode:hover:not(:disabled) { background: var(--web-composer-hover); }
${M} #selection-toolbar .generation-mode:disabled { opacity: .45; cursor: default; }
${M} #selection-toolbar .generation-asset-constraints { display: inline-flex; align-items: center; box-sizing: border-box; height: 32px; min-height: 30px; padding: 0 10px 0 8px; border: 1px solid transparent; border-radius: 8px; background: none; color: var(--web-composer-muted); font: inherit; font-size: 13px; white-space: nowrap; cursor: pointer; }
${M} #selection-toolbar .generation-asset-wrap { position: relative; display: inline-flex; }
${M} #selection-toolbar .generation-asset-constraints[aria-pressed="true"] { color: var(--web-composer-ink); }
${M} #selection-toolbar .generation-asset-constraints[aria-pressed="true"]::before { content: ''; flex: none; width: 12px; height: 12px; margin-right: 6px; background: currentColor; -webkit-mask: ${CHECK_ICON} center / 12px 12px no-repeat; mask: ${CHECK_ICON} center / 12px 12px no-repeat; }
${M} #selection-toolbar .generation-asset-constraints:hover:not(:disabled), ${M} #selection-toolbar .generation-asset-constraints[aria-expanded="true"] { background: var(--web-composer-hover); }
${M} #selection-toolbar .generation-asset-constraints:disabled { opacity: .45; cursor: default; }
/* 素材规范 popover: menu surface tokens, opens above the pill so the composer stays visible. */
${M} #selection-toolbar .generation-asset-popover { position: absolute; left: 0; bottom: calc(100% + 8px); z-index: 30; box-sizing: border-box; width: 320px; padding: 12px; border: 1px solid var(--web-menu-line); border-radius: 8px; background: var(--web-menu-bg); color: var(--web-menu-ink); box-shadow: var(--web-shadow); text-align: left; white-space: normal; }
${M} #selection-toolbar .generation-asset-popover > * + * { margin-top: 8px; }
${M} #selection-toolbar .generation-asset-head { display: flex; align-items: center; justify-content: space-between; }
${M} #selection-toolbar .generation-asset-head b { color: var(--web-text); font-size: 13px; font-weight: 600; }
${M} #selection-toolbar .generation-asset-switch { position: relative; box-sizing: border-box; width: 32px; min-width: 32px; height: 18px; min-height: 18px; margin: 0; padding: 0; border: 0; border-radius: 999px; background: var(--web-line); cursor: pointer; }
${M} #selection-toolbar .generation-asset-switch::after { content: ''; position: absolute; left: 2px; top: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fffaf0; box-shadow: 0 1px 2px rgba(0,0,0,.3); transition: transform .15s; }
${M} #selection-toolbar .generation-asset-switch[aria-checked="true"] { background: var(--web-accent); }
${M} #selection-toolbar .generation-asset-switch[aria-checked="true"]::after { -webkit-transform: translateX(14px); transform: translateX(14px); }
${M} #selection-toolbar .generation-asset-hint { margin-bottom: 0; color: var(--web-muted); font-size: 12px; line-height: 1.5; }
${M} #selection-toolbar .generation-asset-text { display: block; box-sizing: border-box; width: 100%; min-height: 96px; padding: 8px; border: 1px solid var(--web-menu-line); border-radius: 6px; background: var(--web-composer-bg); color: var(--web-composer-ink); font: inherit; font-size: 12px; line-height: 1.5; resize: vertical; outline: none; }
${M} #selection-toolbar .generation-asset-text:focus { border-color: var(--web-accent); }
${M} #selection-toolbar .generation-asset-reset { height: auto; min-height: 0; padding: 0; border: 0; background: none; color: var(--web-accent); font: inherit; font-size: 12px; cursor: pointer; }
${M} #selection-toolbar .generation-asset-reset:hover:not(:disabled) { text-decoration: underline; }
${M} #selection-toolbar .generation-asset-reset:disabled { color: var(--web-muted); opacity: .6; cursor: default; }
${M} #selection-toolbar .generation-actions { order: 4; flex: 0 0 auto; display: flex; align-items: center; margin-left: auto; padding: 0 4px 2px 8px; gap: 0; }
${M} #selection-toolbar .generation-actions > * + * { margin-left: 8px; }
${M} #selection-toolbar .generation-status, ${M} #selection-toolbar .generation-error, ${M} #selection-toolbar .generation-panel > small { order: 5; padding: 0 4px; font-size: 11px; }
${M} #selection-toolbar .generation-status, ${M} #selection-toolbar .generation-panel > small { color: var(--web-composer-muted); }
${M} #selection-toolbar .generation-action { height: 30px; min-height: 30px; padding: 0 10px; border: 1px solid var(--web-composer-line); border-radius: 15px; background: transparent; color: var(--web-composer-ink); font-size: 12px; }
${M} #selection-toolbar .generation-action-primary { position: relative; box-sizing: border-box; width: 32px; min-width: 32px; height: 32px; min-height: 32px; padding: 0; border: 1px solid var(--web-send-bg); border-radius: 999px; background: var(--web-send-bg); color: var(--web-send-ink); font-size: 0; cursor: pointer; }
${M} #selection-toolbar .generation-action-primary::before { content: ''; position: absolute; left: 7px; top: 7px; width: 16px; height: 16px; background: currentColor; -webkit-mask: ${SEND_ICON} center / contain no-repeat; mask: ${SEND_ICON} center / contain no-repeat; }
${M} #selection-toolbar .generation-action-primary:hover:not(:disabled) { border-color: var(--web-send-hover); background: var(--web-send-hover); }
${M} #selection-toolbar .generation-action:disabled { opacity: .48; cursor: not-allowed; }

/* Generating = Mivo GeneratedMediaFx: quiet tinted frame with a slow sweep; status and stop live in a pill below. */
${M} .card-state-overlay.card-state-loading { gap: 0; padding: 0; border: 1px solid var(--web-line); border-radius: 12px; background-color: var(--web-panel); background-image: linear-gradient(100deg, transparent 30%, var(--web-sweep) 50%, transparent 70%); background-size: 220% 100%; -webkit-backdrop-filter: none; backdrop-filter: none; color: var(--web-muted); overflow: visible; -webkit-animation: web-gen-sweep 2.4s linear infinite; animation: web-gen-sweep 2.4s linear infinite; }
${M} .card.image > .card-state-overlay { top: 40px; }
${M} .card-state-overlay.card-state-loading::before { content: ''; position: absolute; left: 0; top: 0; width: 100%; height: 100%; border-radius: inherit; background: var(--web-accent); opacity: .08; pointer-events: none; }
${M} .card-state-loading .card-state-caption { display: none; }
${M} .card-state-loading .card-state-hint { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
${M} .card-state-loading .card-state-icon { position: relative; width: calc(22px * var(--web-inv, 1)); height: calc(22px * var(--web-inv, 1)); border: calc(2px * var(--web-inv, 1)) solid var(--web-line); border-top-color: var(--web-accent); border-right-color: var(--web-line); opacity: .9; }
${M} .web-state-tip { position: absolute; top: 100%; left: 50%; z-index: 2; display: flex; align-items: center; margin-top: calc(8px * var(--web-inv, 1)); padding: 4px 6px 4px 12px; border: 1px solid var(--web-line); border-radius: 999px; background: var(--web-soft); color: var(--web-muted); box-shadow: var(--web-shadow); font-size: 12px; line-height: 20px; white-space: nowrap; pointer-events: auto; -webkit-transform: translateX(-50%) scale(var(--web-inv, 1)); transform: translateX(-50%) scale(var(--web-inv, 1)); -webkit-transform-origin: top center; transform-origin: top center; }
${M} .web-state-tip b { font-size: 12px; font-weight: 500; letter-spacing: 0; line-height: 20px; }
${M} .web-state-dots { display: inline-block; -webkit-animation: web-gen-dots 1.6s steps(1, end) infinite; animation: web-gen-dots 1.6s steps(1, end) infinite; }
${M} .web-state-tip .card-state-query { height: auto; min-height: 0; margin: 0 0 0 12px; padding: 4px 8px; border: 0; border-radius: 999px; background: transparent; color: var(--web-text); font: inherit; font-size: 12px; line-height: 1.2; cursor: pointer; }
${M} .web-state-tip .card-state-query + .card-state-query { margin-left: 2px; }
${M} .web-state-tip .card-state-query:hover:not(:disabled), ${M} .web-state-tip .card-state-query:focus-visible { background: var(--web-line); }
@-webkit-keyframes web-gen-sweep { from { background-position: 120% 0; } to { background-position: -120% 0; } }
@keyframes web-gen-sweep { from { background-position: 120% 0; } to { background-position: -120% 0; } }
@-webkit-keyframes web-gen-dots { 0% { clip-path: inset(0 100% 0 0); } 25% { clip-path: inset(0 66.6667% 0 0); } 50% { clip-path: inset(0 33.3333% 0 0); } 75%, 100% { clip-path: inset(0); } }
@keyframes web-gen-dots { 0% { clip-path: inset(0 100% 0 0); } 25% { clip-path: inset(0 66.6667% 0 0); } 50% { clip-path: inset(0 33.3333% 0 0); } 75%, 100% { clip-path: inset(0); } }
@media (prefers-reduced-motion: reduce) { ${M} .card-state-overlay.card-state-loading, ${M} .web-state-dots { -webkit-animation: none; animation: none; } }

/* Context menu = Mivo .node-action-menu: 236px, 34px rows, 6px radius, weight 500. */
${M} #canvas-context-menu { box-sizing: border-box; min-width: 0; width: 236px; padding: 6px; border: 1px solid var(--web-menu-line); border-radius: 8px; background: var(--web-menu-bg); color: var(--web-menu-ink); box-shadow: var(--web-shadow); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); }
${M} #canvas-context-menu button { display: flex; align-items: center; box-sizing: border-box; width: 100%; height: 34px; min-height: 34px; margin: 0; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--web-menu-ink); font: inherit; font-size: 13px; font-weight: 500; text-align: left; white-space: nowrap; }
${M} #canvas-context-menu button + button { margin-top: 2px; }
${M} #canvas-context-menu button[hidden] { display: none; }
${M} #canvas-context-menu button:hover:not(:disabled), ${M} #canvas-context-menu button:focus-visible { background: var(--web-menu-hover); color: var(--web-text); }

/* Canvas tabs = Maker Web TabsList: slim board-toned bar, pill tabs, ghost + and 全部画布 on the right. */
${M} .workspace-tabs-row { height: 40px; padding: 0 8px; gap: 0; border: 0; border-bottom: 1px solid var(--web-line); background: var(--web-soft); color: var(--web-text); }
${M} .workspace-tabs-row > * + * { margin-left: 4px; }
/* Tabs shrink to content so + trails the last tab; 全部画布 alone takes the free space on the right. */
${M} .workspace-tabs { flex: 0 1 auto; align-items: center; gap: 0; height: 100%; padding: 0 2px; }
${M} .workspace-tabs-row > .workspace-library { margin-left: auto; }
${M} .workspace-tabs > * + * { margin-left: 2px; }
${M} .workspace-tab { position: relative; align-items: center; box-sizing: border-box; height: 30px; max-width: 240px; padding: 0 4px 0 0; border: 0; border-radius: 8px; background: transparent; color: var(--web-muted); box-shadow: none; transition: background-color .12s, color .12s; }
${M} .workspace-tab:hover { background: var(--web-wash); color: var(--web-text); }
${M} .workspace-tab[data-active="true"], ${M} .workspace-tab[data-active="true"]:hover { border: 0; background: var(--web-panel); color: var(--web-text); box-shadow: var(--web-tab-shadow); }
${M} .workspace-tab button { box-sizing: border-box; height: 30px; min-height: 30px; margin: 0; padding: 0; border: 0; border-radius: 8px; background: transparent; color: inherit; font-size: 13px; font-weight: 500; line-height: 30px; }
${M} .workspace-tab button:hover:not(:disabled) { background: transparent; }
${M} .workspace-tab button[role="tab"], ${M} .workspace-tab[data-active="true"] button[role="tab"] { padding: 0 8px 0 12px; color: inherit; font-weight: 500; }
${M} .workspace-tab #rename-canvas, ${M} .workspace-tab button:last-child:not([role="tab"]):not(#rename-canvas) { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 20px; min-width: 20px; height: 20px; min-height: 20px; padding: 0; border-radius: 5px; color: var(--web-muted); line-height: 1; opacity: 0; pointer-events: none; transition: opacity .12s; }
${M} .workspace-tab #rename-canvas svg { width: 13px; height: 13px; }
${M} .workspace-tab button:last-child:not([role="tab"]):not(#rename-canvas) { font-size: 15px; }
${M} .workspace-tab #rename-canvas + button { margin-left: 2px; }
/* Close shows on hover or the active tab; rename only while hovering the active tab; focus always reveals both. */
${M} .workspace-tab:hover button:last-child:not([role="tab"]):not(#rename-canvas), ${M} .workspace-tab[data-active="true"] button:last-child:not([role="tab"]):not(#rename-canvas), ${M} .workspace-tab[data-active="true"]:hover #rename-canvas { opacity: 1; pointer-events: auto; }
${M} .workspace-tab #rename-canvas:focus, ${M} .workspace-tab button:last-child:not([role="tab"]):not(#rename-canvas):focus { opacity: 1; pointer-events: auto; }
${M} .workspace-tab #rename-canvas:hover:not(:disabled), ${M} .workspace-tab button:last-child:not([role="tab"]):not(#rename-canvas):hover:not(:disabled) { background: var(--web-wash); color: var(--web-text); }
${M} .workspace-tabs-row > button, ${M} .workspace-library > summary { box-sizing: border-box; height: 28px; min-height: 28px; padding: 0 10px; border: 0; border-radius: 8px; background: transparent; color: var(--web-muted); font-size: 13px; font-weight: 500; line-height: 28px; }
/* The text "+" sits off-center with font metrics, so a masked glyph replaces it. */
${M} .workspace-tabs-row > #workspace-new { display: inline-flex; flex: none; align-items: center; justify-content: center; width: 28px; padding: 0; font-size: 0; line-height: 0; }
${M} .workspace-tabs-row > #workspace-new::before { content: ''; display: block; width: 16px; height: 16px; background: currentColor; -webkit-mask: ${ADD_ICON} center / contain no-repeat; mask: ${ADD_ICON} center / contain no-repeat; }
${M} .workspace-tabs-row > button:hover:not(:disabled), ${M} .workspace-library > summary:hover, ${M} .workspace-library[open] > summary { background: var(--web-wash); color: var(--web-text); }
${M} .workspace-tab button:focus-visible, ${M} .workspace-tabs-row > button:focus-visible, ${M} .workspace-library > summary:focus-visible { outline: 2px solid var(--web-accent); outline-offset: -2px; }
${M} .workspace-tabs-row > button:disabled { opacity: .45; }
/* Tooltip = Mivo .canvas-tooltip-host bubble: small dark pill above the target, shown by JS after 150ms. */
${M} .web-tooltip { position: fixed; left: 0; top: 0; z-index: 2147483000; box-sizing: border-box; max-width: 220px; padding: 5px 9px; border: 1px solid rgba(255,250,240,.1); border-radius: 7px; background: rgba(28,28,27,.98); color: #fffaf0; box-shadow: 0 10px 24px rgba(0,0,0,.28); font-size: 12px; font-weight: 600; line-height: 1.35; text-align: center; white-space: nowrap; pointer-events: none; opacity: 0; -webkit-transform: translateY(3px); transform: translateY(3px); transition: opacity .12s ease, transform .12s ease; }
${M} .web-tooltip[data-open="true"] { opacity: 1; -webkit-transform: none; transform: none; }
${M} .web-tooltip[hidden] { display: none; }
${M} .web-tooltip::after { content: ''; position: absolute; left: var(--web-tip-arrow, 50%); top: 100%; width: 8px; height: 8px; margin: -4px 0 0 -4px; box-sizing: border-box; border-right: 1px solid rgba(255,250,240,.1); border-bottom: 1px solid rgba(255,250,240,.1); background: inherit; -webkit-transform: rotate(45deg); transform: rotate(45deg); }
${M} .web-tooltip[data-side="below"]::after { top: 0; -webkit-transform: rotate(225deg); transform: rotate(225deg); }
${L} .web-tooltip { border-color: rgba(37,46,41,.9); background: rgba(37,46,41,.96); color: #ffffff; box-shadow: 0 8px 20px rgba(35,35,35,.16); }
${L} .web-tooltip::after { border-color: rgba(37,46,41,.9); }
@media (prefers-reduced-motion: reduce) { ${M} .web-tooltip { transition: none; } }

/* Video slot and video result = image card: bare title row over a shadowed frame, same selection outline, ring and corner handles. */
${M} .card.video.canvas-card, ${M} .card.video-source.canvas-card { overflow: visible; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
${M} .card.video.canvas-card.selected, ${M} .card.video-source.canvas-card.selected { outline: none; }
${M} .card.web-media:not(.section) .canvas-card-header { padding: 0 2px 6px; align-items: flex-end; border: 0; background: transparent; }
${M} .card.web-media:not(.section) .canvas-card-heading { display: block; }
${M} .card.web-media .canvas-card-title { color: var(--web-muted); font-size: 13px; font-weight: 400; line-height: 20px; }
${M} .card.web-media .canvas-card-meta { display: none; }
${M} .card.web-media .canvas-card-menu { width: 22px; height: 22px; margin-bottom: -1px; border-radius: 6px; background: transparent; color: var(--web-muted); opacity: 0; }
${M} .card.web-media:hover .canvas-card-menu, ${M} .card.web-media.selected .canvas-card-menu, ${M} .card.web-media .canvas-card-menu:focus-visible { opacity: 1; }
${M} .card.web-media .canvas-card-menu:hover { background: var(--web-wash); color: var(--web-text); }
${M} .card.video-source .canvas-card-content { border-radius: 0; background: #000; box-shadow: 0 14px 32px rgba(35,35,35,.18); }
${M} .card.video-source.selected .canvas-card-content, ${M} .card.video.selected .canvas-card-content { outline: calc(2px * var(--web-inv, 1)) solid var(--web-accent); outline-offset: 0; }
${M} .card.video-source.selected::before, ${M} .card.video.selected::before { content: ''; position: absolute; left: 0; right: 0; top: 40px; bottom: 0; z-index: 0; box-shadow: 0 0 0 calc(4px * var(--web-inv, 1)) var(--web-accent); opacity: .18; pointer-events: none; }
${M} .card.video.selected::before { border-radius: 12px; opacity: .1; }
/* Empty video slot = image slot with a film glyph; connected frames show as thumbnails in the composer instead. */
${M} .card.video .canvas-card-content { box-sizing: border-box; padding: 0; border: 1px solid var(--web-slot-line); border-radius: 12px; background: var(--web-slot-bg); color: var(--web-slot-glyph); align-items: center; justify-content: center; }
${M} .card.video .canvas-card-content > * { display: none; }
${M} .card.video .canvas-card-content::before { content: ''; display: block; width: 22%; height: 22%; max-width: 48px; max-height: 48px; min-width: 28px; min-height: 28px; background: currentColor; -webkit-mask: ${VIDEO_ICON} center / contain no-repeat; mask: ${VIDEO_ICON} center / contain no-repeat; }
${M} .card.video.selected .canvas-card-content { outline-offset: 0; }
${M} .card.video > .card-state-overlay, ${M} .card.video-source > .card-state-overlay { top: 40px; }
${M} .card.video-source > .generation-credits { height: 20px; padding: 0 8px; border: 1px solid var(--web-glass-edge); border-radius: 999px; background: var(--web-float-bg); color: var(--web-float-ink); box-shadow: 0 2px 8px rgba(0,0,0,.18); font-size: 11px; font-weight: 500; line-height: 18px; }
${L} .card.video-source > .generation-credits { box-shadow: 0 2px 8px rgba(35,35,35,.12); }
/* Same zoom-invariant corner handles as images; video results keep their ratio, groups resize freely. */
${M} .card.web-media .web-node-handle { position: absolute; z-index: 9; box-sizing: border-box; width: calc(10px * var(--web-inv, 1)); height: calc(10px * var(--web-inv, 1)); min-height: 0; margin: 0; padding: 0; border: calc(2px * var(--web-inv, 1)) solid var(--web-accent); border-radius: 50%; background: #fffaf0; box-shadow: 0 1px 3px rgba(0,0,0,.25); opacity: 1; pointer-events: auto; -webkit-transform: translate(-50%, -50%); transform: translate(-50%, -50%); }
${M} .card.web-media .web-node-handle::after { content: ''; position: absolute; left: 50%; top: 50%; width: calc(20px * var(--web-inv, 1)); height: calc(20px * var(--web-inv, 1)); border-radius: 50%; -webkit-transform: translate(-50%, -50%); transform: translate(-50%, -50%); }
${M} .card.web-media .web-node-handle.is-nw, ${M} .card.web-media .web-node-handle.is-se { cursor: nwse-resize; }
${M} .card.web-media .web-node-handle.is-ne, ${M} .card.web-media .web-node-handle.is-sw { cursor: nesw-resize; }
${M} .card.web-media .web-node-handle:disabled { opacity: .45; cursor: default; }
${M} .card.web-media > .resize-handle { display: none; }

/* Group = quiet rounded frame with the caption inside its top edge; selection uses the card outline and ring. */
${M} .card.section.canvas-card { overflow: visible; border: 1px solid var(--web-line); border-radius: 16px; background: var(--web-group-bg); box-shadow: none; }
${M} .card.section.canvas-card.selected { outline: calc(2px * var(--web-inv, 1)) solid var(--web-accent); outline-offset: 0; }
${M} .card.section.selected::before { content: ''; position: absolute; left: 0; top: 0; width: 100%; height: 100%; border-radius: 16px; box-shadow: 0 0 0 calc(4px * var(--web-inv, 1)) var(--web-accent); opacity: .18; pointer-events: none; }
${M} .card.section .canvas-card-header { height: 40px; padding: 0 10px 0 14px; border: 0; background: transparent; }
${M} .card.section .canvas-card-heading { display: flex; flex-direction: row; align-items: baseline; min-width: 0; }
${M} .card.section .canvas-card-title { color: var(--web-text); font-size: 13px; font-weight: 500; }
${M} .card.section .canvas-card-meta { display: inline; margin-left: 8px; color: var(--web-muted); font-size: 12px; }
${M} .card.section .canvas-group-state { height: 20px; padding: 0 8px; border: 1px solid var(--web-line); border-radius: 999px; background: transparent; color: var(--web-muted); font-size: 11px; line-height: 18px; }

/* Sequence and animation cards: panel-toned frame with pill buttons, matching the composer surface. */
${M} .card.sequence.canvas-card, ${M} .card.animation.canvas-card { border: 1px solid var(--web-line); border-radius: 12px; background: var(--web-panel); color: var(--web-text); box-shadow: 0 14px 32px rgba(35,35,35,.18); }
${M} .card.sequence.canvas-card.selected, ${M} .card.animation.canvas-card.selected { outline: calc(2px * var(--web-inv, 1)) solid var(--web-accent); outline-offset: 0; }
${M} .card.sequence .canvas-card-header, ${M} .card.animation .canvas-card-header { border-bottom: 1px solid var(--web-line); background: transparent; }
${M} .card.sequence .canvas-card-title, ${M} .card.animation .canvas-card-title { color: var(--web-text); font-size: 13px; font-weight: 500; }
${M} .card.sequence .canvas-card-meta, ${M} .card.animation .canvas-card-meta, ${M} .sequence-source-label, ${M} .sequence-result-empty, ${M} .sequence-result-grid figure, ${M} .animation-caption { color: var(--web-muted); }
${M} .card.sequence .canvas-card-menu, ${M} .card.animation .canvas-card-menu { border-radius: 6px; background: transparent; color: var(--web-muted); }
${M} .card.sequence .canvas-card-menu:hover, ${M} .card.animation .canvas-card-menu:hover { background: var(--web-wash); color: var(--web-text); }
${M} .sequence-result-grid canvas, ${M} .card.animation .animation-preview { border-radius: 8px; background: repeating-conic-gradient(var(--web-soft) 0% 25%, var(--web-panel) 0% 50%) 0 / 16px 16px; }
${M} .sequence-edit-button, ${M} .sequence-animation-button, ${M} .animation-controls button { box-sizing: border-box; height: 28px; min-height: 28px; padding: 0 12px; border: 1px solid var(--web-pill-line); border-radius: 999px; background: var(--web-pill-bg); color: var(--web-pill-ink); box-shadow: 0 6px 18px rgba(35,35,35,.12); font: inherit; font-size: 12px; font-weight: 600; line-height: 26px; cursor: pointer; }
${M} .sequence-edit-button:hover, ${M} .sequence-animation-button:hover, ${M} .animation-controls button:hover:not(:disabled) { background: var(--web-pill-hover); }

/* Failed / unknown / paused: frosted panel over the frame, status glyph tinted, actions as pills. */
${M} .card-state-overlay:not(.card-state-loading) { padding: 16px; border: 1px solid var(--web-line); border-radius: 12px; background: var(--web-panel); color: var(--web-muted); -webkit-backdrop-filter: none; backdrop-filter: none; }
@supports ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {
  ${M} .card-state-overlay:not(.card-state-loading) { background: var(--web-glass); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); }
}
${M} .card-state-overlay:not(.card-state-loading) .card-state-caption { display: none; }
${M} .card-state-overlay:not(.card-state-loading) .card-state-icon { width: 28px; height: 28px; border-width: 1.5px; font: 600 14px/1 sans-serif; }
${M} .card-state-overlay:not(.card-state-loading) b { color: var(--web-text); font-size: 13px; font-weight: 600; letter-spacing: 0; }
${M} .card-state-overlay:not(.card-state-loading) .card-state-hint { color: var(--web-muted); }
${M} .card-state-failed .card-state-icon { color: #e5675b; }
${M} .card-state-unknown .card-state-icon { color: #d29a3a; }
${M} .card-state-overlay:not(.card-state-loading) .card-state-query { box-sizing: border-box; height: 28px; min-height: 28px; padding: 0 12px; border: 1px solid var(--web-pill-line); border-radius: 999px; background: var(--web-pill-bg); color: var(--web-pill-ink); font: inherit; font-size: 12px; font-weight: 600; line-height: 26px; }
${M} .card-state-overlay:not(.card-state-loading) .card-state-query:hover:not(:disabled) { background: var(--web-pill-hover); }

/* Video composer extras: frame role badges on thumbnails and 导入视频 as a round icon beside send. */
${M} #selection-toolbar .generation-reference[data-role]::after { content: attr(data-role); position: absolute; left: 3px; bottom: 3px; max-width: 38px; padding: 0 4px; overflow: hidden; border-radius: 4px; background: rgba(0,0,0,.62); color: #fffaf0; font-size: 10px; line-height: 14px; white-space: nowrap; text-overflow: ellipsis; pointer-events: none; }
${M} #selection-toolbar .generation-references .generation-field { align-items: center; }
${M} #selection-toolbar .generation-references .generation-field > .generation-reference { margin-right: 4px; }
${M} #selection-toolbar .generation-action.web-icon-action { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; width: 32px; min-width: 32px; height: 32px; min-height: 32px; padding: 0; border-radius: 999px; color: var(--web-composer-ink); }
${M} #selection-toolbar .generation-action.web-icon-action:hover:not(:disabled) { background: var(--web-composer-hover); }
${M} #selection-toolbar .generation-action.web-icon-action svg { display: block; width: 16px; height: 16px; }

/* Dialogs (拆序列帧, 视频历史, frame editors) on the menu/panel tokens: flat header, pill buttons, inverted primary. */
${M} .sequence-editor { --seq-bg: var(--web-panel); --seq-line: var(--web-line); --seq-muted: var(--web-muted); --seq-accent: var(--web-accent); border: 1px solid var(--web-line); border-radius: 16px; background: var(--web-panel); color: var(--web-text); box-shadow: 0 28px 80px rgba(0,0,0,.45); font-family: inherit; }
${L} .sequence-editor { box-shadow: 0 28px 80px rgba(35,35,35,.18); }
${M} .sequence-editor::backdrop { background: rgba(0,0,0,.45); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); }
${L} .sequence-editor::backdrop { background: rgba(35,35,35,.24); }
${M} .sequence-editor button { box-sizing: border-box; height: 32px; min-height: 32px; padding: 0 14px; border: 1px solid var(--web-line); border-radius: 8px; background: transparent; color: var(--web-text); font-size: 13px; font-weight: 500; line-height: 30px; }
${M} .sequence-editor button:hover:not(:disabled) { background: var(--web-wash); }
${M} .sequence-editor button.primary { border-color: var(--web-send-bg); background: var(--web-send-bg); color: var(--web-send-ink); font-weight: 600; }
${M} .sequence-editor button.primary:hover:not(:disabled) { border-color: var(--web-send-hover); background: var(--web-send-hover); }
${M} .sequence-editor .sequence-editor-tile button { height: auto; min-height: 0; padding: 4px; border-radius: 10px; background: var(--web-soft); line-height: normal; }
${M} .sequence-editor .sequence-editor-tile.active button { border-color: var(--web-accent); box-shadow: 0 0 0 1px var(--web-accent); }
${M} .sequence-editor .sequence-editor-tile canvas { border-radius: 6px; background: repeating-conic-gradient(var(--web-soft) 0% 25%, var(--web-panel) 0% 50%) 0 / 12px 12px; }
${M} .sequence-editor .sequence-editor-tile label { color: var(--web-muted); }
${M} .sequence-editor .sequence-editor-tile.chosen { outline: calc(2px) solid var(--web-accent); background: transparent; }
${M} .sequence-editor-header { border-bottom: 1px solid var(--web-line); background: transparent; }
${M} .sequence-editor-header small { color: var(--web-muted); letter-spacing: 1px; }
${M} .sequence-editor-header h2 { color: var(--web-text); font-size: 18px; font-weight: 600; letter-spacing: 0; }
${M} .sequence-editor-steps { background: transparent; color: var(--web-muted); }
${M} .sequence-editor-steps .active { color: var(--web-text); font-weight: 600; }
${M} .sequence-editor-steps .complete { color: var(--web-accent); }
${M} .sequence-editor-stage { border: 1px solid var(--web-line); border-radius: 12px; }
${M} .sequence-editor .checkerboard { background: repeating-conic-gradient(var(--web-soft) 0% 25%, var(--web-panel) 0% 50%) 0 / 24px 24px; }
${M} .sequence-editor-panel { background: var(--web-soft); border-radius: 12px; }
${M} .sequence-editor-panel h3 { color: var(--web-text); font-size: 14px; }
${M} .sequence-editor-field { color: var(--web-muted); }
${M} .sequence-editor-field input, ${M} .sequence-editor-field select, ${M} .sequence-preview-controls select, ${M} .background-body select, ${M} .atlas-compare-row input[type=number] { box-sizing: border-box; border: 1px solid var(--web-composer-line); border-radius: 8px; background: var(--web-composer-bg); color: var(--web-composer-ink); }
${M} .sequence-editor-field input:focus, ${M} .sequence-editor-field select:focus { border-color: var(--web-accent); outline: none; }
${M} .sequence-editor-field input[type=color] { padding: 4px; }
${M} .sequence-editor-footer { border-top: 1px solid var(--web-line); background: transparent; }
${M} .sequence-confirm { background: var(--web-scrim); }
/* 视频历史 rows set inline borders, so !important is the only way to retint them without touching the default page. */
${M} .sequence-editor.video-history { box-sizing: border-box; width: 760px; max-width: 94vw; height: -webkit-fit-content; height: fit-content; max-height: 86vh; padding: 20px 24px; }
${M} .video-history h2 { margin: 0 0 6px; font-size: 18px; font-weight: 600; }
${M} .video-history > p { margin: 0 0 10px; color: var(--web-muted); font-size: 12px; line-height: 1.6; }
${M} .video-history > p[role="status"] { color: var(--web-text); font-size: 13px; }
${M} .video-history article { padding: 12px 14px !important; border: 1px solid var(--web-line) !important; border-radius: 12px !important; background: var(--web-soft); }
${M} .video-history article strong { font-size: 13px; font-weight: 600; }
${M} .video-history article p { margin: 4px 0 0; color: var(--web-muted); font-size: 12px; }
${M} .video-history article button { height: 28px; min-height: 28px; margin: 10px 6px 0 0; padding: 0 12px; border-color: var(--web-pill-line); border-radius: 999px; background: var(--web-pill-bg); color: var(--web-pill-ink); font-size: 12px; font-weight: 600; line-height: 26px; }
${M} .video-history article button:hover:not(:disabled) { background: var(--web-pill-hover); }
${M} .video-history footer { display: flex; justify-content: flex-end; margin-top: 14px; }
${M} .video-history footer > * + * { margin-left: 8px; }
/* Pointer focus draws no ring; keyboard focus gets one subtle 1.5px accent ring, overriding per-control rings. */
${P} :focus { outline: none !important; }
${K} :focus:not(.canvas-port):not(.card) { outline: 1.5px solid var(--web-focus-ring) !important; outline-offset: 1px !important; }
${K} .card .port.canvas-port:focus { opacity: 1; pointer-events: auto; }
${K} .card .port.canvas-port:focus::before { box-shadow: 0 0 0 1.5px var(--web-focus-ring); }
/* Video result: no native controls (they swallowed the drag); a Mivo-like 28px round play chip sits bottom-left. */
${M} .card.video-source .web-video-play { position: absolute; left: 10px; bottom: 10px; z-index: 4; display: flex; align-items: center; justify-content: center; box-sizing: border-box; width: 28px; height: 28px; min-height: 28px; margin: 0; padding: 0; border: 1px solid var(--web-glass-edge); border-radius: 50%; background: var(--web-float-bg); color: var(--web-float-ink); box-shadow: 0 2px 8px rgba(0,0,0,.24); cursor: pointer; opacity: .92; -webkit-transform: scale(var(--web-inv, 1)); transform: scale(var(--web-inv, 1)); -webkit-transform-origin: 0 100%; transform-origin: 0 100%; transition: opacity .12s; }
${M} .card.video-source .web-video-play:hover { opacity: 1; }
${M} .card.video-source .web-video-play svg { display: block; flex: none; }
${M} .card.video-source .web-video-play[data-playing="false"] svg { margin-left: 2px; }
${L} .card.video-source .web-video-play { box-shadow: 0 2px 8px rgba(35,35,35,.16); }
${M} .card.video-source .video-source-preview { cursor: inherit; }
/* Side + chooser = the context menu rows at a compact 148px width. */
${M} .web-slot-chooser { position: fixed; z-index: 60; box-sizing: border-box; width: 148px; padding: 6px; border: 1px solid var(--web-menu-line); border-radius: 8px; background: var(--web-menu-bg); color: var(--web-menu-ink); box-shadow: var(--web-shadow); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); }
${M} .web-slot-chooser button { display: flex; align-items: center; box-sizing: border-box; width: 100%; height: 34px; min-height: 34px; margin: 0; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--web-menu-ink); font: inherit; font-size: 13px; font-weight: 500; text-align: left; white-space: nowrap; cursor: pointer; }
${M} .web-slot-chooser button + button { margin-top: 2px; }
${M} .web-slot-chooser button svg { flex: none; margin-right: 8px; }
${M} .web-slot-chooser button:hover, ${M} .web-slot-chooser button:focus { background: var(--web-menu-hover); color: var(--web-text); }
`;
