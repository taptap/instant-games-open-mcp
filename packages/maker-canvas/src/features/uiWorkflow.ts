import type { CanvasDocument, CanvasNode } from '../contracts.js';

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
