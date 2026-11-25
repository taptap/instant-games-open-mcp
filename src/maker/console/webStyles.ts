import { consoleThemeStyles } from '../webTheme.js';
import { architecturePreviewStyles } from './architecturePreview.js';

export const consoleStyles = String.raw`
${consoleThemeStyles}
:root{--maker-bg-pattern:url(/console-bg-pattern-dark.jpg)}
:root[data-theme="light"]{--maker-bg-pattern:url(/console-bg-pattern.jpg)}
*{box-sizing:border-box;scrollbar-width:thin;scrollbar-color:var(--scrollbar-thumb) transparent}
::-webkit-scrollbar{width:7px;height:7px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--scrollbar-thumb);border-radius:999px;border:2px solid transparent;background-clip:content-box}
::-webkit-scrollbar-thumb:hover{background:var(--scrollbar-thumb-hover);border:1px solid transparent;background-clip:content-box}
::-webkit-scrollbar-corner{background:transparent}
html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;letter-spacing:0;-webkit-font-smoothing:antialiased;overflow:hidden}
.sr-only{position:absolute!important;width:1px!important;height:1px!important;min-width:0!important;min-height:0!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important;pointer-events:none!important}
button,input,select,textarea{font:inherit;letter-spacing:0;max-width:100%}
button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:32px;padding:5px 13px;border:1px solid var(--border-strong);border-radius:var(--radius-sm);background:var(--soft);color:var(--text);font-size:13px;font-weight:500;cursor:pointer}
button:hover:not(:disabled){border-color:color-mix(in srgb,var(--text) 22%,transparent);background:var(--soft-hover)}
button:active:not(:disabled){transform:scale(.98)}
button:disabled{opacity:.42;cursor:not-allowed}
button.primary,button.preview-button{background:var(--primary);border-color:var(--primary);color:var(--on-primary);font-weight:600}
button.primary:hover:not(:disabled),button.preview-button:hover:not(:disabled){filter:brightness(1.06);background:var(--primary);border-color:var(--primary)}
.heading-primary>button{border-radius:var(--radius-pill);min-height:34px;padding:5px 15px}
.heading-primary>button:not(.preview-button){background:var(--surface-solid);border-color:var(--border-strong)}
.heading-primary>button:not(.preview-button):hover:not(:disabled){background:var(--soft-hover)}
.build-button{min-width:84px}
button.is-building:disabled{opacity:1;cursor:wait}
.build-badge{display:inline-flex;align-items:center;padding:2px 9px;border-radius:var(--radius-pill);background:var(--soft);font-size:12px;font-weight:500;white-space:nowrap}
.build-status{padding:0;margin-bottom:14px;min-height:28px}
.build-status-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.build-stage{font-size:13px;overflow-wrap:anywhere}
.build-progress{height:4px;width:100%;overflow:hidden;background:var(--soft);border-radius:var(--radius-pill);margin-top:10px}
.build-progress span{display:block;height:100%;background:var(--primary);border-radius:var(--radius-pill)}
.build-progress.indeterminate span{width:35%}
.build-progress-label{font-size:12px;font-variant-numeric:tabular-nums;margin-top:6px;text-align:right}
@keyframes build-spin{to{transform:rotate(360deg)}}
@keyframes build-travel{from{transform:translateX(-100%)}to{transform:translateX(386%)}}
@keyframes fade-in{from{opacity:0}to{opacity:1}}
@keyframes dialog-enter{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:none}}
.loading-spinner{display:inline-block;width:14px;height:14px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;flex:none}
.is-loading{cursor:wait!important}
@media(prefers-reduced-motion:no-preference){
.is-building .icon,.build-spinner,.loading-spinner{animation:build-spin 1.2s linear infinite}
.build-progress.indeterminate span{animation:build-travel 1.8s ease-in-out infinite}
.build-progress.determinate span{transition:width .25s ease}
.sidebar{transition:width .2s cubic-bezier(.2,.8,.2,1)}
button,input,select{transition:background .14s ease,border-color .14s ease,color .14s ease,transform .12s ease}
main>*{animation:fade-in .16s ease both}
dialog[open]{animation:dialog-enter .15s cubic-bezier(.16,1,.3,1) both}
}
button.danger{color:var(--red);border-color:color-mix(in srgb,var(--red) 30%,var(--border))}
button.danger:hover:not(:disabled){background:color-mix(in srgb,var(--red) 12%,var(--soft));border-color:var(--red)}
button.icon-button{width:32px;min-height:32px;flex-shrink:0;padding:0;background:transparent;border-color:transparent;color:var(--muted)}
button.icon-button:hover:not(:disabled){background:var(--soft);border-color:var(--border);color:var(--text)}
button.icon-button[aria-pressed="true"]{background:var(--track-active);border-color:var(--border);color:var(--text)}
button.link{background:none;border:0;padding:0;min-height:0;justify-content:flex-start;color:var(--text);text-align:left;min-width:0;font-weight:500}
button.link:hover:not(:disabled){background:none;color:var(--text);text-decoration:underline;text-underline-offset:3px}
button.link.bad{color:var(--red)}button.link.good{color:var(--green)}button.link.pending{color:var(--warning)}
:focus-visible{outline:2px solid var(--focus-ring);outline-offset:1px}
button.primary:focus-visible,button.preview-button:focus-visible{outline:2px solid color-mix(in srgb,var(--primary) 55%,transparent);outline-offset:2px}
.icon{width:15px;height:15px;flex:none}
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),select{border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:6px 10px;background:var(--bg);color:var(--text);font-size:13px;min-height:34px}
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):hover:not(:disabled),select:hover:not(:disabled){border-color:color-mix(in srgb,var(--text) 24%,transparent)}
select{appearance:none;-webkit-appearance:none;padding-right:28px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='M4.25 6.25L8 10L11.75 6.25' stroke='%238c93a0' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 9px center;cursor:pointer}
select option{background:var(--surface-solid);color:var(--text)}
input[type="checkbox"]:not(.sr-only){appearance:none;-webkit-appearance:none;position:relative;display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;min-height:15px;min-width:15px;margin:0;padding:0;flex:none;vertical-align:middle;border:1px solid var(--border-strong);border-radius:4px;background:var(--surface-solid);cursor:pointer;transition:background .12s ease,border-color .12s ease}
input[type="checkbox"]:not(.sr-only):hover:not(:disabled){border-color:color-mix(in srgb,var(--text) 34%,transparent);background:var(--soft)}
input[type="checkbox"]:not(.sr-only):checked{background:var(--primary);border-color:var(--primary)}
input[type="checkbox"]:not(.sr-only):checked::after{content:"";display:block;width:4px;height:8px;border:solid var(--on-primary);border-width:0 1.8px 1.8px 0;transform:rotate(45deg) translate(-0.5px,-0.8px)}
input[type="checkbox"]:not(.sr-only):disabled{opacity:.42;cursor:not-allowed}
.console-log-toolbar label.theme{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--muted);cursor:pointer;user-select:none;line-height:1;min-height:28px;padding:0 4px}
.console-log-toolbar label.theme:hover{color:var(--text)}

/* Custom Wrapped Select (Preserves Native <select> in DOM for Accessibility & Tests) */
select[data-custom-select="ready"],select.ui-select-native{position:absolute!important;width:1px!important;height:1px!important;min-width:0!important;min-height:0!important;padding:0!important;margin:-1px!important;border:0!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;pointer-events:none!important;opacity:0!important}
.ui-select-trigger{display:inline-flex;align-items:center;justify-content:space-between;gap:8px;min-height:34px;padding:5px 10px 5px 11px;border:1px solid var(--border-strong);border-radius:var(--radius-sm);background:var(--surface-solid);color:var(--text);font-size:13px;font-weight:400;text-align:left;cursor:pointer;min-width:0;max-width:100%}
.ui-select-trigger:hover:not(:disabled){border-color:color-mix(in srgb,var(--text) 26%,transparent);background:var(--soft-hover)}
.ui-select-trigger.is-open{border-color:color-mix(in srgb,var(--text) 32%,transparent);background:var(--soft-hover)}
.ui-select-trigger:active:not(:disabled){transform:none}
.ui-select-trigger:disabled{opacity:.48;cursor:not-allowed}
.ui-select-trigger.is-pending{color:var(--warning)}
.ui-select-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.35}
.ui-select-chevron{width:14px;height:14px;flex:none;color:var(--muted);transition:transform .16s ease}
.ui-select-trigger.is-open .ui-select-chevron{transform:rotate(180deg);color:var(--text)}
.ui-select-trigger.is-project-picker{flex:1;min-width:0;width:0;min-height:32px;padding:4px 8px 4px 10px;font-size:12px;font-weight:500;background:var(--soft);border-color:var(--border)}
.ui-select-trigger.is-project-picker:hover:not(:disabled),.ui-select-trigger.is-project-picker.is-open{background:var(--soft-hover);border-color:var(--border-strong)}
.ui-select-trigger.is-version-picker{min-height:22px;padding:1px 6px 1px 6px;margin-left:-6px;gap:4px;font-size:11px;font-weight:500;font-variant-numeric:tabular-nums;color:var(--muted);background:transparent;border-color:transparent;border-radius:var(--radius-xs);max-width:148px}
.ui-select-trigger.is-version-picker .ui-select-chevron{width:12px;height:12px}
.ui-select-trigger.is-version-picker:hover:not(:disabled),.ui-select-trigger.is-version-picker.is-open{background:var(--soft);border-color:var(--border);color:var(--text)}
.ui-select-trigger.is-version-picker.is-pending{color:var(--warning)}
.model-setting-field>.ui-select-trigger,.preview-window-settings .ui-select-trigger,#qrcode-confirm .ui-select-trigger,#selection-dialog .ui-select-trigger{width:100%}
.model-setting-field>.ui-select-trigger{min-height:40px;padding:8px 12px}
.model-settings-custom>.ui-select-trigger{flex:1;min-width:0;width:0;min-height:38px}
#selection-dialog .ui-select-trigger{margin:12px 0}
.ui-select-menu{position:fixed;z-index:200;display:flex;flex-direction:column;gap:2px;padding:5px;overflow-y:auto;overscroll-behavior:contain;background:var(--surface-solid);border:1px solid var(--border-strong);border-radius:var(--radius-md);box-shadow:var(--shadow-menu)}
.ui-select-option{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:32px;padding:6px 10px;border:0;border-radius:var(--radius-xs);background:transparent;color:var(--text);font-size:12.5px;font-weight:400;text-align:left;cursor:pointer}
.ui-select-option:hover:not(:disabled),.ui-select-option:focus-visible{background:var(--soft-hover);outline:none}
.ui-select-option:active:not(:disabled){transform:none}
.ui-select-option.is-selected{background:var(--selection);font-weight:600}
.ui-select-option:disabled{opacity:.42;cursor:not-allowed}
.ui-select-option-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ui-select-check{width:14px;height:14px;flex:none;color:var(--text)}

/* App Shell — Flat Neutral Graphite Sidebar (User-Controlled Collapse Only) */
.app-shell{display:flex;height:100dvh;min-height:0;width:100%;overflow:hidden}
.sidebar{width:228px;flex:none;display:flex;flex-direction:column;min-height:0;background:var(--top);border-right:1px solid var(--border);z-index:10}
.sidebar>.top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:12px 12px 10px 14px;min-height:58px;flex-shrink:0}
.brand{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-width:0;flex:1}
.brand-meta{display:flex;align-items:center;min-width:0;max-width:100%}
.mark{display:inline-flex;align-items:center;justify-content:flex-start;height:28px;min-height:28px;flex:none;background:transparent;border:0;border-radius:var(--radius-xs);padding:0;overflow:visible;cursor:pointer;transition:transform .16s ease,opacity .16s ease}
.mark:hover:not(:disabled){background:transparent;border-color:transparent;opacity:.92}
.mark:active{transform:scale(.96)}
.mark svg.brand-logo-full{display:block;height:26px;width:auto;pointer-events:none}
.mark svg.brand-logo-compact{display:none;height:22px;width:28px;pointer-events:none}
.mark.maker-easter-egg{position:relative;animation:maker-mark-reveal 1.5s ease both}
@keyframes maker-mark-reveal{0%{transform:scale(.9);opacity:.35}55%{transform:scale(1.06)}100%{transform:scale(1);opacity:1}}
@media(prefers-reduced-motion:reduce){.mark,.mark.maker-easter-egg{animation:none;transition:none}}
#maker-version-picker{font-size:11px;font-weight:500;font-variant-numeric:tabular-nums;color:var(--muted);background:transparent;border:1px solid transparent;border-radius:var(--radius-xs);padding:1px 22px 1px 4px;margin-left:-4px;min-height:20px;max-width:146px;cursor:pointer}
#maker-version-picker:hover:not(:disabled){background:var(--soft);border-color:var(--border);color:var(--text)}
.project-switch{display:flex;align-items:center;gap:6px;padding:4px 12px 12px;border-bottom:1px solid var(--border);flex-shrink:0}
.project-switch select{flex:1;min-width:0;width:0;min-height:32px;padding:4px 26px 4px 8px;font-size:12px;font-weight:500;background-color:var(--soft);border-color:var(--border);border-radius:var(--radius-sm)}
.project-switch .icon-button{border:1px solid var(--border);background:var(--soft)}

.sidebar nav{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:12px 10px;display:flex;flex-direction:column;gap:16px}
.nav-group{display:flex;flex-direction:column;gap:2px}
.nav-group-label{padding:0 10px 4px;font-size:11px;font-weight:500;letter-spacing:.04em;color:var(--muted);opacity:.72;user-select:none}
.sidebar nav button{position:relative;width:100%;min-height:34px;padding:6px 10px;justify-content:flex-start;gap:10px;border:1px solid transparent;border-radius:var(--radius-sm);background:transparent;color:var(--muted);font-size:13px;font-weight:500;text-align:left;white-space:nowrap}
.sidebar nav button:hover:not(:disabled){background:var(--soft);color:var(--text)}
.sidebar nav button[aria-current="page"]{background:var(--track-active);border-color:var(--border);color:var(--text);font-weight:600}
.sidebar nav button .nav-label{overflow:hidden;text-overflow:ellipsis;min-width:0}
.plugin-tabs{display:contents}

/* Proper 2-Way Segmented Light / Dark Switch */
.sidebar-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-top:1px solid var(--border);flex-shrink:0}
.theme-segmented{display:grid;grid-template-columns:1fr 1fr;gap:2px;flex:1;min-width:0;padding:2px;background:var(--track);border:1px solid var(--border);border-radius:var(--radius-sm)}
.theme-option{min-height:26px;padding:3px 6px;border:0;border-radius:var(--radius-xs);background:transparent;color:var(--muted);font-size:12px;font-weight:500;gap:5px;white-space:nowrap}
.theme-option .icon{width:13px;height:13px}
.theme-option:hover:not(:disabled){background:transparent;color:var(--text)}
.theme-option[aria-pressed="true"]{background:var(--track-active);color:var(--text);font-weight:600}

/* Collapsed Rail — Strictly Manual Toggle Only (Never Auto-Collapsed on Canvas) */
body.sidebar-collapsed .sidebar{width:56px}
body.sidebar-collapsed .sidebar>.top{flex-direction:column;align-items:center;padding:10px 8px 8px;gap:8px;min-height:0}
body.sidebar-collapsed .brand{align-items:center}
body.sidebar-collapsed .mark{width:34px;height:32px;justify-content:center;border-radius:var(--radius-sm);background:var(--soft);border:1px solid var(--border)}
body.sidebar-collapsed .mark svg.brand-logo-full{display:none}
body.sidebar-collapsed .mark svg.brand-logo-compact{display:block}
body.sidebar-collapsed .brand-meta,
body.sidebar-collapsed .project-switch,
body.sidebar-collapsed .nav-group-label,
body.sidebar-collapsed .sidebar nav .nav-label,
body.sidebar-collapsed .theme-opt-label{display:none}
body.sidebar-collapsed .sidebar nav{padding:10px 8px;gap:10px}
body.sidebar-collapsed .sidebar nav button{justify-content:center;padding:0;width:38px;height:36px;margin:0 auto}
body.sidebar-collapsed .sidebar-footer{flex-direction:column;padding:8px 8px 10px;gap:6px}
body.sidebar-collapsed .theme-segmented{grid-template-columns:1fr;width:36px;flex:none}
body.sidebar-collapsed .theme-option{padding:0;width:30px;height:26px;justify-content:center}

/* Workspace Stage — Official TapTap Maker Circuit-Board Background */
.workspace-shell{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;background:var(--bg)}
.navigation{display:flex;align-items:center;justify-content:space-between;gap:16px;height:46px;padding:0 24px;border-bottom:1px solid var(--border);background:var(--bg);flex-shrink:0}
.stage-meta{display:flex;align-items:center;gap:12px;min-width:0}
.stage-title{display:inline-flex;align-items:center;font-size:13px;color:var(--text);white-space:nowrap;min-width:0;overflow:hidden}
.crumb-group{color:var(--muted);font-weight:500}
.crumb-sep{color:var(--muted-dim);margin:0 7px;font-weight:400;user-select:none}
.crumb-page{color:var(--text);font-weight:600;overflow:hidden;text-overflow:ellipsis}
.context{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);min-width:0}
.navigation .context{justify-content:flex-end;min-width:max-content}
.navigation #connection{flex-shrink:0}
.navigation #context{padding:2px 9px;border-radius:var(--radius-pill);background:var(--soft);border:1px solid var(--border);font:11px/1.6 "SFMono-Regular",Consolas,monospace;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px}
#connection{display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border-radius:var(--radius-pill);background:var(--soft);border:1px solid var(--border);font-size:11px;font-weight:500;white-space:nowrap}
#connection.good{color:var(--green);background:color-mix(in srgb,var(--green) 10%,transparent);border-color:color-mix(in srgb,var(--green) 22%,transparent)}
#connection.good::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--green)}
button.console-shutdown{flex-shrink:0;min-height:28px;padding:3px 10px;white-space:nowrap;background:transparent;color:var(--red);border-color:color-mix(in srgb,var(--red) 28%,var(--border));font-size:12px;border-radius:var(--radius-pill)}
button.console-shutdown:hover:not(:disabled){background:color-mix(in srgb,var(--red) 12%,var(--soft));border-color:var(--red)}
#close-canvas{flex-shrink:0;min-height:28px;padding:3px 10px;font-size:12px;color:var(--muted);background:var(--soft);border-color:var(--border)}
#close-canvas:hover:not(:disabled){color:var(--text)}

.stage-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;background-color:var(--bg);background-image:var(--maker-bg-pattern);background-size:cover;background-position:center center;background-repeat:no-repeat;background-attachment:fixed}
body.canvas-mode .stage-scroll{overflow:hidden;display:flex;flex-direction:column;background-image:none;background-color:var(--bg)}
main{padding:28px 36px 48px;max-width:960px;margin:0 auto}

/* Typography & Shared Helpers */
.actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
h1{font-size:24px;font-weight:600;letter-spacing:-.02em;line-height:1.25;margin:0;overflow-wrap:anywhere}
h2{font-size:13px;font-weight:600;letter-spacing:.01em;margin:0 0 12px;color:var(--text)}
h3{font-size:13px;font-weight:600;margin:0 0 8px}
p{margin:8px 0}
.heading{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;flex-wrap:wrap;margin-bottom:20px}
.heading p{margin:4px 0 0}
#heading-actions{display:flex;flex-direction:column;align-items:flex-end;gap:10px;max-width:100%}
.heading-primary,.heading-secondary{justify-content:flex-end;max-width:100%}
.muted,.path,time,dt{color:var(--muted)}
.path{font:12px/1.5 "SFMono-Regular",Consolas,monospace;overflow-wrap:anywhere}
.good{color:var(--green)}.bad{color:var(--red)}.pending{color:var(--warning)}
.preview-link{display:inline-block;color:var(--text);margin:8px 0;overflow-wrap:anywhere;text-decoration:underline;text-underline-offset:3px}
.preview-link:hover{color:var(--accent)}
.empty{padding:16px 0;color:var(--muted);font-size:13px}
section{min-width:0}
dl{margin:0}
.row{display:flex;justify-content:space-between;align-items:baseline;gap:16px;padding:9px 0;border-bottom:1px solid var(--border);overflow-wrap:anywhere;font-size:13px}
.row:last-child{border-bottom:0;padding-bottom:0}
dt{flex-shrink:0}
dd{margin:0;text-align:right;min-width:0;font-variant-numeric:tabular-nums;color:var(--text)}
dd.is-empty{color:var(--muted-dim);font-weight:400}
code,pre{font:12px/1.65 "SFMono-Regular",Consolas,monospace;overflow-wrap:anywhere}
pre{white-space:pre-wrap;tab-size:2;margin:10px 0 0;background:var(--code);padding:14px 16px;max-height:440px;overflow:auto;border:1px solid var(--border);border-radius:var(--radius-sm)}

/* Feedback Banner */
.feedback{margin:0;padding:10px 24px;border:0;border-bottom:1px solid var(--border);border-left:3px solid var(--red);background:var(--surface-solid);overflow-wrap:anywhere;display:flex;gap:14px;justify-content:space-between;align-items:center;flex-shrink:0;font-size:13px}
.feedback p{margin:0;white-space:pre-wrap}
.feedback button{flex-shrink:0;white-space:nowrap;min-height:28px;padding:3px 10px;font-size:12px}
.feedback[data-tone="warning"]{border-left-color:var(--warning)}
.feedback[data-tone="success"]{border-left-color:var(--green)}

/* ============================================================
   VIEW 1: OVERVIEW — Open Editorial Canvas over Circuit Board
   Generous 1440px Studio Measure, Transparent Backdrop, No Boxes
   ============================================================ */
main[data-view="overview"]{max-width:1440px;padding:36px 48px 56px;margin:0 auto;min-height:100%;display:flex;flex-direction:column}
.overview-hero{margin:0 0 32px;padding:0;border:0;align-items:center;background:transparent}
.overview-hero h1{font-size:28px;font-weight:600;letter-spacing:-.025em}
.hero-pulse{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:10px}
.pulse-chip{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:var(--radius-pill);background:var(--surface);border:1px solid var(--border);font-size:11px;font-weight:500;color:var(--muted)}
.pulse-branch{color:var(--text);border-color:var(--border-strong);background:var(--soft);font-family:"SFMono-Regular",Consolas,monospace}
.pulse-mono{font-family:"SFMono-Regular",Consolas,monospace}
.pulse-dirty{color:var(--warning);border-color:color-mix(in srgb,var(--warning) 28%,var(--border))}

.overview-body{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(290px,.55fr);gap:56px;align-items:start}
.overview-main{display:flex;flex-direction:column;gap:32px;min-width:0;background:transparent}

/* Compact 3-Column Environment Status Strip (Light Translucent, Circuit Visible) */
.env-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;background:transparent;border:0}
.env-slot{padding:16px 18px;min-width:0;display:flex;flex-direction:column;background:var(--surface);backdrop-filter:blur(6px);border:1px solid var(--border);border-radius:var(--radius-md)}
.env-slot .muted{font-size:11px;font-weight:500;letter-spacing:.02em}
.env-slot .value{display:inline-flex;align-items:center;gap:8px;font-size:15px;font-weight:600;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;margin-top:6px;line-height:1.35}
.status-dot::before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;flex:none;background:var(--muted-dim)}
.status-dot.good::before{background:var(--green)}
.status-dot.pending::before{background:var(--warning)}
.status-dot.bad::before{background:var(--red)}
.runtime-detail{margin-top:4px;font-size:11px;overflow-wrap:anywhere}
.runtime-metric button{margin-top:10px;align-self:flex-start;min-height:26px;padding:2px 11px;font-size:11px;border-radius:var(--radius-pill)}

/* Editorial Flow Sections Directly on Circuit Canvas (No Boxed Grid!) */
.overview-workbench{display:flex;flex-direction:column;gap:28px;background:transparent}
.workbench-section{padding:0 0 28px;margin:0;border:0;border-bottom:1px solid var(--border);background:transparent}
.workbench-section:last-child{border-bottom:0;padding-bottom:0}
.overview-health .section-heading,#overview-task .section-heading{justify-content:flex-start;gap:10px}
.status-pill{display:inline-flex;align-items:center;padding:2px 9px;border-radius:var(--radius-pill);font-size:11px;font-weight:600;background:var(--soft)}
.status-pill.good{color:var(--green);background:color-mix(in srgb,var(--green) 11%,transparent)}
.status-pill.bad{color:var(--red);background:color-mix(in srgb,var(--red) 12%,transparent)}
.health-summary{margin:0 0 10px;font-size:13px}
.health-issue{padding:10px 0;border-bottom:1px solid var(--border)}
.health-issue:last-of-type{border-bottom:0}
.health-issue p{margin:0;font-size:13px}
.failure-banner{margin:12px 0 0;padding:12px 14px;border:0;border-left:3px solid var(--red);border-radius:var(--radius-xs);background:color-mix(in srgb,var(--red) 8%,var(--soft));overflow-wrap:anywhere}
.failure-banner strong{display:block;font-size:13px;color:var(--red)}
.failure-detail{margin:8px 0 0;max-height:280px}

/* Open Right Spec Column — Thin Left Hairline Directly Over Circuit Canvas */
.overview-aside{position:sticky;top:28px;display:flex;flex-direction:column;gap:24px;padding-left:32px;border-left:1px solid var(--border);background:transparent}
.spec-group{padding:0}
.spec-group+.spec-group{padding-top:20px;border-top:1px solid var(--border)}

/* Context Check */
.context-check{font-size:13px;overflow-wrap:anywhere}
.context-check-head{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.context-check-head h2{margin:0}
.context-check-head p{margin:6px 0 0}
.context-check-actions{flex-wrap:wrap;min-width:0}
.context-check-status{display:grid;gap:6px;margin-top:10px}.context-check-status p{margin:0;line-height:1.6}
.context-error{color:var(--red)}
.context-note{font-size:12px;line-height:1.7;margin:10px 0 0}
.context-check>details{margin-top:12px;padding-top:10px;border-top:1px solid var(--border)}
.context-check>details[open]{max-height:360px;overflow-y:auto;overscroll-behavior:contain;padding:0 12px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface-alt)}
.context-check summary{cursor:pointer;padding:4px 0;font-weight:500}
.context-check>details[open]>summary{position:sticky;top:0;z-index:2;padding:10px 0 8px;margin-bottom:4px;background:var(--surface-solid);border-bottom:1px solid var(--border)}
.context-group{border-top:1px solid var(--border);margin-top:12px;padding-top:8px}
.context-source{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:16px;padding:12px 0;border-bottom:1px solid var(--border)}
.context-source:last-child{border-bottom:0}
.context-source .muted{font-size:12px;margin-top:4px}.context-source .actions{flex-wrap:wrap;justify-content:flex-end}
.context-finding{margin:12px 0;padding-left:14px;border-left:2px solid var(--border-strong)}.context-finding p{margin:6px 0}

/* ============================================================
   VIEW 2: BUILD & TEST — Single-Viewport 2-Column Studio Workbench
   Left 400px Controls | Right Full-Height Terminal Pane (Zero Extra Scroll)
   ============================================================ */
main[data-view="build"]{max-width:1520px;padding:22px 40px 22px;margin:0 auto;height:100%;min-height:0;overflow:hidden;display:grid;grid-template-columns:390px minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);column-gap:36px;row-gap:18px;grid-template-areas:"head head" "sidebar logs";align-items:stretch}
main[data-view="build"]>.heading{grid-area:head;margin:0;padding:0;border:0;align-items:center;background:transparent}
main[data-view="build"]>.heading h1{font-size:24px}
main[data-view="build"]>.build-sidebar{grid-area:sidebar;display:flex;flex-direction:column;gap:18px;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable}
.build-sidebar>.build-columns{grid-area:ctrl;display:flex;flex-direction:column;gap:18px;background:transparent;min-height:0;flex-shrink:0}
.build-sidebar>.build-columns>section{padding:0 0 18px;border-bottom:1px solid var(--border)}
.build-sidebar>.preview-cache-panel{grid-area:cache;margin:0;padding:0 0 18px;border:0;border-bottom:1px solid var(--border);background:transparent;font-size:12px;flex-shrink:0}
.build-sidebar>.preview-cache-panel p{font-size:12px;line-height:1.6}
.build-sidebar>.task-history{grid-area:hist;margin:0;padding:0 4px 0 0;border:0;background:transparent;flex-shrink:0}
main[data-view="build"]>.console-logs{grid-area:logs;margin:0;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--code);backdrop-filter:blur(10px);display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}

.lua-check-option{display:inline-flex;align-items:center;gap:8px;color:var(--muted);white-space:nowrap;font-size:12px;line-height:1;cursor:pointer;user-select:none}
.lua-check-option:hover{color:var(--text)}
.lua-check-panel{font-size:12px;padding-top:12px;border-top:1px solid var(--border)}
.lua-check-actions{gap:12px;min-height:30px}
.lua-check-actions>button:last-child{margin-left:auto;color:var(--muted)}
.lsp-status{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:8px;min-height:26px}
.lsp-status>button{color:var(--muted)}
.preview-status-summary{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;min-height:28px;font-size:13px}
.preview-status-summary>span{display:inline-flex;align-items:center;padding:2px 9px;border-radius:var(--radius-pill);background:var(--soft);font-size:12px;font-weight:500}
.preview-status-summary button{margin-left:auto}
.preview-controls{margin-top:12px}
#preview-panel>.preview-controls{margin-top:12px;min-height:32px}
#preview-panel>.preview-controls>.link:last-child{margin-left:auto;color:var(--muted);font-size:12px}
#preview-panel>details:not(.preview-window-disclosure){margin-top:10px;font-size:12px;color:var(--muted)}
.preview-window-disclosure{margin-top:12px;padding-top:10px;border-top:1px solid var(--border);font-size:12px}
.preview-window-summary{display:flex;align-items:center;gap:10px;min-height:28px;flex-wrap:wrap;list-style:none}
.preview-window-summary::-webkit-details-marker{display:none}
.preview-window-summary>span:nth-child(2){margin-left:auto}
.preview-window-summary::after{content:"⌄";color:var(--muted)}
.preview-window-disclosure[open]>.preview-window-summary::after{content:"⌃"}
.preview-window-settings{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0 0;padding:10px 0 0;border-top:1px solid var(--border)}
.preview-window-settings label{display:flex;flex-direction:column;gap:5px;min-width:0}
.preview-window-settings input,.preview-window-settings select{width:100%;min-width:0}
.preview-window-footer{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
.preview-window-settings p{grid-column:1/-1;margin:0}

/* Console Logs & Validation Terminal — Full-Height Right IDE Pane */
.console-log-toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;padding:12px 24px 8px;background:var(--surface-solid)}
.console-log-toolbar h2{margin:0}
.console-log-tabs{display:flex;align-items:center;gap:2px;padding:0 24px 10px;background:var(--surface-solid);border-bottom:1px solid var(--border);overflow:auto}
.console-log-tabs button{border:0;border-radius:var(--radius-xs);background:transparent;font-size:12px;font-weight:500;color:var(--muted);min-height:28px;padding:4px 11px;flex-shrink:0}
.console-log-tabs button:hover:not(:disabled){color:var(--text);background:var(--soft)}
.console-log-tabs [aria-selected="true"]{color:var(--text);background:var(--track-active);font-weight:600}
.console-log-filters{display:flex;flex-wrap:wrap;gap:6px;padding:8px 24px;background:var(--top);border-bottom:1px solid var(--border)}
.console-log-filters .log-filter{display:inline-flex;align-items:center;gap:6px;min-height:26px;padding:2px 10px;font-size:12px;border-radius:var(--radius-pill);border-color:var(--border);color:var(--muted);background:transparent}
.console-log-filters .log-filter[aria-pressed="true"]{color:var(--text);background:var(--soft);border-color:var(--border-strong)}
.console-log-filters .log-filter[aria-pressed="false"]{opacity:.55}
.console-log-filters .log-filter-warning[aria-pressed="true"]{color:var(--warning)}
.console-log-filters .log-filter-error[aria-pressed="true"]{color:var(--red)}
.log-count{font-variant-numeric:tabular-nums;min-width:2ch;text-align:right}
.console-logs .console-log-output{flex:1;min-height:0;height:auto;max-height:none;width:100%;max-width:100%;overflow:auto;white-space:pre;overflow-wrap:normal;word-break:normal;margin:0;border:0;border-radius:0;background:var(--code);padding:16px 24px;line-height:1.85}
.console-logs .console-log-output.wrap{white-space:pre-wrap;overflow-wrap:anywhere}
.console-logs .log-line{color:var(--text)}
.console-logs .log-error{color:var(--red)}
.console-logs .log-warning{color:var(--warning)}
.validation-panel{flex:1;border:0;padding:18px 24px;min-width:0;min-height:0;height:auto;max-height:none;overflow:auto;overflow-anchor:none;background:var(--code)}
.validation-history,.validation-status{display:flex;align-items:center;flex-wrap:wrap;gap:12px}
.validation-history{justify-content:space-between;padding-bottom:12px;border-bottom:1px solid var(--border)}
.validation-round{padding:16px 0;border-bottom:1px solid var(--border);min-width:0}
.validation-round:last-child{border-bottom:0}
.validation-time{font-size:12px;font-variant-numeric:tabular-nums;color:var(--muted)}
.validation-status{margin:6px 0;font-size:12px;overflow-wrap:anywhere}
.validation-panel p{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0}
.validation-feed{display:grid;gap:8px;margin-top:10px;min-width:0}
.validation-evidence{border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface-solid);padding:10px 14px;min-width:0;max-width:100%}
.validation-evidence summary{cursor:pointer}
.validation-evidence h3,.validation-evidence-title{font-size:12px;font-weight:600;margin:0;line-height:1.7}
.validation-preview{display:block;font:12px/1.6 "SFMono-Regular",Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;margin-top:4px;max-height:4.8em;overflow:hidden;color:var(--muted)}
.validation-evidence[open] .validation-preview{display:none}
.validation-evidence-body{min-width:0}
.validation-evidence-body .validation-log{margin:8px 0 0;max-height:280px;white-space:pre;overflow-wrap:normal;word-break:normal}
.validation-evidence-body .validation-log.wrap{white-space:pre-wrap;overflow-wrap:anywhere}
.validation-screenshot{display:block;width:auto;height:auto;max-width:min(240px,100%);max-height:150px;object-fit:contain;margin:8px 0 0;border-radius:var(--radius-xs);background:var(--code)}

/* Shared Task / Cache Helpers */
.preview-cache-panel h3{font-size:13px;margin-bottom:8px}
.preview-cache-panel .actions{margin-top:12px}
.build-detail,.preview-log-detail{margin-top:16px;border-top:1px solid var(--border);padding-top:14px;width:100%}
.task-item{display:flex;align-items:flex-start;gap:16px;border-bottom:1px solid var(--border);padding:11px 0}
.task-item:last-child{border-bottom:0;padding-bottom:0}
.task{flex:1;min-width:0}
.task-shortcuts{flex-shrink:0;max-width:40%;justify-content:flex-end}
.task-shortcuts:empty{display:none}
.section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
.section-heading h2{margin:0}.section-heading span{font-size:12px}
summary{cursor:pointer;overflow-wrap:anywhere}
.task summary{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;min-height:30px;padding:4px 0;font-size:13px}
.task summary::before{content:"›";color:var(--muted)}
.task[open]>summary::before{content:"⌄"}
.task summary time{margin-left:auto;font-size:12px;font-variant-numeric:tabular-nums}
.task .task-meta{font-size:12px;margin-top:8px}
.status-line{min-height:44px;margin:0 0 14px;padding:10px 0;border-block:1px solid var(--border);overflow-wrap:anywhere}

/* ============================================================
   VIEW 3: GIT — Unified Tree & Code Review Workbench
   ============================================================ */
main[data-view="git"]{max-width:1520px;padding:24px 40px 28px;margin:0 auto;height:100%;min-height:0;display:flex;flex-direction:column;gap:14px}
main[data-view="git"]>.heading{margin:0;padding:0;align-items:center;background:transparent;flex-shrink:0}
main[data-view="git"]>.heading h1{font-size:24px}
.git-meta{display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:0;flex-shrink:0}
.git-meta>span:first-child{padding:2px 10px;border-radius:var(--radius-pill);background:var(--soft);border:1px solid var(--border-strong);color:var(--text);font:12px/1.5 "SFMono-Regular",Consolas,monospace;font-weight:600}
.git-pull-note{margin:0;padding:14px 18px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);flex-shrink:0}
.git-pull-note textarea,#git-pull-conflict textarea{width:100%;min-height:180px;resize:vertical;margin-top:8px;padding:10px 12px;border:1px solid var(--border-strong);border-radius:var(--radius-sm);background:var(--code);color:var(--text);font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
#git-pull-conflict{width:min(640px,calc(100% - 32px))}
details[data-key="git-changes"]{margin:0;padding:0;background:var(--surface);backdrop-filter:blur(8px);border:1px solid var(--border);border-radius:var(--radius-md);flex-shrink:0;overflow:hidden}
details[data-key="git-changes"]>summary{display:flex;align-items:center;gap:8px;padding:10px 16px;font-size:13px;font-weight:600;color:var(--text);user-select:none}
details[data-key="git-changes"]>summary:hover{background:var(--soft)}
.git-wt-body{border-top:1px solid var(--border);padding:6px 12px;max-height:190px;overflow-y:auto;background:var(--code)}
.git-layout{flex:1;min-height:420px;display:grid;grid-template-columns:minmax(340px,420px) minmax(0,1fr);border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface);backdrop-filter:blur(8px);overflow:hidden}
.git-list-pane{display:flex;flex-direction:column;min-width:0;min-height:0;border-right:1px solid var(--border);background:var(--surface-alt)}
.git-pane-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border);background:var(--top);font-size:12px;font-weight:600;color:var(--muted);flex-shrink:0}
.git-scroll{flex:1;min-height:0;overflow:auto}
.git-history{position:relative;min-width:280px}
.git-graph{position:absolute;inset:0 auto auto 0;pointer-events:none}
.git-rows{position:relative}
.git-row{height:60px;display:flex;flex-direction:column;justify-content:center;gap:4px;padding:0 12px 0 6px;border-bottom:1px solid var(--border);cursor:pointer;position:relative;transition:background .12s ease}
.git-row:last-child{border-bottom:0}
.git-row:hover{background:var(--soft)}
.git-row.is-selected{background:var(--track-active)}
.git-row.is-selected::before{content:"";position:absolute;left:0;top:8px;bottom:8px;width:2px;border-radius:2px;background:var(--primary)}
.git-row-top{display:flex;align-items:center;gap:6px;min-width:0}
.git-row .subject{display:block;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;font-weight:500;color:var(--text);line-height:1.35;text-decoration:none}
.git-row .subject:hover{text-decoration:none;color:var(--text)}
.git-row.is-selected .subject{font-weight:600}
.git-head-pill{flex:none;padding:1px 6px;border-radius:var(--radius-xs);background:var(--soft);border:1px solid var(--border-strong);color:var(--text);font:10.5px/1.4 "SFMono-Regular",Consolas,monospace;font-weight:600}
.git-row-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.git-row-meta-start{display:flex;align-items:center;gap:7px;min-width:0;overflow:hidden}
.git-row-hash{flex:none}
.git-row-hash:hover{text-decoration:none}
.git-row code{font-size:11px;color:var(--muted);background:var(--soft);border:1px solid var(--border);padding:0 5px;border-radius:4px;font-variant-numeric:tabular-nums}
.git-row.is-selected code{color:var(--text);border-color:var(--border-strong)}
.git-row-author{font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.git-row time{font-size:11px;font-variant-numeric:tabular-nums;color:var(--muted-dim);white-space:nowrap;flex:none}
.git-more{margin:10px 12px;align-self:stretch}
.git-detail{min-width:0;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:20px 24px 28px;background:transparent}
.git-detail:empty{display:none}
.git-commit-header{padding-bottom:14px;border-bottom:1px solid var(--border)}
.git-commit-header h2{font-size:16px;font-weight:600;line-height:1.4;margin:0 0 8px;overflow-wrap:anywhere}
.git-commit-meta{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;font-size:12px;color:var(--muted)}
button.git-hash-chip{min-height:24px;padding:2px 8px;gap:5px;border-radius:var(--radius-xs);border:1px solid var(--border-strong);background:var(--soft);color:var(--text);font:11.5px/1.4 "SFMono-Regular",Consolas,monospace;font-weight:500}
button.git-hash-chip .icon{width:12px;height:12px;color:var(--muted)}
.git-commit-author{color:var(--text);font-weight:500}
.git-commit-time{font-variant-numeric:tabular-nums;color:var(--muted)}
.git-commit-body{margin:10px 0 0;padding:10px 12px;font-size:12px;line-height:1.6;max-height:150px;background:var(--code);border:1px solid var(--border);border-radius:var(--radius-xs);color:var(--muted)}
.git-section-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:16px 0 8px}
.git-section-bar h3{margin:0;font-size:12px;font-weight:600;color:var(--muted);letter-spacing:.02em}
.git-count-badge{display:inline-flex;align-items:center;padding:1px 7px;border-radius:var(--radius-pill);background:var(--soft);border:1px solid var(--border);font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--muted)}
.git-tree{list-style:none;margin:0;padding:4px 0;font:12px/1.55 "SFMono-Regular",Consolas,monospace}
.git-tree-wrap{border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--code);max-height:220px;overflow-y:auto;padding:4px}
.git-tree-dir{display:flex;align-items:center;gap:6px;padding:4px 8px;color:var(--muted);font-weight:500;user-select:none}
.git-tree-dir-icon{font-size:11px;color:var(--muted-dim)}
.git-tree-children{list-style:none;margin:0 0 0 11px;padding:0 0 0 9px;border-left:1px solid var(--border)}
.git-tree-file{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:26px;padding:3px 8px;border:0;border-radius:var(--radius-xs);background:transparent;color:var(--text);font:inherit;text-align:left;cursor:pointer}
.git-tree-file:hover:not(:disabled){background:var(--soft)}
.git-tree-file-left{display:flex;align-items:center;gap:7px;min-width:0;overflow:hidden}
.git-tree-file-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.git-status-badge{display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;flex:none;border-radius:4px;font:10.5px/1 "SFMono-Regular",Consolas,monospace;font-weight:700}
.git-status-badge.is-a,.git-status-badge.is-u{color:var(--green);background:color-mix(in srgb,var(--green) 14%,transparent);border:1px solid color-mix(in srgb,var(--green) 32%,transparent)}
.git-status-badge.is-m{color:var(--warning);background:color-mix(in srgb,var(--warning) 14%,transparent);border:1px solid color-mix(in srgb,var(--warning) 32%,transparent)}
.git-status-badge.is-d{color:var(--red);background:color-mix(in srgb,var(--red) 14%,transparent);border:1px solid color-mix(in srgb,var(--red) 32%,transparent)}
.git-status-badge.is-r{color:var(--ai);background:color-mix(in srgb,var(--ai) 14%,transparent);border:1px solid color-mix(in srgb,var(--ai) 32%,transparent)}
.git-file-path{font:12px/1.45 "SFMono-Regular",Consolas,monospace;overflow-wrap:anywhere;min-width:0}
.git-file-dir{color:var(--muted)}
.git-file-name{color:var(--text);font-weight:500}
.git-file-arrow{color:var(--muted-dim)}
.git-diff-stats{display:inline-flex;align-items:center;gap:7px;font:11.5px/1 "SFMono-Regular",Consolas,monospace;font-weight:600;font-variant-numeric:tabular-nums;flex:none}
.git-stat-add{color:var(--green)}
.git-stat-del{color:var(--red)}
.git-diff-blocks{display:flex;flex-direction:column;gap:12px}
.git-diff-file{border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--code);overflow:hidden}
.git-diff-file-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 12px;background:var(--top);border-bottom:1px solid var(--border);min-width:0}
.git-diff-lines{overflow-x:auto;font:12px/1.62 "SFMono-Regular",Consolas,monospace;tab-size:2}
.diff-row{display:grid;grid-template-columns:42px 42px 18px minmax(0,1fr);min-width:fit-content}
.diff-ln{padding:0 6px;text-align:right;color:var(--muted-dim);user-select:none;font-size:11px;font-variant-numeric:tabular-nums;border-right:1px solid var(--border)}
.diff-sig{text-align:center;user-select:none;font-weight:600}
.diff-code{padding:0 12px 0 4px;white-space:pre}
.diff-row.diff-ctx{color:var(--text)}
.diff-row.diff-hunk{grid-template-columns:1fr;padding:4px 12px;color:var(--ai);background:color-mix(in srgb,var(--ai) 9%,transparent);font-size:11.5px;border-block:1px solid var(--border)}
.diff-row.diff-add{color:var(--green);background:color-mix(in srgb,var(--green) 11%,transparent)}
.diff-row.diff-add .diff-ln{background:color-mix(in srgb,var(--green) 14%,transparent);color:color-mix(in srgb,var(--green) 78%,var(--muted))}
.diff-row.diff-del{color:var(--red);background:color-mix(in srgb,var(--red) 11%,transparent)}
.diff-row.diff-del .diff-ln{background:color-mix(in srgb,var(--red) 14%,transparent);color:color-mix(in srgb,var(--red) 78%,var(--muted))}
.diff-row.diff-meta{grid-template-columns:1fr;padding:3px 12px;color:var(--muted-dim);font-size:11.5px}
.git-diff-plain{max-height:360px}
.git-diff-truncated{font-size:12px;margin:4px 0 0}
.file-list{padding-left:20px;overflow-wrap:anywhere;font-size:12px;line-height:1.8}

/* ============================================================
   VIEW 4: DOCUMENTS / SKILL — Centered 1120px Split Reader
   ============================================================ */
main[data-view="documents"]{max-width:none;padding:0;height:100%;display:flex;flex-direction:column}
.document-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:12px 24px;border-bottom:1px solid var(--border);background:var(--surface);backdrop-filter:blur(8px);margin:0;flex-shrink:0}
.document-toolbar input{flex:1;min-width:180px;max-width:360px;background:var(--bg)}
.document-tabs{background:var(--track);border:1px solid var(--border);border-radius:var(--radius-sm);padding:2px;gap:2px}
.document-tabs button{border:0;border-radius:var(--radius-xs);background:transparent;color:var(--muted);font-size:12px;min-height:26px;padding:3px 12px}
.document-toolbar [aria-selected="true"]{color:var(--text);background:var(--track-active);font-weight:600}
.document-layout{flex:1;min-height:0;display:grid;grid-template-columns:256px minmax(0,1fr);background:var(--surface);backdrop-filter:blur(8px);overflow:hidden}
#document-directory{padding:12px 12px 24px;background:var(--surface-alt);border-right:1px solid var(--border);overflow:auto}
#document-directory h3{font-size:11px;font-weight:600;letter-spacing:.04em;color:var(--muted);margin:14px 8px 6px}
button.document-entry{display:block;width:100%;padding:7px 10px;overflow-wrap:anywhere;border:0;border-radius:var(--radius-sm);background:transparent;color:var(--muted);font-size:13px;font-weight:400;text-align:left;min-height:32px}
button.document-entry:hover:not(:disabled){background:var(--soft);color:var(--text);text-decoration:none}
button.document-entry[aria-current]{color:var(--text);background:var(--track-active);font-weight:600}
button.document-entry.document-featured{color:var(--text);font-weight:500}
.document-intro{border-bottom:1px solid var(--border);padding-bottom:16px;margin-bottom:20px}
.document-intro p{margin:6px 0}.document-intro .actions{margin-top:12px}
.document-intro button.link{color:var(--text);text-decoration:underline;text-underline-offset:3px}
.document-intro button.link:hover{color:var(--accent)}
.document-reader-header{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
.document-reader-header h2{font-size:22px;margin:0;min-width:0;flex:1;letter-spacing:-.015em}
.document-reader-header button{flex-shrink:0}
.document-reader-header input{width:100%}
#document-reader{min-width:0;padding:32px clamp(24px,4vw,56px) 56px;overflow:auto;overflow-wrap:anywhere}
#document-reader>*{max-width:1120px;width:100%;margin-inline:auto}
#document-reader>h2{font-size:20px;margin-top:0}
.markdown-content{line-height:1.85;max-width:1120px}
.markdown-content h1{font-size:22px}.markdown-content h2{font-size:18px}.markdown-content h3{font-size:15px}
.markdown-content pre{white-space:pre;overflow:auto;max-width:100%;max-height:none}
.markdown-content blockquote{border-left:3px solid var(--border-strong);margin-left:0;padding-left:16px;color:var(--muted)}
.markdown-content a{color:var(--accent);text-decoration:underline;text-underline-offset:3px}
.doc-table{overflow:auto}.doc-table table{border-collapse:collapse;width:100%}
.doc-table th,.doc-table td{border:1px solid var(--border);padding:8px 10px;text-align:left}

/* Projects Page & Settings Page */
.project-list{background:var(--surface);backdrop-filter:blur(8px);border:1px solid var(--border);border-radius:var(--radius-md);padding:4px 24px}
.project-row{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;padding:16px 0;border-bottom:1px solid var(--border);align-items:center}
.project-row:last-child{border-bottom:0}
.project-row.is-current::before{content:"";position:absolute;left:-24px;top:16px;bottom:16px;width:2.5px;border-radius:0 3px 3px 0;background:var(--primary)}
.project-row h2{margin-bottom:4px;overflow-wrap:anywhere}
.project-controls{margin-top:16px}
.tag{display:inline-flex;align-items:center;margin-top:6px;padding:2px 8px;border-radius:var(--radius-pill);background:var(--soft);border:1px solid var(--border-strong);color:var(--text);font-size:11px;font-weight:600}
.entry{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;max-width:780px;padding-top:20px}
.entry label{grid-column:1/-1}

#ui-vision-settings{max-width:740px;padding:24px 28px;background:var(--surface);backdrop-filter:blur(8px);border:1px solid var(--border);border-radius:var(--radius-md)}
#ui-vision-settings>h2{margin:0 0 8px;font-size:18px}
.model-settings-choice{display:grid;gap:14px;padding:20px 0}
.model-settings-choice+.model-settings-choice{border-top:1px solid var(--border)}
.model-setting-field{display:grid;gap:8px;min-width:0}
.model-setting-field>span{font-size:13px;font-weight:500;color:var(--muted);line-height:1.5}
.model-setting-field>input,.model-setting-field>select{width:100%;min-width:0;min-height:40px;border-radius:var(--radius-sm);padding:8px 12px}
.model-settings-choice>.model-setting-field{grid-template-columns:108px minmax(0,1fr);align-items:center;gap:20px}
.model-settings-custom{margin-left:128px}
.model-settings-custom>select{flex:1;min-width:0;width:0;min-height:38px;text-overflow:ellipsis}
.model-settings-custom>button{flex-shrink:0}
dialog.model-api-dialog{width:480px;max-width:calc(100vw - 32px);max-height:calc(100dvh - 32px);overflow-y:auto;padding:28px;border-radius:var(--radius-lg);box-shadow:var(--shadow-dialog)}
.model-api-dialog form{display:grid;gap:18px;min-width:0}
.model-api-dialog h2{margin:0 0 4px;font-size:19px;line-height:1.4;letter-spacing:-.02em}
.model-api-dialog input::placeholder{color:var(--muted);opacity:.65}
.model-api-dialog .bad{margin:0;font-size:13px;line-height:1.6}
.model-api-dialog .bad:empty,#ui-vision-settings>p:empty{display:none}
.model-api-dialog .model-api-actions{margin-top:6px;padding-top:18px;border-top:1px solid var(--border);gap:10px}
.model-api-actions>button{min-height:38px;min-width:76px;border-radius:var(--radius-sm)}
.model-api-actions>.model-api-delete{margin-right:auto;min-width:0;background:transparent;color:var(--muted);border-color:transparent}
.model-api-actions>.model-api-delete:hover{color:var(--red);border-color:var(--border)}

/* Footer & Fortune Corner */
footer{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:30px;padding:4px 24px;border-top:1px solid var(--border);background:var(--bg);font-size:11px;color:var(--muted);flex-shrink:0}
.footer-start{display:flex;align-items:center;gap:16px;flex-wrap:wrap;min-width:0}
#footer-path{overflow-wrap:anywhere;min-width:0;font-family:"SFMono-Regular",Consolas,monospace;opacity:.85}
#fortune-corner{position:relative;flex:none}
button#fortune-toggle{border:0;background:none;color:var(--muted);font-size:11px;font-weight:400;padding:0;min-height:0;line-height:1.4;white-space:nowrap}
button#fortune-toggle:hover,button#fortune-toggle[aria-expanded="true"]{color:var(--text);background:none;border-color:transparent}
#fortune-panel{position:fixed;z-index:30;overflow:hidden;border:0;border-radius:var(--radius-md);background:transparent;box-shadow:var(--shadow-dialog)}
#fortune-panel[hidden]{display:none!important}
#fortune-panel.fortune-preload{opacity:0;pointer-events:none;left:0;top:0;width:1px;height:1px}
#fortune-panel iframe{display:block;width:100%;height:100%;border:0}

/* Dialogs */
dialog{background:var(--surface-solid);color:var(--text);border:1px solid var(--border-strong);border-radius:var(--radius-lg);padding:24px 28px;width:440px;max-width:calc(100% - 32px);box-shadow:var(--shadow-dialog)}
dialog::backdrop{background:rgba(5,6,10,.64);backdrop-filter:blur(4px)}
dialog h2{font-size:18px;margin-bottom:8px}
dialog .actions{justify-content:flex-end;margin-top:22px}
dialog p{white-space:pre-wrap;overflow-wrap:anywhere}
.qrcode-image{display:block;width:240px;max-width:100%;height:auto;margin:14px 0}
#qrcode-result{width:496px;max-height:calc(100dvh - 32px);overflow:auto}
.qrcode-scan-area{width:min(380px,100%,52dvh);aspect-ratio:1;margin:16px auto;background:#fff;border-radius:var(--radius-md);display:grid;place-items:center;padding:12px}
#qrcode-result-image{display:block;width:100%;height:100%;object-fit:contain}
#qrcode-result .actions{flex-wrap:wrap}
.qrcode-text{white-space:pre-wrap;overflow-wrap:anywhere}
#selection-options{width:100%;min-width:0;margin:12px 0}
#qrcode-confirm label{display:flex;flex-direction:column;gap:8px;margin:14px 0;font-size:13px}
#qrcode-confirm label[hidden]{display:none}
#qrcode-confirm input,#qrcode-confirm select{width:100%;min-width:0}

/* Plugins, Canvas, UI Editor */
.plugin-workspace{min-width:0;display:flex;flex-direction:column;height:100%}
.plugin-status{display:flex;align-items:center;flex-wrap:wrap;gap:12px;padding:12px 24px;border-bottom:1px solid var(--border);background:var(--surface-solid)}
.plugin-status p{margin:0;overflow-wrap:anywhere}
.plugin-frame{display:block;width:100%;height:calc(100dvh - 110px);min-height:520px;border:0;background:var(--bg)}
body.canvas-mode #canvas-views,body.canvas-mode #ui-editor-view{display:flex;flex-direction:column;flex:1;min-height:0;height:100%}
body.canvas-mode .canvas-frame{display:block;flex:1;width:100%;height:100%;min-height:0;border:0;background:var(--bg)}
body.canvas-mode .canvas-toolbar{display:flex;gap:8px;padding:10px 16px;background:var(--top);border-bottom:1px solid var(--border)}

/* Other Workspace (Horizontal Segmented Sub-Nav) */
.other-workspace{display:flex;flex-direction:column;min-width:0;min-height:100%}
.other-tabs[hidden]{display:none}
.other-tabs{display:flex;flex-direction:row;align-items:center;gap:4px;padding:8px 24px;border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:blur(8px);position:sticky;top:0;z-index:5}
.other-tabs button{border:0;border-radius:var(--radius-sm);min-height:30px;padding:4px 14px;background:transparent;color:var(--muted);font-size:13px;font-weight:500}
.other-tabs button:hover:not(:disabled){background:var(--soft);color:var(--text)}
.other-tabs button[aria-selected="true"]{background:var(--track-active);color:var(--text);font-weight:600}
#other-motion,#other-architecture{min-width:0;flex:1}
#other-architecture{padding:24px 32px}
[hidden]{display:none!important}

/* Responsive */
@media(max-width:1120px){
  .overview-body{grid-template-columns:1fr;gap:32px}
  .overview-aside{position:static;padding-left:0;padding-top:24px;border-left:0;border-top:1px solid var(--border)}
  main[data-view="build"]{height:auto;overflow:visible;grid-template-columns:1fr;grid-template-rows:auto;grid-template-areas:"head" "ctrl" "logs" "cache" "hist"}
  main[data-view="build"]>.build-sidebar{display:contents}
  main[data-view="build"]>.console-logs{height:520px}
  main[data-view="git"]{height:auto}
  .git-layout{grid-template-columns:1fr;min-height:0}
  .git-list-pane{border-right:0;border-bottom:1px solid var(--border);max-height:340px}
  .git-detail{max-height:none}
}
@media(max-width:760px){
  body{overflow:auto}
  .app-shell{flex-direction:column;height:auto;min-height:100dvh;overflow:visible}
  .sidebar,body.sidebar-collapsed .sidebar{width:100%;border-right:0;border-bottom:1px solid var(--border)}
  .sidebar>.top,body.sidebar-collapsed .sidebar>.top{flex-direction:row;align-items:center;padding:10px 14px;min-height:48px}
  body.sidebar-collapsed .brand-meta,body.sidebar-collapsed .project-switch{display:flex}
  body.sidebar-collapsed .mark{width:auto;height:28px;background:transparent;border:0}
  body.sidebar-collapsed .mark svg.brand-logo-full{display:block}
  body.sidebar-collapsed .mark svg.brand-logo-compact{display:none}
  body.sidebar-collapsed .sidebar nav .nav-label,body.sidebar-collapsed .theme-opt-label{display:inline}
  #sidebar-toggle{display:none}
  .project-switch{padding:0 14px 10px}
  .sidebar nav,body.sidebar-collapsed .sidebar nav{flex-direction:row;overflow-x:auto;padding:6px 12px 10px;gap:4px}
  .nav-group{flex-direction:row;gap:4px;align-items:center}
  .nav-group-label{display:none}
  .sidebar nav button,body.sidebar-collapsed .sidebar nav button{width:auto;height:auto;padding:6px 10px;justify-content:center}
  .sidebar-footer,body.sidebar-collapsed .sidebar-footer{flex-direction:row;padding:8px 14px}
  body.sidebar-collapsed .theme-segmented{grid-template-columns:1fr 1fr;width:auto;flex:1}
  body.sidebar-collapsed .theme-option{width:auto;padding:3px 8px}
  .workspace-shell{min-height:0}
  .stage-scroll{overflow:visible}
  body.canvas-mode .app-shell{height:100dvh}
  body.canvas-mode .workspace-shell{flex:1;min-height:0}
  .navigation{padding:0 14px}
  .navigation #context{display:none}
  main,main[data-view="overview"],main[data-view="build"],main[data-view="git"]{padding:20px 16px 36px}
  .env-strip{grid-template-columns:1fr;gap:10px}
  .document-layout{grid-template-columns:1fr;height:auto}
  #document-directory{max-height:220px;border-right:0;border-bottom:1px solid var(--border)}
  #document-reader{padding:18px 16px}
  #other-architecture{padding:16px 14px}
  .other-tabs{padding:8px 14px}
  footer{padding:6px 14px}
}
@media(max-width:520px){
  .navigation,.stage-meta{gap:6px}
  .stage-title .crumb-group,.stage-title .crumb-sep{display:none}
  .context-check-actions{width:100%}
  .context-source{grid-template-columns:minmax(0,1fr)}
  .context-source .actions{justify-content:flex-start}
  .preview-window-settings{grid-template-columns:1fr}
  #ui-vision-settings{padding:18px}
  .model-settings-choice>.model-setting-field{grid-template-columns:minmax(0,1fr);gap:8px}
  .model-settings-custom{margin-left:0}
  dialog.model-api-dialog{padding:22px}
  .model-api-dialog input{font-size:16px}
}

.check-section-head{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.check-report{max-width:1440px;margin:0 auto;display:flex;flex-direction:column;gap:24px}.check-report h2{font-size:15px;font-weight:600;margin:0}.check-report h3{font-size:14px;font-weight:600;margin:0}.check-section-head{margin-bottom:12px}.check-section-head>.muted{font-size:12px}
.check-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.check-toolbar-info{display:flex;align-items:center;gap:12px;flex-wrap:wrap;min-width:0}.check-toolbar-info>.muted{font-size:12px}.check-scope{min-height:28px;padding:3px 10px;border-radius:var(--radius-pill)}
.check-block{border:0;border-top:1px solid var(--border);border-radius:0;background:transparent;overflow:visible}
.check-bar{position:relative;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;min-height:44px;padding:14px 0 10px;background:transparent}
.check-block.is-open>.check-bar{border-bottom:0}
.check-bar.is-collapsible{cursor:pointer;user-select:none}.check-bar.is-collapsible:hover{color:var(--text)}.check-bar.is-collapsible:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px;border-radius:var(--radius-xs)}
.check-bar-title{display:flex;align-items:center;gap:10px;min-width:0}.check-bar-meta{font-size:12px;color:var(--muted)}
.check-chevron{display:inline-block;width:14px;text-align:center;color:var(--muted);font-size:16px;line-height:1;transition:transform .15s}.check-block.is-open .check-chevron{transform:rotate(90deg)}
.check-loading{display:flex;flex-direction:column;gap:20px}.check-loading-head{display:flex;flex-direction:column;gap:16px;padding:20px 24px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface);backdrop-filter:blur(8px)}.check-loading-row{display:flex;align-items:center;gap:16px}.check-loading-text strong{display:block;font-size:15px}.check-loading-text span{display:block;margin-top:4px;font-size:12px;color:var(--muted)}
.check-spinner{flex:none;width:22px;height:22px;border-radius:50%;border:2.5px solid var(--border-strong);border-top-color:var(--text);animation:check-spin .8s linear infinite}.check-progress{height:3px;border-radius:3px;background:var(--border);overflow:hidden}.check-progress:after{content:"";display:block;height:100%;width:34%;border-radius:3px;background:var(--primary);animation:check-slide 1.4s ease-in-out infinite}
.check-skeleton{border-radius:8px;background:linear-gradient(90deg,var(--soft) 25%,var(--soft-hover) 50%,var(--soft) 75%);background-size:200% 100%;animation:check-shimmer 1.6s linear infinite}.check-skeleton-title{width:140px;height:18px}.check-skeleton-stat{height:96px;border-radius:var(--radius-md)}.check-skeleton-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:20px}.check-skeleton-tile{height:180px;border-radius:var(--radius-md)}
.check-empty{display:flex;flex-direction:column;align-items:flex-start;gap:12px;padding:24px;border:1px dashed var(--border-strong);border-radius:var(--radius-md);background:var(--surface)}.check-empty p{margin:0;max-width:640px;font-size:13px}.check-inline-error{font-size:12px;color:var(--red)}
@keyframes check-spin{to{transform:rotate(360deg)}}@keyframes check-slide{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}@keyframes check-shimmer{to{background-position:-200% 0}}@media(prefers-reduced-motion:reduce){.check-spinner,.check-progress:after,.check-skeleton{animation:none}}@media(max-width:650px){.check-skeleton-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
.check-block-body{padding:8px 0 12px}@media(max-width:650px){.check-block-body{padding:6px 0 10px}.check-bar{padding:10px 0 8px}}.check-block-body[hidden]{display:none}.check-actions{display:flex;gap:10px;flex-wrap:wrap}
.check-tile{border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface);backdrop-filter:blur(6px);min-width:0;text-align:left;overflow:hidden;white-space:normal}
.check-graph-note{font-size:11px;margin:10px 0 0}
.check-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:0 0 24px}.check-stat{display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;gap:6px;padding:16px 18px}.check-stat-label{font-size:12px;color:var(--muted)}.check-stat strong{font-size:32px;line-height:1.15;letter-spacing:-.8px;font-variant-numeric:tabular-nums}.check-stat-note{font-size:11px;color:var(--muted-dim)}
.check-warm{border-color:color-mix(in srgb,var(--red) 28%,var(--border))}.check-warm strong{color:var(--red)}.check-caution{border-color:color-mix(in srgb,var(--warning) 28%,var(--border))}.check-caution strong{color:var(--warning)}
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
@media(max-width:650px){.other-tabs button{flex:1;justify-content:center;padding:6px 10px;font-size:12px}#other-architecture{padding:14px}.motion-library-frame{height:calc(100dvh - 160px)}}
${architecturePreviewStyles}
`;
