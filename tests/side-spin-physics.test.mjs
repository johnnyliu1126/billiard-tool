// Tests for side-spin-physics.mjs — pure calculation functions
// Run with: node --test tests/side-spin-physics.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcSquirtAngle,
  calcInitialSideOmega,
  calcCushionRestitution,
  decaySideOmega,
  calcCushionBounce,
  reflectVelocityWithSideSpin,
  PHYS_SQUIRT_MAX_ANGLE,
  PHYS_SIDE_SPIN_MAX,
  PHYS_SIDE_SPIN_DECAY,
  PHYS_CUSHION_TANGENTIAL_FRICTION,
  PHYS_CUSHION_SIDE_SPIN_RETENTION,
} from '../side-spin-physics.mjs';

describe('calcCushionRestitution — Chinese eight-ball baseline', () => {
  it('uses the public effective rail baseline for normal-speed shots', () => {
    assert.equal(calcCushionRestitution(0), 0.83);
    assert.equal(calcCushionRestitution(2500), 0.83);
  });

  it('softens the rail progressively above the rigid-model range', () => {
    const medium = calcCushionRestitution(5250);
    assert.ok(Math.abs(medium - 0.795) < 1e-12);
    assert.equal(calcCushionRestitution(8000), 0.76);
    assert.equal(calcCushionRestitution(12000), 0.76);
  });
});

const BALL_R = 28.575; // standard ball radius in mm

// ==================== Squirt Angle ====================

describe('calcSquirtAngle', () => {
  it('should return zero for center hit (no spin)', () => {
    assert.ok(Math.abs(calcSquirtAngle(0, 3000)) === 0);
  });

  it('should deflect left of the fixed cue direction for right spin', () => {
    const angle = calcSquirtAngle(1, 3000);
    assert.ok(angle < 0, `Expected negative screen-coordinate angle, got ${angle}`);
    assert.ok(Math.abs(angle) <= PHYS_SQUIRT_MAX_ANGLE * 1.01);
  });

  it('should deflect right of the fixed cue direction for left spin', () => {
    const angle = calcSquirtAngle(-1, 3000);
    assert.ok(angle > 0, `Expected positive screen-coordinate angle, got ${angle}`);
    assert.ok(Math.abs(angle) <= PHYS_SQUIRT_MAX_ANGLE * 1.01);
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

  it('should return counterclockwise screen rotation for right spin', () => {
    const omega = calcInitialSideOmega(1, 3000);
    assert.ok(omega < 0);
    assert.strictEqual(omega, -PHYS_SIDE_SPIN_MAX); // reference speed
  });

  it('should return clockwise screen rotation for left spin', () => {
    const omega = calcInitialSideOmega(-1, 3000);
    assert.ok(omega > 0);
    assert.strictEqual(omega, PHYS_SIDE_SPIN_MAX);
  });

  it('should scale with shot speed', () => {
    const slow = calcInitialSideOmega(1, 1000);
    const fast = calcInitialSideOmega(1, 6000);
    assert.ok(Math.abs(fast) > Math.abs(slow));
    assert.ok(Math.abs(fast - slow * 6) < 0.01);
  });

  it('caps extreme-speed side spin at the public Chinese-eight baseline', () => {
    assert.equal(Math.abs(calcInitialSideOmega(1, 10000)), 150);
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
    assert.ok(Math.abs(fullDelta - halfDelta * 2) < 1e-8,
      `Unsaturated full effect (${fullDelta}) should be twice half (${halfDelta})`);
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
    assert.strictEqual(result.sideOmegaOut, 30);
  });

  it('should leave a ball already moving away from the cushion unchanged', () => {
    for (const omega of [0, 30]) {
      assert.deepEqual(calcCushionBounce(1000, 200, omega, r, restitution), {
        vnOut: 1000, vtOut: 200, sideOmegaOut: omega,
      });
    }
  });

  it('should stop contact slip without overshooting before empirical spin damping', () => {
    const result = calcCushionBounce(-3000, 900, 30, r, restitution);
    const omegaAfterImpulse = result.sideOmegaOut / PHYS_CUSHION_SIDE_SPIN_RETENTION;
    const slipAfterImpulse = result.vtOut - omegaAfterImpulse * r;
    assert.ok(Math.abs(slipAfterImpulse) < 1e-8,
      `Friction should stop the initial 42.75 mm/s slip, got ${slipAfterImpulse}`);
  });

  it('should respect the Coulomb impulse limit for a grazing contact', () => {
    const vn = -100;
    const vt = 2000;
    const result = calcCushionBounce(vn, vt, 30, r, restitution);
    const maximumImpulse = PHYS_CUSHION_TANGENTIAL_FRICTION * (1 + restitution) * -vn;
    assert.ok(Math.abs(vt - result.vtOut - maximumImpulse) < 1e-8);
  });

  it('should never create kinetic energy at a passive cushion', () => {
    // Solid sphere: E/m = (vn² + vt²)/2 + r²*omega²/5.
    const energy = (vn, vt, omega) => (vn * vn + vt * vt) / 2 + (r * omega) ** 2 / 5;
    const cases = [[-1000, 500, 30, restitution]];
    for (const e of [0.4, restitution, 1]) {
      for (const vn of [-50, -1000, -3000]) {
        for (const vt of [-3000, -500, 0, 500, 3000]) {
          for (const omega of [-60, -1, 0, 1, 60]) cases.push([vn, vt, omega, e]);
        }
      }
    }
    for (const [vn, vt, omega, e] of cases) {
      const result = calcCushionBounce(vn, vt, omega, r, e);
      const before = energy(vn, vt, omega);
      const after = energy(result.vnOut, result.vtOut, result.sideOmegaOut);
      assert.ok(after <= before + 1e-8 * Math.max(1, before),
        `Energy increased for [${vn}, ${vt}, ${omega}, ${e}]: ${before} -> ${after}`);
    }
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

    // The side-spin impulse should affect the tangential (x) velocity.
    const diffX = Math.abs(withSpin.vx - noSpin.vx);
    assert.ok(diffX > 0.1, `Expected spin to affect tangential velocity, diffX=${diffX}`);
  });

  it('should send right english toward the shooter’s right after a head-on hit on every rail', () => {
    for (const [nx, ny] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const vx = -nx * 3000;
      const vy = -ny * 3000;
      const omega = calcInitialSideOmega(1, 3000);
      const result = reflectVelocityWithSideSpin(vx, vy, omega, nx, ny, r, e);
      // Screen-coordinate right of incoming d=(-nx,-ny) is (ny,-nx).
      const rightwardSpeed = result.vx * ny - result.vy * nx;
      assert.ok(rightwardSpeed > 0,
        `Right english went left at normal [${nx}, ${ny}]: ${rightwardSpeed}`);
    }
  });
});
