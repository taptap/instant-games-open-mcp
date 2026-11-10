import { consoleThemeScript, consoleThemeStyles } from '../../webTheme.js';
import { motionContract, motionExamples } from './catalog.js';
import { motionDemoScript } from './demo.js';
import { getOriginalMotionExamples } from './originals.js';
import { getUiMotionLab, getUiMotionSampleCatalog, getUiMotionSampleFile } from './sample.js';
import { uiMotionScript } from './script.js';
import { uiMotionStyles } from './styles.js';

function scriptJSON(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/** Local, bundled examples. The same HTML also runs offline without game files. */
export function getUiMotionHtml(initialId = '', standalone = false): string {
  const localSamples = standalone ? [] : getUiMotionSampleCatalog();
  const motionLab = standalone ? undefined : getUiMotionLab();
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>UI 动效</title><style>${consoleThemeStyles}${uiMotionStyles}</style></head><body>
<main>
  <header class="page-heading"><div><h1>UI 动效</h1><p>选一个界面，点开试试。</p></div><span class="index">04 SCENES / 03 TRANSITIONS</span></header>
  <nav class="library-variants" aria-label="演示类型"><button data-library="vector" aria-pressed="true">NanoVG 绘制</button><button data-library="original" aria-pressed="false">图片 UI</button></nav>
  <div id="original-library" hidden>
    <section aria-labelledby="original-scenes-title"><div class="section-heading"><h2 id="original-scenes-title">界面</h2><span>05</span></div><div id="original-scenes" class="scene-grid"></div></section>
    <section aria-labelledby="original-transitions-title"><div class="section-heading"><h2 id="original-transitions-title">转场</h2><span>03</span></div><div id="original-transitions" class="transition-grid"></div></section>
    <p class="page-note" id="original-note">独立 PNG · 可编辑 UI · 原生 Lua</p>
  </div>
  <div id="vector-library">
  ${!standalone && !localSamples.length && getUiMotionSampleFile() ? `<article class="example-card local-sample"><a class="example-open" href="/ui-motion/vector-sample" target="_blank" rel="noopener"><div class="example-media"><iframe src="/ui-motion/vector-sample?thumbnail=1" title="主菜单新设计样板" loading="lazy" tabindex="-1"></iframe><span class="example-play">查看样板 ↗</span></div><div class="example-body"><h3>主菜单 · 新设计样板</h3><p>独立背景与角色 · NanoVG UI</p></div></a></article>` : ''}
  <section aria-labelledby="scenes-title"><div class="section-heading"><h2 id="scenes-title">完整界面</h2><span>04</span></div><div id="scenes" class="scene-grid"></div></section>
  <section aria-labelledby="transitions-title"><div class="section-heading"><h2 id="transitions-title">转场</h2><span>03</span></div><div id="transitions" class="transition-grid"></div></section>
  ${motionLab ? `<section class="more-motion" aria-label="更多 UI 动效"><button id="open-motion-lab"><span class="more-motion-mark" aria-hidden="true">◇</span><span><strong>更多动效</strong><small>7 套界面风格 · 43 项交互与动效</small></span><span class="more-motion-action">进入动效工坊 ↗</span></button></section>` : ''}
  <p class="page-note">NanoVG 绘制 · 可交互演示</p>
  </div>
</main>
<dialog id="local-viewer" class="viewer original-viewer local-viewer" aria-labelledby="local-title"><header class="viewer-head"><h2 id="local-title"></h2><span class="viewer-tag">NanoVG</span><button id="close-local">关闭 ×</button></header><iframe id="local-frame" title="NanoVG 动效交互演示"></iframe><div class="original-actions"><button id="use-local" class="primary">选用 · 交给 AI</button><a id="open-local" target="_blank" rel="noopener">打开独立演示 ↗</a></div></dialog>
<dialog id="original-viewer" class="viewer original-viewer" aria-labelledby="original-title">
  <header class="viewer-head"><h2 id="original-title"></h2><span class="viewer-tag">图片 UI</span><button id="close-original" aria-label="关闭图片 UI 演示">关闭 ×</button></header>
  <iframe id="original-frame" title="图片 UI 动效演示"></iframe>
  <div class="original-actions"><button id="original-assets">素材原图</button><button id="use-original" class="primary">选用 · 交给 AI</button><a id="open-original" target="_blank" rel="noopener">打开独立演示 ↗</a></div>
</dialog>
<dialog id="asset-viewer" class="viewer" aria-labelledby="asset-title"><header class="viewer-head"><h2 id="asset-title">独立素材</h2><button id="close-assets">关闭 ×</button></header><p id="asset-status" class="scene-summary" role="status"></p><div id="asset-grid" class="asset-grid"></div></dialog>
<dialog id="viewer" class="viewer" aria-labelledby="viewer-title">
  <header class="viewer-head"><button id="back" hidden>← 返回</button><h2 id="viewer-title"></h2><span id="viewer-tag" class="viewer-tag"></span><button id="close-viewer" aria-label="关闭演示">关闭 ×</button></header>
  <div class="viewer-content"><div class="demo-column">
    <div id="stage" class="stage" tabindex="0" role="region" aria-label="交互演示，方向键逐帧，空格播放暂停"><canvas id="stage-canvas" width="1280" height="720" aria-label="UI 动效演示"></canvas><div id="hotspots" class="hotspots"></div></div>
    <div id="touch-actions" class="touch-actions" aria-label="演示操作"></div>
    <div class="player-controls"><button id="play" aria-pressed="false">播放</button><button id="replay">重播</button><button id="previous-frame" aria-label="上一帧">← 帧</button><button id="next-frame" aria-label="下一帧">帧 →</button><button id="timeline-unit">秒 → 帧</button><output id="time"></output><select id="speed" aria-label="播放速度"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select></div>
    <div class="keyframe-timeline" aria-label="动效关键帧"><div id="keyframe-tracks"></div><p id="keyframe-detail"></p></div><p id="viewer-summary" class="scene-summary"></p>
  </div><aside class="demo-rail"><div><p class="rail-label">分段体验</p><div id="clips" class="clips"></div></div><div class="reference-actions"><button id="use" class="primary">选用 · 交给 AI</button><a id="download" class="download-link" href="/ui-motion/demo">下载完整示例 ↗</a></div></aside></div>
  <details class="reference-details"><summary>交互与实现参考</summary><p id="interaction"></p><p id="source-note"></p><pre id="reference-json"></pre></details>
</dialog>
<dialog id="handoff" class="handoff" aria-labelledby="handoff-title"><header class="viewer-head"><h2 id="handoff-title">交给你的 AI</h2><button id="close-handoff" aria-label="关闭 AI 指令">关闭 ×</button></header><textarea id="prompt" readonly aria-label="AI 实现指令"></textarea><button id="copy" class="primary">复制指令</button><p id="copy-status" role="status"></p></dialog>
<script>${consoleThemeScript}
(function () {
const localSamples = ${scriptJSON(localSamples)};
const motionLab = ${scriptJSON(motionLab ?? null)};
const examples = ${scriptJSON(motionExamples)};
const contract = ${scriptJSON(motionContract)};
const originals = ${scriptJSON(getOriginalMotionExamples())};
const initialExample = ${scriptJSON(initialId)};
const standalone = ${standalone};
${motionDemoScript}
${uiMotionScript}
})();</script></body></html>`;
}

export function getUiMotionReference(id: string) {
  const example = motionExamples.find((item) => item.id === id);
  if (!example) return null;
  return {
    version: 1,
    variant: 'vector-candidate',
    example,
    contract: motionContract,
    files: [
      { path: 'demo.html', content: getUiMotionHtml(id, true) },
      {
        path: 'motion.json',
        content: JSON.stringify({ contract: motionContract, examples: motionExamples }, null, 2),
      },
      {
        path: 'README.md',
        content: [
          '# Maker UI 动效参考 / ' + example.id + ' ' + example.name,
          '直接打开 demo.html 即可运行；不需要安装依赖、启动服务或连接账号。',
          'HTML 内含完整渲染、按钮热区、播放控制和宿主交互代码。motion.json 与内置预览共用数据。',
          '示例包包含关联场景，默认打开所选示例；不会写入游戏或调用生成接口。',
          '时间线只采样姿态；当前台词、选中角色与切页由演示宿主控制。Seek 取消完成回调。',
          motionContract.provenance,
          motionContract.boundary,
          ...Object.entries(motionContract.native).map(([key, value]) => key + ': ' + value),
          'Maker 原生接入后另行验证打开关闭、连点、重入、不同分辨率的布局和命中。',
        ].join('\n'),
      },
    ],
  };
}
