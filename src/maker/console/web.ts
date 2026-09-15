import { consoleScript } from './webScript.js';
import { consoleStyles } from './webStyles.js';
import { consoleIconLicense } from './webIcons.js';

export function getConsoleHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Maker 本地控制台</title><style>${consoleStyles}</style></head>
<body>
<header class="top">
  <div class="brand"><span class="mark" aria-hidden="true">M</span>Maker 控制台</div>
  <div class="toolbar">
    <select id="project-picker" aria-label="当前项目" disabled><option value="">选择本地项目</option></select>
    <button id="projects-button" class="icon-button" aria-label="本地项目列表" title="本地项目列表"></button>
    <label class="theme">深色<input id="theme" type="checkbox" role="switch" checked aria-label="深色模式"></label>
  </div>
</header>
<nav aria-label="主导航">
  <button data-page="overview">项目</button>
  <button data-page="build">构建与测试</button>
  <button data-page="git">Git</button>
</nav>
<div class="context"><span id="context">正在连接本地服务</span><span id="connection" role="status">连接中</span></div>
<div id="feedback" class="feedback" role="alert" hidden><p id="feedback-text"></p><button id="dismiss">关闭</button></div>
<main id="view" aria-busy="true"><p class="empty">正在读取本地项目</p></main>
<div id="announcement" role="status" aria-live="polite" class="context" hidden></div>
<footer><span id="version">Maker 本地服务</span><span id="footer-path"></span></footer>
<dialog id="confirm" aria-labelledby="confirm-title" aria-describedby="confirm-message">
  <form method="dialog">
    <h2 id="confirm-title"></h2><p id="confirm-message"></p>
    <div class="actions"><button value="cancel" autofocus>取消</button><button id="confirm-accept" class="primary" value="accept">确认</button></div>
  </form>
</dialog>
<noscript>此控制台需要启用 JavaScript。</noscript>
<!-- ${consoleIconLicense} -->
<script>${consoleScript}</script>
</body></html>`;
}
