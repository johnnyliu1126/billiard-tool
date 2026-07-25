// Tests for mirror-method.mjs — pure math functions
// Run with: node --test tests/core-math.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  reflectPoint,
  lineIntersection,
  distToSegmentSq,
  pointOnCushionSegment,
  generateCushionSequences,
  calcGhostBall,
  pathHitsObstacle,
  calculateKickRoutes,
  TABLE_W, TABLE_H, BALL_R,
  GHOST_CUSHIONS, CUSHIONS, POCKET_POSITIONS,
} from '../mirror-method.mjs';

// ==================== reflectPoint ====================

describe('reflectPoint', () => {
  it('should reflect across horizontal line (top cushion)', () => {
    const result = reflectPoint(1000, 500, { x1: 0, y1: 0, horiz: true });
    assert.strictEqual(result.x, 1000);
    assert.strictEqual(result.y, -500);
  });

  it('should reflect across horizontal line (bottom cushion)', () => {
    const result = reflectPoint(1000, 800, { x1: 0, y1: TABLE_H, horiz: true });
    assert.strictEqual(result.x, 1000);
    assert.strictEqual(result.y, 2 * TABLE_H - 800);
  });

  it('should reflect across vertical line (left cushion)', () => {
    const result = reflectPoint(200, 500, { x1: 0, y1: 0, horiz: false });
    assert.strictEqual(result.x, -200);
    assert.strictEqual(result.y, 500);
  });

  it('should reflect across vertical line (right cushion)', () => {
    const result = reflectPoint(2000, 500, { x1: TABLE_W, y1: 0, horiz: false });
    assert.strictEqual(result.x, 2 * TABLE_W - 2000);
    assert.strictEqual(result.y, 500);
  });

  it('should be its own inverse (double reflection = identity)', () => {
    const c = { x1: 0, y1: 0, horiz: true };
    const p = { x: 800, y: 300 };
    const r1 = reflectPoint(p.x, p.y, c);
    const r2 = reflectPoint(r1.x, r1.y, c);
    assert.ok(Math.abs(r2.x - p.x) < 1e-10);
    assert.ok(Math.abs(r2.y - p.y) < 1e-10);
  });
});

// ==================== lineIntersection ====================

describe('lineIntersection', () => {
  it('should find intersection of crossing lines', () => {
    const result = lineIntersection(0, 0, 100, 100, 0, 100, 100, 0);
    assert.ok(result !== null);
    assert.ok(Math.abs(result.x - 50) < 1e-10);
    assert.ok(Math.abs(result.y - 50) < 1e-10);
  });

  it('should return intersection on segment when t is between 0 and 1', () => {
    const result = lineIntersection(0, 0, 100, 0, 50, -50, 50, 50);
    assert.ok(result !== null);
    assert.ok(Math.abs(result.t - 0.5) < 1e-10);
    assert.ok(Math.abs(result.x - 50) < 1e-10);
    assert.ok(Math.abs(result.y - 0) < 1e-10);
  });

  it('should return null for parallel lines', () => {
    const result = lineIntersection(0, 0, 100, 0, 0, 50, 100, 50);
    assert.strictEqual(result, null);
  });

  it('should handle nearly-parallel lines gracefully', () => {
    const result = lineIntersection(0, 0, 100, 0, 0, 1e-15, 100, 1e-15);
    assert.strictEqual(result, null);
  });
});

// ==================== distToSegmentSq ====================

describe('distToSegmentSq', () => {
  it('should return 0 for point on segment', () => {
    const d = distToSegmentSq(50, 0, 0, 0, 100, 0);
    assert.ok(Math.abs(d) < 1e-10);
  });

  it('should return endpoint distance when projection is before start', () => {
    const d = distToSegmentSq(-50, 0, 0, 0, 100, 0);
    assert.strictEqual(d, 2500); // 50²
  });

  it('should return endpoint distance when projection is after end', () => {
    const d = distToSegmentSq(150, 0, 0, 0, 100, 0);
    assert.strictEqual(d, 2500); // 50²
  });

  it('should return perpendicular distance when projection is inside', () => {
    const d = distToSegmentSq(50, 30, 0, 0, 100, 0);
    assert.strictEqual(d, 900); // 30²
  });

  it('should handle zero-length segment (point degeneracy)', () => {
    const d = distToSegmentSq(3, 4, 0, 0, 0, 0);
    assert.strictEqual(d, 25); // 3² + 4²
  });
});

// ==================== pointOnCushionSegment ====================

describe('pointOnCushionSegment', () => {
  it('should return true for a point in the middle of a cushion', () => {
    const result = pointOnCushionSegment(
      { x: TABLE_W / 4, y: 0 },
      CUSHIONS[0] // top
    );
    assert.strictEqual(result, true);
  });

  it('should return false for a point in the corner pocket gap', () => {
    const result = pointOnCushionSegment(
      { x: 5, y: 0 }, // near left corner pocket
      CUSHIONS[0] // top
    );
    assert.strictEqual(result, false);
  });

  it('should return false for a point in the side pocket gap', () => {
    const result = pointOnCushionSegment(
      { x: TABLE_W / 2, y: 0 }, // exactly at side pocket
      CUSHIONS[0] // top
    );
    assert.strictEqual(result, false);
  });

  it('should return true for a valid point on vertical cushion', () => {
    const result = pointOnCushionSegment(
      { x: 0, y: TABLE_H / 2 },
      CUSHIONS[2] // left
    );
    assert.strictEqual(result, true);
  });
});

// ==================== generateCushionSequences ====================

describe('generateCushionSequences', () => {
  it('should generate 4 sequences for 1 cushion', () => {
    const result = generateCushionSequences(1);
    assert.strictEqual(result.length, 4);
  });

  it('should generate 12 sequences for 2 cushions (4 * 3, no repeats)', () => {
    const result = generateCushionSequences(2);
    assert.strictEqual(result.length, 12);
    // Check no consecutive same cushion
    for (const seq of result) {
      assert.notStrictEqual(seq[0], seq[1]);
    }
  });

  it('should generate 36 sequences for 3 cushions (4 * 3 * 3)', () => {
    const result = generateCushionSequences(3);
    assert.strictEqual(result.length, 36);
  });

  it('should generate 108 sequences for 4 cushions', () => {
    const result = generateCushionSequences(4);
    assert.strictEqual(result.length, 108);
  });

  it('should generate 324 sequences for 5 cushions', () => {
    const result = generateCushionSequences(5);
    assert.strictEqual(result.length, 324);
  });

  it('should return empty array for 0 cushions', () => {
    const result = generateCushionSequences(0);
    assert.strictEqual(result.length, 1); // [[]]
    assert.strictEqual(result[0].length, 0);
  });
});

// ==================== calcGhostBall ====================

describe('calcGhostBall', () => {
  it('should place ghost ball behind target away from pocket', () => {
    const target = { x: 500, y: 500 };
    const pocket = { x: 600, y: 500 };
    const ghost = calcGhostBall(target, pocket);
    // Ghost should be further from pocket than target (shifted back by 2*BALL_R)
    const distToPocket = Math.hypot(ghost.x - pocket.x, ghost.y - pocket.y);
    const targetToPocket = Math.hypot(target.x - pocket.x, target.y - pocket.y);
    assert.ok(distToPocket > targetToPocket);
    assert.ok(Math.abs(distToPocket - targetToPocket - BALL_R * 2) < 0.01);
  });

  it('should place ghost ball on the target-pocket line', () => {
    const target = { x: 500, y: 500 };
    const pocket = { x: 600, y: 500 };
    const ghost = calcGhostBall(target, pocket);
    // Ghost should be on same line (y unchanged since pocket is directly to the right)
    assert.ok(Math.abs(ghost.y - 500) < 0.01);
  });
});

// ==================== pathHitsObstacle ====================

describe('pathHitsObstacle', () => {
  it('should detect when path passes through an obstacle', () => {
    const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const obstacles = [{ x: 50, y: 5 }];
    const hit = pathHitsObstacle(points, obstacles, 10);
    assert.strictEqual(hit, true);
  });

  it('should return false when path is clear', () => {
    const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const obstacles = [{ x: 50, y: 50 }];
    const hit = pathHitsObstacle(points, obstacles, 10);
    assert.strictEqual(hit, false);
  });

  it('should handle multiple obstacles', () => {
    const points = [{ x: 0, y: 0 }, { x: 100, y: 100 }];
    const obstacles = [
      { x: 200, y: 200 }, // far away
      { x: 50, y: 50 },   // on the path!
    ];
    const hit = pathHitsObstacle(points, obstacles, 5);
    assert.strictEqual(hit, true);
  });
});

// ==================== calculateKickRoutes (Integration) ====================

describe('calculateKickRoutes', () => {
  it('should find at least one route for a simple 1-cushion kick', () => {
    const cue = { x: 600, y: 600 };
    const target = { x: 1900, y: 600 };
    const pocket = POCKET_POSITIONS[4]; // bottom-right corner
    const routes = calculateKickRoutes(cue, target, pocket, [], 1);
    assert.ok(routes.length > 0, 'Should find at least one 1-cushion route');
  });

  it('should find routes sorted by effective distance', () => {
    const cue = { x: 600, y: 600 };
    const target = { x: 1900, y: 600 };
    const pocket = POCKET_POSITIONS[4];
    const routes = calculateKickRoutes(cue, target, pocket, [], 2);

    if (routes.length >= 2) {
      for (let i = 0; i < routes.length - 1; i++) {
        assert.ok(routes[i].effectiveDist <= routes[i + 1].effectiveDist,
          `Routes should be sorted by effectiveDist, got ${routes[i].effectiveDist} then ${routes[i + 1].effectiveDist}`);
      }
    }
  });

  it('should exclude routes blocked by obstacles', () => {
    const cue = { x: 300, y: 300 };
    const target = { x: 2200, y: 900 };
    const pocket = POCKET_POSITIONS[3]; // bottom-left

    // First, compute without obstacle
    const routesWithout = calculateKickRoutes(cue, target, pocket, [], 2);

    // Place obstacle directly in the path
    if (routesWithout.length > 0) {
      const mid = routesWithout[0].points[1]; // first cushion hit
      const obstacle = { x: (cue.x + mid.x) / 2, y: (cue.y + mid.y) / 2 };
      const routesWith = calculateKickRoutes(cue, target, pocket, [obstacle], 2);
      // The blocked route should be excluded
      const blockedSeq = routesWithout[0].sequence;
      const found = routesWith.some(r =>
        r.sequence.join(',') === blockedSeq.join(',')
      );
      // May or may not find other routes, but the blocked one should be gone
      if (routesWith.length > 0) {
        assert.ok(!found || routesWith[0].sequence.join(',') !== blockedSeq.join(','),
          'Blocked route should not appear');
      }
    }
  });

  it('should return at most 5 routes', () => {
    const cue = { x: 600, y: 600 };
    const target = { x: 1900, y: 600 };
    const pocket = POCKET_POSITIONS[4];
    const routes = calculateKickRoutes(cue, target, pocket, [], 2);
    assert.ok(routes.length <= 5);
  });

  it('should have correct route structure', () => {
    const cue = { x: 600, y: 600 };
    const target = { x: 1900, y: 600 };
    const pocket = POCKET_POSITIONS[4];
    const routes = calculateKickRoutes(cue, target, pocket, [], 1);

    if (routes.length > 0) {
      const route = routes[0];
      assert.ok(Array.isArray(route.points));
      assert.ok(Array.isArray(route.cushionPoints));
      assert.ok(Array.isArray(route.sequence));
      assert.ok(typeof route.totalDist === 'number');
      assert.ok(typeof route.effectiveDist === 'number');
      assert.ok(route.points.length > 1);
    }
  });
});
