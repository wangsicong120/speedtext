import test from 'node:test';
import assert from 'node:assert/strict';
import { silentWav, KeepAlive } from '../../frontend/js/keepalive.js';
import { until } from './helpers.js';

test('silent audio is a small valid WAV generated locally', async () => {
  const blob = silentWav(), buffer = await blob.arrayBuffer(), view = new DataView(buffer);
  assert.equal(blob.type, 'audio/wav'); assert.equal(buffer.byteLength, 8044);
  assert.equal(new TextDecoder().decode(new Uint8Array(buffer, 0, 4)), 'RIFF');
  assert.equal(view.getUint32(24, true), 8000);
  assert(new Uint8Array(buffer, 44).every(value => value === 128));
});
test('a late wake-lock grant after stop is released instead of leaking', async t => {
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const doc = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let grant, releases = 0;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { wakeLock: { request: () => new Promise(resolve => { grant = resolve; }) } } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} } });
  t.after(() => {
    if (nav) Object.defineProperty(globalThis, 'navigator', nav); else delete globalThis.navigator;
    if (doc) Object.defineProperty(globalThis, 'document', doc); else delete globalThis.document;
  });
  const audio = { play: async () => {}, pause() {}, currentTime: 0 };
  const keep = new KeepAlive(audio); keep.start(); keep.stop();
  grant({ release: async () => { releases++; }, addEventListener() {} });
  await until(() => releases === 1); assert.equal(keep.lock, null); keep.dispose();
});
