import test from 'node:test';
import assert from 'node:assert/strict';
import { fitPaneSizes } from '../src/shared/split-sizes.ts';

test('split widths preserve ratios, reserve minimums, and fit the available width', () => {
    assert.deepEqual(fitPaneSizes([{ weight: 60, min: 520 }, { weight: 40, min: 300 }], 1200), [720, 480]);
    const narrow = fitPaneSizes([{ weight: 22, min: 140 }, { weight: 48, min: 180 }, { weight: 30, min: 180 }], 580);
    assert.equal(narrow[0], 140); assert.equal(narrow[2], 180); assert.equal(narrow.reduce((a, b) => a + b), 580);
    assert.deepEqual(fitPaneSizes([{ weight: 1, min: 200 }, { weight: 1, min: 200 }], 300), [200, 200]);
});
