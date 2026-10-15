import type { CanvasNode, CanvasEdge } from './document.js';

export interface CanvasWorkflowTemplate {
  id: string;
  name: string;
  revision: number;
  builtin?: boolean;
  cliOnly?: boolean;
  skills?: string[];
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface CanvasTemplateCoverAnimation {
  fps: number;
  frames: Array<{ x: number; y: number; width: number; height: number }>;
}

export interface CanvasTemplateSummary {
  id: string;
  name: string;
  revision: number;
  builtin?: boolean;
  cliOnly?: boolean;
  skills?: string[];
  nodeCount: number;
  hasCover: boolean;
  updatedAt: number;
}

export interface CanvasTemplatePage {
  presets: CanvasTemplateSummary[];
  items: CanvasTemplateSummary[];
  page: number;
  pageSize: number;
  total: number;
  skipped: number;
}
