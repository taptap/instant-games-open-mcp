import { consoleScript } from './webScript.js';
import { consoleStyles } from './webStyles.js';
import { consoleIconLicense } from './webIcons.js';
import { MAKER_QR_CATEGORIES } from '../qrcodePreflight.js';
import { MAKER_BRAND_SVG } from './brandIcon.js';

const categoryLabels: Record<(typeof MAKER_QR_CATEGORIES)[number], string> = {
  rpg: '角色扮演',
  casual: '休闲',
  action: '动作',
  strategy: '策略',
  simulation: '模拟',
  trivia: '问答',
  arcade: '街机',
  adventure: '冒险',
  card: '卡牌',
  sports: '体育',
  racing: '竞速',
  puzzle: '益智',
  educational: '教育',
  music: '音乐',
  word: '文字',
  board: '桌游',
};

export function getConsoleHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Maker 本地控制台</title><style>${consoleStyles}</style></head>
<body class="compact-chrome">
<div class="app-shell">
  <aside class="sidebar" id="console-sidebar" aria-label="控制台侧边栏">
    <header class="top">
      <div class="brand">
        <button class="mark" id="maker-mark" type="button" aria-label="TapTap 制造控制台品牌标记">${MAKER_BRAND_SVG}</button>
        <div class="brand-meta">
          <select id="maker-version-picker" aria-label="Maker MCP 版本" disabled><option>版本加载中</option></select>
        </div>
      </div>
      <button id="sidebar-toggle" class="icon-button sidebar-toggle" type="button" aria-label="折叠侧边栏" title="折叠侧边栏" aria-pressed="false"></button>
    </header>
    <div class="toolbar project-switch">
      <select id="project-picker" aria-label="当前项目" disabled><option value="">选择本地项目</option></select>
      <button id="projects-button" class="icon-button" aria-label="本地项目列表" title="本地项目列表"></button>
    </div>
    <nav aria-label="主导航">
      <div class="nav-group">
        <span class="nav-group-label">工作区</span>
        <button data-page="overview" data-nav-icon="layoutGrid" title="项目"><span class="nav-label">项目</span></button>
        <button data-page="build" data-nav-icon="hammer" title="构建与测试"><span class="nav-label">构建与测试</span></button>
        <button data-page="git" data-nav-icon="gitBranch" title="Git"><span class="nav-label">Git</span></button>
      </div>
      <div class="nav-group">
        <span class="nav-group-label">创作台</span>
        <button data-page="canvas" data-nav-icon="layers" title="自由画布"><span class="nav-label">自由画布</span></button>
        <button data-page="ui-editor" data-nav-icon="layoutTemplate" title="UI 编辑器"><span class="nav-label">UI 编辑器</span></button>
        <span id="plugin-tabs" class="plugin-tabs"></span>
      </div>
      <div class="nav-group">
        <span class="nav-group-label">资料与工具</span>
        <button data-page="documents" data-nav-icon="bookOpen" title="文档 / Skill" disabled><span class="nav-label">文档 / Skill</span></button>
        <button data-page="other" data-nav-icon="compass" title="其他"><span class="nav-label">其他</span></button>
      </div>
    </nav>
    <div class="sidebar-footer">
      <div class="theme-segmented" role="group" aria-label="外观主题">
        <input id="theme" type="checkbox" role="switch" checked aria-label="深色模式" class="sr-only">
        <button type="button" class="theme-option" data-theme-value="light" aria-pressed="false" title="浅色模式"><span class="theme-opt-label">浅色</span></button>
        <button type="button" class="theme-option" data-theme-value="dark" aria-pressed="true" title="深色模式"><span class="theme-opt-label">深色</span></button>
      </div>
      <button id="settings-button" class="icon-button" aria-label="设置" title="设置"></button>
    </div>
  </aside>
  <div class="workspace-shell">
    <div class="navigation">
      <div class="stage-meta">
        <span id="stage-title" class="stage-title"><span class="crumb-group">工作区</span><span class="crumb-sep" aria-hidden="true">/</span><span class="crumb-page">项目概览</span></span>
      </div>
      <div class="context">
        <span id="context">正在连接本地服务</span><span id="connection" role="status">连接中</span>
        <button id="close-canvas" type="button" class="dialog-close-icon" aria-label="关闭当前项目画布" title="关闭当前项目画布" hidden>×</button>
        <button id="console-shutdown" type="button" class="console-shutdown" disabled>关闭控制台</button>
      </div>
    </div>
    <div id="feedback" class="feedback" role="alert" hidden><p id="feedback-text"></p><button id="dismiss" class="dialog-close-icon" aria-label="关闭提示" title="关闭提示">×</button></div>
    <div class="stage-scroll">
      <main id="view" aria-busy="true"><p class="empty">正在读取本地项目</p></main>
      <section id="other-view" class="other-workspace" aria-label="其他工具" hidden>
        <aside class="other-tabs" role="tablist" aria-label="其他工具页签" aria-orientation="horizontal">
          <button id="other-architecture-tab" role="tab" aria-controls="other-architecture" data-other-tab="architecture">项目检查</button>
          <button id="other-motion-tab" role="tab" aria-controls="other-motion" data-other-tab="motion">UI 动效</button>
        </aside>
        <div id="other-motion" role="tabpanel" aria-labelledby="other-motion-tab"></div>
        <div id="other-architecture" role="tabpanel" aria-labelledby="other-architecture-tab" hidden></div>
      </section>
      <section id="plugin-views" aria-label="插件工作区" hidden></section>
      <section id="canvas-views" aria-label="自由画布" hidden></section>
      <section id="ui-editor-view" aria-label="UI 编辑器" hidden></section>
    </div>
    <div id="announcement" role="status" aria-live="polite" class="context" hidden></div>
    <footer><div class="footer-start"><span id="version">Maker 本地服务</span>
    <section id="fortune-corner" aria-label="开发者日签" hidden>
      <button id="fortune-toggle" type="button" aria-expanded="false" aria-controls="fortune-panel">独立游戏开发日签</button>
    </section>
    </div><span id="footer-path"></span></footer>
  </div>
</div>
<div id="fortune-panel" hidden>
  <iframe id="fortune-frame" title="gDEV日签 · 独立游戏开发者老黄历" sandbox="allow-scripts allow-same-origin" loading="eager" referrerpolicy="no-referrer"></iframe>
</div>
<dialog id="confirm" aria-labelledby="confirm-title" aria-describedby="confirm-message">
  <form method="dialog">
    <h2 id="confirm-title"></h2><p id="confirm-message"></p>
    <div class="actions"><button value="cancel" autofocus>取消</button><button id="confirm-accept" class="primary" value="accept">确认</button></div>
  </form>
</dialog>
<dialog id="selection-dialog" aria-labelledby="selection-title" aria-describedby="selection-message">
  <form method="dialog">
    <h2 id="selection-title"></h2><p id="selection-message"></p>
    <select id="selection-options" aria-labelledby="selection-title"></select>
    <div class="actions"><button value="cancel" autofocus>取消</button><button id="selection-accept" class="primary" value="accept" disabled>确认并继续</button></div>
  </form>
</dialog>
<dialog id="qrcode-confirm" aria-labelledby="qrcode-title">
  <form method="dialog">
    <h2 id="qrcode-title">生成测试二维码？</h2>
    <p id="qrcode-project"></p>
    <p id="qrcode-developer" hidden></p>
    <p id="qrcode-effects"></p>
    <label id="qrcode-name-field">游戏名称<input id="qrcode-name" aria-label="游戏名称" maxlength="200"></label>
    <label id="qrcode-category-field">游戏分类<select id="qrcode-category" aria-label="游戏分类">
      <option value="">请选择分类</option>
      ${MAKER_QR_CATEGORIES.map((category) => `<option value="${category}">${categoryLabels[category]}</option>`).join('')}
    </select></label>
    <label id="qrcode-orientation-field">游戏方向（首次设置后不可更改）
      <select id="qrcode-orientation" aria-label="游戏发布方向">
        <option value="">请选择横屏或竖屏</option>
        <option value="landscape">横屏</option><option value="portrait">竖屏</option>
      </select>
    </label>
    <p id="qrcode-fixed-orientation" class="muted"></p>
    <div class="actions"><button value="cancel" autofocus>取消</button><button id="qrcode-accept" class="primary" value="accept">生成二维码</button></div>
  </form>
</dialog>
<dialog id="git-pull-conflict" aria-labelledby="git-pull-conflict-title">
  <header class="dialog-title-row"><h2 id="git-pull-conflict-title">这些文件两边都改过</h2><form method="dialog"><button value="close" class="dialog-close-icon" aria-label="关闭" title="关闭">×</button></form></header>
  <p id="git-pull-conflict-summary"></p>
  <textarea id="git-pull-conflict-prompt" readonly aria-label="交给 AI 的提示词"></textarea>
  <div class="actions">
    <button id="git-pull-conflict-copy" type="button">复制给 AI</button>
  </div>
</dialog>
<dialog id="qrcode-result" aria-labelledby="qrcode-result-title">
  <header class="dialog-title-row"><h2 id="qrcode-result-title">扫码测试</h2><form method="dialog"><button value="close" autofocus class="dialog-close-icon" aria-label="关闭" title="关闭">×</button></form></header>
  <p id="qrcode-result-project"></p>
  <div class="qrcode-scan-area"><img id="qrcode-result-image" alt="手机测试二维码" referrerpolicy="no-referrer"></div>
  <p id="qrcode-result-status" role="status"></p>
  <p class="muted">使用 TapTap App 扫码。二维码失效后需重新生成。</p>
  <div class="actions">
    <button id="qrcode-result-reload" type="button" hidden>重新加载图片</button>
    <a id="qrcode-result-original" class="preview-link" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">打开原图</a>
  </div>
</dialog>
<noscript>此控制台需要启用 JavaScript。</noscript>
<!-- ${consoleIconLicense} -->
<script>${consoleScript}</script>
</body></html>`;
}
