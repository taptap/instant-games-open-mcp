import type { CanvasCommand } from './automation.js';

export function connectCanvasAutomation(options: {
  projectKey: string;
  current(): { id: string; revision: number } | null;
  execute(command: CanvasCommand): Promise<unknown>;
  error?(message: string): void;
}) {
  let pageId: string | undefined;
  const results = new Map<
    string,
    { id: string; status: 'succeeded' | 'failed'; result?: unknown; error?: string }
  >();
  const seen = new Set<string>();
  let stopped = false;
  async function exchange() {
    if (stopped) return;
    const current = options.current();
    try {
      if (current) {
        const response = await fetch(
          '/api/projects/' +
            encodeURIComponent(options.projectKey) +
            '/canvases/automation/exchange',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pageId,
              canvasId: current.id,
              revision: current.revision,
              received: [...seen],
              results: [...results.values()].slice(0, 1),
            }),
            signal: AbortSignal.timeout(5000),
          }
        );
        if (response.ok) {
          const body = await response.json();
          if (stopped) return;
          pageId = body.pageId;
          for (const id of body.acknowledged) results.delete(id);
          for (const command of body.commands as CanvasCommand[]) {
            if (seen.has(command.requestId)) continue;
            seen.add(command.requestId);
            void options.execute(command).then(
              (result) =>
                results.set(command.requestId, {
                  id: command.requestId,
                  status: 'succeeded',
                  result,
                }),
              (error) =>
                results.set(command.requestId, {
                  id: command.requestId,
                  status: 'failed',
                  error: error instanceof Error ? error.message : String(error),
                })
            );
          }
        } else {
          const body = await response.json().catch(() => ({}));
          if (body.code === 'CANVAS_PAGE_EXPIRED') {
            stopped = true;
            options.error?.('画布连接会话已失效，请刷新页面并查询原任务；不会自动重发命令。');
          }
        }
      }
    } catch {
      return;
    } finally {
      if (!stopped) setTimeout(() => void exchange(), 1000);
    }
  }
  window.addEventListener('pagehide', () => {
    stopped = true;
  });
  void exchange();
}
