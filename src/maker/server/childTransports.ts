import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

type ClosableTransport = Pick<Transport, 'close'>;

const activeMakerChildTransports = new Set<ClosableTransport>();

export function trackMakerChildTransport<T extends ClosableTransport>(transport: T): T {
  activeMakerChildTransports.add(transport);
  const originalClose = transport.close.bind(transport);
  let closed = false;

  transport.close = async (): Promise<void> => {
    if (closed) {
      return;
    }
    closed = true;
    activeMakerChildTransports.delete(transport);
    await originalClose();
  };

  return transport;
}

export async function closeTrackedMakerChildTransports(): Promise<void> {
  const transports = [...activeMakerChildTransports];
  activeMakerChildTransports.clear();
  await Promise.all(transports.map((transport) => transport.close().catch(() => {})));
}
