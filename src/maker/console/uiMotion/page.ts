import { consoleThemeScript, consoleThemeStyles } from '../../webTheme.js';
import { uiMotionScript } from './script.js';
import { uiMotionStyles } from './styles.js';

/** Bundled, local-only demonstrations. No game files or generation APIs are accessed. */
export function getUiMotionHtml(): string {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>UI 动效库</title><style>${consoleThemeStyles}${uiMotionStyles}</style></head><body>
<main><div id="library"><div class="page-heading"><div><p class="eyebrow">让界面动起来</p><h1>UI 动效库</h1><p>先看效果，再让 AI 用到你的界面。</p></div><a href="#catalog" class="button">直接挑选动效 ↓</a></div>
<section class="hero"><div class="hero-preview"><canvas id="hero-canvas" width="1120" height="630" aria-label="星屿冒险完整 UI 动效示例"></canvas><span class="scene-tag">可交互示例 / 星屿冒险</span><div class="hero-status" id="hero-status" role="status">主界面 · 点右侧按钮试一试</div></div><div class="hero-controls"><p class="eyebrow">先玩一下</p><h2>效果放进界面，<br>才知道好不好用。</h2><p>试着打开背包、领取奖励。<br>喜欢当前效果，就加入选择。</p><div class="scene-actions"><button data-scene="list">▤ 打开背包</button><button data-scene="reward">✦ 领取奖励</button><button data-scene="modal">▣ 打开弹窗</button><button data-scene="spotlight">◎ 新手引导</button></div><div class="hero-bottom"><button id="hero-pick" class="primary">选用当前效果</button><button id="hero-home">回到主界面</button><button id="autoplay">顺序演示</button></div><small>演示操作不发奖、不扣费。<br>网页模拟 LuaTween 配方，非引擎实机。</small></div></section>
<section id="catalog"><div class="catalog-heading"><div><p class="eyebrow">按用途挑选</p><h2>你想让哪里动起来？</h2></div><span id="visible-count">14 个效果</span></div><div id="filters" class="filters" aria-label="用途筛选"></div><div id="cards" class="cards"></div></section>
<div class="selection"><div><strong id="count">尚未选择动效</strong><p id="selected-label">点「播放」看效果，点「选用」加入清单。</p></div><button id="clear">清空</button><button id="generate" class="primary" disabled>生成 AI 指令 →</button></div><p class="footer">Lua-Tween 的 14 个配方分别演示；应用到游戏时需在 UrhoX 中验证布局与点击。</p></div></main>
<dialog id="viewer"><div class="dialog-head"><div><p class="eyebrow">放大体验</p><h2 id="viewer-title"></h2></div><button id="close-viewer">关闭 ×</button></div><canvas id="viewer-canvas" width="1120" height="630"></canvas><p id="viewer-desc"></p><div class="dialog-actions"><button id="viewer-play">重播效果</button><button id="viewer-dismiss">关闭演示弹窗</button><button id="viewer-pick" class="primary">选用这个效果</button></div><details><summary>AI 实现参考</summary><p id="recipe"></p></details></dialog>
<dialog id="handoff"><div class="dialog-head"><div><p class="eyebrow">最后一步 · 交给 AI</p><h2>用到你的哪个界面？</h2></div><button id="close-handoff">关闭 ×</button></div><label for="target">界面名称</label><input id="target" placeholder="例如：背包界面" maxlength="60"><p>AI 会读取真实界面，再决定每个效果放在哪里。</p><textarea id="prompt" readonly aria-label="给 AI 的实现指令"></textarea><button id="copy" class="primary">复制给 AI</button><p id="copy-status" role="status"></p></dialog>

<script>${consoleThemeScript}
(function () {${uiMotionScript}
})();</script></body></html>`;
}
