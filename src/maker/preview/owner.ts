export class PreviewOwner {
  private readonly sessions = new Set<() => Promise<void>>();
  private closing = false;

  get active(): boolean {
    return this.sessions.size > 0;
  }

  register = (stop: () => Promise<void>): (() => void) => {
    if (this.closing) throw new Error('Preview owner is closing.');
    this.sessions.add(stop);
    return () => this.sessions.delete(stop);
  };

  async close(): Promise<void> {
    this.closing = true;
    await Promise.all([...this.sessions].map((stop) => stop()));
    if (this.active) throw new Error('Owned preview cleanup is not yet confirmed.');
  }
}
