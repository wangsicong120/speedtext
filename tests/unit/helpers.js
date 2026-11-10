import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';

export async function until(condition, timeout = 1000) {
  const deadline = Date.now() + timeout;
  while (!condition() && Date.now() < deadline) await wait(2);
  assert(condition(), 'Condition did not become true');
}

export function pendingFetch(_url, { signal }) {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(new DOMException('Aborted', 'AbortError'));
    else signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
}

export function streamResponse(signal) {
  let controller, cancelled = false;
  const abort = () => { try { controller.error(new DOMException('Aborted', 'AbortError')); } catch {} };
  const stream = new ReadableStream({
    start(value) { controller = value; signal?.addEventListener('abort', abort, { once: true }); },
    cancel() { cancelled = true; signal?.removeEventListener('abort', abort); }
  });
  return { response: new Response(stream), push: bytes => controller.enqueue(new Uint8Array(bytes)),
    end: () => controller.close(), get cancelled() { return cancelled; } };
}
