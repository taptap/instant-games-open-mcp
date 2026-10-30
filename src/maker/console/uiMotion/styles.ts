export const uiMotionStyles = String.raw`
:root {
  --surface: var(--top);
  --tint: var(--selection);
  --shadow: 0 12px 35px #193d2d09;
}
* {
  box-sizing: border-box;
}
html {
  scroll-behavior: smooth;
}
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font:
    14px/1.65 "PingFang SC",
    "Microsoft YaHei",
    sans-serif;
}
button,
a,
input,
textarea {
  font: inherit;
}
button,
.button {
  padding: 9px 15px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  text-decoration: none;
  display: inline-block;
}
button:hover,
.button:hover {
  border-color: var(--accent);
  background: var(--soft);
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
button:focus-visible,
a:focus-visible,
input:focus-visible,
textarea:focus-visible,
summary:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 3px;
}
.primary {
  background: var(--accent);
  color: var(--surface);
  border-color: var(--accent);
  font-weight: 650;
}
.primary:hover {
  background: var(--accent);
  filter: brightness(1.1);
}
a {
  color: var(--accent);
}
main {
  min-width: 0;
  width: 100%;
  max-width: 1500px;
  margin: auto;
  padding: 30px 32px;
}
h1,
h2,
h3,
p {
  margin: 0;
}
h1 {
  font-size: 32px;
  font-weight: 650;
  letter-spacing: -1px;
}
h2 {
  font-size: 23px;
  line-height: 1.4;
  font-weight: 650;
}
p {
  color: var(--muted);
}
.eyebrow {
  font-size: 11px;
  color: var(--accent);
  letter-spacing: 1.5px;
  margin-bottom: 7px;
}
.page-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  margin-bottom: 25px;
}
.page-heading p:last-child {
  margin-top: 5px;
}
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.9fr) minmax(250px, 1fr);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
  background: var(--surface);
  box-shadow: var(--shadow);
}
.hero-preview {
  position: relative;
  align-self: center;
  background: #e2ede6;
}
.hero-preview canvas {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 16/9;
}
.scene-tag {
  position: absolute;
  top: 14px;
  left: 14px;
  background: #ffffffde;
  border: 1px solid #ccd8cd;
  color: #46634f;
  padding: 4px 9px;
  font-size: 10px;
  border-radius: 20px;
}
.hero-status {
  position: absolute;
  bottom: 12px;
  left: 12px;
  right: 12px;
  text-align: center;
  font-size: 11px;
  color: #31553d;
  background: #ffffffe8;
  border-radius: 5px;
  padding: 3px;
}
.hero-controls {
  padding: 24px;
}
.hero-controls > p {
  margin: 12px 0;
  font-size: 12px;
}
.scene-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin: 18px 0;
}
.scene-actions button {
  padding: 9px;
  font-size: 12px;
}
.hero-bottom {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.hero-bottom button {
  font-size: 11px;
  padding: 7px 9px;
}
.hero-controls small {
  display: block;
  color: var(--muted);
  font-size: 10px;
  margin-top: 15px;
}
.catalog-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 36px;
}
.catalog-heading > span {
  color: var(--muted);
  font-size: 12px;
}
.filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 20px 0;
}
.filters button {
  border-radius: 22px;
  font-size: 12px;
  padding: 7px 14px;
}
.filters button[aria-pressed="true"] {
  background: var(--text);
  color: var(--surface);
  border-color: var(--text);
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 490px), 1fr));
  gap: 20px;
}
.card {
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  background: var(--surface);
  box-shadow: var(--shadow);
  min-width: 0;
}
.card.chosen {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
.card-media {
  position: relative;
  overflow: hidden;
  background: #e9efe5;
}
.card canvas {
  display: block;
  width: 100%;
  aspect-ratio: 16/9;
}
.stage-label {
  position: absolute;
  top: 12px;
  left: 12px;
  font-size: 10px;
  background: #ffffffe8;
  color: #536454;
  padding: 3px 9px;
  border-radius: 20px;
}
.expand {
  position: absolute;
  right: 10px;
  top: 10px;
  font-size: 11px;
  background: #ffffffed;
  color: #34533e;
  padding: 3px 9px;
  border-color: #cdd9ce;
}
.progress {
  height: 3px;
  background: var(--soft);
}
.progress i {
  display: block;
  height: 100%;
  width: 0;
  background: var(--accent);
}
.card-body {
  padding: 18px 20px;
}
.card-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.card h3 {
  font-size: 18px;
  font-weight: 650;
}
.card-number {
  color: var(--muted);
  font:
    italic 20px Georgia,
    serif;
}
.card-body p {
  font-size: 12px;
  margin-top: 7px;
  min-height: 20px;
}
.card-actions {
  display: flex;
  gap: 8px;
  margin-top: 15px;
}
.card-actions button {
  font-size: 12px;
  min-width: 100px;
}
.card-actions button:last-child {
  margin-left: auto;
}
.pick[aria-pressed="true"] {
  background: var(--tint);
  color: var(--accent);
  border-color: var(--accent);
}
.selection {
  position: sticky;
  bottom: 14px;
  z-index: 4;
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 15px 20px;
  background: var(--surface);
  border: 1px solid var(--accent);
  border-radius: 10px;
  box-shadow: 0 6px 30px #132b2420;
  margin-top: 28px;
}
.selection > div {
  flex: 1;
  min-width: 0;
}
.selection p {
  font-size: 11px;
  overflow-wrap: anywhere;
}
.selection button {
  white-space: nowrap;
  font-size: 12px;
}
.footer {
  font-size: 11px;
  margin-top: 24px;
}
dialog {
  width: min(800px, calc(100% - 24px));
  max-height: 90dvh;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  color: var(--text);
  padding: 24px;
}
dialog::backdrop {
  background: #11271f99;
  backdrop-filter: blur(4px);
}
.dialog-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
  margin-bottom: 18px;
}
dialog canvas {
  width: 100%;
  display: block;
  border-radius: 8px;
}
dialog p {
  font-size: 13px;
  margin: 12px 0;
}
.dialog-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
details {
  border-top: 1px solid var(--border);
  padding-top: 12px;
  margin-top: 20px;
  font-size: 12px;
}
summary {
  cursor: pointer;
  color: var(--muted);
}
input,
textarea {
  width: 100%;
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 12px;
}
input {
  margin: 8px 0;
}
textarea {
  height: 300px;
  resize: vertical;
  font-size: 12px;
  line-height: 1.8;
  margin-bottom: 12px;
}
[hidden] {
  display: none !important;
}
@media (max-width: 1100px) {
  .hero {
    grid-template-columns: 1fr;
  }
  .hero-controls h2 br {
    display: none;
  }
  .hero-controls {
    padding: 20px;
  }
  .scene-actions {
    grid-template-columns: repeat(4, 1fr);
  }
  .hero-controls > p {
    margin: 8px 0;
  }
  .cards {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr));
  }
}
@media (max-width: 650px) {
  main {
    padding: 20px 10px;
  }
  h1 {
    font-size: 26px;
  }
  h2 {
    font-size: 19px;
  }
  .page-heading {
    align-items: start;
    flex-direction: column;
    gap: 12px;
  }
  .page-heading p {
    font-size: 12px;
  }
  .hero-controls {
    padding: 14px;
  }
  .scene-actions {
    grid-template-columns: 1fr 1fr;
  }
  .hero-controls h2 {
    font-size: 17px;
  }
  .scene-tag {
    top: 7px;
    left: 7px;
    font-size: 8px;
    padding: 2px 5px;
  }
  .hero-status {
    font-size: 9px;
    bottom: 5px;
    left: 5px;
    right: 5px;
  }
  .catalog-heading {
    align-items: start;
    gap: 8px;
    flex-direction: column;
  }
  .filters {
    gap: 6px;
  }
  .filters button {
    padding: 6px 8px;
    font-size: 11px;
  }
  .card-body {
    padding: 12px;
  }
  .card h3 {
    font-size: 16px;
  }
  .card-actions button {
    min-width: 0;
    padding: 7px 10px;
  }
  .stage-label {
    font-size: 9px;
    top: 7px;
    left: 7px;
  }
  .expand {
    font-size: 10px;
    top: 7px;
    right: 7px;
  }
  .selection {
    flex-wrap: wrap;
    padding: 12px;
    gap: 8px;
    bottom: 6px;
  }
  .selection > div {
    flex-basis: 100%;
  }
  .selection #generate {
    margin-left: auto;
  }
  .selection #selected-label {
    max-height: 45px;
    overflow: auto;
  }
  .dialog-head h2 {
    font-size: 19px;
  }
  dialog {
    padding: 15px;
  }
  .footer {
    font-size: 10px;
  }
  .card-number {
    font-size: 15px;
  }
}
@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
}

.hero-status {
  position: static;
  margin: 0;
  padding: 5px 10px;
  border-radius: 0;
}
.hero-preview canvas {
  cursor: pointer;
}
`;
