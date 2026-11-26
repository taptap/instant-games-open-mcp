export const uiMotionStyles = String.raw`
:root {
  --maker-bg-pattern: url(/console-bg-pattern-dark.jpg);
}
:root[data-theme='light'] {
  --maker-bg-pattern: url(/console-bg-pattern.jpg);
}
* {
  box-sizing: border-box;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
}
::-webkit-scrollbar {
  width: 7px;
  height: 7px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: content-box;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
  border: 1px solid transparent;
  background-clip: content-box;
}
::-webkit-scrollbar-corner {
  background: transparent;
}
body {
  margin: 0;
  min-height: 100dvh;
  background-color: var(--bg);
  background-image: var(--maker-bg-pattern);
  background-size: cover;
  background-position: center center;
  background-repeat: no-repeat;
  background-attachment: fixed;
  color: var(--text);
  font:
    14px/1.6 -apple-system,
    BlinkMacSystemFont,
    'PingFang SC',
    'Hiragino Sans GB',
    'Microsoft YaHei',
    sans-serif;
  -webkit-font-smoothing: antialiased;
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 32px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--soft);
  color: var(--text);
  padding: 5px 12px;
  font-size: 13px;
  font-weight: 500;
  transition:
    background 0.14s ease,
    border-color 0.14s ease,
    color 0.14s ease;
}
button:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--text) 24%, transparent);
  background: var(--soft-hover);
}
button:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}
button:focus-visible,
a:focus-visible,
input:focus-visible,
select:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
button.primary {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
  font-weight: 600;
}
button.primary:hover:not(:disabled) {
  filter: brightness(1.06);
  background: var(--primary);
  border-color: var(--primary);
}
select {
  appearance: none;
  -webkit-appearance: none;
  min-height: 32px;
  padding: 5px 28px 5px 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background-color: var(--surface-solid);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='M4.25 6.25L8 10L11.75 6.25' stroke='%238c93a0' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 9px center;
  color: var(--text);
  font-size: 12.5px;
  cursor: pointer;
}
select:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--text) 24%, transparent);
}
select option {
  background: var(--surface-solid);
  color: var(--text);
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
  max-width: 1440px;
  margin: auto;
  padding: 28px clamp(16px, 3vw, 44px) 44px;
}
.page-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 24px;
}
.page-heading h1 {
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.page-heading p,
.page-note {
  color: var(--muted);
  font-size: 12px;
}
.page-heading .index {
  font:
    11.5px/1.4 'SFMono-Regular',
    Consolas,
    monospace;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.library-intro {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--muted);
}
.library-intro strong {
  font-weight: 600;
  color: var(--text);
}
.library-intro p {
  margin: 0;
}
.library-intro a {
  color: var(--text);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.library-intro a:hover {
  color: var(--accent);
}
#library-content {
  margin: 0;
  padding: 20px 24px;
  max-height: 68vh;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font:
    12.5px/1.7 'SFMono-Regular',
    Consolas,
    monospace;
  background: var(--code);
}
.handoff-help,
#local-handoff-status,
#original-handoff-status {
  font-size: 12px;
  color: var(--muted);
}
.library-variants {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 3px;
  background: var(--track);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.library-variants button {
  min-height: 28px;
  padding: 4px 14px;
  font-size: 12.5px;
  border: 0;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--muted);
}
.library-variants button:hover:not(:disabled) {
  background: var(--soft);
  color: var(--text);
}
.library-variants button[aria-pressed='true'] {
  background: var(--track-active);
  color: var(--text);
  font-weight: 600;
}
.more-motion {
  margin-top: 28px;
}
.more-motion > button {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 20px;
  width: 100%;
  padding: 20px 24px;
  text-align: left;
  background: var(--surface);
  backdrop-filter: blur(8px);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
}
.more-motion > button:hover:not(:disabled) {
  border-color: var(--border-strong);
  background: var(--surface-solid);
}
.more-motion strong {
  display: block;
  font-size: 18px;
  font-weight: 600;
}
.more-motion small {
  display: block;
  margin-top: 4px;
  color: var(--muted);
  font-weight: 400;
}
.more-motion-mark {
  font-size: 32px;
  line-height: 1;
  color: var(--muted);
}
.more-motion-action {
  margin-left: auto;
  font-size: 12.5px;
  color: var(--muted);
}
@media (max-width: 600px) {
  .more-motion > button {
    padding: 16px;
    gap: 12px;
    flex-wrap: wrap;
  }
  .more-motion-action {
    width: 100%;
    margin-left: 0;
  }
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
  text-decoration: none;
  overflow-wrap: anywhere;
}
.asset-grid a:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.asset-grid img {
  width: 100%;
  height: 160px;
  object-fit: contain;
  background: var(--code);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px;
}
.original-viewer iframe {
  display: block;
  width: 100%;
  height: min(760px, 68dvh);
  border: 0;
  background: var(--bg);
}
.original-stage {
  position: relative;
  background: var(--bg);
}
.motion-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  background: var(--surface-solid);
  color: var(--muted);
  font: 13px/1.6 sans-serif;
  text-align: center;
  overflow-wrap: anywhere;
}
.motion-loading::before {
  content: '';
  width: 22px;
  height: 22px;
  border: 2px solid var(--border-strong);
  border-top-color: var(--text);
  border-radius: 50%;
  animation: motion-loading-spin 0.8s linear infinite;
}
.motion-loading[data-state='error']::before {
  display: none;
}
.example-media .motion-loading {
  pointer-events: none;
}
.preview-retry {
  margin: 0 20px 16px;
}
@keyframes motion-loading-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .motion-loading::before {
    animation: none;
  }
}
.original-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  padding: 12px 20px;
  background: var(--top);
  border-top: 1px solid var(--border);
}
.original-actions a {
  font-size: 12px;
  color: var(--muted);
  text-decoration: none;
}
.original-actions a:hover {
  color: var(--text);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.section-heading {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 26px 0 14px;
}
.section-heading h2 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.section-heading span {
  font:
    11.5px/1 'SFMono-Regular',
    Consolas,
    monospace;
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
  gap: 20px;
}
.transition-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}
.example-card {
  min-width: 0;
}
.local-sample {
  max-width: 800px;
  margin-bottom: 24px;
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
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--surface);
  backdrop-filter: blur(8px);
  text-align: left;
  transition:
    transform 0.16s ease,
    border-color 0.16s ease,
    background 0.16s ease;
}
.example-open:hover {
  transform: translateY(-2px);
  border-color: var(--border-strong);
  background: var(--surface-solid);
}
.example-media {
  position: relative;
  overflow: hidden;
  background: var(--code);
  aspect-ratio: 16/9;
}
.example-media canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.example-id {
  position: absolute;
  left: 10px;
  top: 10px;
  background: rgba(15, 16, 20, 0.74);
  color: #f3f4f6;
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(6px);
  padding: 2px 8px;
  border-radius: var(--radius-xs);
  font:
    11px/1.5 'SFMono-Regular',
    Consolas,
    monospace;
  letter-spacing: 0.04em;
}
.example-play {
  position: absolute;
  right: 10px;
  bottom: 10px;
  border-radius: var(--radius-pill);
  padding: 4px 12px;
  background: rgba(17, 18, 22, 0.78);
  color: #f3f4f6;
  border: 1px solid rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(6px);
  font-size: 12px;
  font-weight: 500;
}
.example-body {
  padding: 14px 18px 16px;
}
.example-body h3 {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}
.example-body p {
  font-size: 12px;
  color: var(--muted);
  margin-top: 4px;
}
.page-note {
  margin-top: 24px;
}
.viewer {
  width: min(1420px, calc(100vw - 36px));
  max-width: none;
  max-height: calc(100dvh - 36px);
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface-solid);
  color: var(--text);
  box-shadow: var(--shadow-dialog);
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
.local-viewer[data-kind='lab'] > .viewer-head {
  padding-block: 6px;
}
.viewer::backdrop,
.handoff::backdrop {
  background: rgba(5, 6, 10, 0.64);
  backdrop-filter: blur(5px);
}
.viewer-head {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--surface-solid);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 20px;
  border-bottom: 1px solid var(--border);
}
.viewer-head h2 {
  min-width: 0;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.viewer-tag {
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: var(--soft);
  border: 1px solid var(--border);
  color: var(--muted);
  font-size: 11px;
  font-weight: 500;
}
.viewer-head > button:last-child {
  width: 32px;
  height: 32px;
  margin-left: auto;
  flex-shrink: 0;
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: transparent;
  font-size: 24px;
  line-height: 1;
  color: var(--muted);
}
.viewer-head > button:last-child:hover:not(:disabled) {
  background: var(--soft);
  color: var(--text);
}
.viewer-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 236px;
}
.demo-column {
  min-width: 0;
  padding: 18px 20px;
  background: var(--bg);
}
.stage {
  position: relative;
  aspect-ratio: 16/9;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  overflow: hidden;
  background: var(--code);
  width: 100%;
  max-width: max(240px, calc((100dvh - 252px) * 16 / 9));
  margin-inline: auto;
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
  min-height: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  opacity: 1;
}
.hotspot:hover {
  background: rgba(255, 255, 255, 0.08);
  outline: 1px solid rgba(255, 255, 255, 0.35);
}
.hotspot:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: -2px;
}
.hotspot:disabled {
  opacity: 1;
}
.player-controls {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 12px;
  padding: 8px 10px;
  background: var(--surface-solid);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  flex-wrap: wrap;
}
.player-controls button {
  min-height: 28px;
  min-width: 56px;
  padding: 3px 10px;
  font-size: 12px;
  border-radius: var(--radius-xs);
  border-color: var(--border);
  background: var(--soft);
}
.player-controls button[aria-pressed='true'] {
  background: var(--track-active);
  border-color: var(--border-strong);
  color: var(--text);
  font-weight: 600;
}
.player-controls input {
  min-width: 75px;
  flex: 1;
  accent-color: var(--primary);
}
.player-controls output {
  margin-left: auto;
  font:
    11.5px/1.4 'SFMono-Regular',
    Consolas,
    monospace;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  white-space: nowrap;
  padding: 0 6px;
}
.player-controls select {
  min-height: 28px;
  padding: 3px 24px 3px 8px;
  font-size: 12px;
  border-radius: var(--radius-xs);
  border-color: var(--border);
  background-color: var(--soft);
}
.scene-summary {
  font-size: 12px;
  color: var(--muted);
  margin: 12px 2px 0;
}
.demo-rail {
  border-left: 1px solid var(--border);
  background: var(--top);
  padding: 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.rail-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--muted);
  margin-bottom: 8px;
}
.clips {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.clips button {
  justify-content: flex-start;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  color: var(--muted);
  font-size: 12.5px;
  padding: 7px 10px;
  min-height: 32px;
  border-radius: var(--radius-sm);
}
.clips button:hover:not(:disabled) {
  background: var(--soft);
  border-color: transparent;
  color: var(--text);
}
.clips button[aria-pressed='true'] {
  border-color: var(--border);
  background: var(--track-active);
  color: var(--text);
  font-weight: 600;
}
.reference-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: auto;
}
.download-link {
  text-align: center;
  color: var(--muted);
  font-size: 12px;
  padding: 5px;
  text-decoration: none;
}
.download-link:hover {
  color: var(--text);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.reference-details {
  border-top: 1px solid var(--border);
  background: var(--surface-solid);
  padding: 12px 20px;
  font-size: 12px;
  color: var(--muted);
}
summary {
  cursor: pointer;
  font-weight: 500;
  color: var(--text);
}
details p {
  margin: 10px 0;
  line-height: 1.75;
}
details pre {
  max-height: 240px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--code);
  border: 1px solid var(--border);
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  font:
    11.5px/1.6 'SFMono-Regular',
    Consolas,
    monospace;
}
.handoff {
  width: min(680px, calc(100vw - 24px));
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface-solid);
  color: var(--text);
  box-shadow: var(--shadow-dialog);
  padding: 22px 24px;
}
.handoff .viewer-head {
  padding: 0 0 14px;
  border: 0;
}
.handoff .viewer-head h2 {
  font-size: 18px;
}
.handoff textarea {
  width: 100%;
  height: 290px;
  resize: vertical;
  background: var(--code);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px;
  font:
    12px/1.7 'SFMono-Regular',
    Consolas,
    monospace;
  margin: 10px 0 12px;
}
.handoff #copy-status {
  font-size: 12px;
  color: var(--muted);
  margin-top: 10px;
}
.touch-actions {
  display: none;
}
.keyframe-timeline {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-solid);
  margin-top: 10px;
  padding: 10px 16px 8px 12px;
}
.timeline-track {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  align-items: center;
  min-height: 28px;
  font-size: 12px;
  color: var(--muted);
}
.timeline-lane {
  position: relative;
  height: 26px;
  border-bottom: 1px solid var(--border);
}
.timeline-track:last-child .timeline-lane {
  border-bottom: 0;
}
.timeline-key {
  position: absolute;
  top: 1px;
  width: 24px;
  height: 24px;
  min-height: 0;
  padding: 0;
  transform: translateX(-50%);
  background: transparent;
  border: 0;
}
.timeline-key:hover:not(:disabled) {
  background: transparent;
  border: 0;
}
.timeline-key:after {
  content: '';
  display: block;
  width: 7px;
  height: 7px;
  transform: rotate(45deg);
  margin: auto;
  background: var(--text);
  opacity: 0.72;
  transition:
    transform 0.12s ease,
    background 0.12s ease,
    opacity 0.12s ease;
}
.timeline-key:hover:after {
  background: var(--primary);
  opacity: 1;
  transform: rotate(45deg) scale(1.2);
}
.timeline-head-marker {
  position: absolute;
  top: 0;
  bottom: 0;
  border-left: 1.5px solid var(--primary);
  pointer-events: none;
}
#keyframe-detail {
  margin: 8px 0 0;
  font:
    11.5px/1.4 'SFMono-Regular',
    Consolas,
    monospace;
  color: var(--muted);
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
    margin-bottom: 20px;
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
    font-size: 16px;
  }
  .viewer-head .viewer-tag {
    display: none;
  }
  .viewer-head button {
    padding: 5px 9px;
  }
  .demo-column {
    padding: 12px;
  }
  .stage {
    border-radius: var(--radius-xs);
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
    min-height: 36px;
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
`;
