import test from 'node:test';
import assert from 'node:assert/strict';
import { GAUGE_SCALE, gaugeProgress } from '../../frontend/js/chart.js';

test('the bandwidth dial retains the reference 0–5 Gbps marks', () => {
  assert.deepEqual(GAUGE_SCALE, [0, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]);
  for (const [index, value] of GAUGE_SCALE.entries()) {
    assert.equal(gaugeProgress(value), index / 10);
  }
});

test('the arc interpolates between the displayed marks instead of using a linear maximum', () => {
  assert.equal(gaugeProgress(2.5), .05);
  assert.equal(gaugeProgress(75), .45);
  assert.equal(gaugeProgress(350), .65);
  assert.equal(gaugeProgress(3500), .95);
});

test('invalid and above-scale rates cannot produce invalid or overflowing arcs', () => {
  for (const value of [-1, NaN, Infinity, null, undefined, '100']) assert.equal(gaugeProgress(value), 0);
  for (const value of [5001, 100000, Number.MAX_VALUE]) assert.equal(gaugeProgress(value), 1);
});
