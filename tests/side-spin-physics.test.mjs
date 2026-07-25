// Tests for side-spin-physics.mjs — pure calculation functions
// Run with: node --test tests/side-spin-physics.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcSquirtAngle,
  calcInitialSideOmega,
  decaySideOmega,
  calcCushionBounce,
  reflectVelocityWithSideSpin,
  PHYS_SQUIRT_MAX_ANGLE,
  PHYS_SIDE_SPIN_MAX,
  PHYS_SIDE_SPIN_DECAY,
} from '../side-spin-physics.mjs';

const BALL_R = 28.575; // standard ball radius in mm

// ==================== Squirt Angle ====================

describe('calcSquirtAngle', () => {
  it('should return zero for center hit (no spin)', () => {
    assert.ok(Math.abs(calcSquirtAngle(0, 3000)) === 0);
  });

  it('should return positive angle for right spin (aim compensation right)', () => {
    const angle = calcSquirtAngle(1, 3000);
    assert.ok(angle > 0, `Expected positive angle, got ${angle}`);
    assert.ok(angle <= PHYS_SQUIRT_MAX_ANGLE * 1.01);
  });

  it('should return negative angle for left spin (aim compensation left)', () => {
    const angle = calcSquirtAngle(-1, 3000);
    assert.ok(angle < 0, `Expected negative angle, got ${angle}`);
    assert.ok(angle >= -PHYS_SQUIRT_MAX_ANGLE * 1.01);
  });

  it('should be symmetric: left and right equal magnitude opposite sign', () => {
    const left = calcSquirtAngle(-0.5, 3000);
    const right = calcSquirtAngle(0.5, 3000);
    assert.ok(Math.abs(left + right) < 1e-10, `Expected symmetric, got left=${left}, right=${right}`);
  });

  it('should scale linearly with spin intensity', () => {
    const half = calcSquirtAngle(0.5, 3000);
    const full = calcSquirtAngle(1.0, 3000);
    assert.ok(Math.abs(half * 2 - full) < 1e-10);
  });
});

// ==================== Initial Side Omega ====================

describe('calcInitialSideOmega', () => {
  it('should return zero for no spin', () => {
    assert.ok(Math.abs(calcInitialSideOmega(0, 3000)) === 0);
  });

  it('should return positive omega for right spin', () => {
    const omega = calcInitialSideOmega(1, 3000);
    assert.ok(omega > 0);
    assert.strictEqual(omega, PHYS_SIDE_SPIN_MAX); // reference speed
  });

  it('should return negative omega for left spin', () => {
    const omega = calcInitialSideOmega(-1, 3000);
    assert.ok(omega < 0);
    assert.strictEqual(omega, -PHYS_SIDE_SPIN_MAX);
  });

  it('should scale with shot speed', () => {
    const slow = calcInitialSideOmega(1, 1000);
    const fast = calcInitialSideOmega(1, 6000);
    assert.ok(fast > slow);
    assert.ok(Math.abs(fast - slow * 6) < 0.01);
  });

  it('should be symmetric: left/right equal magnitude at same intensity', () => {
    const left = calcInitialSideOmega(-0.8, 4000);
    const right = calcInitialSideOmega(0.8, 4000);
    assert.strictEqual(left, -right);
  });
});

// ==================== Side Omega Decay ====================

describe('decaySideOmega', () => {
  it('should reduce absolute value over time', () => {
    const after = decaySideOmega(50, 0.1);
    assert.ok(Math.abs(after) < 50);
  });

  it('should maintain sign', () => {
    assert.ok(decaySideOmega(50, 0.1) > 0);
    assert.ok(decaySideOmega(-50, 0.1) < 0);
  });

  it('should zero out near-zero values', () => {
    assert.ok(Math.abs(decaySideOmega(0.005, 0.1)) === 0);
  });

  it('should follow exponential decay formula', () => {
    const omega0 = 60;
    const dt = 1 / 60;
    const expected = omega0 * Math.exp(-PHYS_SIDE_SPIN_DECAY * dt);
    const actual = decaySideOmega(omega0, dt);
    assert.ok(Math.abs(actual - expected) < 0.001);
  });

  it('should not change zero', () => {
    assert.ok(Math.abs(decaySideOmega(0, 1)) === 0);
  });
});

// ==================== Cushion Bounce ====================

describe('calcCushionBounce', () => {
  const restitution = 0.72;
  const r = BALL_R;

  // Acceptance Test 1: Zero side spin → angle-preserving reflection
  it('acceptance: zero side-spin preserves geometric angle (both components scaled by e)', () => {
    const vn = -3000; // approaching cushion at 3 m/s
    const vt = 500;
    const result = calcCushionBounce(vn, vt, 0, r, restitution);

    // Normal: standard restitution reflection
    const expectedVn = -vn * restitution;
    assert.ok(Math.abs(result.vnOut - expectedVn) < 0.01);

    // Tangential: also scaled by restitution to preserve angle (mirror-like)
    assert.ok(Math.abs(result.vtOut - vt * restitution) < 0.01);
    assert.ok(Math.abs(result.sideOmegaOut) === 0);
  });

  // Acceptance Test 2: Mirror symmetry — left vs right spin
  it('acceptance: left and right spin produce equal-and-opposite rebound offsets', () => {
    const vn = -3000;
    const vt = 0;

    const leftSpin = 60;
    const rightSpin = -60;

    const left = calcCushionBounce(vn, vt, leftSpin, r, restitution);
    const right = calcCushionBounce(vn, vt, rightSpin, r, restitution);

    // Tangential velocity offsets should be equal magnitude, opposite sign
    const leftDeltaVt = left.vtOut - vt;
    const rightDeltaVt = right.vtOut - vt;
    assert.ok(Math.abs(leftDeltaVt + rightDeltaVt) < 1,
      `Expected symmetric vt, got left=${left.vtOut}, right=${right.vtOut}`);

    // sideOmega changes should also be symmetric
    const leftDeltaOmega = left.sideOmegaOut - leftSpin;
    const rightDeltaOmega = right.sideOmegaOut - rightSpin;
    assert.ok(Math.abs(leftDeltaOmega + rightDeltaOmega) < 1,
      `Expected symmetric omega delta, got left=${leftDeltaOmega}, right=${rightDeltaOmega}`);
  });

  // Acceptance Test 3: More spin → more effect
  it('acceptance: full spin produces larger effect than half spin', () => {
    const vn = -3000;
    const vt = 0;

    const full = calcCushionBounce(vn, vt, 60, r, restitution);
    const half = calcCushionBounce(vn, vt, 30, r, restitution);

    const fullDelta = Math.abs(full.vtOut - vt);
    const halfDelta = Math.abs(half.vtOut - vt);
    assert.ok(fullDelta > halfDelta * 0.8,
      `Full effect (${fullDelta}) should be >= 80% larger than half (${halfDelta})`);
  });

  // Acceptance Test 4: Side spin decreases after bounce
  it('acceptance: sideOmega magnitude decreases after cushion bounce', () => {
    const result = calcCushionBounce(-3000, 0, 60, r, restitution);
    assert.ok(Math.abs(result.sideOmegaOut) < 60);
  });

  it('should produce correct normal rebound with restitution', () => {
    const vn = -2000;
    const result = calcCushionBounce(vn, 0, 0, r, 0.8);
    // vnOut = -vn * e = 1600
    assert.ok(Math.abs(result.vnOut - 1600) < 0.01);
  });

  it('should handle zero normal velocity gracefully', () => {
    const result = calcCushionBounce(0, 100, 30, r, restitution);
    // No normal impulse → friction limited to zero
    assert.ok(Math.abs(result.vnOut) === 0);
    // With non-zero sideOmega but zero normal impulse, the tangential
    // friction is capped to 0, so vt should remain unchanged
    assert.strictEqual(result.vtOut, 100);
  });
});

// ==================== Velocity Reflection ====================

describe('reflectVelocityWithSideSpin', () => {
  const r = BALL_R;
  const e = 0.72;

  it('should reflect velocity correctly off top cushion with zero spin (angle-preserving)', () => {
    // Top cushion: normal pointing down into table = (0, 1)
    // Ball moving up-right: vx=1000, vy=-2000 (moving toward top cushion since vy<0)
    const result = reflectVelocityWithSideSpin(1000, -2000, 0, 0, 1, r, e);
    // vn = -2000, vnOut = 2000 * 0.72 = 1440
    // vt = 1000*(-1) + (-2000)*0 = -1000, vtOut = -1000 * 0.72 = -720
    // vx = 1440*0 + (-720)*(-1) = 720
    // vy = 1440*1 + (-720)*0 = 1440
    assert.ok(Math.abs(result.vy - 1440) < 1, `vy=${result.vy}`);
    assert.ok(Math.abs(result.vx - 720) < 1, `vx=${result.vx}`);
    assert.ok(Math.abs(result.sideOmega) === 0);
  });

  it('should reflect velocity correctly off bottom cushion (angle-preserving)', () => {
    // Bottom cushion: normal pointing up into table = (0, -1)
    // Ball moving down: vx=500, vy=2000 (moving toward bottom)
    const result = reflectVelocityWithSideSpin(500, 2000, 0, 0, -1, r, e);
    // vn = 500*0 + 2000*(-1) = -2000, vnOut = 1440
    // vt = 500*1 + 2000*0 = 500, vtOut = 500 * 0.72 = 360
    // vx = 1440*0 + 360*1 = 360
    // vy = 1440*(-1) + 360*0 = -1440
    assert.ok(Math.abs(result.vx - 360) < 1, `vx=${result.vx}`);
    assert.ok(Math.abs(result.vy - (-1440)) < 1, `vy=${result.vy}`);
  });

  it('should handle left cushion correctly', () => {
    // Left cushion: normal pointing right into table = (1, 0)
    // Ball moving left: vx=-2000, vy=300 (moving toward left)
    const result = reflectVelocityWithSideSpin(-2000, 300, 0, 1, 0, r, e);
    // vn = -2000*1 + 300*0 = -2000, vnOut = 1440
    // vt = -2000*0 + 300*1 = 300, vtOut = 300 * 0.72 = 216
    // vx = 1440*1 + 216*0 = 1440
    // vy = 1440*0 + 216*1 = 216
    assert.ok(Math.abs(result.vx - 1440) < 1, `vx=${result.vx}`);
    assert.ok(Math.abs(result.vy - 216) < 1, `vy=${result.vy}`);
  });

  it('should show side-spin effect on tangential velocity', () => {
    // Top cushion with right side spin
    const noSpin = reflectVelocityWithSideSpin(1000, -3000, 0, 0, 1, r, e);
    const withSpin = reflectVelocityWithSideSpin(1000, -3000, 60, 0, 1, r, e);

    // Both should have angle-preserving base reflection
    // Side spin should cause ADDITIONAL difference in tangential (x) velocity
    const diffX = Math.abs(withSpin.vx - noSpin.vx);
    assert.ok(diffX > 0.1, `Expected spin to affect tangential velocity, diffX=${diffX}`);
  });
});
