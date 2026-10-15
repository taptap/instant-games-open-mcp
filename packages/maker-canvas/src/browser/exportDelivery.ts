export type CanvasExportResult =
  | { status: 'saved'; path?: string }
  | { status: 'downloaded' }
  | { status: 'canceled' };

export interface CanvasExportRequest {
  filename: string;
  mime: string;
  /** Lazy content lets the host open a native picker before asynchronous encoding. */
  produce(): Promise<Blob>;
}

export type CanvasExportDelivery = (request: CanvasExportRequest) => Promise<CanvasExportResult>;
