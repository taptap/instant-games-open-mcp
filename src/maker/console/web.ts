import { consoleScript } from './webScript.js';
import { consoleStyles } from './webStyles.js';
import { consoleIconLicense } from './webIcons.js';
import { MAKER_QR_CATEGORIES } from '../qrcodePreflight.js';

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
<body>
<header class="top">
  <div class="brand"><button class="mark" id="maker-mark" type="button" aria-label="Maker 控制台品牌标记">M</button>Maker 控制台
    <select id="maker-version-picker" aria-label="Maker MCP 版本" disabled><option>版本加载中</option></select>
  </div>
  <div class="toolbar">
    <select id="project-picker" aria-label="当前项目" disabled><option value="">选择本地项目</option></select>
    <button id="projects-button" class="icon-button" aria-label="本地项目列表" title="本地项目列表"></button>
    <label class="theme">深色<input id="theme" type="checkbox" role="switch" checked aria-label="深色模式"></label>
  </div>
</header>
<div class="navigation">
<nav aria-label="主导航">
  <button data-page="overview">项目</button>
  <button data-page="build">构建与测试</button>
  <button data-page="git">Git</button>
  <button data-page="documents" disabled>文档 / Skill</button>
  <span id="plugin-tabs" class="plugin-tabs"></span>
</nav>
<div class="context"><span id="context">正在连接本地服务</span><span id="connection" role="status">连接中</span></div>
</div>
<div id="feedback" class="feedback" role="alert" hidden><p id="feedback-text"></p><button id="dismiss">关闭</button></div>
<main id="view" aria-busy="true"><p class="empty">正在读取本地项目</p></main>
<section id="plugin-views" aria-label="插件工作区" hidden></section>
<div id="announcement" role="status" aria-live="polite" class="context" hidden></div>
<footer><div class="footer-start"><span id="version">Maker 本地服务</span>
<section id="fortune-corner" aria-label="开发者日签" hidden>
  <button id="fortune-toggle" type="button" aria-expanded="false" aria-controls="fortune-panel">独立游戏开发日签</button>
</section>
</div><span id="footer-path"></span></footer>
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
  <h2 id="git-pull-conflict-title">这些文件两边都改过</h2>
  <p id="git-pull-conflict-summary"></p>
  <textarea id="git-pull-conflict-prompt" readonly aria-label="交给 AI 的提示词"></textarea>
  <div class="actions">
    <button id="git-pull-conflict-copy" type="button">复制给 AI</button>
    <form method="dialog"><button value="close">关闭</button></form>
  </div>
</dialog>
<dialog id="qrcode-result" aria-labelledby="qrcode-result-title">
  <h2 id="qrcode-result-title">扫码测试</h2>
  <p id="qrcode-result-project"></p>
  <div class="qrcode-scan-area"><img id="qrcode-result-image" alt="手机测试二维码" referrerpolicy="no-referrer"></div>
  <p id="qrcode-result-status" role="status"></p>
  <p class="muted">使用 TapTap App 扫码。二维码失效后需重新生成。</p>
  <div class="actions">
    <button id="qrcode-result-reload" type="button" hidden>重新加载图片</button>
    <a id="qrcode-result-original" class="preview-link" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">打开原图</a>
    <form method="dialog"><button value="close" autofocus>关闭</button></form>
  </div>
</dialog>
<noscript>此控制台需要启用 JavaScript。</noscript>
<!-- ${consoleIconLicense} -->
<script>${consoleScript}</script>
</body></html>`;
}
