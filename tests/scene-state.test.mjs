import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { saveScene, loadScene, sanitizeScene } from '../scene-state.mjs';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

const SCENE = {
  balls: [
    { x: 600, y: 500, type: 'cue' },
    { x: 1800, y: 700, type: 'target' },
    { x: 1200, y: 300, type: 'obstacle' },
  ],
  pocketTarget: { x: 2540, y: 1270 },
  cushionCount: 2,
  cueSpeed: 3.5,
  cueHeight: 'low',
  cueSpin: 'right',
};

describe('scene persistence', () => {
  it('saves and restores the complete playable scene', () => {
    const storage = memoryStorage();
    assert.equal(saveScene(storage, SCENE), true);
    assert.deepEqual(loadScene(storage), SCENE);
  });

  it('ignores corrupt or out-of-range saved data', () => {
    const storage = memoryStorage();
    storage.setItem('billiard-tool.scene.v1', '{broken');
    assert.equal(loadScene(storage), null);
    storage.setItem('billiard-tool.scene.v1', JSON.stringify({ version: 1, scene: { ...SCENE, cushionCount: 99 } }));
    assert.equal(loadScene(storage), null);
  });

  it('copies only supported fields rather than retaining arbitrary stored data', () => {
    const clean = sanitizeScene({ ...SCENE, injected: '<script>', balls: SCENE.balls.map(b => ({ ...b, extra: true })) });
    assert.equal('injected' in clean, false);
    assert.equal('extra' in clean.balls[0], false);
  });
});
