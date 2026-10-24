import { TimeoutError } from "../errors.js";

/** Call the browser's native fetch with the correct global receiver. */
export const globalFetch = (...args) => globalThis.fetch(...args);

/** Fetch with a hard deadline, including when an injected/test fetch ignores AbortSignal. */
export async function fetchWithTimeout(fetchImpl, url, options = {}, timeoutMs = 8_000, label = "Network request") {
  const controller = new AbortController();
  let timer;
  let timedOut = false;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new TimeoutError(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds.`));
    }, timeoutMs);
  });
  try {
    const request = Promise.resolve().then(() => fetchImpl(url, { ...options, signal: controller.signal }));
    return await Promise.race([request, timeout]);
  } catch (error) {
    if (timedOut) throw error;
    if (error?.name === "AbortError") throw new TimeoutError(`${label} was aborted before a response arrived.`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Bound response-body parsing too; some endpoints can return headers and then stall. */
export async function promiseWithTimeout(promise, timeoutMs = 8_000, label = "Response body") {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new TimeoutError(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds.`)), timeoutMs); })
    ]);
  } finally { clearTimeout(timer); }
}
