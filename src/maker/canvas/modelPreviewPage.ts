declare const __MAKER_MODEL_PREVIEW_SCRIPT__: string;

export function getCanvasModelPreviewHtml(scriptOverride?: string) {
  const script =
    scriptOverride ||
    (typeof __MAKER_MODEL_PREVIEW_SCRIPT__ === 'string'
      ? __MAKER_MODEL_PREVIEW_SCRIPT__
      : 'document.getElementById("status").textContent="请重新构建 Maker 控制台后查看模型。";');
  return (
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>模型旋转预览</title><style>' +
    '*{box-sizing:border-box}html,body{margin:0;height:100%;background:#182022;color:#e3e9e8;font:14px/1.5 sans-serif}body{display:flex;flex-direction:column}header{display:flex;gap:12px;align-items:center;padding:12px 16px;border-bottom:1px solid #3c494c}#status{flex:1;overflow-wrap:anywhere}button{background:#293739;border:1px solid #536367;color:inherit;border-radius:6px;padding:6px 14px;cursor:pointer}#viewport{flex:1;min-height:0;overflow:hidden}canvas{display:block;touch-action:none}footer{font-size:12px;color:#aab8b8;padding:8px 16px}' +
    'body.thumbnail header,body.thumbnail footer{display:none}' +
    '#close{width:30px;height:30px;flex:none;padding:0;border:0;background:transparent;font-size:24px;line-height:1}#close[hidden]{display:none}#close:hover{background:#ffffff16}header{gap:8px}' +
    'body.template footer,body.template button{display:none}body.template[data-state=ready] header{display:none}body.template header{padding:8px;font-size:11px}' +
    '</style></head><body data-state="loading"><header><span id="status" role="status">正在读取本地模型与贴图…</span><button id="reset">复位</button><button id="close" aria-label="关闭预览" title="关闭预览" hidden>×</button></header><div id="viewport"></div><footer>静态外观预览 · 基础色贴图；不播放骨骼动画，光照效果不等同游戏引擎。</footer><script>' +
    script.replace(/<\/script/gi, '<\\/script') +
    '</script></body></html>'
  );
}
