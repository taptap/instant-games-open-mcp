export const architectureStyles = String.raw`
:root {
  color-scheme: light;
  --bg: #f5f7f4;
  --panel: #fff;
  --text: #243b34;
  --muted: #687c72;
  --line: #dce5dd;
  --accent: #007d70;
  --soft: #e7f3ec;
  --warm: #ae7b35;
  --node: #f5faf7;
  --wire: #8cae9b;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font:
    14px/1.6 "PingFang SC",
    "Microsoft YaHei",
    sans-serif;
}
body.dark {
  color-scheme: dark;
  --bg: #151d1a;
  --panel: #202a25;
  --text: #e1ece5;
  --muted: #a2b5a9;
  --line: #3c4a41;
  --accent: #7bd1b3;
  --soft: #2a4335;
  --warm: #dfb97b;
  --node: #243b2f;
  --wire: #6e9982;
}
button,
input,
select {
  font: inherit;
}
button,
.button {
  border: 1px solid var(--line);
  background: var(--panel);
  color: var(--text);
  border-radius: 7px;
  padding: 8px 12px;
  cursor: pointer;
}
button:hover {
  background: var(--soft);
  border-color: var(--accent);
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
button:focus-visible,
a:focus-visible,
input:focus-visible,
summary:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 3px;
}
a {
  color: var(--accent);
  text-decoration: none;
}
header {
  min-height: 66px;
  display: flex;
  align-items: center;
  gap: 22px;
  padding: 12px 25px;
  border-bottom: 1px solid var(--line);
  background: var(--panel);
}
.brand {
  color: var(--text);
  font-size: 23px;
  font-weight: 700;
}
.brand span {
  font-size: 15px;
  margin-left: 12px;
  font-weight: 550;
}
.snapshot-tag {
  font-size: 11px;
  color: var(--muted);
}
header > a:nth-last-child(2) {
  margin-left: auto;
  font-size: 12px;
}
header button {
  font-size: 12px;
}
.workspace {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
}
.projects {
  background: var(--panel);
  border-right: 1px solid var(--line);
  height: calc(100dvh - 66px);
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.side-head {
  padding: 20px 16px 12px;
}
.side-head small {
  color: var(--muted);
}
.side-head strong {
  float: right;
  font:
    22px Georgia,
    serif;
  color: var(--accent);
}
input {
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--bg);
  color: var(--text);
  padding: 10px;
  min-width: 0;
  max-width: 100%;
}
#search {
  display: block;
  width: 100%;
  margin-top: 12px;
  font-size: 12px;
}
.check {
  font-size: 11px;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 10px;
}
.check input {
  accent-color: var(--accent);
}
#project-list {
  overflow: auto;
  flex: 1;
  padding: 0 8px 15px;
}
#project-list button {
  display: block;
  width: 100%;
  border: 1px solid transparent;
  text-align: left;
  background: none;
  margin: 4px 0;
  padding: 10px 9px;
}
#project-list button strong {
  display: block;
  font-size: 12px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
#project-list button small {
  font-size: 10px;
  color: var(--muted);
}
#project-list button[aria-current="true"] {
  border-color: var(--line);
  background: var(--soft);
}
#project-list button[aria-current="true"] strong {
  color: var(--accent);
}
.coverage-button {
  font-size: 11px;
  margin: 8px 12px 15px;
}
main {
  padding: 32px;
  min-width: 0;
  max-width: 1500px;
  width: 100%;
  margin: 0 auto;
}
h1,
h2,
h3,
p {
  margin: 0;
}
h1 {
  font-size: 29px;
  letter-spacing: -0.5px;
  line-height: 1.4;
  margin-bottom: 12px;
}
h2 {
  font-size: 21px;
  line-height: 1.4;
}
h3 {
  font-size: 15px;
}
p {
  color: var(--muted);
}
.eyebrow {
  color: var(--accent);
  font-size: 11px;
  letter-spacing: 1px;
  margin-bottom: 10px;
}
.intro {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 24px;
}
.intro > div {
  max-width: 840px;
  min-width: 0;
}
.intro > button {
  white-space: nowrap;
  font-size: 11px;
}
.intro #summary {
  font-size: 14px;
  line-height: 1.9;
}
#identity {
  font-size: 11px;
  margin-top: 12px;
  color: var(--muted);
  overflow-wrap: anywhere;
}
.badge {
  display: inline-block;
  padding: 3px 9px;
  background: var(--soft);
  color: var(--accent);
  border-radius: 20px;
  font-size: 10px;
  white-space: nowrap;
}
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin: 25px 0 16px;
}
.stat {
  padding: 14px 18px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 9px;
}
.stat b {
  font:
    29px Georgia,
    serif;
  display: block;
}
.stat span {
  font-size: 11px;
  color: var(--muted);
}
.insight {
  display: flex;
  gap: 16px;
  border-left: 3px solid var(--accent);
  padding: 10px 14px;
  background: var(--soft);
  font-size: 12px;
}
.insight span {
  color: var(--accent);
  white-space: nowrap;
  font-weight: 650;
}
#structure {
  margin-top: 25px;
}
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 18px;
}
.section-head p {
  font-size: 12px;
  margin-top: 6px;
}
.section-head > button {
  font-size: 11px;
  white-space: nowrap;
}
.graph-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 18px;
}
.map {
  position: relative;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 32px 20px;
  background-color: var(--panel);
  background-image: radial-gradient(var(--line) 0.7px, transparent 0.7px);
  background-size: 17px 17px;
  overflow: hidden;
}
.nodes {
  display: flex;
  flex-direction: column;
  gap: 56px;
  position: relative;
  z-index: 1;
}
.layer {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 20px;
}
.module {
  min-width: 0;
  text-align: left;
  padding: 16px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 9px;
  min-height: 96px;
  max-width: 100%;
  position: relative;
  box-shadow: 0 5px 12px #243b3406;
  transition: opacity 0.15s;
}
.module b {
  display: block;
  font-size: 15px;
  margin: 7px 0 4px;
}
.module p {
  font-size: 11px;
  line-height: 1.6;
}
.module small {
  font-size: 10px;
  color: var(--muted);
  display: block;
  margin-top: 12px;
}
.module .number {
  font:
    italic 17px Georgia,
    serif;
  color: var(--accent);
}
.module[aria-pressed="true"] {
  border: 2px solid var(--accent);
  background: var(--node);
  padding: 15px;
}
.module.dim {
  color: var(--muted);
}
.module.dim > * {
  opacity: 0.7;
}
.module.linked {
  border-color: var(--wire);
}
#wires {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
  overflow: visible;
}
.wire {
  fill: none;
  stroke: var(--wire);
  stroke-width: 1.5;
}
.wire.main {
  stroke: var(--accent);
  stroke-width: 2;
}
.wire.dashed {
  stroke-dasharray: 5 4;
}
.module::after{content:"";position:absolute;inset:-3px;border:1px solid var(--accent);border-radius:inherit;pointer-events:none;opacity:0}
@media(prefers-reduced-motion:no-preference){
  .module[aria-pressed="true"]::after,.module.linked::after,.architecture-compact .module::after{animation:architecture-halo 3.2s ease-in-out infinite}
}
@keyframes architecture-halo{0%,100%{opacity:.2;box-shadow:0 0 4px color-mix(in srgb,var(--accent) 15%,transparent)}50%{opacity:.75;box-shadow:0 0 16px color-mix(in srgb,var(--accent) 35%,transparent)}}
.architecture-motion-paused .module::after{animation-play-state:paused}
@media(prefers-reduced-motion:reduce){.wire-flow{display:none}}
.legend {
  display: flex;
  gap: 13px;
  flex-wrap: wrap;
  margin: 12px 0;
  font-size: 10px;
  color: var(--muted);
}
.relationships {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
}
.relationships button {
  font-size: 10px;
  padding: 5px 8px;
  text-align: left;
}
.inspector {
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--panel);
  min-width: 0;
  align-self: start;
  max-height: 720px;
  overflow: auto;
}
.inspector p {
  font-size: 12px;
  margin: 8px 0;
}
.file-item {
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
  font-size: 11px;
  overflow-wrap: anywhere;
}
.file-item b {
  font-weight: 550;
}
.file-item small {
  display: block;
  color: var(--muted);
}
.file-item button {
  font-size: 10px;
  padding: 3px 7px;
  margin-top: 5px;
}
.inspector h4 {
  margin: 20px 0 3px;
  font-size: 12px;
}
.source {
  font:
    11px/1.6 ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
  overflow-wrap: anywhere;
  color: var(--muted);
}
.entry-box {
  margin-top: 24px;
  padding: 18px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 9px;
}
.entry-box h3 {
  margin-bottom: 10px;
}
.entry {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 7px 0;
  flex-wrap: wrap;
  font-size: 12px;
}
.entry code {
  font-size: 11px;
  color: var(--accent);
}
.entry .source {
  flex: 1;
}
.source-edge {
  font-size: 11px;
  padding: 9px 0;
  border-bottom: 1px solid var(--line);
}
.source-edge small {
  display: block;
  color: var(--muted);
}
details {
  margin-top: 16px;
  min-width: 0;
}
summary {
  cursor: pointer;
}
details p {
  margin-top: 12px;
  font-size: 12px;
}
#evidence-summary {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.8;
}
.lead {
  font-size: 14px;
  line-height: 1.9;
  max-width: 850px;
  margin: 16px 0 25px;
}
.proposal-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.proposal-grid article {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 22px;
}
.proposal-grid b {
  font-size: 11px;
  color: var(--accent);
}
.proposal-grid h3 {
  margin: 14px 0;
  font-size: 19px;
}
.proposal-grid p {
  font-size: 12px;
  line-height: 1.9;
}
.proposal-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 25px;
  margin-top: 28px;
}
.proposal-columns li {
  font-size: 12px;
  color: var(--muted);
  margin: 9px 0;
}
ul {
  padding-left: 19px;
}
footer {
  border-top: 1px solid var(--line);
  margin-top: 35px;
  padding-top: 16px;
  color: var(--muted);
  font-size: 10px;
}
dialog {
  width: min(800px, calc(100% - 24px));
  max-height: 88dvh;
  overflow: auto;
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--panel);
  color: var(--text);
}
dialog::backdrop {
  background: #152e24a8;
  backdrop-filter: blur(4px);
}
.dialog-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
  margin-bottom: 20px;
}
#coverage-content p {
  margin: 12px 0;
  font-size: 12px;
}
#coverage-content h3 {
  margin: 25px 0 10px;
}
.unavailable {
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
}
.unavailable strong {
  font-size: 12px;
}
.unavailable small {
  font-size: 11px;
  display: block;
  color: var(--muted);
  overflow-wrap: anywhere;
}
#toast {
  position: fixed;
  bottom: 22px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--text);
  color: var(--panel);
  padding: 10px 18px;
  border-radius: 8px;
  z-index: 20;
  font-size: 12px;
  max-width: 90%;
  display: none;
}
#toast.show {
  display: block;
}
.empty {
  padding: 25px 12px;
  color: var(--muted);
  font-size: 12px;
}
[hidden] {
  display: none !important;
}
@media (min-width: 1500px) {
  .nodes {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 1100px) {
  .workspace {
    grid-template-columns: 205px minmax(0, 1fr);
  }
  main {
    padding: 25px 22px;
  }
  .graph-layout {
    grid-template-columns: 1fr;
  }
  .inspector {
    max-height: 450px;
  }
  .intro {
    flex-direction: column;
    gap: 12px;
  }
  .proposal-grid {
    grid-template-columns: 1fr;
  }
  .stats {
    gap: 8px;
  }
  .stat {
    padding: 12px;
  }
  .stat b {
    font-size: 24px;
  }
  .snapshot-tag {
    display: none;
  }
}
@media (max-width: 650px) {
  header {
    padding: 12px;
    gap: 10px;
    flex-wrap: wrap;
  }
  .brand {
    font-size: 19px;
  }
  .brand span {
    font-size: 12px;
    margin-left: 6px;
  }
  header > a:nth-last-child(2) {
    font-size: 10px;
  }
  .workspace {
    display: block;
  }
  .projects {
    position: static;
    height: auto;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
  .side-head {
    padding: 12px;
  }
  .side-head > small,
  .side-head > strong {
    display: none;
  }
  #search {
    margin: 0;
  }
  #project-list {
    display: flex;
    overflow: auto;
    gap: 6px;
    max-height: 148px;
    padding: 0 12px 8px;
  }
  #project-list button {
    width: 145px;
    min-width: 145px;
    margin: 0;
  }
  #project-list button strong {
    font-size: 11px;
  }
  #project-list button small {
    font-size: 9px;
  }
  .coverage-button {
    margin: 0 12px 12px;
    width: calc(100% - 24px);
  }
  main {
    padding: 20px 12px;
  }
  h1 {
    font-size: 24px;
  }
  .stats {
    grid-template-columns: 1fr 1fr;
    margin-top: 18px;
  }
  .intro #summary {
    font-size: 12px;
  }
  .insight {
    flex-direction: column;
    gap: 5px;
  }
  .section-head {
    align-items: start;
    flex-wrap: wrap;
  }
  h2 {
    font-size: 19px;
  }
  .map {
    padding: 22px 15px;
  }
  .nodes {
    grid-template-columns: 1fr;
    gap: 38px;
  }
  .module {
    min-height: 105px;
  }
  .module p {
    font-size: 12px;
  }
  .graph-layout {
    gap: 15px;
  }
  .proposal-columns {
    grid-template-columns: 1fr;
  }
  .entry {
    gap: 6px;
  }
  .entry .source {
    flex-basis: 100%;
  }
  .proposal-columns {
    gap: 12px;
  }
  .inspector {
    max-height: 500px;
  }
  .legend {
    font-size: 9px;
  }
  .snapshot-tag {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  * {
    scroll-behavior: auto !important;
    transition: none !important;
  }
}

.workspace{display:block} main{max-width:none;padding:12px}body{padding:12px}[hidden]{display:none!important}.section-head{flex-wrap:wrap}
body.architecture-compact{padding:0;background:var(--panel)}
.architecture-compact main{padding:0}
.architecture-compact>.section-head:has(#load-status[hidden]){display:none}
.architecture-compact .intro,.architecture-compact .stats,.architecture-compact .insight,.architecture-compact #structure>.section-head,.architecture-compact .inspector,.architecture-compact .entry-box,.architecture-compact .legend,.architecture-compact .relationships,.architecture-compact footer{display:none}
.architecture-compact .graph-layout{display:block}
.architecture-compact .map{border:0;border-radius:0;min-height:100dvh;padding:40px 24px 56px;display:grid;align-items:center}
html:has(body.architecture-compact),.architecture-compact{overflow:hidden}
.architecture-compact .map{min-height:0}
@media(max-width:600px){.architecture-compact .map{padding:24px 12px 48px}}
`;
