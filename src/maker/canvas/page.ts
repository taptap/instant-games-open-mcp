import { nodesInMarquee, removeNodes, saveAcknowledgement } from './edit.js';
import { createBrowserCanvasDocumentStore, dispatchCanvasStoreRequest } from './store.js';
import {
  createSequenceProcessor,
  defaultSequenceSettings,
  duplicateIndicesFromSignatures,
  estimateSequenceFrameCount,
  maxSequenceFrameCount,
  maxSequenceInputFrameCount,
  removeConnectedBackgroundPixels,
  sequenceActionsForCard,
  signatureSimilarity,
  DEFAULT_SEQUENCE_SIDE,
  MAX_ATLAS_SIDE,
  MAX_SEQUENCE_FRAMES,
  MAX_SEQUENCE_PIXEL_BUDGET,
  MAX_SEQUENCE_SIDE,
  MAX_SEQUENCE_SOURCE_SIDE,
} from './sequence.js';
import { createSequenceUiController } from './sequenceUi.js';
import { createSequenceEditor, renderSequenceResult } from './sequenceEditor.js';
import { SEQUENCE_EDITOR_STYLES } from './sequenceEditorStyles.js';
import { appendAnimation, createAnimationCards } from './animation.js';
import { renderGenerationResult } from './generationResult.js';

export const CANVAS_PAGE_MARKER = 'maker-canvas-page';

function replaceCanvasPageText(page: string, search: string, replacement: string): string {
  if (!page.includes(search))
    throw new Error('Canvas page template is out of sync: ' + search.slice(0, 96));
  return page.replace(search, replacement);
}

const template =
  "<!doctype html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title data-maker-canvas=\"maker-canvas-page\">创作画布</title>\n<style>\n:root { color-scheme: light dark; font-family: sans-serif; }\nbody { margin: 0; height: 100vh; display: flex; flex-direction: column; background: #101114; color: #f4f1ea; }\nheader { display: flex; gap: 8px; align-items: center; padding: 8px 12px; border-bottom: 1px solid #2a2d34; }\nheader button, header select { background: #1c1f26; color: inherit; border: 1px solid #3a3f4a; border-radius: 6px; padding: 6px 8px; }\n#status { margin-left: auto; font-size: 13px; }\n#error { min-height: 1.2em; padding: 0 12px; color: #e6b15c; font-size: 13px; }\n#board { position: relative; flex: 1; overflow: hidden; background-image: radial-gradient(#2c3038 1px, transparent 1px); background-size: 22px 22px; touch-action: none; }\n#wires { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }\n.wire { fill: none; stroke: #d7b56d; stroke-width: 2; }\n#world { position: absolute; inset: 0; transform-origin: 0 0; }\n.card { position: absolute; box-sizing: border-box; border: 1px solid #3d4250; border-radius: 10px; background: #1a1d24; padding: 8px; overflow: hidden; }\n.card.selected { outline: 2px solid #e6b15c; }\n.card img { width: 100%; height: calc(100% - 28px); object-fit: contain; }\n.card p { margin: 8px 0 0; color: #b7b1a6; font-size: 13px; }\n.port { position: absolute; right: -10px; top: 50%; width: 22px; height: 22px; border-radius: 50%; border: 0; background: #e6b15c; color: #1a1d24; }\n#marquee { position: absolute; border: 1px solid #e6b15c; background: rgba(230,177,92,.15); pointer-events: none; }\n</style>\n</head>\n<body>\n<header>\n  <strong>创作画布</strong>\n  <select id=\"canvases\" aria-label=\"画布\"></select>\n  <button id=\"new-canvas\" type=\"button\">新建</button>\n  <button id=\"add-image\" type=\"button\">导入图片</button>\n  <button id=\"add-video\" type=\"button\">视频输入卡</button>\n  <button id=\"add-note\" type=\"button\">便签</button>\n  <button id=\"undo\" type=\"button\">撤销</button>\n  <button id=\"redo\" type=\"button\">重做</button>\n  <button id=\"save\" type=\"button\">保存</button>\n  <span id=\"status\">未保存</span>\n</header>\n<p id=\"error\"></p>\n<div id=\"board\"><svg id=\"wires\"></svg><div id=\"world\"></div><div id=\"marquee\" hidden></div></div>\n<input id=\"file\" type=\"file\" accept=\"image/png,image/jpeg,image/webp\" hidden>\n<script>/*__HELPERS__*/\n\n(function () {\n  const key = new URLSearchParams(location.search).get('project') || '';\n  const base = '/api/projects/' + encodeURIComponent(key);\n  const board = document.getElementById('board');\n  const world = document.getElementById('world');\n  const wires = document.getElementById('wires');\n  const status = document.getElementById('status');\n  const error = document.getElementById('error');\n  const select = document.getElementById('canvases');\n  const file = document.getElementById('file');\n  let documentState = null;\n  let savedKey = '';\n  let past = [];\n  let future = [];\n  let timer = 0;\n  let drag = null;\n  let space = false;\n  let opening = null;\n  const media = {};\n  const selected = new Set();\n  window.makerCanvasUnsaved = false;\n\n  function layout(value) {\n    const copy = JSON.parse(JSON.stringify(value));\n    delete copy.revision;\n    return JSON.stringify(copy);\n  }\n  function dirty() {\n    return Boolean(documentState) && layout(documentState) !== savedKey;\n  }\n  function publishDirty() {\n    window.makerCanvasUnsaved = dirty();\n  }\n  function setStatus(text) { status.textContent = text; publishDirty(); }\n  function setError(text) { error.textContent = text || ''; }\n  function remember() {\n    past.push(JSON.parse(JSON.stringify(documentState)));\n    if (past.length > 60) past.shift();\n    future = [];\n  }\n  async function request(path, options) {\n    const response = await fetch(base + path, options);\n    const body = await response.json().catch(function () { return {}; });\n    if (!response.ok) {\n      const err = new Error(body.error || ('请求失败 ' + response.status));\n      err.status = response.status;\n      throw err;\n    }\n    return body;\n  }\n  function render() {\n    if (!documentState) return;\n    const view = documentState.viewport;\n    world.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.scale + ')';\n    world.replaceChildren();\n    for (const node of documentState.nodes) {\n      const card = document.createElement('article');\n      card.className = 'card ' + node.type + (selected.has(node.id) ? ' selected' : '');\n      card.dataset.id = node.id;\n      card.style.left = node.x + 'px';\n      card.style.top = node.y + 'px';\n      card.style.width = node.width + 'px';\n      card.style.height = node.height + 'px';\n      const title = document.createElement('strong');\n      title.textContent = node.title || '未命名';\n      card.append(title);\n      if (node.type === 'image' && node.assetPath && media[node.assetPath]) {\n        const img = document.createElement('img');\n        img.alt = node.title;\n        img.src = media[node.assetPath];\n        card.append(img);\n      }\n      if (node.type === 'note') {\n        const text = document.createElement('p');\n        text.textContent = node.text || '便签';\n        card.append(text);\n      }\n      if (node.type === 'video') {\n        const hint = document.createElement('p');\n        hint.textContent = '视频输入卡。生视频将在下一阶段接入。';\n        card.append(hint);\n      }\n      if (node.type === 'image' && node.assetPath) {\n        const port = document.createElement('button');\n        port.type = 'button';\n        port.className = 'port';\n        port.textContent = '+';\n        port.title = '拖到视频输入卡，保存为首帧';\n        port.addEventListener('pointerdown', function (event) { startWire(event, node.id); });\n        card.append(port);\n      }\n      card.addEventListener('pointerdown', function (event) {\n        if (event.target.classList.contains('port')) return;\n        selectNode(node.id, event.shiftKey);\n        startDrag(event, node.id);\n      });\n      world.append(card);\n    }\n    wires.setAttribute('viewBox', '0 0 ' + board.clientWidth + ' ' + board.clientHeight);\n    wires.replaceChildren();\n    for (const edge of documentState.edges) {\n      const from = documentState.nodes.find(function (node) { return node.id === edge.from; });\n      const to = documentState.nodes.find(function (node) { return node.id === edge.to; });\n      if (!from || !to) continue;\n      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');\n      const x1 = view.x + (from.x + from.width) * view.scale;\n      const y1 = view.y + (from.y + from.height / 2) * view.scale;\n      const x2 = view.x + to.x * view.scale;\n      const y2 = view.y + (to.y + to.height / 2) * view.scale;\n      path.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + 40) + ' ' + y1 + ', ' + (x2 - 40) + ' ' + y2 + ', ' + x2 + ' ' + y2);\n      path.setAttribute('class', 'wire');\n      wires.append(path);\n    }\n    if (layout(documentState) === savedKey) setStatus('已保存');\n    else if (status.textContent !== '保存中…') setStatus('未保存');\n    else publishDirty();\n  }\n  function selectNode(id, shift) {\n    if (!shift) selected.clear();\n    if (selected.has(id) && shift) selected.delete(id);\n    else selected.add(id);\n    render();\n  }\n  function localPoint(event) {\n    const rect = board.getBoundingClientRect();\n    return { x: event.clientX - rect.left, y: event.clientY - rect.top };\n  }\n  function startDrag(event, id) {\n    if (space) return;\n    const node = documentState.nodes.find(function (item) { return item.id === id; });\n    drag = { kind: 'move', id: id, x: event.clientX, y: event.clientY, ox: node.x, oy: node.y, moved: false };\n    board.setPointerCapture(event.pointerId);\n  }\n  function startWire(event, id) {\n    event.stopPropagation();\n    drag = { kind: 'wire', id: id };\n    board.setPointerCapture(event.pointerId);\n  }\n  board.addEventListener('pointerdown', function (event) {\n    if (event.target !== board && event.target !== world) return;\n    if (space || event.button === 1) {\n      drag = { kind: 'pan', x: event.clientX, y: event.clientY, ox: documentState.viewport.x, oy: documentState.viewport.y };\n      return;\n    }\n    const point = localPoint(event);\n    drag = { kind: 'marquee', x: point.x, y: point.y };\n    selected.clear();\n    render();\n  });\n  board.addEventListener('pointermove', function (event) {\n    if (!drag || !documentState) return;\n    if (drag.kind === 'move') {\n      const dx = (event.clientX - drag.x) / documentState.viewport.scale;\n      const dy = (event.clientY - drag.y) / documentState.viewport.scale;\n      if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 3) {\n        remember();\n        drag.moved = true;\n      }\n      const node = documentState.nodes.find(function (item) { return item.id === drag.id; });\n      node.x = drag.ox + dx;\n      node.y = drag.oy + dy;\n      markDirty();\n      render();\n    } else if (drag.kind === 'marquee') {\n      const box = document.getElementById('marquee');\n      const point = localPoint(event);\n      box.hidden = false;\n      box.style.left = Math.min(drag.x, point.x) + 'px';\n      box.style.top = Math.min(drag.y, point.y) + 'px';\n      box.style.width = Math.abs(point.x - drag.x) + 'px';\n      box.style.height = Math.abs(point.y - drag.y) + 'px';\n    } else if (drag.kind === 'pan') {\n      documentState.viewport.x = drag.ox + event.clientX - drag.x;\n      documentState.viewport.y = drag.oy + event.clientY - drag.y;\n      markDirty();\n      render();\n    }\n  });\n  board.addEventListener('pointerup', function (event) {\n    if (!drag) return;\n    if (drag.kind === 'marquee') {\n      const point = localPoint(event);\n      selected.clear();\n      for (const id of nodesInMarquee(documentState.nodes, documentState.viewport, { x1: drag.x, y1: drag.y, x2: point.x, y2: point.y })) {\n        selected.add(id);\n      }\n      document.getElementById('marquee').hidden = true;\n      render();\n    }\n    if (drag.kind === 'wire') {\n      const hit = document.elementFromPoint(event.clientX, event.clientY);\n      const card = hit && hit.closest ? hit.closest('[data-id]') : null;\n      if (card) connect(drag.id, card.dataset.id);\n    }\n    drag = null;\n  });\n  board.addEventListener('wheel', function (event) {\n    if (!documentState) return;\n    event.preventDefault();\n    const point = localPoint(event);\n    const before = documentState.viewport.scale;\n    const next = Math.min(4, Math.max(0.15, before * (event.deltaY > 0 ? 0.9 : 1.1)));\n    const worldX = (point.x - documentState.viewport.x) / before;\n    const worldY = (point.y - documentState.viewport.y) / before;\n    documentState.viewport.scale = next;\n    documentState.viewport.x = point.x - worldX * next;\n    documentState.viewport.y = point.y - worldY * next;\n    markDirty();\n    render();\n  }, { passive: false });\n  function markDirty() {\n    setStatus('未保存');\n    clearTimeout(timer);\n    timer = setTimeout(function () { void flush(); }, 800);\n  }\n  function connect(fromId, toId) {\n    const from = documentState.nodes.find(function (node) { return node.id === fromId; });\n    const to = documentState.nodes.find(function (node) { return node.id === toId; });\n    if (!from || !to || from.type !== 'image' || !from.assetPath || to.type !== 'video') {\n      setError('首帧线只能从已导入图片连到视频输入卡。');\n      return;\n    }\n    remember();\n    documentState.edges = documentState.edges.filter(function (edge) { return edge.to !== toId; });\n    documentState.edges.push({ id: crypto.randomUUID(), from: fromId, to: toId, kind: 'first-frame' });\n    setError('');\n    markDirty();\n    render();\n  }\n  function add(type, point) {\n    remember();\n    const node = {\n      id: crypto.randomUUID(),\n      type: type,\n      x: point.x,\n      y: point.y,\n      width: type === 'note' ? 180 : 220,\n      height: type === 'note' ? 120 : 150,\n      title: type === 'image' ? '图片' : type === 'video' ? '视频输入' : '便签',\n    };\n    if (type === 'note') node.text = '便签';\n    documentState.nodes.push(node);\n    selected.clear();\n    selected.add(node.id);\n    markDirty();\n    render();\n  }\n  async function saveOnce() {\n    if (!documentState) return true;\n    const submittedId = documentState.id;\n    const snapshot = JSON.parse(JSON.stringify(documentState));\n    const submittedLayout = layout(snapshot);\n    if (submittedLayout === savedKey) {\n      if (documentState && documentState.id === submittedId && layout(documentState) === submittedLayout) setStatus('已保存');\n      return true;\n    }\n    setStatus('保存中…');\n    try {\n      const saved = await request('/canvases/' + submittedId, {\n        method: 'PUT',\n        headers: { 'content-type': 'application/json' },\n        body: JSON.stringify(snapshot),\n      });\n      const ack = saveAcknowledgement({\n        currentId: documentState ? documentState.id : null,\n        currentLayout: documentState ? layout(documentState) : null,\n        submittedId: submittedId,\n        submittedLayout: submittedLayout,\n        savedRevision: saved.revision,\n      });\n      if (!ack.apply) return true;\n      documentState.revision = ack.revision;\n      savedKey = ack.savedKey;\n      setStatus(ack.pending ? '未保存' : '已保存');\n      setError('');\n      return !ack.pending;\n    } catch (caught) {\n      if (!documentState || documentState.id !== submittedId) return false;\n      setStatus('未保存');\n      setError(caught.message || '保存失败');\n      return false;\n    }\n  }\n  async function flush() {\n    let guard = 0;\n    while (dirty() && guard < 5) {\n      guard += 1;\n      const ok = await saveOnce();\n      if (!ok) return false;\n    }\n    return !dirty();\n  }\n  function mediaUrl(assetPath) {\n    return base + '/canvas-media?path=' + encodeURIComponent(assetPath);\n  }\n  async function loadMedia(assetPath) {\n    media[assetPath] = mediaUrl(assetPath);\n  }\n  async function openDocument(id) {\n    const token = {};\n    opening = token;\n    const loaded = await request('/canvases/' + id);\n    if (opening !== token) return;\n    documentState = loaded;\n    savedKey = layout(loaded);\n    past = [];\n    future = [];\n    selected.clear();\n    select.value = id;\n    for (const node of documentState.nodes) {\n      if (node.assetPath) await loadMedia(node.assetPath);\n      if (opening !== token) return;\n    }\n    setStatus('已保存');\n    setError('');\n    render();\n  }\n  async function leaveCurrent() {\n    const id = documentState && documentState.id;\n    const ok = await flush();\n    if (documentState && documentState.id === id && dirty()) {\n      setError('当前画布还有未保存编辑，已留在此画布。');\n      if (id) select.value = id;\n      return false;\n    }\n    return ok;\n  }\n  async function boot() {\n    if (!key) {\n      setError('缺少项目标识。');\n      return;\n    }\n    let list = await request('/canvases');\n    if (!list.length) {\n      const created = await request('/canvases', {\n        method: 'POST',\n        headers: { 'content-type': 'application/json' },\n        body: JSON.stringify({ title: '创作画布' }),\n      });\n      list = [{ id: created.id, title: created.title }];\n    }\n    select.replaceChildren();\n    for (const item of list) {\n      const option = document.createElement('option');\n      option.value = item.id;\n      option.textContent = item.title;\n      select.append(option);\n    }\n    await openDocument(list[0].id);\n  }\n  select.addEventListener('change', function () {\n    const next = select.value;\n    const current = documentState && documentState.id;\n    if (next === current) return;\n    void leaveCurrent().then(function (ok) {\n      if (!ok) return;\n      void openDocument(next);\n    });\n  });\n  document.getElementById('new-canvas').addEventListener('click', function () {\n    void leaveCurrent().then(async function (ok) {\n      if (!ok || (documentState && dirty())) return;\n      const created = await request('/canvases', {\n        method: 'POST',\n        headers: { 'content-type': 'application/json' },\n        body: JSON.stringify({ title: '创作画布' }),\n      });\n      if (documentState && dirty()) return;\n      const option = document.createElement('option');\n      option.value = created.id;\n      option.textContent = created.title;\n      select.append(option);\n      await openDocument(created.id);\n    });\n  });\n  document.getElementById('add-note').addEventListener('click', function () { add('note', { x: 80, y: 80 }); });\n  document.getElementById('add-video').addEventListener('click', function () { add('video', { x: 360, y: 80 }); });\n  document.getElementById('add-image').addEventListener('click', function () { file.click(); });\n  file.addEventListener('change', function () {\n    const chosen = file.files && file.files[0];\n    file.value = '';\n    if (!chosen || !documentState) return;\n    const canvasId = documentState.id;\n    void chosen.arrayBuffer().then(function (bytes) {\n      return fetch(base + '/canvases/' + canvasId + '/images', {\n        method: 'POST',\n        headers: { 'content-type': chosen.type || 'application/octet-stream' },\n        body: bytes,\n      });\n    }).then(function (response) {\n      return response.json().then(function (body) { return { ok: response.ok, body: body }; });\n    }).then(async function (result) {\n      if (!result.ok) {\n        setError(result.body.error || '导入失败');\n        return;\n      }\n      if (!documentState || documentState.id !== canvasId) {\n        setError('已离开原画布。图片已写入当前项目，但没有放进其他画布。');\n        return;\n      }\n      remember();\n      const node = {\n        id: crypto.randomUUID(),\n        type: 'image',\n        x: 80,\n        y: 220,\n        width: 220,\n        height: 160,\n        title: (chosen.name.replace(/\\.[^.]+$/, '') || '图片').slice(0, 80),\n        assetPath: result.body.relativePath,\n      };\n      documentState.nodes.push(node);\n      await loadMedia(result.body.relativePath);\n      if (!documentState || documentState.id !== canvasId) return;\n      selected.clear();\n      selected.add(node.id);\n      setError('');\n      markDirty();\n      render();\n    }).catch(function (caught) { setError(caught.message || '导入失败'); });\n  });\n  document.getElementById('undo').addEventListener('click', function () {\n    const previous = past.pop();\n    if (!previous || !documentState) return;\n    future.unshift(JSON.parse(JSON.stringify(documentState)));\n    previous.revision = documentState.revision;\n    documentState = previous;\n    markDirty();\n    render();\n  });\n  document.getElementById('redo').addEventListener('click', function () {\n    const next = future.shift();\n    if (!next || !documentState) return;\n    past.push(JSON.parse(JSON.stringify(documentState)));\n    next.revision = documentState.revision;\n    documentState = next;\n    markDirty();\n    render();\n  });\n  window.addEventListener('keydown', function (event) {\n    if (event.code === 'Space') space = true;\n    const meta = event.metaKey || event.ctrlKey;\n    if (meta && event.key === 'z') {\n      event.preventDefault();\n      document.getElementById(event.shiftKey ? 'redo' : 'undo').click();\n    }\n  });\n  window.addEventListener('keyup', function (event) { if (event.code === 'Space') space = false; });\n  document.getElementById('save').addEventListener('click', function () { void flush(); });\n  void boot().catch(function (caught) { setError(caught.message); });\n})();\n</script>\n</body>\n</html>\n";

export function getCanvasPageHtml(): string {
  const helpers = [
    'function __name(target) { return target; }',
    'const MAX_SEQUENCE_FRAMES = ' + MAX_SEQUENCE_FRAMES + ';',
    'const MAX_SEQUENCE_SIDE = ' + MAX_SEQUENCE_SIDE + ';',
    'const MAX_SEQUENCE_SOURCE_SIDE = ' + MAX_SEQUENCE_SOURCE_SIDE + ';',
    'const MAX_SEQUENCE_PIXEL_BUDGET = ' + MAX_SEQUENCE_PIXEL_BUDGET + ';',
    'const MAX_ATLAS_SIDE = ' + MAX_ATLAS_SIDE + ';',
    'const DEFAULT_SEQUENCE_SIDE = ' + DEFAULT_SEQUENCE_SIDE + ';',
    estimateSequenceFrameCount.toString(),
    maxSequenceFrameCount.toString(),
    maxSequenceInputFrameCount.toString(),
    signatureSimilarity.toString(),
    duplicateIndicesFromSignatures.toString(),
    defaultSequenceSettings.toString(),
    sequenceActionsForCard.toString(),
    removeConnectedBackgroundPixels.toString(),
    sequenceActionsForCard.toString(),
    createSequenceProcessor.toString(),
    renderSequenceResult.toString(),
    createSequenceEditor.toString(),
    appendAnimation.toString(),
    createAnimationCards.toString(),
    renderGenerationResult.toString(),
    createSequenceUiController.toString(),
    createBrowserCanvasDocumentStore.toString(),
    dispatchCanvasStoreRequest.toString(),
    saveAcknowledgement.toString(),
    nodesInMarquee.toString(),
    removeNodes.toString(),
  ].join('\n');
  let page = template;
  page = replaceCanvasPageText(
    page,
    '  <button id="add-image" type="button">导入图片</button>',
    '  <button id="add-image" type="button">导入图片</button>\n  <button id="add-video-source" type="button">导入视频</button>'
  );
  page = replaceCanvasPageText(
    page,
    '<input id="file" type="file" accept="image/png,image/jpeg,image/webp" hidden>',
    '<input id="file" type="file" accept="image/png,image/jpeg,image/webp" hidden>\n<input id="video-file" type="file" accept="video/mp4,video/webm,video/quicktime" hidden>\n<video id="sequence-source" hidden playsinline></video>'
  );
  page = replaceCanvasPageText(
    page,
    '<strong>创作画布</strong>',
    '<strong id="canvas-title">创作画布</strong>'
  );
  page = replaceCanvasPageText(
    page,
    '  <button id="new-canvas" type="button">新建</button>',
    '  <button id="new-canvas" type="button">新建</button>\n  <button id="rename-canvas" type="button">重命名</button>\n  <button id="fit-canvas" type="button">适配内容</button>\n  <button id="delete-selected" type="button">删除选中</button>'
  );
  page = replaceCanvasPageText(
    page,
    '.card p { margin: 8px 0 0; color: #b7b1a6; font-size: 13px; }',
    '.card p { margin: 8px 0 0; color: #b7b1a6; font-size: 13px; }\n.card textarea { box-sizing: border-box; width: 100%; height: calc(100% - 28px); resize: none; border: 0; background: transparent; color: inherit; font: inherit; }\n.card.video img { height: 72px; object-fit: cover; }\n.card.video-source { height: 210px; }\n.video-source-preview { width: 100%; height: 112px; object-fit: contain; background: #090a0c; }\n.card.sequence { display: flex; flex-direction: column; padding: 12px; overflow: auto; }\n.sequence-content { display: flex; flex-direction: column; gap: 8px; height: 100%; }\n.sequence-heading, .sequence-progress, .sequence-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }\n.sequence-status, .sequence-info { color: #b7b1a6; font-size: 12px; }\n.sequence-steps { display: flex; flex-wrap: wrap; gap: 5px; }\n.sequence-step { padding: 3px 6px; border-radius: 10px; background: #262a33; color: #aaa; font-size: 11px; }\n.sequence-step.active { background: #604c2b; color: #ffe2a5; }\n.sequence-step.complete { background: #254a3c; color: #b9f0d3; }\n.sequence-fields { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 6px; max-height: 108px; overflow: auto; }\n.sequence-field { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: #bbb; }\n.sequence-field input, .sequence-field select { min-width: 0; width: 100%; box-sizing: border-box; }\n.sequence-check { font-size: 11px; display: flex; align-items: center; gap: 4px; }\n.sequence-thumbnails, .sequence-candidates { display: flex; flex-wrap: wrap; gap: 5px; }\n.sequence-thumbnails canvas, .sequence-candidates canvas { width: 64px; height: 48px; object-fit: contain; background: #090a0c; }\n.sequence-candidates label { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; }\n.sequence-atlas { max-width: 100%; max-height: 140px; object-fit: contain; }\n.sequence-error { color: #ff9c8a; }\n.sequence-actions button { background: #1c1f26; color: inherit; border: 1px solid #3a3f4a; border-radius: 6px; padding: 5px 8px; }\n.sequence-progress { font-size: 12px; }\n.sequence-progress progress { flex: 1; }\n.resize-handle { position: absolute; right: 2px; bottom: 2px; width: 14px; height: 14px; padding: 0; border: 0; background: #e6b15c; cursor: nwse-resize; }\n#board.drop-target { outline: 2px solid #e6b15c; outline-offset: -4px; }'
  );
  page = replaceCanvasPageText(
    page,
    "  const base = '/api/projects/' + encodeURIComponent(key);",
    [
      '  const store = createBrowserCanvasDocumentStore(key);',
      '  const sequenceProcessor = createSequenceProcessor({ maxSourceSide: MAX_SEQUENCE_SOURCE_SIDE, maxOutputSide: MAX_SEQUENCE_SIDE, maxAtlasSide: MAX_ATLAS_SIDE, estimateFrameCount: estimateSequenceFrameCount, maxAtlasFrameCount: maxSequenceFrameCount, duplicateFrameIndices: duplicateIndicesFromSignatures });',
      '  let sequenceUi = null;',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "  const file = document.getElementById('file');",
    "  const file = document.getElementById('file');\n  const videoFile = document.getElementById('video-file');\n  const sequenceVideo = document.getElementById('sequence-source');"
  );
  page = replaceCanvasPageText(
    page,
    '  const selected = new Set();',
    '  const selected = new Set();\n  let pendingAssetImports = 0;\n  const pendingImportWaiters = [];\n  window.makerCanvasSequenceRunning = false;'
  );
  page = replaceCanvasPageText(
    page,
    '  let opening = null;',
    [
      '  let opening = null;',
      '  let activeCanvasWrite = Promise.resolve();',
      '  function persistActiveCanvas(id) {',
      '    const next = activeCanvasWrite.catch(function () {}).then(function () { return store.setActiveCanvasId(id); });',
      '    activeCanvasWrite = next;',
      '    return next;',
      '  }',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    [
      "      if (node.type === 'note') {",
      "        const text = document.createElement('p');",
      "        text.textContent = node.text || '便签';",
      '        card.append(text);',
      '      }',
    ].join('\n'),
    [
      "      if (node.type === 'note') {",
      "        const editor = document.createElement('textarea');",
      "        editor.value = node.text || '便签';",
      "        editor.setAttribute('aria-label', '便签内容');",
      "        editor.addEventListener('focus', function () { editor.dataset.historyRecorded = ''; editor.dataset.originalValue = node.text || '便签'; });",
      "        editor.addEventListener('input', function () {",
      '          if (editor.value === node.text) return;',
      "          if (!editor.dataset.historyRecorded && editor.value !== editor.dataset.originalValue) { remember(); editor.dataset.historyRecorded = 'true'; }",
      '          node.text = editor.value;',
      '          markDirty();',
      '        });',
      "        editor.addEventListener('pointerdown', function (event) { event.stopPropagation(); });",
      '        card.append(editor);',
      '      }',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    [
      "      if (node.type === 'video') {",
      "        const hint = document.createElement('p');",
      "        hint.textContent = '视频输入卡。生视频将在下一阶段接入。';",
      '        card.append(hint);',
      '      }',
    ].join('\n'),
    [
      "      if (node.type === 'video') {",
      '        const edge = documentState.edges.find(function (item) { return item.to === node.id; });',
      '        const source = edge && documentState.nodes.find(function (item) { return item.id === edge.from; });',
      '        if (source && source.assetPath && media[source.assetPath]) {',
      "          const preview = document.createElement('img');",
      "          preview.alt = '首帧来源：' + source.title;",
      '          preview.src = media[source.assetPath];',
      '          card.append(preview);',
      '        }',
      "        const hint = document.createElement('p');",
      "        hint.textContent = source ? '首帧：' + source.title : '拖入已导入图片作为首帧。生视频将在下一阶段接入。';",
      '        card.append(hint);',
      '        if (edge) {',
      "          const disconnect = document.createElement('button');",
      "          disconnect.type = 'button';",
      "          disconnect.textContent = '断开首帧';",
      "          disconnect.addEventListener('click', function (event) { event.stopPropagation(); remember(); documentState.edges = documentState.edges.filter(function (item) { return item.id !== edge.id; }); markDirty(); render(); });",
      '          card.append(disconnect);',
      '        }',
      '      }',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "      if (node.type === 'image' && node.assetPath) {\n        const port = document.createElement('button');",
    [
      "      if (node.type === 'video-source' && node.assetPath) {",
      "        const player = document.createElement('video');",
      "        player.className = 'video-source-preview';",
      '        player.controls = true;',
      "        player.preload = 'metadata';",
      '        player.playsInline = true;',
      '        player.src = media[node.assetPath] || store.mediaUrl(node.assetPath);',
      '        card.append(player);',
      "        const launch = document.createElement('button');",
      "        launch.type = 'button';",
      "        launch.textContent = '拆序列帧';",
      "        launch.addEventListener('click', function (event) { event.stopPropagation(); sequenceUi.createFromVideo(node.id); });",
      '        card.append(launch);',
      '      }',
      "      if (node.type === 'sequence') {",
      '        const sourceVideo = documentState.nodes.find(function (item) { return item.id === node.sourceVideoId; });',
      '        sequenceUi.renderCard(card, node, sourceVideo);',
      '      }',
      "      if (node.type === 'image' && node.assetPath) {",
      "        const port = document.createElement('button');",
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "        port.addEventListener('pointerdown', function (event) { startWire(event, node.id); });",
    [
      "        port.addEventListener('pointerdown', function (event) { startWire(event, node.id); });",
      "            port.addEventListener('click', function (event) {",
      '              event.stopPropagation();',
      "              add('video', { x: node.x + node.width + 48, y: node.y }, true);",
      '              connect(node.id, selected.values().next().value, false);',
      '            });',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "      card.addEventListener('pointerdown', function (event) {",
    [
      "      const resizeHandle = document.createElement('button');",
      "      resizeHandle.type = 'button';",
      "      resizeHandle.className = 'resize-handle';",
      "      resizeHandle.setAttribute('aria-label', '调整卡片大小');",
      "      resizeHandle.addEventListener('pointerdown', function (event) { startResize(event, node.id); });",
      '      card.append(resizeHandle);',
      "      card.addEventListener('pointerdown', function (event) {",
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "        if (event.target.classList.contains('port')) return;",
    "        if (event.target.closest('textarea, input, select, button, video')) return;"
  );
  page = replaceCanvasPageText(
    page,
    [
      '    if (!shift) selected.clear();',
      '    if (selected.has(id) && shift) selected.delete(id);',
      '    else selected.add(id);',
    ].join('\n'),
    [
      '    if (shift && selected.has(id)) selected.delete(id);',
      '    else {',
      '      if (!shift && !selected.has(id)) selected.clear();',
      '      selected.add(id);',
      '    }',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "    const node = documentState.nodes.find(function (item) { return item.id === id; });\n    drag = { kind: 'move', id: id, x: event.clientX, y: event.clientY, ox: node.x, oy: node.y, moved: false };",
    [
      '    const positions = documentState.nodes.filter(function (item) { return selected.has(item.id); }).map(function (item) { return { id: item.id, x: item.x, y: item.y }; });',
      '    if (!positions.some(function (item) { return item.id === id; })) return;',
      "    drag = { kind: 'move', x: event.clientX, y: event.clientY, positions: positions, moved: false };",
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    '  function startWire(event, id) {',
    [
      '  function startResize(event, id) {',
      '    event.stopPropagation();',
      '    const node = documentState.nodes.find(function (item) { return item.id === id; });',
      "    drag = { kind: 'resize', id: id, x: event.clientX, y: event.clientY, width: node.width, height: node.height, moved: false };",
      '    board.setPointerCapture(event.pointerId);',
      '  }',
      '  function startWire(event, id) {',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "    drag = { kind: 'wire', id: id };",
    "    drag = { kind: 'wire', id: id, x: event.clientX, y: event.clientY, moved: false };"
  );
  page = replaceCanvasPageText(
    page,
    [
      '      const node = documentState.nodes.find(function (item) { return item.id === drag.id; });',
      '      node.x = drag.ox + dx;',
      '      node.y = drag.oy + dy;',
    ].join('\n'),
    [
      '      for (const position of drag.positions) {',
      '        const node = documentState.nodes.find(function (item) { return item.id === position.id; });',
      '        if (node) { node.x = position.x + dx; node.y = position.y + dy; }',
      '      }',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "    } else if (drag.kind === 'marquee') {",
    [
      "    } else if (drag.kind === 'resize') {",
      '      const dx = (event.clientX - drag.x) / documentState.viewport.scale;',
      '      const dy = (event.clientY - drag.y) / documentState.viewport.scale;',
      '      if (!drag.moved && Math.hypot(dx, dy) > 2) { remember(); drag.moved = true; }',
      '      if (drag.moved) {',
      '        const node = documentState.nodes.find(function (item) { return item.id === drag.id; });',
      '        node.width = Math.min(2000, Math.max(120, drag.width + dx));',
      '        node.height = Math.min(2000, Math.max(100, drag.height + dy));',
      '        markDirty();',
      '        render();',
      '      }',
      "    } else if (drag.kind === 'wire') {",
      '      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 3) drag.moved = true;',
      "    } else if (drag.kind === 'marquee') {",
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    '  function connect(fromId, toId) {',
    '  function connect(fromId, toId, shouldRemember) {'
  );
  page = replaceCanvasPageText(
    page,
    '    remember();\n    documentState.edges = documentState.edges.filter(function (edge) { return edge.to !== toId; });',
    [
      "    if (documentState.edges.some(function (edge) { return edge.to === toId && edge.from === fromId; })) { setError(''); return; }",
      '    if (shouldRemember !== false) remember();',
      '    documentState.edges = documentState.edges.filter(function (edge) { return edge.to !== toId; });',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    '  function add(type, point) {\n    remember();',
    [
      '  function nextPlacement(type) {',
      "    const width = type === 'sequence' ? 480 : type === 'note' ? 180 : type === 'video' ? 220 : 240;",
      "    const height = type === 'sequence' ? 300 : type === 'note' ? 120 : type === 'video' ? 150 : type === 'video-source' ? 210 : 190;",
      '    const view = documentState.viewport;',
      '    const centerX = (board.clientWidth / 2 - view.x) / view.scale - width / 2;',
      '    const centerY = (board.clientHeight / 2 - view.y) / view.scale - height / 2;',
      '    const minimumX = (24 - view.x) / view.scale;',
      '    const maximumX = (board.clientWidth - 24 - view.x) / view.scale - width;',
      '    const minimumY = (24 - view.y) / view.scale;',
      '    const maximumY = (board.clientHeight - 24 - view.y) / view.scale - height;',
      '    const offsets = [0, -1, 1, -2, 2, -3, 3, -4, 4];',
      '    for (let row = 0; row < 12; row++) {',
      '      const y = centerY + row * (height + 32);',
      '      if (y < minimumY || y > maximumY) continue;',
      '      for (const offset of offsets) {',
      '        const candidate = { x: centerX + offset * (width + 32), y: y };',
      '        if (candidate.x < minimumX || candidate.x > maximumX) continue;',
      '        const free = documentState.nodes.every(function (node) { return candidate.x + width + 24 <= node.x || node.x + node.width + 24 <= candidate.x || candidate.y + height + 24 <= node.y || node.y + node.height + 24 <= candidate.y; });',
      '        if (free) return candidate;',
      '      }',
      '    }',
      '    const bottom = Math.max(centerY, ...documentState.nodes.map(function (node) { return node.y + node.height; }));',
      '    return { x: centerX, y: bottom + 32 };',
      '  }',
      '  function add(type, point, shouldRemember) {',
      '    if (shouldRemember !== false) remember();',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "  document.getElementById('add-note').addEventListener('click', function () { add('note', { x: 80, y: 80 }); });",
    "  document.getElementById('add-note').addEventListener('click', function () { add('note', nextPlacement('note')); });"
  );
  page = replaceCanvasPageText(
    page,
    "  document.getElementById('add-video').addEventListener('click', function () { add('video', { x: 360, y: 80 }); });",
    "  document.getElementById('add-video').addEventListener('click', function () { add('video', nextPlacement('video')); });"
  );
  page = replaceCanvasPageText(
    page,
    [
      "    if (drag.kind === 'wire') {",
      '      const hit = document.elementFromPoint(event.clientX, event.clientY);',
      "      const card = hit && hit.closest ? hit.closest('[data-id]') : null;",
      '      if (card) connect(drag.id, card.dataset.id);',
      '    }',
    ].join('\n'),
    [
      "    if (drag.kind === 'wire') {",
      '      const hit = document.elementFromPoint(event.clientX, event.clientY);',
      "      const card = hit && hit.closest ? hit.closest('[data-id]') : null;",
      '      if (card) connect(drag.id, card.dataset.id);',
      '      else if (drag.moved) {',
      '        const point = localPoint(event);',
      '        const x = (point.x - documentState.viewport.x) / documentState.viewport.scale;',
      '        const y = (point.y - documentState.viewport.y) / documentState.viewport.scale;',
      "        add('video', { x: x, y: y }, true);",
      '        connect(drag.id, selected.values().next().value, false);',
      '      }',
      '    }',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    '  function publishDirty() {\n    window.makerCanvasUnsaved = dirty();\n  }',
    [
      '  function publishDirty() {',
      '    const sequenceRunning = Boolean(sequenceUi && sequenceUi.isBusy);',
      '    const pendingFrames = Boolean(sequenceUi && sequenceUi.hasUnsavedFrames);',
      '    window.makerCanvasSequenceRunning = sequenceRunning;',
      '    window.makerCanvasUnsaved = dirty() || pendingAssetImports > 0 || sequenceRunning || pendingFrames;',
      '    window.makerCanvasPendingImport = pendingAssetImports > 0 || sequenceRunning;',
      '  }',
      '  function waitForPendingAssets() {',
      '    if (!pendingAssetImports) return Promise.resolve();',
      '    return new Promise(function (resolve) { pendingImportWaiters.push(resolve); });',
      '  }',
      '  function finishAssetImport() {',
      '    pendingAssetImports -= 1;',
      '    publishDirty();',
      '    if (!pendingAssetImports) pendingImportWaiters.splice(0).forEach(function (resolve) { resolve(); });',
      '  }',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    '  async function saveOnce() {',
    [
      '  function deleteSelected() {',
      '    if (!documentState || !selected.size) return;',
      "    if (!sequenceUi.deleteNodes(Array.from(selected))) { setError('拆帧任务运行中，请先取消后再删除。'); return; }",
      '    remember();',
      '    documentState = removeNodes(documentState, Array.from(selected));',
      '    selected.clear();',
      '    markDirty();',
      '    render();',
      '  }',
      '  async function saveOnce() {',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    '  function markDirty() {',
    [
      '  function fitAll() {',
      '    if (!documentState) return;',
      '    if (!documentState.nodes.length) { documentState.viewport = { x: 0, y: 0, scale: 1 }; }',
      '    else {',
      '      const left = Math.min.apply(null, documentState.nodes.map(function (node) { return node.x; }));',
      '      const top = Math.min.apply(null, documentState.nodes.map(function (node) { return node.y; }));',
      '      const right = Math.max.apply(null, documentState.nodes.map(function (node) { return node.x + node.width; }));',
      '      const bottom = Math.max.apply(null, documentState.nodes.map(function (node) { return node.y + node.height; }));',
      '      const width = Math.max(1, right - left);',
      '      const height = Math.max(1, bottom - top);',
      '      const scale = Math.min(4, Math.max(0.15, Math.min((board.clientWidth - 64) / width, (board.clientHeight - 64) / height)));',
      '      documentState.viewport.scale = scale;',
      '      documentState.viewport.x = (board.clientWidth - width * scale) / 2 - left * scale;',
      '      documentState.viewport.y = (board.clientHeight - height * scale) / 2 - top * scale;',
      '    }',
      '    markDirty();',
      '    render();',
      '  }',
      '  function markDirty() {',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    '    documentState = loaded;',
    ['    sequenceUi.clear();', '    documentState = loaded;'].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    '    select.value = id;',
    "    select.value = id;\n    document.getElementById('canvas-title').textContent = loaded.title;"
  );
  page = replaceCanvasPageText(
    page,
    "    setError('');\n    render();\n  }\n  async function leaveCurrent() {",
    "    setError('');\n    void persistActiveCanvas(id).catch(function (caught) { if (opening === token) setError(caught.message); });\n    render();\n  }\n  async function leaveCurrent() {"
  );
  page = replaceCanvasPageText(
    page,
    '    const id = documentState && documentState.id;\n    const ok = await flush();',
    [
      '    const id = documentState && documentState.id;',
      "    if (sequenceUi.isBusy) { setError('拆帧正在运行，请先等待或取消当前步骤。'); return false; }",
      "    if (sequenceUi.hasUnsavedFrames) { setError('帧集尚未保存，请先保存帧集或放弃本次处理。'); return false; }",
      '    await waitForPendingAssets();',
      '    const ok = await flush();',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "  document.getElementById('new-canvas').addEventListener('click', function () {",
    [
      "  document.getElementById('rename-canvas').addEventListener('click', function () {",
      '    if (!documentState) return;',
      "    const value = window.prompt('画布名称', documentState.title);",
      '    if (value === null) return;',
      '    const title = value.trim().slice(0, 80);',
      "    if (!title) { setError('画布名称不能为空。'); return; }",
      '    if (title === documentState.title) return;',
      '    remember();',
      '    documentState.title = title;',
      '    select.options[select.selectedIndex].textContent = title;',
      "    document.getElementById('canvas-title').textContent = title;",
      '    markDirty();',
      '  });',
      "  document.getElementById('fit-canvas').addEventListener('click', fitAll);",
      "  document.getElementById('delete-selected').addEventListener('click', deleteSelected);",
      "  document.getElementById('new-canvas').addEventListener('click', function () {",
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "  window.addEventListener('keydown', function (event) {\n    if (event.code === 'Space') space = true;",
    "  window.addEventListener('keydown', function (event) {\n    if (event.target.closest && event.target.closest('textarea, input, select, button')) return;\n    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelected(); return; }\n    if (event.code === 'Space') space = true;"
  );
  page = replaceCanvasPageText(
    page,
    "if (meta && event.key === 'z')",
    "if (meta && event.key.toLowerCase() === 'z')"
  );
  page = page.replace(
    'header { display: flex; gap: 8px;',
    'header { display: flex; flex-wrap: wrap; gap: 8px;'
  );
  page = page.replace(
    '</style>',
    [
      '.sequence-sampling { display: flex; align-items: center; gap: 8px; color: #d6d0c4; font-size: 12px; }',
      '.sequence-sampler { max-width: 55%; max-height: 96px; width: auto; height: auto; border: 1px solid #6a707e; object-fit: contain; cursor: crosshair; }',
      '.sequence-thumbnails { flex-wrap: nowrap; overflow-x: auto; min-height: 76px; }',
      '.sequence-frame-tile { flex: 0 0 auto; margin: 0; text-align: center; color: #a8a399; font-size: 10px; }',
      '.sequence-frame-tile figcaption { line-height: 1.2; }',
      '.sequence-candidates { max-height: 90px; overflow: auto; align-content: flex-start; }',
      '.card img.sequence-atlas { display: block; width: auto; height: auto; max-width: 100%; max-height: 88px; object-fit: contain; }',
      '.sequence-output-frames { display: flex; flex-wrap: nowrap; gap: 4px; overflow-x: auto; min-height: 58px; }',
      '.sequence-output-frames canvas { width: 48px; height: 48px; background: #090a0c; object-fit: contain; }',
      '.sequence-content { min-height: 0; }',
      '</style>',
    ].join(String.fromCharCode(10))
  );
  page = replaceCanvasPageText(
    page,
    '  function localPoint(event) {',
    [
      '  function worldPoint(event) {',
      '    const point = localPoint(event);',
      '    return { x: (point.x - documentState.viewport.x) / documentState.viewport.scale, y: (point.y - documentState.viewport.y) / documentState.viewport.scale };',
      '  }',
      '  function localPoint(event) {',
    ].join('\n')
  );
  const fileHandler = page.match(
    / {2}file\.addEventListener\('change', function \(\) \{[\s\S]*?\n {2}\}\);/
  );
  if (!fileHandler) throw new Error('Canvas image import handler is out of sync.');
  page = page.replace(
    fileHandler[0],
    [
      '  async function importImageFile(chosen, point) {',
      '    if (!chosen || !documentState) return;',
      "    if (chosen.size > 20 * 1024 * 1024) { setError('图片不能超过 20 MiB。'); return; }",
      "    if (chosen.type && !['image/png', 'image/jpeg', 'image/webp'].includes(chosen.type)) { setError('只接受 PNG、JPEG 或 WebP。'); return; }",
      '    const canvasId = documentState.id;',
      '    pendingAssetImports += 1;',
      '    publishDirty();',
      '    try {',
      "      const result = await store.importImage(canvasId, await chosen.arrayBuffer(), chosen.type || 'application/octet-stream');",
      "      if (!documentState || documentState.id !== canvasId) { setError('已离开原画布。图片已写入当前项目，但没有放进其他画布。'); return; }",
      '      remember();',
      "      const node = { id: crypto.randomUUID(), type: 'image', x: point.x, y: point.y, width: 220, height: 160, title: (chosen.name.replace(/\\.[^.]+$/, '') || '图片').slice(0, 80), assetPath: result.relativePath };",
      '      documentState.nodes.push(node);',
      '      await loadMedia(result.relativePath);',
      '      if (!documentState || documentState.id !== canvasId) return;',
      '      selected.clear();',
      '      selected.add(node.id);',
      "      setError('');",
      '      markDirty();',
      '      render();',
      "    } catch (caught) { setError(caught.message || '导入失败'); } finally { finishAssetImport(); }",
      '  }',
      "  file.addEventListener('change', function () {",
      '    const chosen = file.files && file.files[0];',
      "    file.value = '';",
      "    if (chosen) void importImageFile(chosen, nextPlacement('image'));",
      '  });',
      '  async function importVideoFile(chosen, pointOverride) {',
      '    if (!chosen || !documentState) return;',
      "    if (chosen.size > 100 * 1024 * 1024) { setError('视频不能超过 100 MiB。'); return; }",
      "    if (chosen.type && !['video/mp4', 'video/quicktime', 'video/webm'].includes(chosen.type)) { setError('只接受 MP4、MOV 或 WebM 视频。'); return; }",
      '    const canvasId = documentState.id;',
      '    pendingAssetImports += 1;',
      '    publishDirty();',
      '    try {',
      "      const saved = await store.importVideo(canvasId, chosen, chosen.type || '');",
      "      if (!documentState || documentState.id !== canvasId) { setError('已离开原画布。视频已写入项目，但没有添加到其他画布。'); return; }",
      "      const point = pointOverride || nextPlacement('video-source');",
      "      const node = { id: crypto.randomUUID(), type: 'video-source', x: point.x, y: point.y, width: 240, height: 210, title: (chosen.name.replace(/\\.[^.]+$/, '') || '视频').slice(0, 80), assetPath: saved.relativePath };",
      '      remember();',
      '      documentState.nodes.push(node);',
      '      selected.clear();',
      '      selected.add(node.id);',
      "      setError('');",
      '      markDirty();',
      '      render();',
      "    } catch (caught) { setError(caught.message || '视频导入失败'); } finally { finishAssetImport(); }",
      '  }',
      "  document.getElementById('add-video-source').addEventListener('click', function () { videoFile.click(); });",
      "  videoFile.addEventListener('change', function () { const chosen = videoFile.files && videoFile.files[0]; videoFile.value = ''; if (chosen) void importVideoFile(chosen); });",
      "  board.addEventListener('dragover', function (event) {",
      "    if (!event.dataTransfer || !Array.from(event.dataTransfer.types || []).includes('Files')) return;",
      '    event.preventDefault();',
      "    board.classList.add('drop-target');",
      '  });',
      "  board.addEventListener('dragleave', function (event) {",
      "    if (!event.relatedTarget || !board.contains(event.relatedTarget)) board.classList.remove('drop-target');",
      '  });',
      "  board.addEventListener('drop', function (event) {",
      '    const files = Array.from(event.dataTransfer && event.dataTransfer.files || []);',
      '    if (!files.length) return;',
      '    event.preventDefault();',
      "    board.classList.remove('drop-target');",
      '    const point = worldPoint(event);',
      "    files.forEach(function (chosen, index) { const target = { x: point.x + index * 24, y: point.y + index * 24 }; if ((chosen.type && chosen.type.startsWith('video/')) || /\\.(mp4|mov|webm)$/i.test(chosen.name)) void importVideoFile(chosen, target); else void importImageFile(chosen, target); });",
      '  });',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    [
      '    if (event.target !== board && event.target !== world) return;',
      '    if (space || event.button === 1) {',
      "      drag = { kind: 'pan', x: event.clientX, y: event.clientY, ox: documentState.viewport.x, oy: documentState.viewport.y };",
      '      return;',
      '    }',
    ].join('\n'),
    [
      '    if (space || event.button === 1) {',
      "      if (event.target.closest && event.target.closest('textarea, input, button')) return;",
      "      drag = { kind: 'pan', x: event.clientX, y: event.clientY, ox: documentState.viewport.x, oy: documentState.viewport.y };",
      '      board.setPointerCapture(event.pointerId);',
      '      return;',
      '    }',
      '    if (event.target !== board && event.target !== world) return;',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    [
      '    const point = localPoint(event);',
      "    drag = { kind: 'marquee', x: point.x, y: point.y };",
      '    selected.clear();',
      '    render();',
    ].join('\n'),
    [
      '    const point = localPoint(event);',
      '    const additive = event.shiftKey || event.metaKey || event.ctrlKey;',
      "    drag = { kind: 'marquee', x: point.x, y: point.y, additive: additive };",
      '    if (!additive) selected.clear();',
      '    render();',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    '      selected.clear();\n      for (const id of nodesInMarquee',
    '      if (!drag.additive) selected.clear();\n      for (const id of nodesInMarquee'
  );
  page = replaceCanvasPageText(
    page,
    [
      "        if (event.target.closest('textarea, input, select, button, video')) return;",
      '        selectNode(node.id, event.shiftKey);',
      '        startDrag(event, node.id);',
    ].join('\n'),
    [
      "        if (event.target.closest('textarea, input, select, button, video')) return;",
      '        if (space || event.button === 1) return;',
      '        selectNode(node.id, event.shiftKey || event.metaKey || event.ctrlKey);',
      '        startDrag(event, node.id);',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "port.addEventListener('pointerdown', function (event) { startWire(event, node.id); });",
    "port.addEventListener('pointerdown', function (event) { if (space || event.button === 1) return; startWire(event, node.id); });"
  );
  page = replaceCanvasPageText(
    page,
    '    previous.revision = documentState.revision;\n    documentState = previous;',
    '    previous.revision = documentState.revision;\n    previous.viewport = { ...documentState.viewport };\n    documentState = previous;'
  );
  page = replaceCanvasPageText(
    page,
    '    next.revision = documentState.revision;\n    documentState = next;',
    '    next.revision = documentState.revision;\n    next.viewport = { ...documentState.viewport };\n    documentState = next;'
  );
  page = page.replace(
    "if (meta && event.key === 'z')",
    "if (meta && event.key.toLowerCase() === 'z')"
  );
  const requestAdapter = [
    '  async function request(path, options) {',
    '    const response = await dispatchCanvasStoreRequest(store, path, options);',
    '    const body = await response.json();',
    "    if (!response.ok) throw Object.assign(new Error(body.error || '请求失败 ' + response.status), { status: response.status });",
    '    return body;',
    '  }',
    '  function render() {',
  ].join('\n');
  page = page.replace(
    / {2}async function request\(path, options\) \{[\s\S]*?\n {2}\}\n {2}function render\(\) \{/,
    requestAdapter
  );
  page = page.replace(
    "return base + '/canvas-media?path=' + encodeURIComponent(assetPath);",
    'return store.mediaUrl(assetPath);'
  );
  page = page.replace(
    'await openDocument(list[0].id);',
    [
      'const activeId = await store.getActiveCanvasId();',
      'const selectedId = list.some(function (item) { return item.id === activeId; }) ? activeId : list[0].id;',
      'await openDocument(selectedId);',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "  document.getElementById('save').addEventListener('click', function () { void flush(); });",
    [
      '  sequenceUi = createSequenceUiController({',
      '    store: store,',
      '    processor: sequenceProcessor,',
      '    renderCard: renderSequenceResult,',
      '    onOpen: function (id) { sequenceEditor.open(id); },',
      '    onChange: function (id) { sequenceEditor.refresh(id); },',
      '    onAnimation: function (id) {',
      '      const source = documentState.nodes.find(function (node) { return node.id === id; });',
      '      if (!source || !source.frameSetInfo || !source.assetPath) return;',
      '      remember();',
      '      const node = appendAnimation(documentState, id, crypto.randomUUID(), crypto.randomUUID());',
      '      selected.clear(); selected.add(node.id); markDirty(); render();',
      '    },',
      '    getDocument: function () { return documentState; },',
      '    createId: function () { return crypto.randomUUID(); },',
      '    nextPlacement: nextPlacement,',
      '    video: sequenceVideo,',
      '    remember: remember,',
      '    markDirty: markDirty,',
      '    flush: flush,',
      '    render: render,',
      '    refreshCard: function () { render(); },',
      '    publishState: publishDirty,',
      '    setError: setError,',
      '    defaultSettings: defaultSequenceSettings,',
      '    estimateFrameCount: estimateSequenceFrameCount,',
      '    maxFrameCount: maxSequenceFrameCount,',
      '    maxInputFrameCount: maxSequenceInputFrameCount,',
      '  });',
      "  document.getElementById('save').addEventListener('click', function () { void flush(); });",
    ].join(String.fromCharCode(10))
  );
  page = replaceCanvasPageText(
    page,
    '  let sequenceUi = null;',
    '  let sequenceUi = null; let sequenceEditor;'
  );
  page = replaceCanvasPageText(
    page,
    '  async function saveOnce() {',
    [
      '  let pendingSave = null;',
      '  function saveOnce() {',
      '    if (!pendingSave) pendingSave = saveSnapshot().finally(function () { pendingSave = null; });',
      '    return pendingSave;',
      '  }',
      '  async function saveSnapshot() {',
    ].join(String.fromCharCode(10))
  );
  page = page.replace(
    '  void boot().catch',
    '  sequenceEditor = createSequenceEditor({ controller: sequenceUi, mediaUrl: store.mediaUrl, actions: sequenceActionsForCard }); void boot().catch'
  );
  page = page.replace(
    "window.addEventListener('keydown', function (event) {",
    "window.addEventListener('keydown', function (event) { if (sequenceEditor && sequenceEditor.isOpen) return;"
  );
  page = page.replace('</style>', SEQUENCE_EDITOR_STYLES + '</style>');
  page = replaceCanvasPageText(
    page,
    '  const store = createBrowserCanvasDocumentStore(key);',
    '  const store = createBrowserCanvasDocumentStore(key); const animationCards = createAnimationCards(store.mediaUrl);'
  );
  page = replaceCanvasPageText(
    page,
    '    world.replaceChildren();',
    '    animationCards.beginRender(documentState.nodes); world.replaceChildren();'
  );
  page = replaceCanvasPageText(
    page,
    "      if (node.type === 'sequence') {",
    "      if (node.type === 'animation') animationCards.render(card, node);\n      if (node.type === 'sequence') {"
  );
  page = page.replace('/*__HELPERS__*/', helpers);
  page = replaceCanvasPageText(
    page,
    '      card.append(title);',
    '      card.append(title); renderGenerationResult(card, node, documentState.nodes);'
  );
  page = page
    .split("event.target.closest('textarea, input, select, button, video')")
    .join("event.target.closest('textarea, input, select, button, video, details')");
  return page;
}
