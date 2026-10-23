/** Serialized into the page for Chrome 74, so it stays self-contained and never replaces natives. */
export function installCanvasPolyfills(): void {
  const scope = globalThis as any;
  function define(target: any, name: string, value: unknown) {
    if (target && !(name in target))
      Object.defineProperty(target, name, { value, writable: true, configurable: true });
  }
  if (typeof scope.structuredClone !== 'function') {
    // Covers the page's data (documents, attempts, typed arrays); Blob/File are immutable and shared.
    define(scope, 'structuredClone', function structuredClone(value: unknown): unknown {
      const seen = new Map<unknown, unknown>();
      function copy(item: any): any {
        if (item === null || typeof item !== 'object') {
          if (typeof item === 'function' || typeof item === 'symbol')
            throw new DOMException('Value could not be cloned.', 'DataCloneError');
          return item;
        }
        if (seen.has(item)) return seen.get(item);
        if (typeof Blob !== 'undefined' && item instanceof Blob) return item;
        if (item instanceof Date) return new Date(item.getTime());
        if (item instanceof RegExp) return new RegExp(item.source, item.flags);
        if (item instanceof ArrayBuffer) return item.slice(0);
        if (ArrayBuffer.isView(item)) {
          const view = item as any;
          return new view.constructor(view.buffer.slice(0), view.byteOffset, view.length);
        }
        if (item instanceof Map) {
          const result = new Map();
          seen.set(item, result);
          item.forEach((entry, key) => result.set(copy(key), copy(entry)));
          return result;
        }
        if (item instanceof Set) {
          const result = new Set();
          seen.set(item, result);
          item.forEach((entry) => result.add(copy(entry)));
          return result;
        }
        const result: any = Array.isArray(item) ? [] : {};
        seen.set(item, result);
        for (const key of Object.keys(item)) result[key] = copy(item[key]);
        return result;
      }
      return copy(value);
    });
  }
  const crypto = scope.crypto;
  if (crypto && typeof crypto.randomUUID !== 'function' && crypto.getRandomValues)
    define(crypto, 'randomUUID', function randomUUID(): string {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (byte: number) => (byte + 0x100).toString(16).slice(1));
      return (
        hex.slice(0, 4).join('') +
        '-' +
        hex.slice(4, 6).join('') +
        '-' +
        hex.slice(6, 8).join('') +
        '-' +
        hex.slice(8, 10).join('') +
        '-' +
        hex.slice(10).join('')
      );
    });
  define(Object, 'hasOwn', function hasOwn(target: object, key: PropertyKey): boolean {
    return Object.prototype.hasOwnProperty.call(target, key);
  });
  function at(this: any, index: number) {
    const length = this.length >>> 0;
    const position = Math.trunc(index) || 0;
    const resolved = position < 0 ? length + position : position;
    return resolved < 0 || resolved >= length ? undefined : this[resolved];
  }
  define(Array.prototype, 'at', at);
  define(String.prototype, 'at', function (this: string, index: number) {
    return at.call(String(this), index);
  });
  define(
    String.prototype,
    'replaceAll',
    function replaceAll(this: string, search: string | RegExp, replacement: any): string {
      if (search instanceof RegExp && !search.global)
        throw new TypeError('replaceAll requires a global RegExp.');
      const pattern =
        search instanceof RegExp
          ? search
          : new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      return String(this).replace(pattern, replacement);
    }
  );
  define(Array.prototype, 'findLast', function findLast(this: any[], test: any, self?: unknown) {
    for (let index = this.length - 1; index >= 0; index--)
      if (test.call(self, this[index], index, this)) return this[index];
    return undefined;
  });
  define(
    Array.prototype,
    'findLastIndex',
    function findLastIndex(this: any[], test: any, self?: unknown) {
      for (let index = this.length - 1; index >= 0; index--)
        if (test.call(self, this[index], index, this)) return index;
      return -1;
    }
  );
  define(Promise, 'allSettled', function allSettled(values: Iterable<unknown>) {
    return Promise.all(
      Array.from(values, (value) =>
        Promise.resolve(value).then(
          (result) => ({ status: 'fulfilled', value: result }),
          (reason) => ({ status: 'rejected', reason })
        )
      )
    );
  });
  if (typeof Element !== 'undefined')
    define(
      Element.prototype,
      'replaceChildren',
      function replaceChildren(this: Element, ...nodes: Array<Node | string>) {
        while (this.lastChild) this.removeChild(this.lastChild);
        this.append(...nodes);
      }
    );
  if (typeof Blob !== 'undefined') {
    const read = (blob: Blob, kind: 'buffer' | 'text') =>
      new Promise<any>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        if (kind === 'buffer') reader.readAsArrayBuffer(blob);
        else reader.readAsText(blob);
      });
    define(Blob.prototype, 'arrayBuffer', function arrayBuffer(this: Blob) {
      return read(this, 'buffer');
    });
    define(Blob.prototype, 'text', function text(this: Blob) {
      return read(this, 'text');
    });
  }
  if (typeof AbortSignal !== 'undefined' && typeof AbortController !== 'undefined')
    define(AbortSignal, 'timeout', function timeout(milliseconds: number) {
      const controller = new AbortController();
      setTimeout(
        () => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')),
        milliseconds
      );
      return controller.signal;
    });
}
