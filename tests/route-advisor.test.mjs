import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assessRouteQuality, rankRouteAdvice } from '../route-advisor.mjs';

function route(overrides = {}) {
  return {
    points: [{ x: 300, y: 400 }, { x: 900, y: 29 }, { x: 1700, y: 650 }, { x: 2000, y: 700 }, { x: 2540, y: 1270 }],
    cushionPoints: [{ x: 900, y: 29 }],
    sequence: ['top'],
    totalDist: 2800,
    effectiveDist: 3300,
    angleDiff: 0.15,
    ...overrides,
  };
}

const SCENE = {
  cue: { x: 300, y: 400 },
  target: { x: 2000, y: 700 },
  pocket: { x: 2540, y: 1270, r: 44 },
  obstacles: [{ x: 1200, y: 380 }],
  cushionCount: 1,
};

describe('route quality advice', () => {
  it('reports distance, cut angle, obstacle clearance, scratch risk and perturbation tolerance separately', () => {
    const result = assessRouteQuality(route(), SCENE, { toleranceEvaluator: () => ({ kept: 7, total: 9 }) });
    assert.ok(Number.isFinite(result.score));
    assert.ok(result.metrics.cutAngleDeg > 0);
    assert.ok(Number.isFinite(result.metrics.clearanceMm));
    assert.equal(result.metrics.tolerance.kept, 7);
    assert.match(result.explanation, /容错|障碍|切球|行程/);
  });

  it('prefers a slightly longer route with safer clearance and better perturbation tolerance', () => {
    const shortRisky = route({ id: 'short', totalDist: 2500, effectiveDist: 2900,
      points: [{ x: 300, y: 400 }, { x: 900, y: 29 }, { x: 1200, y: 390 }, { x: 2000, y: 700 }, { x: 2540, y: 1270 }] });
    const longerSafe = route({ id: 'safe', totalDist: 2850, effectiveDist: 3300,
      points: [{ x: 300, y: 400 }, { x: 500, y: 29 }, { x: 900, y: 900 }, { x: 2000, y: 700 }, { x: 2540, y: 1270 }] });
    const ranked = rankRouteAdvice([shortRisky, longerSafe], SCENE, {
      toleranceEvaluator: candidate => candidate.id === 'safe' ? { kept: 9, total: 9 } : { kept: 3, total: 9 },
    });
    assert.equal(ranked[0].id, 'safe');
    assert.match(ranked[0].explanation, /容错/);
  });

  it('labels perturbation results as geometry tolerance samples rather than a potting probability', () => {
    const result = assessRouteQuality(route(), SCENE, { toleranceEvaluator: () => ({ kept: 8, total: 9 }) });
    assert.match(result.explanation, /扰动样本/);
    assert.doesNotMatch(result.explanation, /进球率|成功率/);
  });
});
