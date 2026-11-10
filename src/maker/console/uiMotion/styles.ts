export const uiMotionStyles = String.raw`
.more-motion { margin-top: 28px; }
.more-motion > button {
  display: flex; align-items: center; gap: 22px; width: 100%;
  padding: 24px; text-align: left; background: var(--soft); color: var(--text);
  border: 1px solid var(--border); border-radius: 14px; cursor: pointer;
}
.more-motion strong { display: block; font-size: 22px; font-weight: 600; }
.more-motion small { display: block; margin-top: 6px; opacity: .65; }
.more-motion-mark { font-size: 48px; line-height: 1; }
.more-motion-action { margin-left: auto; font-size: 13px; }
@media (max-width: 600px) {
  .more-motion > button { padding: 18px; gap: 12px; flex-wrap: wrap; }
  .more-motion-action { width: 100%; margin-left: 0; }
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font:
    14px/1.6 'PingFang SC',
    'Microsoft YaHei',
    sans-serif;
}
button,
input,
select,
textarea {
  font: inherit;
  color: inherit;
}
button,
a {
  -webkit-tap-highlight-color: transparent;
}
button,
a.button {
  cursor: pointer;
}
button {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--soft);
  padding: 8px 14px;
}
button:hover {
  border-color: var(--accent);
}
button:disabled {
  cursor: default;
  opacity: 0.45;
}
button:focus-visible,
a:focus-visible,
input:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
}
button.primary {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}
[hidden] {
  display: none !important;
}
h1,
h2,
h3,
p {
  margin: 0;
}
main {
  max-width: 1480px;
  margin: auto;
  padding: 26px clamp(14px, 3vw, 40px) 36px;
}
.page-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 32px;
}
.page-heading h1 {
  font-size: 25px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.page-heading p,
.page-note {
  color: var(--muted);
  font-size: 12px;
}
.page-heading .index {
  font:
    12px Georgia,
    serif;
  letter-spacing: 0.15em;
  color: var(--muted);
}
.library-intro {
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.7;
}
.library-intro strong { font-weight: 500; }
.library-intro p { margin: 0; }
.library-intro a { color: inherit; text-underline-offset: 3px; }
#library-content { margin: 0; padding: 20px; max-height: 65vh; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; line-height: 1.7; }
.handoff-help, #local-handoff-status, #original-handoff-status { font-size: 12px; color: var(--muted); }
.library-variants {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.library-variants button {
  font-size: 12px;
  background: transparent;
}
.library-variants button[aria-pressed='true'] {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--selection);
}
.example-media img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
.example-media iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  pointer-events: none;
}
.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr));
  gap: 16px;
  padding: 20px;
}
.asset-grid a {
  display: grid;
  gap: 8px;
  min-width: 0;
  color: var(--text);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.asset-grid img {
  width: 100%;
  height: 160px;
  object-fit: contain;
  background: var(--soft);
}
.original-viewer iframe {
  display: block;
  width: 100%;
  height: min(760px, 68dvh);
  border: 0;
}
.original-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border-top: 1px solid var(--border);
}
.original-actions a {
  font-size: 12px;
  color: var(--muted);
}
.section-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 26px 0 14px;
}
.section-heading h2 {
  font-size: 15px;
  font-weight: 500;
}
.section-heading span {
  font:
    12px Georgia,
    serif;
  color: var(--muted);
}
.section-heading:after {
  content: '';
  height: 1px;
  background: var(--border);
  flex: 1;
}
.scene-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
}
.transition-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}
.example-card {
  min-width: 0;
}
.local-sample {
  max-width: 800px;
  margin-bottom: 28px;
}
.local-sample a {
  color: inherit;
  text-decoration: none;
}
.example-open {
  display: block;
  width: 100%;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 13px;
  overflow: hidden;
  background: var(--top);
  text-align: left;
  transition:
    transform 0.18s,
    border-color 0.18s;
}
.example-open:hover {
  transform: translateY(-3px);
}
.example-media {
  position: relative;
  overflow: hidden;
  background: var(--soft);
  aspect-ratio: 16/9;
}
.example-media canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.example-id {
  position: absolute;
  left: 12px;
  top: 12px;
  background: #1d2d2b;
  color: #f7edda;
  padding: 3px 9px;
  border-radius: 4px;
  font:
    11px/1.5 Georgia,
    serif;
  letter-spacing: 0.1em;
}
.example-play {
  position: absolute;
  right: 12px;
  bottom: 12px;
  border-radius: 30px;
  padding: 6px 14px;
  background: #fff7e6;
  color: #263e35;
  font-size: 12px;
  box-shadow: 0 2px 12px #0002;
}
.example-body {
  padding: 16px 20px 18px;
}
.example-body h3 {
  font-size: 18px;
  font-weight: 500;
  letter-spacing: 0.03em;
}
.example-body p {
  font-size: 12px;
  color: var(--muted);
  margin-top: 4px;
}
.page-note {
  margin-top: 26px;
}
.viewer {
  width: min(1420px, calc(100vw - 36px));
  max-width: none;
  max-height: calc(100dvh - 36px);
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--bg);
  color: var(--text);
  overflow: auto;
}
.local-viewer {
  height: calc(100dvh - 36px);
  overflow: hidden;
}
.local-viewer[open] {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
}
.local-viewer iframe {
  height: 100%;
  min-height: 0;
}
.local-viewer[data-kind='lab'] {
  width: min(1740px, calc(100vw - 24px));
  height: min(calc(100dvh - 24px), max(480px, 70vw));
  max-width: none;
}
.local-viewer[data-kind='lab'][open] {
  grid-template-rows: minmax(0, 1fr) auto;
}
.local-viewer[data-kind='lab'] > .viewer-head {
  display: none;
}
.viewer::backdrop,
.handoff::backdrop {
  background: #07110ec9;
  backdrop-filter: blur(7px);
}
.viewer-head {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--bg);
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 22px;
  border-bottom: 1px solid var(--border);
}
.viewer-head h2 {
  min-width: 0;
  font-size: 21px;
  font-weight: 500;
}
.viewer-tag {
  color: var(--muted);
  font-size: 12px;
}
.viewer-head > button:last-child {
  margin-left: auto;
  flex-shrink: 0;
  align-self: flex-start;
}
.viewer-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 224px;
}
.demo-column {
  min-width: 0;
  padding: 20px;
}
.stage {
  position: relative;
  aspect-ratio: 16/9;
  border-radius: 10px;
  overflow: hidden;
  background: var(--soft);
}
.stage canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.hotspots {
  position: absolute;
  inset: 0;
}
.hotspot {
  position: absolute;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  opacity: 1;
}
.hotspot:hover {
  background: #fff1;
  outline: 1px solid #fff5;
}
.hotspot:focus-visible {
  outline: 3px solid #fff2d9;
  outline-offset: -3px;
}
.hotspot:disabled {
  opacity: 1;
}
.player-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 12px;
  flex-wrap: wrap;
}
.player-controls button {
  min-width: 62px;
}
.player-controls input {
  min-width: 75px;
  flex: 1;
  accent-color: var(--accent);
}
.player-controls output {
  font: 11px monospace;
  color: var(--muted);
  white-space: nowrap;
}
.player-controls select {
  background: var(--soft);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 4px;
}
.scene-summary {
  font-size: 12px;
  color: var(--muted);
  margin: 12px 2px 0;
}
.demo-rail {
  border-left: 1px solid var(--border);
  padding: 22px 18px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.rail-label {
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 8px;
}
.clips {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.clips button {
  text-align: left;
  background: transparent;
  font-size: 12px;
  padding: 10px;
}
.clips button[aria-pressed='true'] {
  border-color: var(--accent);
  background: var(--selection);
  color: var(--accent);
}
.reference-actions {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin-top: auto;
}
.download-link {
  text-align: center;
  color: var(--muted);
  font-size: 12px;
  padding: 5px;
}
.reference-details {
  border-top: 1px solid var(--border);
  padding: 12px 22px;
  font-size: 12px;
  color: var(--muted);
}
summary {
  cursor: pointer;
}
details p {
  margin: 12px 0;
  line-height: 1.8;
}
details pre {
  max-height: 240px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--code);
  padding: 14px;
  border-radius: 8px;
  font-size: 11px;
}
.handoff {
  width: min(680px, calc(100vw - 24px));
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg);
  color: var(--text);
  padding: 24px;
}
.handoff .viewer-head {
  padding: 0 0 16px;
  border: 0;
}
.handoff .viewer-head h2 {
  font-size: 20px;
}
.handoff textarea {
  width: 100%;
  height: 290px;
  resize: vertical;
  background: var(--code);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  font-size: 12px;
  line-height: 1.8;
  margin-bottom: 12px;
}
.handoff #copy-status {
  font-size: 12px;
  color: var(--muted);
  margin-top: 10px;
}
.touch-actions {
  display: none;
}
@media (max-width: 1000px) {
  .transition-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .viewer-content {
    grid-template-columns: minmax(0, 1fr);
  }
  .demo-rail {
    border-left: 0;
    border-top: 1px solid var(--border);
    padding: 14px 20px;
    gap: 12px;
  }
  .clips {
    flex-direction: row;
    flex-wrap: wrap;
  }
  .reference-actions {
    flex-direction: row;
    align-items: center;
  }
  .reference-actions button {
    flex: 1;
  }
  .viewer {
    width: calc(100vw - 20px);
    max-height: calc(100dvh - 20px);
  }
  .local-viewer {
    height: calc(100dvh - 20px);
  }
}
@media (max-width: 650px) {
  main {
    padding-top: 18px;
  }
  .page-heading {
    margin-bottom: 22px;
  }
  .page-heading .index {
    display: none;
  }
  .scene-grid,
  .transition-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
  }
  .example-body {
    padding: 12px 15px;
  }
  .viewer-head {
    padding: 12px;
    gap: 8px;
  }
  .viewer-head h2 {
    font-size: 18px;
  }
  .viewer-head .viewer-tag {
    display: none;
  }
  .viewer-head button {
    padding: 7px 9px;
  }
  .demo-column {
    padding: 10px;
  }
  .stage {
    border-radius: 6px;
  }
  .player-controls {
    gap: 6px;
  }
  .player-controls input {
    order: 2;
    flex-basis: 100%;
  }
  .demo-rail {
    padding: 12px;
  }
  .reference-details {
    padding: 12px;
  }
  .touch-actions {
    display: flex;
    gap: 7px;
    flex-wrap: wrap;
    margin-top: 10px;
  }
  .touch-actions button {
    min-height: 40px;
    flex: 1 1 28%;
    font-size: 12px;
    padding: 6px;
  }
  .handoff {
    padding: 16px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .example-open {
    transition: none;
  }
}

.stage {
  width: 100%;
  max-width: max(240px, calc((100dvh - 252px) * 16 / 9));
  margin-inline: auto;
}

.keyframe-timeline {border:1px solid var(--border);border-radius:6px;margin-top:12px;padding:12px 20px 8px 10px}
.timeline-track {display:grid;grid-template-columns:80px minmax(0,1fr);align-items:center;min-height:29px;font-size:12px}
.timeline-lane {position:relative;height:28px;border-bottom:1px solid var(--border)}
.timeline-key {position:absolute;top:1px;width:24px;height:24px;min-height:0;padding:0;transform:translateX(-50%);background:transparent;border:0}
.timeline-key:after {content:'';display:block;width:8px;height:8px;transform:rotate(45deg);margin:auto;background:var(--accent)}
.timeline-head-marker {position:absolute;top:0;bottom:0;border-left:1px solid var(--accent);pointer-events:none}
#keyframe-detail {margin:10px 0 0;font-size:11px;color:var(--muted)}
`;
