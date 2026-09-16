export const consoleStyles = String.raw`
:root{color-scheme:dark;--bg:#202224;--top:#282b2d;--border:#414647;--text:#f2f4ef;--muted:#acb4af;--yellow:#f5d747;--accent:#f5d747;--green:#70d9b4;--red:#ff9c94;--soft:#303b36;--code:#191c1d}
:root[data-theme="light"]{color-scheme:light;--bg:#fff;--top:#f3f5f4;--border:#dce2de;--text:#252e29;--muted:#64716a;--accent:#76600b;--green:#176c50;--red:#b3352c;--soft:#edf4ef;--code:#f5f7f6}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.6 "PingFang SC","Microsoft YaHei",sans-serif;letter-spacing:0}
button,input,select{font:inherit;letter-spacing:0;max-width:100%}
button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:36px;padding:7px 12px;border:1px solid var(--border);border-radius:4px;background:var(--top);color:var(--text);cursor:pointer}
button:hover:not(:disabled){border-color:var(--muted);background:var(--soft)}
button:disabled{opacity:.5;cursor:not-allowed}
button.primary{background:var(--yellow);border-color:var(--yellow);color:#252820;font-weight:600}
.build-button{min-width:116px}
button.is-building:disabled{opacity:1;cursor:wait}
.build-badge{font-size:12px;white-space:nowrap}
.build-status{padding:14px 0;margin-bottom:14px;border-block:1px solid var(--border);min-height:60px}
.build-status-title{display:flex;align-items:center;gap:8px}
.build-stage{font-size:13px;overflow-wrap:anywhere}
.build-progress{height:6px;width:100%;overflow:hidden;background:var(--border);margin-top:12px}
.build-progress span{display:block;height:100%;background:var(--accent)}
.build-progress.indeterminate span{width:35%}
.build-progress-label{font-size:12px;margin-top:6px;text-align:right}
@keyframes build-spin{to{transform:rotate(360deg)}}
@keyframes build-travel{from{transform:translateX(-100%)}to{transform:translateX(386%)}}
@media(prefers-reduced-motion:no-preference){
.is-building .icon,.build-spinner{animation:build-spin 1.2s linear infinite}
.build-progress.indeterminate span{animation:build-travel 1.8s ease-in-out infinite}
.build-progress.determinate span{transition:width .25s ease}
}
button.danger{color:var(--red)}
button.icon-button{width:36px;flex-shrink:0;padding:8px}
button.link{background:none;border:0;padding:0;justify-content:flex-start;color:var(--text);text-align:left;min-width:0}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.icon{width:16px;height:16px;flex:none}
input,select{border:1px solid var(--border);border-radius:4px;padding:7px 10px;background:var(--bg);color:var(--text)}
input[type="checkbox"]{accent-color:var(--yellow);width:18px;height:18px}
.top{display:flex;justify-content:space-between;gap:20px;align-items:center;padding:18px 28px;background:var(--top);flex-wrap:wrap}
.brand{font-size:18px;font-weight:600;display:flex;gap:10px;align-items:center}
.mark{width:28px;height:28px;display:grid;place-items:center;color:#252820;background:var(--yellow);border-radius:4px}
.toolbar,.actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.toolbar select{max-width:380px;width:300px}
.theme{display:flex;gap:7px;align-items:center;font-size:12px;color:var(--muted);white-space:nowrap}
nav{padding:0 28px;display:flex;gap:26px;border-bottom:1px solid var(--border);background:var(--top)}
nav button{background:none;border:0;border-bottom:2px solid transparent;border-radius:0;padding:10px 0;color:var(--muted)}
nav button[aria-current="page"]{color:var(--accent);border-bottom-color:var(--yellow)}
.context,footer{padding:10px 28px;display:flex;gap:12px;justify-content:space-between;flex-wrap:wrap;font-size:12px;color:var(--muted)}
.context{border-bottom:1px solid var(--border)}
.context span{overflow-wrap:anywhere;min-width:0}
main{padding:26px 28px;max-width:1600px;margin:0 auto;min-height:65vh}
h1{font-size:24px;font-weight:500;margin:0;overflow-wrap:anywhere}
h2{font-size:16px;font-weight:600;margin:0 0 14px}
h3{font-size:14px;font-weight:600;margin:0 0 6px}
p{margin:8px 0}
.heading{display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap;margin-bottom:24px}
.heading p{margin:2px 0 0}
.muted,.path,time,dt{color:var(--muted)}
.path{font-size:12px;overflow-wrap:anywhere}
.good{color:var(--green)}.bad{color:var(--red)}.pending{color:var(--accent)}
.preview-link{display:inline-block;color:var(--accent);margin:8px 0;overflow-wrap:anywhere;text-underline-offset:3px}
.health-issue{padding:8px 0;border-bottom:1px solid var(--border)}
.health-issue p{margin:0}
.failure-banner{margin:12px 0;padding:12px 14px;border:1px solid var(--red);border-left:4px solid var(--red);background:var(--soft);overflow-wrap:anywhere}
.failure-banner strong{display:block}
.failure-detail{margin:8px 0 0;max-height:280px}
.metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));border-block:1px solid var(--border);margin-bottom:26px}
.lua-check-option{display:inline-flex;align-items:center;gap:8px;color:var(--muted);white-space:nowrap}
.lua-check-panel{margin-top:16px;padding-top:14px;border-top:1px solid var(--border)}
.metric{padding:14px 12px 14px 0;min-width:0}
.metric .value{font-size:19px;font-weight:500;overflow-wrap:anywhere;margin-top:3px}
.metric .muted{font-size:12px}
.runtime-detail{margin-top:3px;overflow-wrap:anywhere}
.runtime-metric button{margin-top:8px}
.columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:36px}
section{min-width:0}
dl{margin:0}
.row{display:flex;justify-content:space-between;gap:16px;padding:9px 0;border-bottom:1px solid var(--border);overflow-wrap:anywhere}
dt{flex-shrink:0}dd{margin:0;text-align:right;min-width:0}
code,pre{font:12px/1.65 "SFMono-Regular",Consolas,monospace;overflow-wrap:anywhere}
pre{white-space:pre-wrap;tab-size:2;margin:10px 0 0;background:var(--code);padding:14px;max-height:440px;overflow:auto;border:1px solid var(--border);border-radius:4px}
.feedback{margin:14px 28px 0;padding:10px 14px;border:1px solid var(--border);border-left:3px solid var(--red);overflow-wrap:anywhere;display:flex;gap:14px;justify-content:space-between;align-items:center}
.feedback p{margin:0;white-space:pre-wrap}
.feedback button{flex-shrink:0;white-space:nowrap}
.empty{padding:26px 0;color:var(--muted)}
.project-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;padding:18px 0;border-bottom:1px solid var(--border);align-items:center}
.project-row h2{margin-bottom:3px;overflow-wrap:anywhere}
.tag{color:var(--green);font-size:12px}
.entry{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;max-width:780px;padding-top:24px}
.entry label{grid-column:1/-1}
.task-history{margin-top:28px;border-top:1px solid var(--border);padding-top:20px}
.build-detail,.preview-log-detail{margin-top:28px;border-top:1px solid var(--border);padding-top:20px;width:100%}
.task{padding:12px 0;border-bottom:1px solid var(--border)}
summary{cursor:pointer;overflow-wrap:anywhere}
.task summary{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.task summary time{margin-left:auto;font-size:12px}
.task .task-meta{font-size:12px;margin-top:8px}
.status-line{min-height:48px;margin:0 0 15px;padding:12px 0;border-block:1px solid var(--border);overflow-wrap:anywhere}
.preview-controls{margin-top:14px}
.git-scroll{overflow:auto}
.git-history{position:relative;min-width:420px}
.git-graph{position:absolute;inset:0 auto auto 0;pointer-events:none}
.git-rows{position:relative}
.git-row{height:76px;display:grid;grid-template-columns:76px minmax(0,1fr) 175px;gap:12px;align-items:center;border-bottom:1px solid var(--border);padding-right:4px}
.git-row .subject{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.git-row code{color:var(--accent)}
.git-row time{font-size:12px;text-align:right}
.git-meta{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:16px}
.git-detail{margin-top:24px;border-top:1px solid var(--border);padding-top:20px}
.file-list{padding-left:22px;overflow-wrap:anywhere}
footer{border-top:1px solid var(--border);font-size:11px}
dialog{background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:24px;width:440px;max-width:calc(100% - 32px)}
dialog::backdrop{background:#0009}
dialog h2{font-size:18px}dialog .actions{justify-content:flex-end;margin-top:22px}
dialog p{white-space:pre-wrap;overflow-wrap:anywhere}
.plugin-tabs{display:contents}
nav{overflow-x:auto;white-space:nowrap}
.plugin-workspace{min-width:0}
.plugin-status{display:flex;align-items:center;flex-wrap:wrap;gap:12px;padding:12px 28px;border-bottom:1px solid var(--border)}
.plugin-status p{margin:0;overflow-wrap:anywhere}
.plugin-frame{display:block;width:100%;height:calc(100dvh - 205px);min-height:520px;border:0;background:var(--bg)}
[hidden]{display:none!important}
@media(max-width:720px){
.top,main{padding:18px 16px}nav{padding-inline:16px;gap:24px}.context,footer{padding-inline:16px}
.toolbar{width:100%}.toolbar select{flex:1;min-width:0;width:auto}.theme{margin-left:auto}
.columns{grid-template-columns:1fr;gap:28px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
.feedback{margin-inline:16px}button{min-height:42px}button.icon-button{width:42px}
.project-row{gap:10px}.project-row .actions{justify-content:flex-end}.entry{grid-template-columns:1fr}.entry input{font-size:16px}
.git-row{grid-template-columns:64px minmax(0,1fr);gap:8px;padding-block:8px}.git-row time{grid-column:2;text-align:left;font-size:11px}
.task summary time{margin-left:0;width:100%}h1{font-size:22px}
.plugin-status{padding:10px 16px}.plugin-frame{height:calc(100dvh - 235px);min-height:480px}
}
@media(prefers-reduced-motion:no-preference){button{transition:background .12s,border-color .12s}}
`;
