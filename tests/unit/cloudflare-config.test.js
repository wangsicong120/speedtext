import test from 'node:test';
import assert from 'node:assert/strict';
import configuration from '../../cloudflare.config.ts';

test('Cloudflare development explicitly suppresses simulated edge client metadata', () => {
  const { worker } = configuration({ mode: 'development', isPreview: false });
  assert.equal(worker.env.ASSETS.type, 'assets');
  assert.equal(worker.env.LOCAL_DEV.type, 'json');
  assert.equal(worker.env.LOCAL_DEV.value, true);
});

test('production, previews and non-development modes never ship the local metadata flag', () => {
  for (const context of [
    { mode: 'production', isPreview: false },
    { mode: 'production', isPreview: true },
    { mode: 'development', isPreview: true },
    { mode: 'staging', isPreview: false },
    { mode: undefined, isPreview: false }
  ]) {
    const { worker } = configuration(context);
    assert.equal(worker.name, 'speedtext');
    assert.equal(worker.env.ASSETS.type, 'assets');
    assert.equal(Object.hasOwn(worker.env, 'LOCAL_DEV'), false);
    assert.equal(worker.assets.runWorkerFirst, true);
  }
});
