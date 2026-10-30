import test from 'node:test';
import assert from 'node:assert/strict';
import { nodeBounds, fitCamera, zoomCamera } from '../src/pages/overview/viewport.ts';
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('fit centers the actual visible node bounds and leaves room on all sides', () => {
  const bounds = nodeBounds([{ x: -100, y: 40 }, { x: 800, y: 500 }, { x: 350, y: 0 }])!;
  const camera = fitCamera(bounds, 800, 600);
  near(camera.x + (bounds.x + bounds.width / 2) * camera.scale, 400);
  near(camera.y + (bounds.y + bounds.height / 2) * camera.scale, 300);
  assert.ok(camera.x + bounds.x * camera.scale >= 32 - 1e-8);
  assert.ok(camera.y + bounds.y * camera.scale >= 32 - 1e-8);
  assert.ok(camera.x + (bounds.x + bounds.width) * camera.scale <= 768 + 1e-8);
  assert.ok(camera.y + (bounds.y + bounds.height) * camera.scale <= 568 + 1e-8);
  assert.equal(nodeBounds([]), undefined);
});

test('zoom preserves the graph point under the cursor even after selection or dragging', () => {
  const before = { x: -280, y: 140, scale: .7 }, point = { x: 350, y: 260 };
  const after = zoomCamera(before, 1.1, point);
  near((point.x - before.x) / before.scale, (point.x - after.x) / after.scale);
  near((point.y - before.y) / before.scale, (point.y - after.y) / after.scale);
  assert.equal(zoomCamera(before, 100, point).scale, 2);
});
