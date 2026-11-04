import { consoleThemeStyles } from '../webTheme.js';
import { architecturePreviewStyles } from './architecturePreview.js';

export const consoleStyles = String.raw`
${consoleThemeStyles}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.6 "PingFang SC","Microsoft YaHei",sans-serif;letter-spacing:0}
button,input,select{font:inherit;letter-spacing:0;max-width:100%}
button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:36px;padding:7px 12px;border:1px solid var(--border);border-radius:4px;background:var(--top);color:var(--text);cursor:pointer}
button:hover:not(:disabled){border-color:var(--muted);background:var(--soft)}
button:disabled{opacity:.5;cursor:not-allowed}
button.primary{background:var(--primary);border-color:var(--primary);color:var(--on-primary);font-weight:600}
button.preview-button{color:var(--accent);font-weight:700;border-color:var(--accent);background:var(--soft)}
.build-button{min-width:88px}
button.is-building:disabled{opacity:1;cursor:wait}
.build-badge{font-size:12px;white-space:nowrap}
.build-status{padding:0;margin-bottom:16px;min-height:32px}
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
.console-service-actions{display:flex;justify-content:flex-end;margin-top:24px;padding-top:16px}
button.console-shutdown{background:#332525;color:#d3908e;border-color:#65413f;font-size:12px}
button.console-shutdown:hover:not(:disabled){background:#87353d;border-color:#87353d}
#maker-version-picker{font-size:12px;font-weight:400;max-width:240px;min-width:100px;padding:5px 8px}
.brand{flex-wrap:wrap}
.footer-start{display:flex;align-items:center;gap:18px;flex-wrap:wrap;min-width:0}
#fortune-corner{position:relative;flex:none}
button#fortune-toggle{border:0;background:none;color:var(--muted);font-size:11px;font-weight:400;padding:0;min-height:0;line-height:1.4;white-space:nowrap}
button#fortune-toggle:hover,button#fortune-toggle[aria-expanded="true"]{color:var(--accent);background:none;border-color:transparent}
#fortune-panel{position:fixed;z-index:30;overflow:hidden;border:0;border-radius:6px;background:transparent;box-shadow:0 8px 28px #0005}
#fortune-panel[hidden]{display:none!important}
#fortune-panel.fortune-preload{opacity:0;pointer-events:none;left:0;top:0;width:1px;height:1px}
#fortune-panel iframe{display:block;width:100%;height:100%;border:0}
.document-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:18px}
.document-toolbar input{flex:1;min-width:160px;max-width:360px}
.document-tabs{border:1px solid var(--border);border-radius:5px;padding:3px;gap:3px}
.document-tabs button{border:0;background:transparent;color:var(--muted);font-size:13px;min-height:30px;padding:4px 12px}
.document-toolbar [aria-selected="true"]{color:var(--accent);background:var(--soft)}
.document-layout{display:grid;grid-template-columns:235px minmax(0,1fr);border-top:1px solid var(--border);height:calc(100dvh - 260px);min-height:460px}
#document-directory{padding:12px 18px 20px 0;border-right:1px solid var(--border);overflow:auto}
#document-directory h3{font-size:12px;color:var(--muted);margin:18px 0 8px}
button.document-entry{display:block;width:100%;padding:7px 10px;overflow-wrap:anywhere;border-radius:4px;font-size:13px}
button.document-entry[aria-current]{color:var(--accent);background:var(--soft);border-left:2px solid var(--accent)}
button.document-entry.document-featured{color:var(--accent);font-weight:700}
.document-intro{border-bottom:1px solid var(--border);padding-bottom:16px;margin-bottom:20px}
.document-intro p{margin:6px 0}.document-intro .actions{margin-top:12px}
.document-intro button.link{color:var(--green);text-decoration:underline}
.document-reader-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
.document-reader-header h2{font-size:22px;margin:0;min-width:0;flex:1}
.document-reader-header button{flex-shrink:0}
.document-reader-header input{width:100%}
#document-reader{min-width:0;padding:22px 32px;overflow:auto;overflow-wrap:anywhere}
#document-reader>h2{font-size:22px;margin-top:0}
.markdown-content{line-height:1.85;max-width:920px}
.markdown-content h1{font-size:24px}.markdown-content h2{font-size:20px}.markdown-content h3{font-size:17px}
.markdown-content pre{white-space:pre;overflow:auto;max-width:100%;max-height:none}
.markdown-content blockquote{border-left:3px solid var(--border);margin-left:0;padding-left:16px;color:var(--muted)}
.markdown-content a{color:var(--green);text-decoration:underline}
.doc-table{overflow:auto}.doc-table table{border-collapse:collapse;width:100%}
.doc-table th,.doc-table td{border:1px solid var(--border);padding:8px;text-align:left}
@media(max-width:700px){.document-layout{grid-template-columns:minmax(0,1fr);height:auto}#document-directory{max-height:220px;border-right:0;border-bottom:1px solid var(--border);padding-right:0}#document-reader{padding:18px 0;max-height:none}}
button.icon-button{width:36px;flex-shrink:0;padding:8px}
button.link{background:none;border:0;padding:0;justify-content:flex-start;color:var(--text);text-align:left;min-width:0}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.icon{width:16px;height:16px;flex:none}
input,select{border:1px solid var(--border);border-radius:4px;padding:7px 10px;background:var(--bg);color:var(--text)}
input[type="checkbox"]{accent-color:var(--primary);width:14px;height:14px}
.top{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:10px 32px;background:var(--top);flex-wrap:wrap}
.brand{font-size:18px;font-weight:600;display:flex;gap:10px;align-items:center}
.mark{width:28px;height:28px;display:grid;place-items:center;color:var(--on-primary);background:var(--primary);border:0;border-radius:4px;padding:0;overflow:hidden;font:inherit;font-weight:800;cursor:pointer;transition:transform .2s ease,background .2s ease}
.mark img{display:block;width:100%;height:100%;object-fit:cover;pointer-events:none}
.mark:active{transform:scale(.94)}
.mark.maker-easter-egg{position:relative;animation:maker-mark-reveal 1.5s ease both}
@keyframes maker-mark-reveal{0%{transform:scale(.9);opacity:.35}55%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
@media(prefers-reduced-motion:reduce){.mark,.mark.maker-easter-egg{animation:none;transition:none}}
.toolbar,.actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.toolbar select{max-width:380px;width:235px}
.theme{display:flex;gap:7px;align-items:center;font-size:12px;color:var(--muted);white-space:nowrap}
.navigation{display:flex;align-items:center;gap:24px;padding:0 32px;border-bottom:1px solid var(--border);background:var(--top)}
nav{display:flex;gap:26px;min-width:0;flex:1;background:var(--top)}
nav button{background:none;border:0;border-bottom:2px solid transparent;border-radius:0;padding:8px 0;color:var(--muted)}
nav button[aria-current="page"]{color:var(--accent);border-bottom-color:var(--primary)}
.context,footer{padding:10px 32px;display:flex;gap:18px;justify-content:space-between;flex-wrap:wrap;font-size:12px;color:var(--muted)}
.navigation .context{padding:0;justify-content:flex-end;font-size:12px;flex-shrink:0;max-width:40%}
#connection.good:before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--green);margin-right:7px}
.context span{overflow-wrap:anywhere;min-width:0}
main{padding:28px 32px;max-width:1480px;margin:0 auto;min-height:calc(100dvh - 180px)}
h1{font-size:23px;font-weight:600;margin:0;overflow-wrap:anywhere}
h2{font-size:16px;font-weight:600;margin:0 0 14px}
h3{font-size:14px;font-weight:600;margin:0 0 6px}
p{margin:8px 0}
.heading{display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap;margin-bottom:24px}
.heading p{margin:2px 0 0}
#heading-actions{display:flex;flex-direction:column;align-items:flex-end;gap:10px;max-width:100%}
.heading-primary,.heading-secondary{justify-content:flex-end;max-width:100%}
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
.lua-check-panel{font-size:12px}
.lua-check-actions{gap:12px;min-height:36px}
.lua-check-actions>button:last-child{margin-left:auto;color:var(--muted)}
.lsp-status{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:12px;min-height:36px}
.lsp-status>button{color:var(--muted)}
.metric{padding:20px 12px 20px 0;min-width:0}
.metric .value{font-size:18px;font-weight:600;overflow-wrap:anywhere;margin-top:6px}
.metric .muted{font-size:12px}
.runtime-detail{margin-top:3px;overflow-wrap:anywhere}
.runtime-metric button{margin-top:8px}
.columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:36px}
.context-check{margin-top:28px;padding:24px 0;border-block:1px solid var(--border);font-size:13px;overflow-wrap:anywhere}
.context-check-head{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.context-check-head h2{margin:0}.context-check-head p{margin:8px 0 0}
.context-check-actions{flex-wrap:wrap;min-width:0}
.context-check-status{display:grid;gap:10px;margin-top:16px}.context-check-status p{margin:0;line-height:1.6}
.context-error{color:var(--red)}
.context-note{font-size:12px;line-height:1.7;margin:12px 0 0}
.context-check>details{margin-top:16px}.context-check summary{cursor:pointer;padding:6px 0}
.context-group{border-top:1px solid var(--border);margin-top:12px;padding-top:8px}
.context-source{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:16px;padding:14px 0;border-bottom:1px solid var(--border)}
.context-source .muted{font-size:12px;margin-top:4px}.context-source .actions{flex-wrap:wrap;justify-content:flex-end}
.context-finding{margin:14px 0;padding-left:14px;border-left:2px solid var(--border)}.context-finding p{margin:6px 0}
@media(max-width:520px){.context-check-actions{width:100%}.context-source{grid-template-columns:minmax(0,1fr)}.context-source .actions{justify-content:flex-start}}
.build-columns{padding:22px 0;border-block:1px solid var(--border)}
.build-columns>section+section{padding-left:36px;border-left:1px solid var(--border)}
section{min-width:0}
dl{margin:0}
.row{display:flex;justify-content:space-between;gap:16px;padding:9px 0;border-bottom:1px solid var(--border);overflow-wrap:anywhere}
dt{flex-shrink:0}dd{margin:0;text-align:right;min-width:0}
code,pre{font:12px/1.65 "SFMono-Regular",Consolas,monospace;overflow-wrap:anywhere}
pre{white-space:pre-wrap;tab-size:2;margin:10px 0 0;background:var(--code);padding:14px;max-height:440px;overflow:auto;border:1px solid var(--border);border-radius:4px}
.feedback{margin:14px 28px 0;padding:10px 14px;border:1px solid var(--border);border-left:3px solid var(--red);overflow-wrap:anywhere;display:flex;gap:14px;justify-content:space-between;align-items:center}
.feedback p{margin:0;white-space:pre-wrap}
.feedback[data-tone="warning"]{border-left-color:var(--warning)}
.feedback[data-tone="success"]{border-left-color:var(--green)}
.console-logs{width:100%;min-width:0;margin-top:24px}
.console-log-toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-bottom:10px}
.console-log-toolbar h2{margin:0}
.console-log-tabs{display:flex;gap:22px;padding:0 16px;background:var(--top);border:1px solid var(--border);border-radius:4px 4px 0 0;overflow:auto}
.console-log-tabs button{border:0;border-bottom:2px solid transparent;background:none;border-radius:0;font-size:12px;color:var(--muted);padding:10px 0;flex-shrink:0}
.console-log-tabs [aria-selected="true"]{color:var(--accent);border-bottom-color:var(--accent)}
.console-log-filters{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px;background:var(--top);border:1px solid var(--border);border-top:0}
.console-log-filters .log-filter{display:inline-flex;align-items:center;gap:8px;min-height:32px;padding:4px 10px;font-size:12px;border-radius:3px;color:var(--muted);background:transparent}
.console-log-filters .log-filter[aria-pressed="true"]{color:var(--text);background:var(--soft);border-color:var(--muted)}
.console-log-filters .log-filter[aria-pressed="false"]{opacity:.6}
.console-log-filters .log-filter-warning[aria-pressed="true"]{color:var(--warning)}
.console-log-filters .log-filter-error[aria-pressed="true"]{color:var(--red)}
:root[data-theme="light"] .console-log-filters .log-filter-warning[aria-pressed="true"]{color:var(--warning)}
.log-count{font-variant-numeric:tabular-nums;min-width:2ch;text-align:right}
.console-logs .console-log-output{height:360px;max-height:60vh;width:100%;max-width:100%;overflow:auto;white-space:pre;overflow-wrap:normal;word-break:normal;margin:0;border-top:0;border-radius:0 0 4px 4px;line-height:1.9}
.console-logs .console-log-output.wrap{white-space:pre-wrap;overflow-wrap:anywhere}
.console-logs .log-line{color:var(--text)}
.console-logs .log-error{color:var(--red)}
.console-logs .log-warning{color:var(--warning)}
.validation-panel{border:1px solid var(--border);border-top:0;padding:12px 16px;min-width:0;height:640px;max-height:70vh;overflow:auto;overflow-anchor:none}
.validation-history,.validation-status{display:flex;align-items:center;flex-wrap:wrap;gap:12px}
.validation-history{justify-content:space-between}
.validation-round{padding:18px 0;border-bottom:1px solid var(--border);min-width:0}
.validation-round:last-child{border-bottom:0}
.validation-time{font-size:12px;font-variant-numeric:tabular-nums;color:var(--muted)}
.validation-status{margin:6px 0;font-size:12px;overflow-wrap:anywhere}
.validation-panel p{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0}
.validation-feed{display:grid;gap:8px;margin-top:10px;min-width:0}
.validation-evidence{border:1px solid var(--border);border-radius:4px;background:var(--top);padding:8px 12px;min-width:0;max-width:100%}
.validation-evidence summary{cursor:pointer}
.validation-evidence h3,.validation-evidence-title{font-size:12px;font-weight:600;margin:0;line-height:1.8}
.validation-preview{display:block;font:12px/1.65 "SFMono-Regular",Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;margin-top:5px;max-height:4.95em;overflow:hidden;color:var(--muted)}
.validation-evidence[open] .validation-preview{display:none}
.validation-evidence-body{min-width:0}
.validation-evidence-body .validation-log{margin:8px 0 0;max-height:280px;white-space:pre;overflow-wrap:normal;word-break:normal}
.validation-evidence-body .validation-log.wrap{white-space:pre-wrap;overflow-wrap:anywhere}
.validation-screenshot{display:block;width:auto;height:auto;max-width:min(240px,100%);max-height:150px;object-fit:contain;margin:8px 0 0;background:var(--code)}
button.link.bad{color:var(--red)}button.link.good{color:var(--green)}button.link.pending{color:var(--accent)}
.preview-status-summary{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;min-height:32px;font-size:13px}
.preview-status-summary button{margin-left:auto}
.preview-window-disclosure{margin-top:12px;font-size:12px}
.preview-window-summary{display:flex;align-items:center;gap:10px;min-height:36px;flex-wrap:wrap;list-style:none}
.preview-window-summary::-webkit-details-marker{display:none}
.preview-window-summary>span:nth-child(2){margin-left:auto}
.preview-window-summary:after{content:"⌄";color:var(--muted)}
.preview-window-disclosure[open]>.preview-window-summary:after{content:"⌃"}
.preview-window-settings{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:12px 0 0;padding:14px 0 0;border-top:1px solid var(--border)}
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
.task-item{display:flex;align-items:flex-start;gap:16px;border-bottom:1px solid var(--border);padding:13px 0}
.task{flex:1;min-width:0}
.task-shortcuts{flex-shrink:0;max-width:40%;justify-content:flex-end}
.task-shortcuts:empty{display:none}
.section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
.section-heading h2{margin:0}.section-heading span{font-size:12px}
summary{cursor:pointer;overflow-wrap:anywhere}
.task summary{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;min-height:36px;padding:6px 0;font-size:13px}
.task summary:before{content:"›";color:var(--muted)}
.task[open]>summary:before{content:"⌄"}
.task summary time{margin-left:auto;font-size:12px}
.task .task-meta{font-size:12px;margin-top:8px}
.status-line{min-height:48px;margin:0 0 15px;padding:12px 0;border-block:1px solid var(--border);overflow-wrap:anywhere}
.preview-controls{margin-top:14px}
#preview-panel>.preview-controls{margin-top:12px;min-height:36px}
#preview-panel>.preview-controls>.link:last-child{margin-left:auto;color:var(--muted);font-size:12px}
#preview-panel>details:not(.preview-window-disclosure){margin-top:8px;font-size:12px;color:var(--muted)}
.git-scroll{overflow:auto}
.git-history{position:relative;min-width:420px}
.git-graph{position:absolute;inset:0 auto auto 0;pointer-events:none}
.git-rows{position:relative}
.git-row{height:76px;display:grid;grid-template-columns:76px minmax(0,1fr) 175px;gap:12px;align-items:center;border-bottom:1px solid var(--border);padding-right:4px}
.git-row .subject{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.git-row code{color:var(--accent)}
.git-row time{font-size:12px;text-align:right}
.git-meta{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:16px}
.git-pull-note{margin:0 0 16px}
.git-pull-note textarea,#git-pull-conflict textarea{width:100%;min-height:180px;resize:vertical;margin-top:8px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
#git-pull-conflict{width:min(640px,calc(100% - 32px))}
.git-detail{margin-top:24px;border-top:1px solid var(--border);padding-top:20px}
.file-list{padding-left:22px;overflow-wrap:anywhere}
footer{border-top:1px solid var(--border);font-size:11px;align-items:center;gap:12px}
#footer-path{overflow-wrap:anywhere;min-width:0}
dialog{background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:24px;width:440px;max-width:calc(100% - 32px)}
dialog::backdrop{background:#0009}
dialog h2{font-size:18px}dialog .actions{justify-content:flex-end;margin-top:22px}
dialog p{white-space:pre-wrap;overflow-wrap:anywhere}
#ui-vision-settings{max-width:720px;padding:28px}
#ui-vision-settings>h2{margin:0 0 8px;font-size:20px}
.model-settings-choice{display:grid;gap:14px;padding:24px 0}
.model-settings-choice+.model-settings-choice{border-top:1px solid var(--border)}
.model-setting-field{display:grid;gap:8px;min-width:0}
.model-setting-field>span{font-size:13px;font-weight:500;color:var(--muted);line-height:1.5}
.model-setting-field>input,.model-setting-field>select{width:100%;min-width:0;min-height:44px;box-sizing:border-box;border-radius:7px;padding:10px 12px}
.model-settings-choice>.model-setting-field{grid-template-columns:108px minmax(0,1fr);align-items:center;gap:20px}
.model-settings-custom{margin-left:128px}
.model-settings-custom>select{flex:1;min-width:0;width:0;min-height:40px;text-overflow:ellipsis}
.model-settings-custom>button{flex-shrink:0}
dialog.model-api-dialog{width:480px;max-width:calc(100vw - 32px);max-height:calc(100dvh - 32px);box-sizing:border-box;overflow-y:auto;padding:28px;border-radius:12px;box-shadow:0 24px 80px #0005}
.model-api-dialog::backdrop{background:#0008;backdrop-filter:blur(4px)}
.model-api-dialog form{display:grid;gap:18px;min-width:0}
.model-api-dialog h2{margin:0 0 6px;font-size:20px;line-height:1.4;letter-spacing:-.3px}
.model-api-dialog input:focus-visible,#ui-vision-settings select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.model-api-dialog input::placeholder{color:var(--muted);opacity:.65}
.model-api-dialog .bad{margin:0;font-size:13px;line-height:1.6}
.model-api-dialog .bad:empty,#ui-vision-settings>p:empty{display:none}
.model-api-dialog .model-api-actions{margin-top:6px;padding-top:20px;border-top:1px solid var(--border);gap:10px}
.model-api-actions>button{min-height:40px;min-width:76px;border-radius:7px}
.model-api-actions>.model-api-delete{margin-right:auto;min-width:0;background:transparent;color:var(--muted);border-color:transparent}
.model-api-actions>.model-api-delete:hover{color:var(--red);border-color:var(--border)}
@media(max-width:520px){
  #ui-vision-settings{padding:20px}
  .model-settings-choice>.model-setting-field{grid-template-columns:minmax(0,1fr);gap:8px}
  .model-settings-custom{margin-left:0}
  dialog.model-api-dialog{padding:24px}
  .model-api-dialog input{font-size:16px}
}
.plugin-tabs{display:contents}
nav{overflow-x:auto;white-space:nowrap}
.plugin-workspace{min-width:0}
.plugin-status{display:flex;align-items:center;flex-wrap:wrap;gap:12px;padding:12px 28px;border-bottom:1px solid var(--border)}
.plugin-status p{margin:0;overflow-wrap:anywhere}
.plugin-frame{display:block;width:100%;height:calc(100dvh - 205px);min-height:520px;border:0;background:var(--bg)}
body.canvas-mode{display:flex;flex-direction:column;height:100dvh;min-height:0}
body.compact-chrome>.top{padding:4px 16px;gap:8px;min-height:36px;box-sizing:border-box}
body.compact-chrome .brand{font-size:13px;font-weight:500;gap:8px;color:var(--muted)}
body.compact-chrome .mark{width:22px;height:22px;min-height:22px;font-size:12px}
body.compact-chrome #maker-version-picker{max-width:128px;font-size:11px;padding:3px 6px}
body.compact-chrome .toolbar select{width:210px;font-size:12px;padding:4px 8px}
body.compact-chrome .toolbar .icon-button{width:28px;min-height:28px;padding:5px}
body.compact-chrome>.navigation{padding-inline:16px;gap:16px}
body.compact-chrome nav{gap:20px}
body.compact-chrome nav button{min-height:30px;padding:4px 0;font-size:12px}
body.canvas-mode>.top,body.canvas-mode>.navigation,body.canvas-mode>.feedback,body.canvas-mode>#announcement,body.canvas-mode>footer{flex-shrink:0}
body.canvas-mode #canvas-views,body.canvas-mode #ui-editor-view{display:flex;flex-direction:column;flex:1;min-height:0}
body.canvas-mode .canvas-frame{display:block;flex:1;width:100%;height:100%;min-height:0;border:0;background:var(--bg)}
body.canvas-mode .canvas-toolbar{display:flex;gap:8px;padding:8px 12px;background:var(--top)}
body.canvas-mode #close-canvas{flex-shrink:0;min-height:28px;padding:3px 8px;font-size:12px;color:var(--muted);background:transparent}
body.compact-chrome>footer{padding-block:3px;gap:0 12px;font-size:11px;line-height:1.5}
[hidden]{display:none!important}
@media(max-width:720px){
.top,main{padding:18px 16px}.navigation{padding-inline:16px;gap:0;flex-wrap:wrap}nav{gap:24px;width:100%;flex:auto}.context,footer{padding-inline:16px}
.top{padding-block:10px}
body.compact-chrome nav{flex:1;width:auto;margin-right:12px}
body.compact-chrome .toolbar{width:auto;min-width:0;flex:1 1 100%;flex-wrap:nowrap}
body.compact-chrome .toolbar select{width:auto;min-width:0}
body.compact-chrome .navigation{flex-wrap:nowrap;gap:8px}
body.compact-chrome .navigation .context{width:auto;max-width:none;padding:0}
body.compact-chrome .navigation #context{display:none}
body.compact-chrome .navigation #connection{font-size:11px;white-space:nowrap}
body.canvas-mode #close-canvas{max-width:85px;white-space:normal;font-size:10px}
.navigation .context{max-width:none;width:100%;padding:8px 0;justify-content:space-between}
.toolbar{width:100%}.toolbar select{flex:1;min-width:0;width:auto}.theme{margin-left:auto}
.columns{grid-template-columns:1fr;gap:28px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
.build-columns>section+section{padding-left:0;border-left:0;padding-top:20px;border-top:1px solid var(--border)}
.feedback{margin-inline:16px}button{min-height:42px}button.icon-button{width:42px}
.project-row{gap:10px}.project-row .actions{justify-content:flex-end}.entry{grid-template-columns:1fr}.entry input{font-size:16px}
.git-row{grid-template-columns:64px minmax(0,1fr);gap:8px;padding-block:8px}.git-row time{grid-column:2;text-align:left;font-size:11px}
.task summary time{margin-left:0;width:100%}h1{font-size:22px}
.task-item{flex-wrap:wrap;gap:6px}.task-shortcuts{max-width:100%}
.console-log-tabs{gap:18px;padding-inline:12px}
.document-tabs button{min-height:36px}
.plugin-status{padding:10px 16px}.plugin-frame{height:calc(100dvh - 235px);min-height:480px}
}
.other-workspace{display:grid;grid-template-columns:144px minmax(0,1fr);flex:1;min-width:0}
.other-tabs{display:flex;flex-direction:column;gap:4px;align-self:stretch;padding:16px 0;border-right:1px solid var(--border);background:var(--top)}
.other-tabs button{border:0;border-radius:0;justify-content:flex-start;padding:12px 16px;background:transparent}
.other-tabs button[aria-selected="true"]{background:var(--selection);color:var(--accent);box-shadow:inset 3px 0 var(--accent)}
#other-motion,#other-architecture{min-width:0}
#other-architecture{padding:24px}

.check-section-head{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.check-report{max-width:none;display:flex;flex-direction:column;gap:20px}.check-report h2{font-size:16px;margin:0}.check-report h3{font-size:15px;margin:0}.check-section-head{margin-bottom:14px}.check-section-head>.muted{font-size:12px}
.check-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.check-toolbar-info{display:flex;align-items:center;gap:14px;flex-wrap:wrap;min-width:0}.check-toolbar-info>.muted{font-size:12px}.check-scope{min-height:30px;padding:4px 10px}
.check-block{border:1px solid var(--border);border-radius:14px;background:var(--bg);overflow:hidden}
.check-bar{position:relative;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;min-height:56px;padding:10px 20px 10px 24px;background:var(--top)}.check-bar:before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:3px;border-radius:0 3px 3px 0;background:var(--accent)}
.check-block.is-open>.check-bar{border-bottom:1px solid var(--border)}
.check-bar.is-collapsible{cursor:pointer;user-select:none}.check-bar.is-collapsible:hover{background:var(--soft)}.check-bar.is-collapsible:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.check-bar-title{display:flex;align-items:center;gap:12px;min-width:0}.check-bar-meta{font-size:12px;color:var(--muted)}
.check-chevron{display:inline-block;width:14px;text-align:center;color:var(--muted);font-size:18px;line-height:1;transition:transform .15s}.check-block.is-open .check-chevron{transform:rotate(90deg)}
.check-loading{display:flex;flex-direction:column;gap:20px}.check-loading-head{display:flex;flex-direction:column;gap:16px;padding:20px 24px;border:1px solid var(--border);border-radius:14px;background:var(--top)}.check-loading-row{display:flex;align-items:center;gap:16px}.check-loading-text strong{display:block;font-size:16px}.check-loading-text span{display:block;margin-top:4px;font-size:12px;color:var(--muted)}
.check-spinner{flex:none;width:24px;height:24px;border-radius:50%;border:3px solid var(--border);border-top-color:var(--accent);animation:check-spin .8s linear infinite}.check-progress{height:3px;border-radius:3px;background:var(--border);overflow:hidden}.check-progress:after{content:"";display:block;height:100%;width:34%;border-radius:3px;background:linear-gradient(90deg,transparent,var(--accent),transparent);animation:check-slide 1.4s ease-in-out infinite}
.check-skeleton{border-radius:8px;background:linear-gradient(90deg,var(--soft) 25%,var(--top) 50%,var(--soft) 75%);background-size:200% 100%;animation:check-shimmer 1.6s linear infinite}.check-skeleton-title{width:140px;height:18px}.check-skeleton-stat{height:112px;border-radius:14px}.check-skeleton-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:20px}.check-skeleton-tile{height:190px;border-radius:14px}
.check-empty{display:flex;flex-direction:column;align-items:flex-start;gap:12px;padding:28px 24px;border:1px dashed var(--border);border-radius:14px;background:var(--top)}.check-empty p{margin:0;max-width:640px;font-size:13px}.check-inline-error{font-size:12px;color:var(--red)}
@keyframes check-spin{to{transform:rotate(360deg)}}@keyframes check-slide{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}@keyframes check-shimmer{to{background-position:-200% 0}}@media(prefers-reduced-motion:reduce){.check-spinner,.check-progress:after,.check-skeleton{animation:none}}@media(max-width:650px){.check-skeleton-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
.check-block-body{padding:20px}@media(max-width:650px){.check-block-body{padding:14px}.check-bar{padding:8px 14px 8px 18px}}.check-block-body[hidden]{display:none}.check-actions{display:flex;gap:10px;flex-wrap:wrap}
.check-tile{border:1px solid var(--border);border-radius:14px;background:var(--top);min-width:0;text-align:left;overflow:hidden;white-space:normal}
.check-graph-note{font-size:11px;margin:10px 0 0}
.check-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:0 0 28px}.check-stat{display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;gap:10px;padding:20px}.check-stat-label{font-size:13px}.check-stat strong{font-size:38px;line-height:1.15;letter-spacing:-1px;font-variant-numeric:tabular-nums}.check-stat-note{font-size:11px;color:var(--muted)}
.check-warm{background:linear-gradient(135deg,color-mix(in srgb,var(--red) 15%,var(--top)),var(--top))}.check-warm strong{color:var(--red)}.check-caution{background:linear-gradient(135deg,color-mix(in srgb,var(--warning) 15%,var(--top)),var(--top))}.check-caution strong{color:var(--warning)}
.check-note{font-size:12px;margin:-4px 0 16px}.check-problem-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;align-items:start}.check-image-column{display:flex;flex-direction:column;gap:14px;min-width:0}.check-problem{width:100%;display:flex;flex-direction:column;padding:0;gap:0;align-items:stretch;justify-content:flex-start}.check-problem-caption{display:flex;flex-direction:column;align-items:flex-start;padding:14px;gap:8px;min-width:0}.check-problem-caption strong{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.check-problem-caption>.muted{font-size:11px}.check-badge{font-size:10px;line-height:1.5;color:var(--warning);background:color-mix(in srgb,var(--warning) 10%,transparent);padding:3px 7px;border-radius:5px}.check-badge-warm{color:var(--red);background:color-mix(in srgb,var(--red) 10%,transparent)}
.check-unavailable{margin-bottom:14px}.check-stats:has(+.check-hint){margin-bottom:14px}.check-hint{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px;padding:14px 18px;border:1px solid color-mix(in srgb,var(--warning) 45%,var(--border));border-radius:12px;background:color-mix(in srgb,var(--warning) 8%,var(--top))}.check-hint p{margin:4px 0 0;font-size:12px}.check-hint strong{font-size:14px}.check-file-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px;margin:14px 0}.check-file-grid .check-problem{content-visibility:auto;contain-intrinsic-size:auto 270px}.check-file-grid .check-problem .asset-thumb{height:150px}.check-file-grid .check-problem .asset-thumb img{height:100%;object-fit:contain}.check-tile-note{font-size:11px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}.check-dup-row{display:grid;grid-template-columns:120px minmax(0,1fr);gap:14px;align-items:start}.check-dup-row .asset-thumb,.asset-check-row .asset-thumb{height:90px;border-radius:8px}.asset-check-row .asset-thumb{width:120px;flex:none}.asset-check-row>div{flex:1;min-width:0}
.check-more{display:block;margin:16px auto 0}.check-extras{display:flex;flex-wrap:wrap;gap:18px;margin-top:22px;padding-top:18px;border-top:1px solid var(--border)}.check-extras button{padding:0;border:0;background:transparent;color:var(--muted);font-size:12px}.check-scope{font-size:12px;color:var(--warning);background:var(--soft);border:0;margin-bottom:20px;justify-content:flex-start}
.asset-thumb{width:100%;height:155px;display:flex;align-items:center;justify-content:center;background:repeating-conic-gradient(var(--bg) 0% 25%,var(--soft) 0% 50%) 50%/16px 16px;overflow:hidden}.asset-thumb img{width:100%;height:100%;object-fit:contain}.check-problem .asset-thumb{height:auto;min-height:48px}.check-problem .asset-thumb img{display:block;height:auto;aspect-ratio:auto}.asset-thumb span{padding:16px;font-size:12px;text-align:center;color:var(--muted)}
dialog.check-dialog,dialog.asset-detail{box-sizing:border-box;width:720px;max-width:calc(100vw - 24px);max-height:calc(100dvh - 32px);overflow:auto;padding:24px;color:var(--text);background:var(--bg);border:1px solid var(--border);border-radius:16px}dialog.check-dialog::backdrop,dialog.asset-detail::backdrop{background:rgba(0,0,0,.55)}dialog.check-dialog-wide{width:1280px}
.check-dialog-head,.asset-detail .heading{display:flex;flex-wrap:nowrap;gap:16px;align-items:flex-start;position:sticky;top:-24px;background:var(--bg);padding:12px 0;z-index:1}.check-dialog-head h2,.asset-detail .heading h2{font-size:18px;margin:0;min-width:0;flex:1;overflow-wrap:anywhere}.check-dialog-head button,.asset-detail .heading button{flex-shrink:0}.check-dialog-content{min-width:0}.check-dialog .path,.asset-detail .path{overflow-wrap:anywhere}.check-dialog h3,.asset-detail h3{margin-top:22px}.asset-detail .asset-thumb{height:280px}.asset-evidence{padding:12px 0;border-bottom:1px solid var(--border)}.asset-evidence p{font-size:12px}
.project-architecture-frame{display:block;width:100%;height:calc(100dvh - 150px);min-height:320px;border:0}
.project-architecture-frame.check-architecture-frame{height:440px;min-height:0;border:1px solid var(--border);border-radius:14px}
.check-file{display:flex;justify-content:space-between;align-items:center;gap:16px;width:100%;text-align:left;border:0;border-bottom:1px solid var(--border);border-radius:0;background:none;padding:14px 0}.check-file>span:first-child{min-width:0;display:grid;gap:4px}.check-file strong{overflow-wrap:anywhere}.check-file .path{font-size:11px}.check-file>span:last-child{flex-shrink:0;font-size:12px}
.asset-callout{padding:18px;border:1px solid var(--border);border-radius:10px;margin:18px 0;background:var(--soft)}.asset-size-row{display:grid;grid-template-columns:40px minmax(0,1fr) 90px;gap:12px;align-items:center;font-size:12px}.asset-size-row meter{width:100%;height:16px}.asset-size-row>span:last-child{text-align:right}
.asset-check-group{border-top:1px solid var(--border);padding:18px 0}.asset-check-group summary{cursor:pointer;font-weight:600}.asset-check-row{display:flex;justify-content:space-between;align-items:start;gap:16px;padding:14px 0;border-top:1px solid var(--border)}.asset-check-row>div{min-width:0}.asset-check-row .path{overflow-wrap:anywhere}.asset-check-row p{margin:6px 0}.asset-check-row button{flex-shrink:0}
.asset-check-group textarea,.check-dialog textarea,.asset-detail textarea{display:block;box-sizing:border-box;width:100%;min-height:120px;resize:vertical;margin:12px 0;font:inherit;font-size:13px;line-height:1.6;padding:12px;color:var(--text);background:var(--top);border:1px solid var(--border);border-radius:8px}
@media(max-width:1000px){.check-stats{gap:10px}.check-stat{padding:16px}}
@media(max-width:650px){.check-section-head{gap:8px}.check-section-head button{font-size:12px}.check-stats{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:24px}.check-stat strong{font-size:32px}.project-architecture-frame.check-architecture-frame{height:600px}.check-problem-caption{padding:10px;gap:6px}.check-problem-caption strong{font-size:12px}.check-problem-caption>.muted{font-size:10px}dialog.check-dialog,dialog.asset-detail{padding:16px}.check-dialog-head,.asset-detail .heading{top:-16px}.asset-detail .asset-thumb{height:210px}.asset-check-row{flex-wrap:wrap}.asset-check-row>div{width:100%}.check-file{gap:8px}}
.motion-library-frame{display:block;width:100%;height:calc(100dvh - 120px);min-height:580px;border:0}
@media(max-width:650px){.other-workspace{grid-template-columns:86px minmax(0,1fr)}.other-tabs button{padding:10px 8px;font-size:12px}#other-architecture{padding:12px}.motion-library-frame{height:calc(100dvh - 160px)}}
@media(max-width:650px){.other-workspace{grid-template-columns:minmax(0,1fr)}.other-tabs{display:flex;flex-direction:row;border-right:0;border-bottom:1px solid var(--border)}.other-tabs button{flex:1;justify-content:center}}
@media(prefers-reduced-motion:no-preference){button{transition:background .12s,border-color .12s}}
${architecturePreviewStyles}
`;
