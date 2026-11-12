export const LOCAL_PROBE_TIMEOUT_MS = process.platform === 'win32' ? 2500 : 1000;
// Initial IDE discovery and model lookup run sequentially on the first call.
export const CLIENT_MODEL_TIMEOUT_MS = LOCAL_PROBE_TIMEOUT_MS * 2 + 100;
