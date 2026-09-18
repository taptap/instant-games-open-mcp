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
button.preview-button{color:var(--yellow);font-weight:700}
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
.loading-spinner{display:inline-block;width:14px;height:14px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;flex:none}
.is-loading{cursor:wait!important}
@media(prefers-reduced-motion:no-preference){
.is-building .icon,.build-spinner,.loading-spinner{animation:build-spin 1.2s linear infinite}
.build-progress.indeterminate span{animation:build-travel 1.8s ease-in-out infinite}
.build-progress.determinate span{transition:width .25s ease}
}
button.danger{color:var(--red)}
.console-service-actions{display:flex;justify-content:flex-end;margin-top:24px;padding-top:16px;border-top:1px solid var(--border)}
button.console-shutdown{background:#702c32;color:#fff;border-color:#702c32}
button.console-shutdown:hover:not(:disabled){background:#87353d;border-color:#87353d}
#maker-version-picker{font-size:12px;font-weight:400;max-width:240px;min-width:100px;padding:5px 8px}
.brand{flex-wrap:wrap}
.footer-start{display:flex;align-items:center;gap:12px;flex-wrap:nowrap;min-width:0}
#fortune-corner{position:relative;flex:none}
button#fortune-toggle{border:0;background:none;color:#f5e6a3;font-size:12px;font-weight:600;padding:0;min-height:0;line-height:1.4;white-space:nowrap}
:root[data-theme="light"] button#fortune-toggle{color:#c4a017}
button#fortune-toggle:hover,button#fortune-toggle[aria-expanded="true"]{color:var(--yellow);background:none;border-color:transparent}
#fortune-panel{position:fixed;z-index:30;overflow:hidden;border:0;border-radius:6px;background:transparent;box-shadow:0 8px 28px #0005}
#fortune-panel.fortune-preload{opacity:0;pointer-events:none;left:0;top:0;width:1px;height:1px}
#fortune-panel[hidden]{display:none!important}
#fortune-panel iframe{display:block;width:100%;height:100%;border:0}
.document-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:18px}
.document-toolbar input{flex:1;min-width:160px;max-width:360px}
.document-toolbar [aria-selected="true"]{color:var(--accent);border-bottom:2px solid var(--accent)}
.document-layout{display:grid;grid-template-columns:260px minmax(0,1fr);border-top:1px solid var(--border);min-height:480px}
#document-directory{padding:12px 18px 20px 0;border-right:1px solid var(--border);max-height:75vh;overflow:auto}
#document-directory h3{font-size:12px;color:var(--muted);margin:18px 0 8px}
button.document-entry{display:block;width:100%;padding:7px 10px;overflow-wrap:anywhere;border-radius:0;font-size:13px}
button.document-entry[aria-current]{color:var(--accent);background:var(--soft);border-left:2px solid var(--accent)}
button.document-entry.document-featured{color:var(--accent);font-weight:700}
.document-intro{border-bottom:1px solid var(--border);padding-bottom:16px;margin-bottom:20px}
.document-intro p{margin:6px 0}.document-intro .actions{margin-top:12px}
.document-intro button.link{color:var(--green);text-decoration:underline}
.document-reader-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
.document-reader-header h2{font-size:22px;margin:0;min-width:0;flex:1}
.document-reader-header button{flex-shrink:0}
.document-reader-header input{width:100%}
#document-reader{min-width:0;padding:22px 28px;max-height:75vh;overflow:auto;overflow-wrap:anywhere}
#document-reader>h2{font-size:22px;margin-top:0}
.markdown-content{line-height:1.85;max-width:920px}
.markdown-content h1{font-size:24px}.markdown-content h2{font-size:20px}.markdown-content h3{font-size:17px}
.markdown-content pre{white-space:pre;overflow:auto;max-width:100%;max-height:none}
.markdown-content blockquote{border-left:3px solid var(--border);margin-left:0;padding-left:16px;color:var(--muted)}
.markdown-content a{color:var(--green);text-decoration:underline}
.doc-table{overflow:auto}.doc-table table{border-collapse:collapse;width:100%}
.doc-table th,.doc-table td{border:1px solid var(--border);padding:8px;text-align:left}
@media(max-width:700px){.document-layout{grid-template-columns:minmax(0,1fr)}#document-directory{max-height:220px;border-right:0;border-bottom:1px solid var(--border);padding-right:0}#document-reader{padding:18px 0;max-height:none}}
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
#heading-actions{display:flex;flex-direction:column;align-items:flex-end;gap:10px;max-width:100%}
.heading-primary,.heading-secondary{justify-content:flex-end;max-width:100%}
.heading-secondary{font-size:12px;gap:14px}
.qrcode-image{display:block;width:240px;max-width:100%;height:auto;margin:14px 0}
#qrcode-result{width:496px;max-height:calc(100dvh - 32px);overflow:auto}
.qrcode-scan-area{width:min(400px,100%,55dvh);aspect-ratio:1;margin:16px auto;background:#fff;display:grid;place-items:center;padding:12px}
#qrcode-result-image{display:block;width:100%;height:100%;object-fit:contain}
#qrcode-result .actions{flex-wrap:wrap}
.qrcode-text{white-space:pre-wrap;overflow-wrap:anywhere}
#selection-options{width:100%;min-width:0;margin:12px 0}
#qrcode-confirm label{display:flex;flex-direction:column;gap:8px;margin:16px 0}
#qrcode-confirm label[hidden]{display:none}
#qrcode-confirm input,#qrcode-confirm select{width:100%;min-width:0}
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
.feedback[data-tone="warning"]{border-left-color:var(--yellow)}
.feedback[data-tone="success"]{border-left-color:var(--green)}
.console-logs{width:100%;min-width:0;margin-top:24px;border-top:1px solid var(--border);padding-top:16px}
.console-log-toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-bottom:10px}
.console-log-toolbar [aria-selected="true"]{color:var(--accent);border-bottom:2px solid var(--accent)}
.console-logs .console-log-output{height:360px;max-height:60vh;width:100%;max-width:100%;overflow:auto;white-space:pre;overflow-wrap:normal;word-break:normal;margin:0}
.console-logs .console-log-output.wrap{white-space:pre-wrap;overflow-wrap:anywhere}
.console-log-output .log-line{color:var(--text)}
.console-log-output .log-error{color:var(--red)}
.console-log-output .log-warning{color:var(--yellow)}
button.link.bad{color:var(--red)}button.link.good{color:var(--green)}button.link.pending{color:var(--accent)}
.preview-status-summary{display:flex;flex-wrap:wrap;align-items:center;gap:8px 20px;padding:12px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border)}
.preview-status-summary span{font-weight:600}
.preview-window-settings{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:20px 0;padding:0 0 20px;border-bottom:1px solid var(--border)}
.preview-window-title{grid-column:1/-1;margin:0 0 4px;font-size:17px;padding-left:10px;border-left:3px solid var(--accent)}
.preview-window-settings label{display:flex;flex-direction:column;gap:6px;min-width:0}
.preview-window-settings input,.preview-window-settings select{width:100%;min-width:0;box-sizing:border-box}
.preview-window-footer{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
.preview-window-settings p{grid-column:1/-1;margin:0}
@media(max-width:520px){.preview-window-settings{grid-template-columns:1fr}}
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
footer{border-top:1px solid var(--border);font-size:11px;align-items:center}
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
