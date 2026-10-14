import type { CanvasDocument, CanvasNode } from './model.js';

export function isGameUiResource(document: CanvasDocument | undefined, node: CanvasNode): boolean {
  return (
    node.type === 'image-assets' &&
    Boolean(
      document?.nodes.some(
        (section) =>
          section.id === node.sectionId &&
          section.type === 'section' &&
          (section.templateId === '7e1cb6ad-732f-4dc3-a951-000000000013' ||
            section.templateId === '7e1cb6ad-732f-4dc3-a951-000000000015' ||
            (section.templateCliOnly && section.templateSkills?.includes('maker-ui-bbox-workflow')))
      ) ||
        document?.edges.some(
          (edge) =>
            edge.kind === 'image-assets' &&
            edge.to === node.id &&
            document.nodes.some(
              (source) =>
                source.id === edge.from &&
                source.type === 'image' &&
                Boolean(source.uiAtlasGroup) &&
                !source.uiAtlasPrelayout &&
                (Boolean(source.generation?.uiAtlasPlan) ||
                  document.edges.some(
                    (reference) =>
                      reference.to === source.id &&
                      reference.kind === 'image-variant' &&
                      document.nodes.some(
                        (input) => input.id === reference.from && input.uiAtlasPrelayout
                      )
                  ))
            )
        )
    )
  );
}

export function gameUiHandoffText(canvasId: string, projectKey: string): string {
  return [
    '请使用 Maker 内置 maker-ui-workflow Skill，从已有素材继续组装 UI，不重新生图。',
    '控制台项目标识：' +
      projectKey +
      '；画布 ID：' +
      canvasId +
      '。先通过 Maker 状态与画布列表核对对应的本地游戏项目。',
    '读取该画布设计稿、各资源卡和已有布局记录，检查是否全部完成，不能把待更新的示例当成新结果。',
    '先用 canvas ui-archives --target-dir <项目> --canvas-id ' +
      canvasId +
      ' 查找本地归档；按 UI 编号与版本读取同一条记录的 bboxPath 和 bindingsPath。旧画布无归档时先保存再用 canvas archive-ui 补归档。不要依赖聊天记忆或混用不同版本。',
    '将正式 PNG 归档到当前项目 assets/ui/<界面>/images/；冗余素材放 reserve/，仅保存在本机。',
    '读取导出的 bbox.json 和 bindings.json：按稳定元素 ID、显式 PNG 绑定、原稿像素框和父子层级组装，texts 直接还原 Label。缺少关联或未确认顺序时停止，不猜配相似底框。没有 Bbox 时按设置完成识图。',
    '显式调用 generate_resource_meta，使用 Skill 的 assemble-ui.mjs 生成新的 .ui.json 和同名 .reference.png。',
    '打开当前项目控制台的 UI 编辑器检查结果。用户要求纯数据组装时不做视觉纠偏；其它情况先记录差异再决定修正。保留手工编辑，不修改游戏加载逻辑，不上传用户素材。',
  ].join('\n');
}

export function openGameUiHandoff(canvasId: string): void {
  const dialog = document.createElement('dialog');
  dialog.className = 'workflow-template-dialog';
  dialog.style.cssText = 'width:min(640px,calc(100vw - 32px));max-height:85vh;overflow:auto';
  dialog.setAttribute('aria-label', '下一步：组装游戏 UI');
  const title = document.createElement('h2');
  title.textContent = '下一步：交给 AI 组装游戏 UI';
  const message = document.createElement('p');
  message.textContent =
    '模板到资源包结束。把原设计稿和含 bbox.json、bindings.json 的素材包交给接入 Maker MCP 的 AI，继续组装 UI.json。';
  const prompt = document.createElement('textarea');
  prompt.readOnly = true;
  prompt.rows = 9;
  prompt.style.cssText = 'width:100%;box-sizing:border-box';
  prompt.setAttribute('aria-label', '交给 AI 的指令');
  prompt.value = gameUiHandoffText(
    canvasId,
    new URLSearchParams(location.search).get('project') || '请核对当前项目'
  );
  const cli = document.createElement('p');
  cli.textContent =
    '使用 CLI：准备含 bbox、assets 和 bindings 的 assembly.json，再运行 Skill 中的 assemble-ui.mjs <项目目录> <assembly.json> <新输出目录>。缺少显式素材绑定时不猜配。';
  const privacy = document.createElement('p');
  privacy.textContent = '你的模板、生成结果和导出素材仅保存在本机，不会自动上传 CDN 或 GitHub。';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = '复制 AI 指令';
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(prompt.value);
      copy.textContent = '已复制';
    } catch {
      prompt.focus();
      prompt.select();
      copy.textContent = '请手动复制选中文字';
      try {
        if (document.execCommand('copy')) copy.textContent = '已复制';
      } catch {
        // Embedded browsers may reject both clipboard APIs; retain the selected text.
      }
    }
  };
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '关闭';
  close.onclick = () => dialog.close();
  dialog.addEventListener('keydown', (event) => event.stopPropagation());
  dialog.addEventListener('keyup', (event) => event.stopPropagation());
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.append(title, message, prompt, cli, privacy, copy, close);
  document.body.append(dialog);
  dialog.showModal();
  copy.focus();
  prompt.scrollTop = 0;
}
