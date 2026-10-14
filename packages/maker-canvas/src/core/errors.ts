export class CanvasStoreError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = 'CanvasStoreError';
  }
}
