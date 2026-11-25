import type { CanvasNode, CanvasEdge } from './document.js';
import type { CanvasPlatformScope } from './platform.js';

export interface CanvasWorkflowTemplate extends CanvasPlatformScope {
  id: string;
  name: string;
  revision: number;
  builtin?: boolean;
  cliOnly?: boolean;
  skills?: string[];
  /** One-line "input → output" purpose shown on the library card and matched by search. */
  description?: string;
  /** Library filter; templates without one remain visible under 全部 and 我的模板. */
  category?: string;
  /** Card whose saved result represents the template; falls back to the default cover choice. */
  coverNodeId?: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface CanvasTemplateCoverAnimation {
  fps: number;
  frames: Array<{ x: number; y: number; width: number; height: number }>;
}

export interface CanvasTemplateSummary extends CanvasPlatformScope {
  id: string;
  name: string;
  description?: string;
  category?: string;
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
