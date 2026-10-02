import { nodesInMarquee, removeNodes, saveAcknowledgement } from './edit.js';
import { createCanvasTemplateModel, isBuiltinCanvasTemplate } from './templates.js';
import { createCanvasTemplateUi } from './templateUi.js';
import { createTemplateCovers } from './templateCovers.js';
import { TEMPLATE_LIBRARY_STYLES } from './templateStyles.js';
import {
  canvasCardStatus,
  renderCanvasCardStatus,
  CANVAS_CARD_STATUS_STYLES,
} from './cardStatus.js';
import { createCanvasLog, canvasLogLevel, CANVAS_LOG_STYLES } from './logUi.js';
import { createBrowserCanvasDocumentStore, dispatchCanvasStoreRequest } from './store.js';
import {
  createSequenceProcessor,
  defaultSequenceSettings,
  duplicateIndicesFromSignatures,
  estimateSequenceFrameCount,
  maxSequenceFrameCount,
  maxSequenceInputFrameCount,
  removeConnectedBackgroundPixels,
  removeChromaBackgroundPixels,
  hasOpaqueBoundary,
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
import { videoCardSize } from './videoCard.js';
import { createPromptEditor, formatBuiltinPrompt } from './promptEditor.js';
import { appendAnimation, createAnimationCards, refreshAnimationFromSource } from './animation.js';
import { renderGenerationResult } from './generationResult.js';
import { DEFAULT_SEQUENCE_FPS, DEFAULT_SEQUENCE_DURATION } from './sequenceModel.js';
import { applyFrameOperations, openFrameEditor } from './frameEditor.js';
import {
  backgroundColorsDiffer,
  createBackgroundRemoval,
  stableBackgroundColor,
} from './backgroundRemoval.js';
import { openBackgroundEditor } from './backgroundUi.js';
import { createFrameCollection } from './frameCollection.js';
import { createCanvasGenerationUi, imageEditSources } from './generationUi.js';
import { downloadCanvasImage } from './imageExport.js';
import {
  canvasExportIdentity,
  canvasExportFilename,
  nextCanvasExportCode,
} from './exportNaming.js';
import { createCanvasZip } from './zipArchive.js';
import {
  sequenceExportManifest,
  sequenceExportLua,
  sequenceExportInstructions,
  createSequenceExport,
} from './sequenceExport.js';
import {
  canvasExportFormats,
  downloadCanvasResource,
  createCanvasResourceExport,
} from './resourceExport.js';
import { imageSizeLabel, renderImageInfo } from './imageInfo.js';
import { createImageEditing } from './imageEditing.js';
import { applyLocalImageResult } from './localImageResult.js';
import { createVideoHistoryUi } from './videoHistoryUi.js';
import { createVideoPrompts } from './videoPrompts.js';
import { videoTaskTiming } from './videoTaskTiming.js';
import { createCanvasGroupQueue } from './groupQueue.js';
import { createCanvasGroupQueueUi, GROUP_QUEUE_STYLES } from './groupQueueUi.js';
import {
  createTemplateWorkflow,
  canvasNeedsProcessing,
  invalidateCanvasDependents,
} from './templateWorkflow.js';
import { videoInputSources, videoAttemptMatchesSources } from './videoInputs.js';
import {
  canvasNodeVersion,
  canvasReferences,
  canvasDependents,
  isCanvasNodeStale,
  isCanvasSourceCurrent,
  metadataVersion,
  snapshotCanvasSource,
} from './dependencies.js';

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
    createCanvasLog.toString(),
    canvasLogLevel.toString(),
    canvasCardStatus.toString(),
    renderCanvasCardStatus.toString(),
    createCanvasTemplateModel.toString(),
    isBuiltinCanvasTemplate.toString(),
    createCanvasTemplateUi.toString(),
    createTemplateCovers.toString(),
    'const DEFAULT_SEQUENCE_FPS = ' + DEFAULT_SEQUENCE_FPS + ';',
    'const DEFAULT_SEQUENCE_DURATION = ' + DEFAULT_SEQUENCE_DURATION + ';',
    applyFrameOperations.toString(),
    openFrameEditor.toString(),
    createBackgroundRemoval.toString(),
    openBackgroundEditor.toString(),
    createFrameCollection.toString(),
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
    removeChromaBackgroundPixels.toString(),
    hasOpaqueBoundary.toString(),
    sequenceActionsForCard.toString(),
    backgroundColorsDiffer.toString(),
    stableBackgroundColor.toString(),
    createSequenceProcessor.toString(),
    renderSequenceResult.toString(),
    createSequenceEditor.toString(),
    appendAnimation.toString(),
    refreshAnimationFromSource.toString(),
    createAnimationCards.toString(),
    renderGenerationResult.toString(),
    videoCardSize.toString(),
    formatBuiltinPrompt.toString(),
    createPromptEditor.toString(),
    createCanvasGenerationUi.toString(),
    imageEditSources.toString(),
    createTemplateWorkflow.toString(),
    downloadCanvasImage.toString(),
    createCanvasZip.toString(),
    sequenceExportManifest.toString(),
    sequenceExportLua.toString(),
    sequenceExportInstructions.toString(),
    createSequenceExport.toString(),
    canvasExportFormats.toString(),
    canvasExportFilename.toString(),
    canvasExportIdentity.toString(),
    nextCanvasExportCode.toString(),
    downloadCanvasResource.toString(),
    createCanvasResourceExport.toString(),
    imageSizeLabel.toString(),
    renderImageInfo.toString(),
    createImageEditing.toString(),
    applyLocalImageResult.toString(),
    createVideoHistoryUi.toString(),
    createVideoPrompts.toString(),
    videoTaskTiming.toString(),
    createCanvasGroupQueue.toString(),
    createCanvasGroupQueueUi.toString(),
    metadataVersion.toString(),
    canvasNodeVersion.toString(),
    isCanvasNodeStale.toString(),
    isCanvasSourceCurrent.toString(),
    snapshotCanvasSource.toString(),
    canvasReferences.toString(),
    canvasDependents.toString(),
    canvasNeedsProcessing.toString(),
    videoInputSources.toString(),
    videoAttemptMatchesSources.toString(),
    invalidateCanvasDependents.toString(),
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
    '<span class="canvas-heading"><strong id="canvas-title">创作画布</strong><button id="rename-canvas" type="button" title="修改画布名称" aria-label="修改画布名称"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/></svg></button></span>'
  );
  page = replaceCanvasPageText(
    page,
    '  <button id="new-canvas" type="button">新建</button>',
    '  <button id="new-canvas" type="button">新建</button>\n  <button id="add-generation" type="button">图片生成卡</button>\n  <button id="fit-canvas" type="button">适配内容</button>\n  <button id="create-section" type="button">新建分区</button>\n  <button id="duplicate-selected" type="button">复制选中</button>\n  <button id="delete-selected" type="button">删除选中</button>\n  <button id="export-canvas" type="button">导出 PNG</button>'
  );
  page = replaceCanvasPageText(
    page,
    '.card p { margin: 8px 0 0; color: #b7b1a6; font-size: 13px; }',
    '.card p { margin: 8px 0 0; color: #b7b1a6; font-size: 13px; }\n.card textarea { box-sizing: border-box; width: 100%; height: calc(100% - 28px); resize: none; border: 0; background: transparent; color: inherit; font: inherit; }\n.card.video img { height: 72px; object-fit: cover; }\n.card.video-source { padding: 0; }\n.video-source-preview { display: block; width: 100%; height: 100%; object-fit: contain; background: #090a0c; }\n.card.sequence { display: flex; flex-direction: column; padding: 12px; overflow: auto; }\n.sequence-content { display: flex; flex-direction: column; gap: 8px; height: 100%; }\n.sequence-heading, .sequence-progress, .sequence-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }\n.sequence-status, .sequence-info { color: #b7b1a6; font-size: 12px; }\n.sequence-steps { display: flex; flex-wrap: wrap; gap: 5px; }\n.sequence-step { padding: 3px 6px; border-radius: 10px; background: #262a33; color: #aaa; font-size: 11px; }\n.sequence-step.active { background: #604c2b; color: #ffe2a5; }\n.sequence-step.complete { background: #254a3c; color: #b9f0d3; }\n.sequence-fields { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 6px; max-height: 108px; overflow: auto; }\n.sequence-field { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: #bbb; }\n.sequence-field input, .sequence-field select { min-width: 0; width: 100%; box-sizing: border-box; }\n.sequence-check { font-size: 11px; display: flex; align-items: center; gap: 4px; }\n.sequence-thumbnails, .sequence-candidates { display: flex; flex-wrap: wrap; gap: 5px; }\n.sequence-thumbnails canvas, .sequence-candidates canvas { width: 64px; height: 48px; object-fit: contain; background: #090a0c; }\n.sequence-candidates label { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; }\n.sequence-atlas { max-width: 100%; max-height: 140px; object-fit: contain; }\n.sequence-error { color: #ff9c8a; }\n.sequence-actions button { background: #1c1f26; color: inherit; border: 1px solid #3a3f4a; border-radius: 6px; padding: 5px 8px; }\n.sequence-progress { font-size: 12px; }\n.sequence-progress progress { flex: 1; }\n.resize-handle { position: absolute; right: 2px; bottom: 2px; width: 14px; height: 14px; padding: 0; border: 0; background: #e6b15c; cursor: nwse-resize; }\n#board.drop-target { outline: 2px solid #e6b15c; outline-offset: -4px; }'
  );
  page = replaceCanvasPageText(
    page,
    "  const base = '/api/projects/' + encodeURIComponent(key);",
    [
      '  const store = createBrowserCanvasDocumentStore(key);',
      '  const backgroundRemoval = createBackgroundRemoval(); const frameCollection = createFrameCollection();',
      '  const sequenceProcessor = createSequenceProcessor({ backgroundRemoval, maxSourceSide: MAX_SEQUENCE_SOURCE_SIDE, maxOutputSide: MAX_SEQUENCE_SIDE, maxAtlasSide: MAX_ATLAS_SIDE, estimateFrameCount: estimateSequenceFrameCount, maxAtlasFrameCount: maxSequenceFrameCount, duplicateFrameIndices: duplicateIndicesFromSignatures });',
      '  let sequenceUi = null; let generationUi = null;',
      "  const selectionToolbar = document.getElementById('selection-toolbar');",
      "  const selectionMenu = document.getElementById('selection-menu');",
      "  let selectionAction = '';",
      '  [selectionToolbar, selectionMenu].forEach(function (surface) {',
      "    surface.addEventListener('pointerdown', function (event) { event.stopPropagation(); });",
      "    surface.addEventListener('wheel', function (event) { event.stopPropagation(); }, { passive: true });",
      "    surface.addEventListener('contextmenu', function (event) { event.stopPropagation(); });",
      '  });',
      '  function positionSelectionToolbar() {',
      '    if (selectionMenu.hidden && selectionToolbar.hidden) return;',
      "    const card = world.querySelector('.card.selected');",
      '    if (!card) { selectionMenu.hidden = true; selectionToolbar.hidden = true; return; }',
      '    const bounds = board.getBoundingClientRect();',
      '    const anchor = card.getBoundingClientRect();',
      '    const gap = 12;',
      '    const cardLeft = anchor.left - bounds.left;',
      '    const cardTop = anchor.top - bounds.top;',
      '    selectionMenu.style.maxWidth = Math.max(0, bounds.width - gap * 2) + "px";',
      '    const menuWidth = selectionMenu.offsetWidth;',
      '    const menuHeight = selectionMenu.offsetHeight;',
      '    const menuLeft = cardLeft + (anchor.width - menuWidth) / 2;',
      '    selectionMenu.style.left = Math.max(gap, Math.min(menuLeft, bounds.width - menuWidth - gap)) + "px";',
      '    selectionMenu.style.top = Math.max(gap, cardTop - menuHeight - gap) + "px";',
      '    if (selectionToolbar.hidden) return;',
      '    selectionToolbar.style.width = Math.min(440, Math.max(0, bounds.width - gap * 2)) + "px";',
      '    selectionToolbar.style.maxHeight = Math.max(0, bounds.height - gap * 2) + "px";',
      '    const width = selectionToolbar.offsetWidth;',
      '    const height = selectionToolbar.offsetHeight;',
      '    let left = cardLeft;',
      '    let top = anchor.bottom - bounds.top + gap;',
      '    if (top + height > bounds.height - gap) {',
      '      if (anchor.right - bounds.left + gap + width <= bounds.width - gap) {',
      '        left = anchor.right - bounds.left + gap; top = cardTop;',
      '      } else if (cardLeft - gap - width >= gap) {',
      '        left = cardLeft - gap - width; top = cardTop;',
      '      } else { top = cardTop - menuHeight - gap * 2 - height; }',
      '    }',
      '    selectionToolbar.style.left = Math.max(gap, Math.min(left, bounds.width - width - gap)) + "px";',
      '    selectionToolbar.style.top = Math.max(gap, Math.min(top, bounds.height - height - gap)) + "px";',
      '  }',
      '  const selectionResize = new ResizeObserver(positionSelectionToolbar);',
      "  selectionResize.observe(document.getElementById('board'));",
      '  selectionResize.observe(selectionToolbar);',
      '  selectionResize.observe(selectionMenu);',
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
    '  const selected = new Set();\n  const videoDimensions = new Map();\n  let pendingAssetImports = 0;\n  let pendingImageImport = null;\n  let pendingVideoImport = null;\n  const pendingImportWaiters = [];\n  window.makerCanvasSequenceRunning = false;'
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
      "        hint.textContent = source ? '首帧：' + source.title : '拖入已导入图片作为首帧，然后在卡片内生成视频。';",
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
      "        player.addEventListener('pointerdown', function (event) {",
      '          if (event.button !== 0 || selected.has(node.id) || generationUi && generationUi.isNodeBusy(node.id) || templateWorkflow && templateWorkflow.locked(node.id)) return;',
      "          selected.clear(); selected.add(node.id); selectionAction = '';",
      "          world.querySelectorAll('.card.selected').forEach(function (item) { item.classList.remove('selected'); });",
      "          card.classList.add('selected'); renderSelectionToolbar();",
      '        });',
      '        player.src = media[node.assetPath] || store.mediaUrl(node.assetPath);',
      "        player.addEventListener('loadedmetadata', function () {",
      '          if (!card.isConnected || !documentState.nodes.includes(node)) return;',
      '          videoDimensions.set(node.assetPath, { width: player.videoWidth, height: player.videoHeight });',
      '          if (fitVideoCard(node)) render();',
      '        });',
      '        card.append(player);',
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
      '              createImageSlot(node);',
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
      '    const dragged = documentState.nodes.find(function (item) { return item.id === id; });',
      "    const dragIds = dragged && dragged.type === 'section' ? documentState.nodes.filter(function (item) { return item.sectionId === id || item.id === id; }).map(function (item) { return item.id; }) : Array.from(selected);",
      '    const positions = documentState.nodes.filter(function (item) { return dragIds.indexOf(item.id) >= 0; }).map(function (item) { return { id: item.id, x: item.x, y: item.y }; });',
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
      "        const dimensions = node.type === 'video-source' && (videoDimensions.get(node.assetPath) || node.videoInfo);",
      '        const widthDelta = dimensions && dimensions.height > 0 && Math.abs(dy) > Math.abs(dx) ? dy * dimensions.width / dimensions.height : dx;',
      '        node.width = Math.min(2000, Math.max(120, drag.width + widthDelta));',
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
      '    documentState.edges = documentState.edges.filter(function (edge) { return !(edge.to === toId && edge.from === fromId); });',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    '  function add(type, point) {\n    remember();',
    [
      '  function createImageSlot(source) {',
      "    add('image', { x: source.x + source.width + 48, y: source.y }, true);",
      '    const slot = documentState.nodes.find(function (item) { return selected.has(item.id); });',
      '    if (!slot) return;',
      "    slot.title = '图片变体 · 待生成';",
      "    slot.generationDraft = { operation: 'variant', sourceImageId: source.id };",
      "    setError('已创建图片生成槽：填写提示词后点击“生成”。');",
      '    render();',
      '  }',
      '  function createVideoSlot(source) {',
      "    if (!documentState || !source || !source.assetPath) { setError('请先选择一张已保存的图片。'); return; }",
      "    selectionAction = selectionAction === 'video' ? '' : 'video'; render();",
      '  }',
      '  function createBlankImageSlot() {',
      "    add('image', nextPlacement('image'), true);",
      '    const slot = documentState.nodes.find(function (item) { return selected.has(item.id); });',
      '    if (!slot) return;',
      "    slot.title = '图片生成槽 · 待生成';",
      "    slot.generationDraft = { operation: 'generate' };",
      '    render();',
      '  }',
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
      '    const sequenceRunning = Boolean((groupQueue && groupQueue.isBusy) || (imageEditing && imageEditing.isBusy) || (videoHistory && videoHistory.isBusy) || (sequenceUi && sequenceUi.isBusy) || (templateWorkflow && templateWorkflow.isBusy) || (generationUi && generationUi.isBusy));',
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
      '    if (groupQueue && groupQueue.isBusy) { setError("请先停止分组队列并等待当前步骤结束，再删除卡片。"); return; }',
      '    if (protectTemplateSelection()) return;',
      "    if (!sequenceUi.deleteNodes(Array.from(selected))) { setError('拆帧任务运行中，请先取消后再删除。'); return; }",
      '    remember();',
      '    documentState = removeNodes(documentState, Array.from(selected));',
      '    if (documentState.templateFlow && documentState.templateFlow.stage === "complete") delete documentState.templateFlow;',
      '    selected.clear();',
      '    markDirty();',
      '    render();',
      '  }',
      '  function createSection() {',
      "    const members = documentState && documentState.nodes.filter(function (node) { return selected.has(node.id) && node.type !== 'section'; });",
      "    if (!members || !members.length) { setError('请先选择要放入分区的卡片。'); return; }",
      '    if (groupQueue && members.some(function (node) { return groupQueue.protects(node.id); })) { setError("请先停止相关队列，再调整分组。"); return; }',
      '    const padding = 28;',
      '    const left = Math.min.apply(null, members.map(function (node) { return node.x; })) - padding;',
      '    const top = Math.min.apply(null, members.map(function (node) { return node.y; })) - padding - 28;',
      '    const right = Math.max.apply(null, members.map(function (node) { return node.x + node.width; })) + padding;',
      '    const bottom = Math.max.apply(null, members.map(function (node) { return node.y + node.height; })) + padding;',
      '    remember();',
      "    const section = { id: crypto.randomUUID(), type: 'section', x: left, y: top, width: Math.max(240, right - left), height: Math.max(160, bottom - top), title: '新分区' };",
      '    documentState.nodes.push(section);',
      '    members.forEach(function (node) { node.sectionId = section.id; });',
      '    selected.clear(); selected.add(section.id); markDirty(); render();',
      '  }',
      '  function duplicateSelected() {',
      '    if (protectTemplateSelection()) return;',
      "    if (!documentState || !selected.size) { setError('请先选择要复制的卡片。'); return; }",
      "    const copies = documentState.nodes.filter(function (node) { return selected.has(node.id) && node.type !== 'section'; }).map(function (node) {",
      '      const copy = JSON.parse(JSON.stringify(node));',
      '      copy.id = crypto.randomUUID(); copy.x += 36; copy.y += 36; delete copy.sectionId; delete copy.templatePending;',
      "      if (copy.generation) copy.generation = { prompt: copy.generation.prompt, operation: 'generate' };",
      '      return copy;',
      '    });',
      "    if (!copies.length) { setError('当前选择没有可复制的卡片。'); return; }",
      '    remember(); documentState.nodes.push.apply(documentState.nodes, copies); selected.clear(); copies.forEach(function (node) { selected.add(node.id); }); markDirty(); render();',
      '  }',
      '  async function exportCanvasPng() {',
      '    if (!documentState) return;',
      "    const nodes = documentState.nodes.filter(function (node) { return node.type !== 'section'; });",
      "    if (!nodes.length) { setError('画布没有可导出的内容。'); return; }",
      '    const left = Math.min.apply(null, nodes.map(function (node) { return node.x; })) - 32;',
      '    const top = Math.min.apply(null, nodes.map(function (node) { return node.y; })) - 32;',
      '    const right = Math.max.apply(null, nodes.map(function (node) { return node.x + node.width; })) + 32;',
      '    const bottom = Math.max.apply(null, nodes.map(function (node) { return node.y + node.height; })) + 32;',
      '    const scale = Math.min(2, 2400 / Math.max(1, right - left), 1600 / Math.max(1, bottom - top));',
      "    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round((right - left) * scale)); canvas.height = Math.max(1, Math.round((bottom - top) * scale));",
      "    const context = canvas.getContext('2d'); context.fillStyle = '#101114'; context.fillRect(0, 0, canvas.width, canvas.height); context.font = '14px sans-serif';",
      '    for (const node of nodes) {',
      '      const x = (node.x - left) * scale; const y = (node.y - top) * scale; const width = node.width * scale; const height = node.height * scale;',
      "      context.fillStyle = '#1a1d24'; context.strokeStyle = '#3d4250'; context.lineWidth = Math.max(1, scale); context.fillRect(x, y, width, height); context.strokeRect(x, y, width, height);",
      "      context.fillStyle = '#f4f1ea'; context.fillText(node.title || '未命名', x + 8 * scale, y + 18 * scale);",
      "      if (node.assetPath && media[node.assetPath] && (node.type === 'image' || node.type === 'sequence')) {",
      '        await new Promise(function (resolve) { const image = new Image(); image.onload = function () { const ratio = Math.min((width - 16 * scale) / image.naturalWidth, (height - 32 * scale) / image.naturalHeight); const drawWidth = image.naturalWidth * ratio; const drawHeight = image.naturalHeight * ratio; context.drawImage(image, x + (width - drawWidth) / 2, y + 24 * scale + (height - 24 * scale - drawHeight) / 2, drawWidth, drawHeight); resolve(); }; image.onerror = resolve; image.src = media[node.assetPath]; });',
      "      } else { context.fillStyle = '#b7b1a6'; context.fillText(node.type === 'video-source' ? '视频结果' : node.type === 'animation' ? '序列帧动画' : node.text || '', x + 8 * scale, y + 42 * scale); }",
      '    }',
      "    const link = document.createElement('a'); link.download = (documentState.title || 'canvas') + '.png'; link.href = canvas.toDataURL('image/png'); link.click();",
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
    "    if (generationUi) await generationUi.restore().catch(function () {});\n    setError('');\n    void persistActiveCanvas(id).catch(function (caught) { if (opening === token) setError(caught.message); });\n    render();\n  }\n  async function leaveCurrent() {"
  );
  page = replaceCanvasPageText(
    page,
    '    const id = documentState && documentState.id;\n    const ok = await flush();',
    [
      '    const id = documentState && documentState.id;',
      '    if (generationUi && generationUi.isBusy) { setError("生成任务正在运行，请等待完成后再切换画布。"); return false; }',
      '    if (groupQueue && groupQueue.isBusy) { setError("请先停止分组队列，再切换画布。"); return false; }',
      '    if (imageEditing && imageEditing.isBusy || videoHistory && videoHistory.isBusy) { setError("请先完成或关闭当前编辑／查询。"); return false; }',
      "    if (templateWorkflow && templateWorkflow.isBusy) { setError('模板流程正在运行，请等待本轮完成。'); return false; }",
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
      "    setError('');",
      '    markDirty();',
      '  });',
      "  document.getElementById('fit-canvas').addEventListener('click', fitAll);",
      "  document.getElementById('add-generation').addEventListener('click', createBlankImageSlot);",
      "  document.getElementById('create-section').addEventListener('click', createSection);",
      "  document.getElementById('duplicate-selected').addEventListener('click', duplicateSelected);",
      "  document.getElementById('delete-selected').addEventListener('click', deleteSelected);",
      "  document.getElementById('export-canvas').addEventListener('click', function () { void exportCanvasPng(); });",
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
      '.generation-panel { display: flex; flex-direction: column; gap: 5px; margin-top: 8px; }',
      '.generation-prompt { width: 100%; box-sizing: border-box; background: #11141a; color: inherit; border: 1px solid #3a3f4a; border-radius: 5px; padding: 5px 6px; }',
      '.generation-mode { width: 100%; box-sizing: border-box; background: #11141a; color: inherit; border: 1px solid #3a3f4a; border-radius: 5px; padding: 5px 6px; }',
      '.generation-actions { display: grid; grid-template-columns: minmax(0, 1fr); gap: 5px; }',
      '.generation-action { min-width: 0; background: #20242d; color: #e8e3d8; border: 1px solid #414957; border-radius: 7px; padding: 6px 5px; font-size: 11px; cursor: pointer; }',
      '.generation-action:hover { background: #2b313d; border-color: #d1a75e; }',
      '.generation-action-primary { background: #5b4728; border-color: #c99649; color: #fff1cf; }',
      '.generation-action:disabled { cursor: wait; opacity: .55; }',
      '.generation-status { color: #b7b1a6; font-size: 12px; }',
      '.generation-credits { position:absolute; top:8px; right:8px; max-width:calc(100% - 16px); box-sizing:border-box; padding:3px 7px; border-radius:5px; background:#171b24dc; color:#e5dfd2; font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }',
      '.image-size-info { position:absolute; left:6px; bottom:6px; max-width:calc(100% - 24px); padding:3px 6px; border-radius:4px; background:#171b24dc; color:#d8d4ca; font-size:10px; pointer-events:none; }',
      '.generation-status-failed, .generation-status-unknown { color: #ff9c8a; }',
      '.generation-status-succeeded { color: #b9f0d3; }',
      '.generation-status-running { color: #f1d18f; }',
      '.generation-error { color: #ffb2a5; font-size: 11px; line-height: 1.35; overflow-wrap: anywhere; }',
      '.card.section { background: rgba(92,76,43,.18); border: 1px dashed #b58c4a; z-index: 0; }',
      '.card.section strong { color: #f1d18f; }',
      '.card.section p { color: #c5b58e; }',
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
      '  function requestImageImport(nodeId) {',
      '    if (!documentState) return;',
      '    if (generationUi && generationUi.isBusy) { setError("请等待当前生成完成后再替换图片。"); return; }',
      '    pendingImageImport = { canvasId: documentState.id, nodeId: nodeId };',
      '    file.click();',
      '  }',
      '  async function importImageFile(chosen, request) {',
      '    if (!chosen || !request || !documentState) return;',
      '    if (chosen.size > 20 * 1024 * 1024) { setError("图片不能超过 20 MiB。"); return; }',
      '    if (chosen.type && ["image/png", "image/jpeg", "image/webp"].indexOf(chosen.type) < 0) { setError("只接受 PNG、JPEG 或 WebP。"); return; }',
      '    pendingAssetImports += 1;',
      '    publishDirty();',
      '    try {',
      '      const saved = await store.importImage(request.canvasId, await chosen.arrayBuffer(), chosen.type || "application/octet-stream");',
      '      if (!documentState || documentState.id !== request.canvasId) {',
      '        setError("已离开原画布。图片已写入当前项目，但没有放进其他画布。");',
      '        return;',
      '      }',
      '      const node = documentState.nodes.find(function (item) { return item.id === request.nodeId && item.type === "image"; });',
      '      if (!node || (node.assetPath && !templateWorkflow.canEditImage(node.id))) { setError("图片卡已被修改，导入结果未挂载。"); return; }',
      '      remember();',
      '      node.title = (chosen.name.replace(/\\.[^.]+$/, "") || "图片").slice(0, 80);',
      '      node.assetPath = saved.relativePath;',
      '      delete node.generationDraft;',
      '      delete node.generation;',
      '      delete node.sourceSnapshot;',
      '      delete node.sourceSnapshots;',
      '      await loadMedia(saved.relativePath);',
      '      selected.clear();',
      '      selected.add(node.id);',
      '      setError("");',
      '      markDirty();',
      '      render();',
      '    } catch (caught) { setError(caught.message || "图片导入失败"); return; } finally { finishAssetImport(); }',
      '    selectionAction = "";',
      '    await templateWorkflow.headChanged(request.nodeId);',
      '  }',
      '  file.addEventListener("change", function () {',
      '    const chosen = file.files && file.files[0];',
      '    file.value = "";',
      '    const request = pendingImageImport;',
      '    pendingImageImport = null;',
      '    if (chosen) void importImageFile(chosen, request);',
      '  });',
      '  function requestVideoImport(nodeId) {',
      '    if (!documentState) return;',
      '    pendingVideoImport = { canvasId: documentState.id, nodeId: nodeId };',
      '    videoFile.click();',
      '  }',
      '  async function importVideoFile(chosen, request) {',
      '    if (!chosen || !documentState) return;',
      "    if (chosen.size > 100 * 1024 * 1024) { setError('视频不能超过 100 MiB。'); return; }",
      "    if (chosen.type && !['video/mp4', 'video/quicktime', 'video/webm'].includes(chosen.type)) { setError('只接受 MP4、MOV 或 WebM 视频。'); return; }",
      '    const canvasId = request && request.canvasId ? request.canvasId : documentState.id;',
      '    pendingAssetImports += 1;',
      '    publishDirty();',
      '    try {',
      "      const saved = await store.importVideo(canvasId, chosen, chosen.type || '');",
      "      if (!documentState || documentState.id !== canvasId) { setError('已离开原画布。视频已写入项目，但没有添加到其他画布。'); return; }",
      '      const target = request && request.nodeId ? documentState.nodes.find(function (item) { return item.id === request.nodeId && item.type === "video"; }) : null;',
      "      const point = request && request.point ? request.point : nextPlacement('video-source');",
      "      const node = target || { id: crypto.randomUUID(), type: 'video-source', x: point.x, y: point.y, width: 240, height: 210, title: (chosen.name.replace(/\\.[^.]+$/, '') || '视频').slice(0, 80), assetPath: saved.relativePath };",
      '      remember();',
      "      node.type = 'video-source';",
      '      node.width = 240;',
      '      node.height = 210;',
      "      node.title = (chosen.name.replace(/\\.[^.]+$/, '') || '视频').slice(0, 80);",
      '      node.assetPath = saved.relativePath;',
      '      delete node.generationDraft;',
      '      delete node.generation;',
      '      delete node.sourceSnapshot;',
      '      documentState.edges = documentState.edges.filter(function (edge) { return edge.to !== node.id; });',
      '      if (!target) documentState.nodes.push(node);',
      '      selected.clear();',
      '      selected.add(node.id);',
      "      setError('');",
      '      markDirty();',
      '      render();',
      "    } catch (caught) { setError(caught.message || '视频导入失败'); } finally { finishAssetImport(); }",
      '  }',
      '  videoFile.addEventListener("change", function () {',
      '    const chosen = videoFile.files && videoFile.files[0];',
      '    videoFile.value = "";',
      '    const request = pendingVideoImport;',
      '    pendingVideoImport = null;',
      '    if (chosen) void importVideoFile(chosen, request);',
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
      '        if (space || event.button !== 0) return;',
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
      '    resolveTarget: function (id, type, targetId) { return templateWorkflow.resolveTarget(id, type, targetId); },',
      '    onSaved: function (id) { return templateWorkflow.nodeChanged(id); },',
      '    onChange: function (id) { sequenceEditor.refresh(id); },',
      '    onAnimation: async function (id) {',
      '      const source = documentState.nodes.find(function (node) { return node.id === id; });',
      '      if (!source || !source.frameSetInfo || !source.assetPath) return;',
      '      const decision = templateWorkflow.resolveTarget(id, "animation");',
      '      if (decision && decision.kind === "blocked") { setError(decision.message); return; }',
      '      remember();',
      '      const node = appendAnimation(documentState, id, crypto.randomUUID(), crypto.randomUUID(), decision && decision.kind === "reuse" ? decision.nodeId : undefined);',
      '      if (!node) { setError("动画来源或目标已变化，请重新打开卡片。"); return; }',
      '      selected.clear(); selected.add(node.id); markDirty(); render();',
      '      await templateWorkflow.nodeChanged(node.id);',
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
      '  generationUi = createCanvasGenerationUi({',
      '    store: store,',
      '    getDocument: function () { return documentState; },',
      '    getSelected: function () { return selected; },',
      '    remember: remember,',
      '    markDirty: markDirty,',
      '    flush: flush,',
      '    render: render,',
      '    nextPlacement: nextPlacement,',
      '    loadMedia: loadMedia,',
      '    requestImageImport: requestImageImport,',
      '    requestVideoImport: requestVideoImport,',
      '    setError: setError,',
      '    log: function (message, level) { canvasLogs.add(message, level); },',
      '    createId: function () { return crypto.randomUUID(); },',
      '    resolveTarget: function (id, type, targetId) { return templateWorkflow.resolveTarget(id, type, targetId); },',
      '    onVideoCreated: function (id) { selected.clear(); selected.add(id); selectionAction = ""; },',
      '    onGenerateStart: function () { selectionAction = ""; },',
      '    onGenerated: async function (id, kind) { selectionAction = ""; selected.clear(); selected.add(id); render(); if (kind === "image") await templateWorkflow.headChanged(id); if (kind === "video") await templateWorkflow.videoChanged(id); },',
      '  });',
      '  templateWorkflow = createTemplateWorkflow({',
      '    getDocument: function () { return documentState; }, save: flush, changed: markDirty, render: render, error: setError,',
      '    confirm: function (message) { return window.confirm(message); },',
      '    isNodeBusy: function (id) { return generationUi.isNodeBusy(id) || sequenceUi.isNodeBusy(id); },',
      '    hasUnsettledResult: function (id) { return generationUi.hasUnsettledResult(id); },',
      '    isQueued: function (id) { return Boolean(groupQueue && groupQueue.protects(id)); },',
      '    hasFailure: function (id) { return generationUi.nodeState(id)?.status === "failed" || sequenceUi.view(id).run?.status === "failed"; },',
      '    video: generationUi.runTemplateVideo, sequence: sequenceUi.runTemplate, importImage: requestImageImport,',
      '    image: generationUi.runTemplateImage,',
      '    refreshAnimation: function (id) { if (!refreshAnimationFromSource(documentState, id)) throw new Error("动画来源图集或连线尚未就绪。"); markDirty(); },',
      '    select: function (id) { selected.clear(); selected.add(id); render(); },',
      '    animation: function (flow) {',
      '      past = []; future = [];',
      '      const node = appendAnimation(documentState, flow.sequenceId, crypto.randomUUID(), crypto.randomUUID(), flow.animationId);',
      '      if (!node) throw new Error("动画来源图集或连线尚未就绪。");',
      '      flow.animationId = node.id;',
      '      markDirty();',
      '    }',
      '  });',
      "  document.getElementById('save').addEventListener('click', function () { void flush(); });",
    ].join(String.fromCharCode(10))
  );
  page = replaceCanvasPageText(
    page,
    '  let sequenceUi = null; let generationUi = null;',
    '  let sequenceUi = null; let generationUi = null; let sequenceEditor; let templateWorkflow = null; let imageEditing = null; let videoHistory = null; let groupQueue = null; let groupQueueUi = null;'
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
  page = replaceCanvasPageText(page, '      return !ack.pending;', '      return true;');
  page = page.replace(
    '  void boot().catch',
    '  sequenceEditor = createSequenceEditor({ maxFrames: MAX_SEQUENCE_FRAMES, controller: sequenceUi, frameCollection, backgroundRemoval, openBackgroundEditor, openFrameEditor, mediaUrl: store.mediaUrl, actions: sequenceActionsForCard }); void boot().catch'
  );
  page = page.replace(
    "window.addEventListener('keydown', function (event) {",
    "window.addEventListener('keydown', function (event) { if (sequenceEditor && sequenceEditor.isOpen) return;"
  );
  page = page.replace(
    '</style>',
    SEQUENCE_EDITOR_STYLES +
      '.sequence-editor[aria-label="本地图片编辑"] { width: min(560px, calc(100vw - 32px)); height: auto; padding: 20px; box-sizing: border-box; }' +
      '</style>'
  );
  page = replaceCanvasPageText(
    page,
    '  const store = createBrowserCanvasDocumentStore(key);',
    [
      '  const store = createBrowserCanvasDocumentStore(key);',
      '  const animationCards = createAnimationCards(store.mediaUrl, function (animationId) {',
      '    if (!documentState) return;',
      '    remember();',
      "    if (!refreshAnimationFromSource(documentState, animationId)) { setError('序列帧来源不存在，无法刷新动画。'); return; }",
      '    markDirty();',
      '    render();',
      '  });',
    ].join(String.fromCharCode(10))
  );
  page = replaceCanvasPageText(
    page,
    '    world.replaceChildren();',
    '    animationCards.beginRender(documentState.nodes); world.replaceChildren();'
  );
  page = replaceCanvasPageText(
    page,
    "      if (node.type === 'sequence') {",
    "      if (node.type === 'animation') animationCards.render(card, node, documentState.nodes.find(function (source) { return documentState.edges.some(function (edge) { return edge.kind === 'sequence-animation' && edge.from === source.id && edge.to === node.id; }) && source.type === 'sequence'; }));\n      if (node.type === 'sequence') {"
  );
  page = replaceCanvasPageText(
    page,
    '    for (const node of documentState.nodes) {',
    "    const orderedNodes = documentState.nodes.slice().sort(function (left, right) { return (left.type === 'section' ? -1 : 0) - (right.type === 'section' ? -1 : 0); });\n    for (const node of orderedNodes) {\n      if (node.type === 'video-source') fitVideoCard(node);"
  );
  page = replaceCanvasPageText(
    page,
    '  function render() {',
    [
      '  function fitVideoCard(node) {',
      '    const dimensions = videoDimensions.get(node.assetPath) || node.videoInfo;',
      '    if (!dimensions) return false;',
      '    const size = videoCardSize(node.width, dimensions.width, dimensions.height);',
      '    if (!size || Math.abs(size.width - node.width) < .01 && Math.abs(size.height - node.height) < .01) return false;',
      '    node.width = size.width; node.height = size.height;',
      '    markDirty();',
      '    return true;',
      '  }',
      '  function render() {',
    ].join('\n')
  );
  page = page.replace('/*__HELPERS__*/', helpers);
  page = replaceCanvasPageText(
    page,
    '      card.append(title);',
    "      if (node.type !== 'image' || !node.assetPath) card.append(title); if (node.type === 'section') { const info = document.createElement('p'); info.textContent = documentState.nodes.filter(function (item) { return item.sectionId === node.id; }).length + ' 个节点'; card.append(info); } if (node.type === 'image' && !node.assetPath) { const empty = document.createElement('button'); empty.type = 'button'; empty.className = 'image-empty'; empty.setAttribute('aria-label', '导入图片'); empty.innerHTML = '<span>＋</span><small>图片</small>'; empty.addEventListener('click', function (event) { event.stopPropagation(); selectNode(node.id, false); requestImageImport(node.id); }); card.append(empty); }"
  );
  page = replaceCanvasPageText(
    page,
    '      world.append(card);\n    }\n    wires.setAttribute',
    [
      '      world.append(card);',
      '      if (node.type === "image" && node.assetPath) renderImageInfo(card, generationUi.imageTarget(node));',
      '    }',
      '    function renderSelectionToolbar() {',
      '      selectionToolbar.replaceChildren();',
      '      selectionMenu.replaceChildren();',
      '      const chosen = documentState.nodes.filter(function (item) { return selected.has(item.id); });',
      "      if (chosen.length !== 1 || !generationUi || !['image', 'video', 'video-source'].includes(chosen[0].type)) { selectionMenu.hidden = true; selectionToolbar.hidden = true; return; }",
      '      const node = chosen[0];',
      '      const nodeBusy = Boolean((generationUi && generationUi.isNodeBusy(node.id)) || (templateWorkflow && templateWorkflow.isNodeLoading(node.id)));',
      '      const remoteState = generationUi.nodeState(node.id);',
      '      const workflowMember = templateWorkflow.isMember(node.id);',
      '      const restricted = workflowMember && (templateWorkflow.status(node.id) === "pending" || remoteState && ["failed", "unknown", "canceled", "timedout"].includes(remoteState.status));',
      '      const adjusting = selectionAction === "workflow" && templateWorkflow.canAdjust(node.id);',
      '      if (nodeBusy || remoteState && ["running", "pending", "unknown", "canceled"].includes(remoteState.status) || templateWorkflow.locked(node.id) && !adjusting) { selectionMenu.hidden = true; selectionToolbar.hidden = true; return; }',
      "      const emptyImage = node.type === 'image' && !node.assetPath;",
      '      selectionMenu.hidden = emptyImage || restricted;',
      '      const panelOpen = restricted ? adjusting : emptyImage || Boolean(selectionAction);',
      '      selectionToolbar.hidden = !panelOpen;',
      "      const actions = document.createElement('div'); actions.className = 'selection-actions';",
      "      function actionButton(text, action, active, unavailable) { const button = document.createElement('button'); button.type = 'button'; button.textContent = text; if (active) button.className = 'active'; if (unavailable) { button.disabled = true; button.title = unavailable; } button.addEventListener('click', function (event) { event.stopPropagation(); action(); }); actions.append(button); }",
      "      if (node.type === 'image' && !emptyImage) {",
      "        actionButton('快速编辑', function () { selectionAction = selectionAction === 'image' ? '' : 'image'; render(); }, selectionAction === 'image');",
      "        actionButton('视频生成', function () { createVideoSlot(node); }, selectionAction === 'video');",
      "        actionButton('去纯色背景', function () { void openLocalImage(node, 'cutout'); });",
      "        actionButton('扩展画面（AI）', function () { selectionAction = selectionAction === 'outpaint' ? '' : 'outpaint'; render(); }, selectionAction === 'outpaint');",
      "        actionButton('本地编辑', function () { void openLocalImage(node, 'edit'); });",
      "        const download = document.createElement('details'); download.className = 'image-download';",
      "        const trigger = document.createElement('summary'); trigger.setAttribute('aria-label', '下载图片'); trigger.title = '下载图片'; trigger.innerHTML = '<svg width=18 height=18 viewBox=\"0 0 24 24\" fill=none stroke=currentColor stroke-width=1.8 aria-hidden=true><path d=\"M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5\"/></svg>';",
      "        const formats = document.createElement('div'); formats.className = 'image-download-options';",
      "        ['png', 'jpg'].forEach(function (format) {",
      "          const item = document.createElement('button'); item.type = 'button'; item.textContent = '导出为 ' + format.toUpperCase();",
      "          item.addEventListener('click', function () { download.open = false; void resourceExport.download(node, format); });",
      '          formats.append(item);',
      '        });',
      "        download.addEventListener('toggle', function () { if (!download.open) return; const rect = trigger.getBoundingClientRect(); formats.style.left = Math.max(8, rect.right - 144) + 'px'; formats.style.top = rect.bottom + 6 + 'px'; });",
      '        download.append(trigger, formats); actions.append(download);',
      '      }',
      "      else if (node.type !== 'image') { const editingTemplateVideo = node.type === 'video-source' && templateWorkflow && templateWorkflow.canEditVideo(node.id); actionButton(editingTemplateVideo ? '编辑视频' : '生成视频', function () { selectionAction = selectionAction === 'video' ? '' : 'video'; render(); }, selectionAction === 'video'); if (node.type === 'video-source' && node.assetPath) actionButton('拆序列帧', function () { sequenceUi.createFromVideo(node.id); }); }",
      '      selectionMenu.append(actions);',
      "      if (panelOpen) { const panel = document.createElement('div'); panel.className = 'selection-panel'; const panelNode = node.type === 'image' && selectionAction === 'video' ? { id: 'video-draft:' + node.id, type: 'video', draftSourceId: node.id } : node; const workflowEdit = workflowMember && panelNode === node ? { canSubmit: !templateWorkflow.waitingForSource(node.id), submit: function (execute) { return templateWorkflow.runFrom(node.id, execute); } } : undefined; generationUi.render(panel, panelNode, documentState.nodes, selectionAction === 'outpaint' ? 'outpaint' : undefined, workflowEdit); selectionToolbar.append(panel); }",
      '      positionSelectionToolbar();',
      '    }',
      '    renderSelectionToolbar();',
      '    wires.setAttribute',
    ].join('\n')
  );
  page = page
    .split("event.target.closest('textarea, input, select, button, video')")
    .join("event.target.closest('textarea, input, select, button, video, details')");
  page = page.replace(
    '  <button id="new-canvas" type="button">新建</button>',
    '  <select id="new-canvas" aria-label="新建画布"><option value="">新建画布…</option><option value="empty">新建空白画布</option></select>'
  );
  page = page.replace(
    '<div id="board"><svg id="wires"></svg><div id="world"></div><div id="marquee" hidden></div></div>',
    '<div id="board"><div id="selection-menu" role="toolbar" aria-label="卡片功能菜单" hidden></div><div id="selection-toolbar" role="region" aria-label="卡片生成面板" hidden></div><svg id="wires"></svg><div id="world"></div><div id="marquee" hidden></div></div>\n<div id="canvas-context-menu" hidden role="menu"><button type="button" data-canvas-action="add-generation" data-menu-scope="blank">新建图片卡片</button><button type="button" data-canvas-action="add-video" data-menu-scope="blank">新建视频卡片</button><button type="button" data-canvas-action="duplicate" data-menu-scope="card">复制卡片</button><button type="button" data-canvas-action="delete" data-menu-scope="card">删除卡片</button></div>'
  );
  page = page.replace(
    '</style>',
    '.canvas-heading { display: inline-flex; align-items: center; gap: 4px; min-width: 0; max-width: min(280px, 100%); }\n#canvas-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n#rename-canvas { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 30px; width: 30px; height: 30px; padding: 0; border-color: transparent; background: transparent; color: #b7b1a6; cursor: pointer; }\n#rename-canvas:hover { background: #2c333e; color: #e6b15c; }\n#rename-canvas:focus-visible { outline: 2px solid #e6b15c; outline-offset: 2px; }\n#canvas-context-menu { position: fixed; z-index: 30; min-width: 168px; padding: 6px; border: 1px solid #4a5260; border-radius: 10px; background: #171a20; box-shadow: 0 12px 32px rgba(0,0,0,.38); }\n#canvas-context-menu button { display: block; width: 100%; padding: 8px 10px; border: 0; border-radius: 6px; background: transparent; color: inherit; text-align: left; cursor: pointer; }\n#canvas-context-menu button:hover { background: #2c333e; }\n#add-image, #add-video-source, #add-video, #add-note, #undo, #redo, #add-generation, #fit-canvas, #create-section, #duplicate-selected, #delete-selected, #export-canvas { display: none !important; }\n.card { cursor: grab; user-select: none; }\n.card:active { cursor: grabbing; }\n.card img { user-select: none; -webkit-user-drag: none; }\n</style>'
  );
  page = page.replace(
    '</style>',
    '#selection-toolbar { position: absolute; z-index: 20; box-sizing: border-box; display: flex; flex-direction: column; align-items: stretch; gap: 10px; padding: 12px; border: 1px solid #414957; border-radius: 12px; background: #17191f; box-shadow: 0 12px 32px rgba(0,0,0,.4); overflow: auto; overscroll-behavior: contain; }\n#selection-menu { position: absolute; z-index: 21; box-sizing: border-box; width: max-content; padding: 6px; border: 1px solid #414957; border-radius: 10px; background: #202228; box-shadow: 0 6px 20px rgba(0,0,0,.35); overflow-x: auto; overscroll-behavior: contain; }\n#selection-menu .selection-actions { flex-wrap: nowrap; }\n#selection-menu button { white-space: nowrap; border-color: transparent; background: transparent; font-weight: 600; }\n#selection-menu button:hover, #selection-menu button.active { background: #5b4728; border-color: #c99649; }\n#selection-menu button:disabled { opacity: .4; cursor: not-allowed; background: transparent; border-color: transparent; }\n.image-download summary { display: flex; align-items: center; justify-content: center; width: 34px; height: 32px; cursor: pointer; border-left: 1px solid #414957; list-style: none; }\n.image-download summary::-webkit-details-marker { display: none; }\n.image-download-options { position: fixed; z-index: 40; width: 144px; padding: 5px; box-sizing: border-box; border: 1px solid #414957; border-radius: 8px; background: #202228; box-shadow: 0 8px 24px rgba(0,0,0,.4); }\n.image-download-options button { display: block; width: 100%; text-align: left; }\n#selection-menu[hidden], #selection-toolbar[hidden] { display: none; }\n.selection-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }\n.selection-actions button { background: #20242d; color: #e8e3d8; border: 1px solid #414957; border-radius: 7px; padding: 7px 10px; cursor: pointer; }\n.selection-actions button:hover, .selection-actions button.active { background: #5b4728; border-color: #c99649; color: #fff1cf; }\n.selection-label { color: #b7b1a6; font-size: 12px; margin-right: 4px; }\n.selection-panel { min-width: 0; }\n.image-empty { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 84px; height: 84px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border: 0; background: #1a1d24; color: #aaa79f; cursor: pointer; }\n.image-empty:hover { background: #232832; color: #e6b15c; }\n.image-empty span { font-size: 30px; line-height: 1; }\n.image-empty small { font-size: 12px; }\n.card.image { padding: 0; min-width: 280px; min-height: 220px; }\n.card.image > img { display: block; width: 100%; height: 100%; object-fit: contain; }\n.card.image > strong, .card.video > strong, .card.video-source > strong { display: none; }\n.port { display: none !important; }\n.generation-panel { margin-top: 0; display: grid; grid-template-columns: minmax(0,1fr); align-items: end; gap: 8px; }\n.generation-panel > .generation-prompt { min-height: 96px; resize: vertical; font: inherit; font-size: 13px; line-height: 1.5; padding: 10px; }\n.generation-references { display: flex; align-items: flex-start; gap: 10px; flex-wrap: nowrap; overflow-x: auto; min-width: 0; max-width: 100%; padding: 6px 6px 4px; box-sizing: border-box; overscroll-behavior-x: contain; scrollbar-width: thin; }\n.generation-references:empty { display: none; }\n.generation-reference { position: relative; flex: 0 0 68px; width: 68px; display: flex; flex-direction: column; gap: 4px; text-align: center; }\n.generation-reference img { display: block; width: 68px; height: 60px; object-fit: contain; border: 1px solid #414957; border-radius: 6px; background: #101114; }\n.generation-reference small { font-size: 10px; color: #b7b1a6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.generation-reference-remove { position: absolute; top: -5px; right: -5px; width: 20px; height: 20px; padding: 0; border-radius: 50%; border: 1px solid #616875; background: #303640; color: white; cursor: pointer; }\n.generation-reference-add { flex: 0 0 68px; height: 62px; display: grid; place-items: center; padding: 0; border: 1px dashed #616875; border-radius: 6px; background: #161a21; color: #aeb8cb; font-size: 28px; cursor: pointer; } .generation-reference-add:hover:not(:disabled), .generation-reference-add:focus-visible { border-color: #e6b15c; color: #e6b15c; background: #252320; } .generation-reference-add:disabled { opacity: .45; cursor: not-allowed; } .generation-reference-hint { color: #aaa79f; font-size: 11px; }\n.generation-reference-remove:disabled { opacity: .4; cursor: wait; }\n.generation-fields { display: grid; grid-template-columns: repeat(3,minmax(80px,1fr)); gap: 6px; }\n.generation-field { display: flex; flex-direction: column; gap: 3px; color: #aaa79f; font-size: 11px; }\n.generation-field .generation-mode { width: 100%; }\n.generation-actions { display: flex; justify-content: flex-end; gap: 6px; }\n.generation-actions .generation-action { white-space: nowrap; }\n@media (max-width: 760px) { .generation-panel { grid-template-columns: 1fr; } .generation-fields { grid-template-columns: repeat(2,minmax(80px,1fr)); } }\n</style>'
  );
  page = page.replace(
    '        card.append(img);',
    "        img.draggable = false; img.addEventListener('dragstart', function (event) { event.preventDefault(); });\n        card.append(img);"
  );
  page = page.replace(
    "      card.addEventListener('pointerdown', function (event) {",
    "      card.addEventListener('dragstart', function (event) { event.preventDefault(); });\n      card.addEventListener('pointerdown', function (event) { if (event.button !== 2 && ((templateWorkflow && templateWorkflow.locked(node.id)) || (templateWorkflow && templateWorkflow.isNodeLoading(node.id)) || (generationUi && generationUi.isNodeBusy(node.id)))) { event.preventDefault(); event.stopPropagation(); return; }"
  );
  page = page.replace(
    "port.title = '拖到视频输入卡，保存为首帧';",
    "port.title = '点击创建图片变体；拖到视频输入卡可设置首帧';"
  );
  page = page.replace(
    'if (chosen) void importVideoFile(chosen);',
    'if (chosen) void importVideoFile(chosen, pendingPlacement || undefined); pendingPlacement = null;'
  );
  page = page.replace(
    / {2}document\.getElementById\('new-canvas'\)\.addEventListener\('click', function \(\) \{[\s\S]*?\n {2}\}\);\n {2}document\.getElementById\('add-note'\)/,
    [
      "  document.getElementById('new-canvas').addEventListener('change', function (event) {",
      '    const template = event.target.value;',
      "    event.target.value = '';",
      '    if (!template) return;',
      '    void leaveCurrent().then(async function (ok) {',
      '      if (!ok || (documentState && dirty())) return;',
      "      const title = template === 'sequence' ? '序列帧模板画布' : '空白画布';",
      "      const created = await request('/canvases', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: title, template: template }) });",
      "      const option = document.createElement('option');",
      '      option.value = created.id; option.textContent = created.title; select.append(option);',
      '      await openDocument(created.id);',
      "    }).catch(function (caught) { setError(caught.message || '新建画布失败。'); });",
      '  });',
      "  document.getElementById('add-note')",
    ].join('\n')
  );
  page = page.replace(
    "  document.getElementById('add-note').addEventListener('click', function () { add('note', nextPlacement('note')); });",
    [
      '  let pendingPlacement = null;',
      "  const contextMenu = document.getElementById('canvas-context-menu');",
      '  const resourceExport = createCanvasResourceExport({ getDocument: function () { return documentState; }, mediaUrl: function (path) { return store.mediaUrl(path); }, error: setError, progress: function (message) { setError(message, "info"); } });',
      '  function hideContextMenu() { contextMenu.hidden = true; }',
      '  function showContextMenu(event) {',
      '    event.preventDefault();',
      "    const card = event.target.closest && event.target.closest('.card[data-id]');",
      "    const blankActions = contextMenu.querySelectorAll('[data-menu-scope=blank]');",
      "    const cardActions = contextMenu.querySelectorAll('[data-menu-scope=card]');",
      '    blankActions.forEach(function (item) { item.hidden = Boolean(card); });',
      '    cardActions.forEach(function (item) { item.hidden = !card; });',
      '    if (card && !selected.has(card.dataset.id)) selectNode(card.dataset.id, false);',
      '    if (!card && selected.size < 2) { selected.clear(); render(); }',
      '    templateUi.context(contextMenu);',
      '    resourceExport.context(contextMenu, card && selected.size === 1 ? documentState.nodes.find(function (node) { return node.id === card.dataset.id; }) : undefined);',
      '    pendingPlacement = documentState ? worldPoint(event) : null;',
      '    contextMenu.hidden = false;',
      "    contextMenu.style.left = Math.min(event.clientX, window.innerWidth - 190) + 'px';",
      "    contextMenu.style.top = Math.min(event.clientY, window.innerHeight - 300) + 'px';",
      '  }',
      "  board.addEventListener('contextmenu', showContextMenu);",
      "  contextMenu.addEventListener('click', function (event) {",
      "    const action = event.target.closest && event.target.closest('[data-canvas-action]');",
      '    if (!action) return;',
      '    const value = action.dataset.canvasAction;',
      '    hideContextMenu();',
      "    if (value === 'add-video') { add('video', pendingPlacement || nextPlacement('video')); pendingPlacement = null; return; }",
      "    if (value === 'add-generation') { createBlankImageSlot(); return; }",
      "    if (value === 'duplicate') { duplicateSelected(); return; }",
      "    if (value === 'delete') deleteSelected();",
      '  });',
      "  document.addEventListener('pointerdown', function (event) { if (!contextMenu.hidden && !contextMenu.contains(event.target)) hideContextMenu(); });",
      "  document.getElementById('add-note').addEventListener('click', function () { add('note', nextPlacement('note')); });",
    ].join('\n')
  );
  page = page.replace('</header><div id="template-flow" hidden></div>', '</header>');
  page = page.replace(
    '<div id="marquee" hidden></div></div>\n<div id="canvas-context-menu"',
    '<div id="marquee" hidden></div><div id="template-flow" hidden></div></div>\n<div id="canvas-context-menu"'
  );
  page = replaceCanvasPageText(
    page,
    '</style>',
    '#canvas-context-menu button[hidden] { display: none; }</style>'
  );
  page = replaceCanvasPageText(
    page,
    "  board.addEventListener('pointerdown', function (event) {",
    "  board.addEventListener('pointerdown', function (event) {\n    if (event.button === 2) return;"
  );
  page = replaceCanvasPageText(
    page,
    '</style>',
    '#template-flow:not([hidden]) { position:absolute; z-index:25; left:50%; bottom:24px; transform:translateX(-50%); display:flex; align-items:center; gap:14px; box-sizing:border-box; width:min(560px, calc(100% - 32px)); padding:12px 14px; border:1px solid #6d5b3b; border-radius:12px; background:#25251fee; color:#e6c18a; font-size:13px; box-shadow:0 10px 28px rgba(0,0,0,.34); } #template-flow span { flex:1; line-height:1.45; } #template-flow button { flex:0 0 auto; } #template-flow button:disabled { opacity:.55; cursor:wait; } .template-locked button, .template-locked input, .template-locked select, .template-locked textarea { pointer-events:none; opacity:.35; } .template-example { position:absolute; top:8px; left:8px; padding:3px 7px; background:#222c; color:#ddd; border-radius:4px; font-size:11px; pointer-events:none; } .card.template-pending { border-color:#6d5b3b; opacity:.72; } .card.template-loading { border-color:#e6b15c; box-shadow:0 0 0 2px rgba(230,177,92,.3), 0 0 24px rgba(230,177,92,.18); animation:template-card-pulse 1.4s ease-in-out infinite; } .card.template-loading button, .card.template-loading input, .card.template-loading select, .card.template-loading textarea { pointer-events:none; opacity:.45; } @keyframes template-card-pulse { 50% { box-shadow:0 0 0 4px rgba(230,177,92,.18), 0 0 30px rgba(230,177,92,.28); } }</style>'
  );
  page = replaceCanvasPageText(
    page,
    '  function render() {\n    if (!documentState) return;',
    [
      '  function protectTemplateSelection() {',
      '    const flow = documentState && documentState.templateFlow;',
      '    if (!flow || flow.stage === "complete") return false;',
      '    if (![flow.imageId, flow.videoId, flow.sequenceId, flow.animationId].some(function (id) { return selected.has(id); })) return false;',
      '    setError("模板流程完成前请保留流程卡片；首图可快速编辑或替换。"); return true;',
      '  }',
      '  function render() {',
      '    if (!documentState) return;',
      '    if (templateWorkflow) templateWorkflow.render(document.getElementById("template-flow"));',
      '    publishDirty();',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    '      world.append(card);',
    [
      '      const templateStatus = templateWorkflow && templateWorkflow.status(node.id);',
      '      const creditsLabel = generationUi && generationUi.creditsLabel(node); if (creditsLabel) { const credits = document.createElement("small"); credits.className = "generation-credits"; credits.textContent = creditsLabel; credits.title = "当前结果的 MCP 返回积分，不是累计消耗或余额；未返回不代表免费，最终扣费以账单为准。"; card.append(credits); }',
      '      const nodeBusy = Boolean((generationUi && generationUi.isNodeBusy(node.id)) || (templateWorkflow && templateWorkflow.isNodeLoading(node.id)));',
      '      const generationState = generationUi && generationUi.nodeState(node.id);',
      '      const sequenceState = node.type === "sequence" && sequenceUi.view(node.id).run;',
      '      const overlayState = node.type !== "section" ? canvasCardStatus({ busy: nodeBusy || sequenceUi.isNodeBusy(node.id), generation: generationState && generationState.status, sequence: sequenceState && sequenceState.status, template: templateStatus }) : undefined;',
      '      if (templateStatus === "pending") card.classList.add("template-pending");',
      '      if (templateStatus === "loading" || nodeBusy) card.classList.add("template-loading");',
      '      if (node.type !== "section" && (templateWorkflow && templateWorkflow.locked(node.id) || nodeBusy || templateWorkflow.isMember(node.id) && overlayState)) {',
      '        card.classList.add("template-locked");',
      '        card.querySelectorAll("button,input,select,textarea").forEach(function (control) { control.disabled = true; });',
      '        card.addEventListener("dblclick", function (event) { event.stopImmediatePropagation(); }, true);',
      '      }',
      '      renderCanvasCardStatus(card, overlayState, { waitingForSource: templateWorkflow.waitingForSource(node.id), adjust: templateWorkflow.canAdjust(node.id) ? function () { selected.clear(); selected.add(node.id); if (node.type === "sequence") { sequenceUi.beginEdit(node.id); sequenceEditor.open(node.id); } else { selectionAction = "workflow"; render(); } } : undefined, waitTimedOut: generationState && generationState.status === "timedout", resume: (!generationState || generationState.status !== "timedout") && templateWorkflow.canContinue(node.id) ? function () { selectionAction = ""; return templateWorkflow.runFrom(node.id); } : undefined, detail: sequenceState && sequenceState.error, stoppedWaiting: generationState && generationState.status === "canceled", query: generationState && generationState.canQuery && !nodeBusy ? function () { return generationUi.queryNode(node.id); } : undefined });',
      '      world.append(card);',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    '  function selectNode(id, shift) {',
    '  function selectNode(id, shift) {\n    if (!selected.has(id)) selectionAction = "";'
  );
  page = replaceCanvasPageText(
    page,
    '    if (event.target !== board && event.target !== world) return;',
    "    if (event.target !== board && event.target !== world) return;\n    selectionAction = ''; "
  );
  page = replaceCanvasPageText(
    page,
    '    const previous = past.pop();',
    '    if (documentState && documentState.templateFlow && documentState.templateFlow.stage !== "complete") { setError("模板流程中暂不撤销，以免回退已提交的生成任务。"); return; }\n    const previous = past.pop();'
  );
  page = replaceCanvasPageText(
    page,
    '    const next = future.shift();',
    '    if (documentState && documentState.templateFlow && documentState.templateFlow.stage !== "complete") return;\n    const next = future.shift();'
  );
  page = replaceCanvasPageText(
    page,
    '<button id="create-section"',
    '<button id="add-template" type="button">添加模板</button><button id="create-section"'
  );
  page = replaceCanvasPageText(page, '</style>', TEMPLATE_LIBRARY_STYLES + '</style>');
  page = replaceCanvasPageText(
    page,
    'void boot().catch(function (caught) { setError(caught.message); });',
    [
      '  const templateModel = createCanvasTemplateModel();',
      '  const templateUi = createCanvasTemplateUi({',
      '    store: store.templates, model: templateModel, getDocument: function () { return documentState; }, selected: selected,',
      '    remember: remember, changed: markDirty, render: render, save: flush, error: setError,',
      '    busy: function (id) { return pendingAssetImports > 0 || Boolean(groupQueue && groupQueue.protects(id)) || sequenceUi.isBusy || generationUi.isNodeBusy(id) || generationUi.hasUnsettledResult(id) || templateWorkflow.isNodeLoading(id); },',
      '    placement: function () { const nodes = documentState.nodes; return nodes.length ? { x: Math.max.apply(null, nodes.map(function (node) { return node.x + node.width; })) + 80, y: Math.min.apply(null, nodes.map(function (node) { return node.y; })) + 56 } : { x: 80, y: 80 }; },',
      '    deleteSelected: deleteSelected, loadMedia: loadMedia,',
      '    reveal: function (group) { const scale = Math.min(1, Math.max(.15, Math.min((board.clientWidth - 100) / group.width, (board.clientHeight - 100) / group.height))); documentState.viewport = { scale: scale, x: (board.clientWidth - group.width * scale) / 2 - group.x * scale, y: (board.clientHeight - group.height * scale) / 2 - group.y * scale }; },',
      '  });',
      '  document.getElementById("add-template").addEventListener("click", function () { void templateUi.library(); });',
      '  videoHistory = createVideoHistoryUi({ store: store, onBusyChange: publishDirty, recover: function (attempt) { return generationUi.recoverVideo(attempt); } });',
      '  document.getElementById("video-history").addEventListener("click", function () { void videoHistory.open(); });',
      '  let videoTimingState = "";',
      '  setInterval(function () { if (!documentState || !generationUi) return; const next = documentState.id + documentState.nodes.filter(function (node) { return node.type === "video" || node.type === "video-source"; }).map(function (node) { const state = generationUi.nodeState(node.id); return node.id + (state ? state.status + state.canQuery : ""); }).join("|"); if (videoTimingState !== next) render(); videoTimingState = next; }, 1000);',
      '  async function openLocalImage(node, action) {',
      '    if (imageEditing && imageEditing.isBusy) return;',
      '    const current = documentState;',
      '    const decision = templateWorkflow.resolveTarget(node.id, "image", node.id);',
      '    if (decision && decision.kind === "blocked") { setError(decision.message); return; }',
      '    const targetId = decision && decision.kind === "reuse" ? decision.nodeId : undefined;',
      '    imageEditing = createImageEditing({',
      '      load: async function (source, signal) { const response = await fetch(store.mediaUrl(source.assetPath), { signal: signal }); if (!response.ok) throw new Error("图片读取失败"); return response.blob(); },',
      '      save: async function (blob) { if (documentState !== current) throw new Error("画布已切换"); return store.importImage(current.id, await blob.arrayBuffer(), "image/png"); },',
      '      onSaved: async function (result, source) {',
      '        if (documentState !== current) throw new Error("画布已切换，未覆盖原卡片");',
      '        if (!(await flush())) throw new Error("请先解决画布保存错误，再重试");',
      '        const previous = { nodes: structuredClone(current.nodes), edges: structuredClone(current.edges) };',
      '        let applied;',
      '        try { applied = applyLocalImageResult(current, source, result.relativePath, targetId, function () { return crypto.randomUUID(); }); invalidateCanvasDependents(current, applied.id); if (!(await flush())) throw new Error("画布保存失败，原结果仍保留，可重试保存"); }',
      '        catch (caught) { Object.assign(current, previous); render(); throw caught; }',
      '        const committed = { nodes: current.nodes, edges: current.edges }; Object.assign(current, previous); remember(); Object.assign(current, committed);',
      '        selected.clear(); selected.add(applied.id); selectionAction = ""; render();',
      '      },',
      '      onBusyChange: publishDirty, backgroundRemoval: backgroundRemoval, openBackgroundEditor: openBackgroundEditor, openFrameEditor: openFrameEditor,',
      '    });',
      '    try { await imageEditing.open(node, action); } catch (caught) { setError(caught.message); }',
      '  }',
      '  void boot().catch(function (caught) { setError(caught.message); });',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "  board.addEventListener('pointerup', function (event) {",
    "  board.addEventListener('pointerup', function (event) {\n    if (drag && drag.kind === 'move' && drag.moved) { templateModel.updateMembership(documentState, drag.positions.map(function (item) { return item.id; })); markDirty(); render(); }"
  );
  page = replaceCanvasPageText(
    page,
    '      world.append(card);',
    '      if (node.type === "section" && node.templateId) title.textContent += " · 模板";\n      world.append(card);'
  );
  page = replaceCanvasPageText(
    page,
    '<p id="error"></p>',
    '<p id="error" hidden aria-hidden="true"></p><section id="canvas-log" aria-label="运行日志"></section>'
  );
  page = replaceCanvasPageText(
    page,
    "  const error = document.getElementById('error');",
    [
      "  const error = document.getElementById('error');",
      "  const videoHistoryButton = document.createElement('button');",
      "  videoHistoryButton.id = 'video-history'; videoHistoryButton.type = 'button'; videoHistoryButton.textContent = '视频历史';",
      "  const canvasLogs = createCanvasLog(document.getElementById('canvas-log'), [videoHistoryButton]);",
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "  function setError(text) { error.textContent = text || ''; }",
    "  function setError(text, level) { error.textContent = text || ''; canvasLogs.add(text || '', level); }"
  );
  page = replaceCanvasPageText(
    page,
    '    const view = documentState.viewport;',
    '    canvasLogs.setContext(documentState.id);\n    const view = documentState.viewport;'
  );
  page = replaceCanvasPageText(
    page,
    '</style>',
    CANVAS_CARD_STATUS_STYLES + CANVAS_LOG_STYLES + GROUP_QUEUE_STYLES + '</style>'
  );
  page = replaceCanvasPageText(
    page,
    '    const previous = past.pop();',
    '    if (groupQueue && groupQueue.isBusy) { setError("请先停止队列并等待当前步骤结束，再撤销。"); return; }\n    const previous = past.pop();'
  );
  page = replaceCanvasPageText(
    page,
    '    const next = future.pop();',
    '    if (groupQueue && groupQueue.isBusy) { setError("请先停止队列并等待当前步骤结束，再重做。"); return; }\n    const next = future.pop();'
  );
  page = replaceCanvasPageText(
    page,
    '  function connect(fromId, toId, shouldRemember) {',
    '  function connect(fromId, toId, shouldRemember) {\n    if (groupQueue && (groupQueue.protects(fromId) || groupQueue.protects(toId))) { setError("请先停止相关队列，再修改引用连线。"); return; }'
  );
  page = replaceCanvasPageText(
    page,
    '      world.append(card);',
    '      if (node.type === "section" && node.templateId && groupQueueUi) groupQueueUi.render(card, node);\n      world.append(card);'
  );
  page = replaceCanvasPageText(
    page,
    "  document.getElementById('save').addEventListener",
    [
      '  groupQueue = createCanvasGroupQueue({',
      '    getDocument: function () { return documentState; },',
      '    needs: function (id) { return templateWorkflow.status(id) === "pending"; },',
      '    problem: function (id) { if (sequenceUi.hasDraft(id)) return "此卡片有未保存的帧处理，请先保存或放弃后再继续队列。"; return generationUi.queueBlockReason(id); },',
      '    busy: function () { return templateWorkflow.isBusy || generationUi.isBusy || sequenceUi.isBusy || Boolean(sequenceEditor && sequenceEditor.isOpen) || Boolean(imageEditing && imageEditing.isBusy) || Boolean(videoHistory && videoHistory.isBusy) || pendingAssetImports > 0; },',
      '    videoBusy: async function () { return Boolean((await store.videoHistory(0, 1)).busy); },',
      '    run: async function (id) { error.textContent = ""; const ok = await templateWorkflow.runQueued(id); if (ok) return true; throw new Error(error.textContent || "步骤未完成，已暂停。请查看卡片状态和运行日志。"); },',
      '    confirm: function (message) { return window.confirm(message); }, error: setError,',
      '    changed: function () { if (groupQueueUi) groupQueueUi.refresh(); publishDirty(); },',
      '  });',
      '  groupQueueUi = createCanvasGroupQueueUi({ queue: groupQueue, node: function (id) { return documentState && documentState.nodes.find(function (node) { return node.id === id; }); }, scale: function () { return documentState && documentState.viewport.scale || 1; },',
      '    focus: function (id) { const node = documentState && documentState.nodes.find(function (node) { return node.id === id; }); if (!node) return; const view = documentState.viewport; view.x = board.clientWidth / 2 - (node.x + node.width / 2) * view.scale; view.y = board.clientHeight / 2 - (node.y + (node.height || 200) / 2) * view.scale; selected.clear(); selected.add(id); selectionAction = ""; render(); },',
      '  });',
      '  setInterval(function () { groupQueueUi.tick(); }, 1000);',
      "  document.getElementById('save').addEventListener",
    ].join('\n')
  );
  return page.replace(
    '<title data-maker-canvas="maker-canvas-page">创作画布</title>',
    '<title data-maker-canvas="maker-canvas-page">序列帧动画</title>'
  );
}
