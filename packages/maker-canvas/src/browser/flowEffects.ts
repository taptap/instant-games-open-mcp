import type { CanvasDocument, CanvasNode } from '../contracts.js';
import { canvasNeedsProcessing } from '../features/templateWorkflow.js';
import { resourceBundleMembers } from '../features/resourceBundle.js';

/** Presentation only: reuse the state already resolved by the card's task UI. */
export function decorateCanvasFlowCard(
  card: HTMLElement,
  node: CanvasNode,
  state: string | undefined,
  doc: CanvasDocument
) {
  if (['section', 'note', 'mark'].includes(node.type)) return;
  if (['model', 'model-views'].includes(node.type)) state = card.dataset.state;
  if (!state && node.type === 'resource-bundle') {
    const members = resourceBundleMembers(doc, node.id);
    state =
      members.length &&
      members.every(
        (member) =>
          !canvasNeedsProcessing(doc, member) &&
          (member.uiEmpty || member.imageAssetsInfo?.items.length)
      )
        ? 'ready'
        : 'waiting';
  }
  if (!state) {
    const ready =
      node.uiEmpty ||
      (node.type === 'image-assets'
        ? node.imageAssetsInfo?.items.length
        : node.assetPath &&
          (!['sequence', 'animation'].includes(node.type) || node.frameSetInfo?.frames.length));
    state = ready && !canvasNeedsProcessing(doc, node) ? 'ready' : 'waiting';
  }
  card.dataset.flowState = state === 'loading' ? 'running' : state === 'ready' ? 'success' : state;
  if (state !== 'loading') return;
  const orbit = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  orbit.setAttribute('class', 'canvas-flow-orbit');
  orbit.setAttribute('aria-hidden', 'true');
  const border = document.createElementNS(orbit.namespaceURI, 'rect') as SVGRectElement;
  for (const [key, value] of Object.entries({
    x: '.5',
    y: '.5',
    width: '100%',
    height: '100%',
    rx: '8.5',
    pathLength: '100',
  }))
    border.setAttribute(key, value);
  // Preserve phase when selection, dragging or task updates rebuild the card.
  border.style.animationDelay = -((Date.now() / 1000) % 3) + 's';
  orbit.append(border);
  card.append(orbit);
}

/** Called after cards and wires render, including viewport changes. No document mutations. */
export function syncCanvasFlowEffects(board: HTMLElement) {
  const cards = new Map(
    Array.from(board.querySelectorAll<HTMLElement>('.card[data-flow-state]')).map((card) => [
      card.dataset.id,
      card,
    ])
  );
  const bounds = board.getBoundingClientRect();
  const visible = (element: Element) => {
    const rect = element.getBoundingClientRect();
    return (
      rect.right >= bounds.left &&
      rect.left <= bounds.right &&
      rect.bottom >= bounds.top &&
      rect.top <= bounds.bottom
    );
  };
  for (const card of cards.values())
    if (card.dataset.flowState === 'running') card.dataset.flowOffscreen = String(!visible(card));
  for (const path of board.querySelectorAll<SVGPathElement>('.wire[data-from][data-to]')) {
    const from = cards.get(path.dataset.from);
    const to = cards.get(path.dataset.to);
    const state =
      from?.dataset.flowState === 'success' ? to?.dataset.flowState || 'waiting' : 'waiting';
    path.dataset.flowState = state;
    if (state !== 'running' || path.parentElement?.id !== 'wires' || !visible(path)) continue;
    // Layered dashes form the same travelling comet as the architecture example.
    for (const [length, offset, opacity] of [
      [56, 0, 0.12],
      [36, 20, 0.24],
      [18, 38, 0.5],
      [5, 51, 1],
    ]) {
      const glow = document.createElementNS(path.namespaceURI, 'path') as SVGPathElement;
      glow.setAttribute('d', path.getAttribute('d') || '');
      glow.setAttribute('class', 'canvas-flow-wire');
      glow.setAttribute('stroke-dasharray', length + ' ' + (180 - length));
      glow.style.opacity = String(opacity);
      glow.style.animationDelay = -((offset / 180) * 1.8 + ((Date.now() / 1000) % 1.8)) + 's';
      path.parentNode!.appendChild(glow);
    }
  }
}

export const CANVAS_FLOW_STYLES = `
:root { --flow-running:#e9bb4f; --flow-success:var(--canvas-accent); --flow-failed:#ed7478; --flow-waiting:#65716e; }
:root[data-theme=light] { --flow-running:#ae7908; --flow-failed:#cf444b; --flow-waiting:#adb9b4; }
[data-flow-state=running] { --flow-color:var(--flow-running); }
[data-flow-state=success] { --flow-color:var(--flow-success); }
[data-flow-state=failed] { --flow-color:var(--flow-failed); }
[data-flow-state=waiting] { --flow-color:var(--flow-waiting); }
[data-flow-state=paused] { --flow-color:#8aa0b4; }
[data-flow-state=unknown] { --flow-color:var(--flow-running); }
#world .card[data-flow-state] { border-color:var(--flow-color); animation:none; box-shadow:0 3px 10px #0003; }
#world .card[data-flow-state=running] { box-shadow:0 0 22px #e9bb4f30; }
#world .card[data-flow-state=success] { box-shadow:0 0 14px #00ad9d20; }
#world .card[data-flow-state=failed] { box-shadow:0 0 16px #ed747830; }
#world .card[data-flow-state].selected { outline:none; box-shadow:0 0 18px var(--flow-color); }
/* The SVG covers the border box, so its stroke follows the existing border's centreline. */
.canvas-flow-orbit { position:absolute; inset:-1px; width:calc(100% + 2px); height:calc(100% + 2px); overflow:visible; z-index:9; pointer-events:none; }
.canvas-flow-orbit rect { x:.5px; y:.5px; rx:8.5px; width:calc(100% - 1px); height:calc(100% - 1px); fill:none; stroke:var(--flow-color); stroke-width:2; stroke-dasharray:14 86; filter:drop-shadow(0 0 3px var(--flow-color)); animation:canvas-flow-orbit 3s linear infinite; }
@keyframes canvas-flow-orbit { to { stroke-dashoffset:-100; } }
#board .wire[data-flow-state] { stroke:var(--flow-color); stroke-dasharray:none; opacity:.85; }
#board .wire[data-flow-state=waiting] { stroke-dasharray:6 7; opacity:.38; }
#board .wire[data-flow-state=paused], #board .wire[data-flow-state=unknown] { stroke-dasharray:6 7; opacity:.6; }
#board .wire[data-flow-state=running] { opacity:.5; }
#board .wire[data-flow-state].wire-muted { opacity:.2; }
.canvas-flow-wire { fill:none; stroke:var(--flow-running); stroke-width:3; stroke-linecap:round; pointer-events:none; filter:drop-shadow(0 0 3px var(--flow-running)); animation:canvas-flow-wire 1.8s linear infinite; }
@keyframes canvas-flow-wire { to { stroke-dashoffset:-180; } }
.card[data-flow-offscreen=true] .canvas-flow-orbit rect, :root[data-flow-hidden=true] .canvas-flow-orbit rect, :root[data-flow-hidden=true] .canvas-flow-wire { animation-play-state:paused; }
@media(prefers-reduced-motion:reduce) { .canvas-flow-orbit rect, .canvas-flow-wire { animation:none; } }
:root .canvas-group-state[data-state=ready] { color:var(--flow-success); }
:root .canvas-group-state[data-state=loading], :root .card .card-state-loading { color:var(--flow-running); }
:root .canvas-group-state[data-state=failed], :root .card .card-state-failed { color:var(--flow-failed); }
:root .canvas-group-state[data-state=waiting], :root .card .card-state-waiting { color:var(--canvas-muted); }
`;
