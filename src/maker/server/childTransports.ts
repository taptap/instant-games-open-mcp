import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

type ClosableTransport = Pick<Transport, 'close'>;

const activeMakerChildTransports = new Set<ClosableTransport>();

export function trackMakerChildTransport<T extends ClosableTransport>(transport: T): T {
  activeMakerChildTransports.add(transport);
  const originalClose = transport.close.bind(transport);
  let closePromise: Promise<void> | undefined;

  transport.close = async (): Promise<void> => {
    closePromise ??= Promise.resolve()
      .then(originalClose)
      .then(() => {
        activeMakerChildTransports.delete(transport);
      })
      .catch((error: unknown) => {
        closePromise = undefined;
        throw error;
      });
    return closePromise;
  };

  return transport;
}

export async function closeTrackedMakerChildTransports(): Promise<void> {
  const transports = [...activeMakerChildTransports];
  const results = await Promise.allSettled(transports.map((transport) => transport.close()));
  const failure = results.find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
}
