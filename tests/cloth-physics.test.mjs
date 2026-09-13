import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyClothFriction } from '../cloth-physics.mjs';

const R = 28.575;
const G = 9810;
const SLIDE_DECEL = 0.2 * G;
const ROLL_DECEL = 0.01 * G;
const ball = (state = {}) => ({ vx: 0, vy: 0, wx: 0, wy: 0, r: R, ...state });
const slip = b => Math.hypot(b.vx - b.r * b.wy, b.vy + b.r * b.wx);
// K / mass for a homogeneous solid sphere: I / mass = (2/5) r².
const energy = b => 0.5 * (b.vx ** 2 + b.vy ** 2)
  + b.r ** 2 / 5 * (b.wx ** 2 + b.wy ** 2);

function close(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `Expected ${expected}, received ${actual}, tolerance ${tolerance}`);
}

function rotated(b, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return ball({
    ...b,
    vx: c * b.vx - s * b.vy, vy: s * b.vx + c * b.vy,
    wx: c * b.wx - s * b.wy, wy: s * b.wx + c * b.wy,
  });
}

describe('applyClothFriction', () => {
  it('converts a center strike into natural roll at 5/7 of its launch speed', () => {
    const b = ball({ vx: 700 });
    applyClothFriction(b, 200 / SLIDE_DECEL);
    close(b.vx, 500);
    close(b.wy, 500 / R);
    close(b.vy, 0);
    close(b.wx, 0);
    close(slip(b), 0);
    close(energy(b), 175000); // Initial K/m = 245000; heat/m = 70000.
  });

  it('starts draw backwards from zero translational speed after a full-ball collision', () => {
    const b = ball({ wy: -100 });
    applyClothFriction(b, 0.01);
    close(b.vx, -SLIDE_DECEL * 0.01);
    assert.ok(b.wy > -100 && b.wy < 0, 'Friction must consume backspin');
    close(b.vy, 0);
    close(b.wx, 0);
  });

  it('starts follow forwards from retained topspin after a full-ball collision', () => {
    const b = ball({ wy: 100 });
    applyClothFriction(b, 0.01);
    close(b.vx, SLIDE_DECEL * 0.01);
    assert.ok(b.wy < 100 && b.wy > 0, 'Friction must consume topspin');
  });

  it('distinguishes backspin from equal-magnitude natural roll', () => {
    const rolling = ball({ vx: 1000, wy: 1000 / R });
    const draw = ball({ vx: 1000, wy: -1000 / R });
    applyClothFriction(rolling, 0.01);
    applyClothFriction(draw, 0.01);
    close(rolling.vx, 1000 - ROLL_DECEL * 0.01);
    close(draw.vx, 1000 - SLIDE_DECEL * 0.01);
    assert.ok(draw.wy > -1000 / R, 'Backspin must evolve through zero toward topspin');
    close(slip(rolling), 0);
  });

  it('turns sufficiently strong backspin into backward rolling without a velocity multiplier', () => {
    const b = ball({ vx: 700, wy: -2100 / R });
    const transitionTime = (2 / 7) * 2800 / SLIDE_DECEL;
    applyClothFriction(b, transitionTime);
    close(b.vx, -100);
    close(b.wy, -100 / R);
    close(slip(b), 0);
  });

  it('consumes the remaining time as rolling resistance after slip reaches zero', () => {
    const b = ball({ vx: 700 });
    applyClothFriction(b, 200 / SLIDE_DECEL + 0.04);
    close(b.vx, 500 - ROLL_DECEL * 0.04);
    close(b.wy, b.vx / R);
    close(slip(b), 0);
  });

  it('dissipates total solid-sphere kinetic energy for arbitrary spin directions', () => {
    for (let i = 0; i < 100; i++) {
      const b = ball({
        vx: Math.sin(i + 0.2) * 5000,
        vy: Math.cos(i * 1.7) * 4000,
        wx: Math.cos(i * 0.9) * 180,
        wy: Math.sin(i * 1.2) * 210,
      });
      for (const dt of [0.0001, 0.001, 0.01, 0.2, 1]) {
        const before = energy(b);
        applyClothFriction(b, dt);
        assert.ok(energy(b) < before,
          `Friction failed to dissipate energy: case ${i}, dt ${dt}`);
      }
    }
  });

  it('has identical physics after rotating the entire state in the table plane', () => {
    const initial = ball({ vx: 1500, vy: -700, wx: 60, wy: -25 });
    for (const angle of [Math.PI / 2, Math.PI, 0.37, -2.19]) {
      for (const dt of [0.001, 0.2, 1]) {
        const b = ball(initial);
        const rotatedBall = rotated(initial, angle);
        applyClothFriction(b, dt);
        applyClothFriction(rotatedBall, dt);
        assert.ok(energy(b) < energy(initial));
        const expected = rotated(b, angle);
        for (const key of ['vx', 'vy', 'wx', 'wy']) close(rotatedBall[key], expected[key]);
      }
    }
  });

  it('gives the same state for one large step and adaptive substeps across the roll transition', () => {
    const initialStates = [
      ball({ vx: 700 }),
      ball({ vx: 700, wy: -2100 / R }),
      ball({ wy: -100 }),
      ball({ vx: 500, vy: -700, wx: 80, wy: -40 }),
      ball({ vx: 500, vy: -700, wx: 700 / R, wy: 500 / R }),
    ];
    for (const initial of initialStates) {
      for (const totalTime of [0.05, 0.4, 1.4, 12]) {
        const single = ball(initial);
        applyClothFriction(single, totalTime);
        assert.ok(energy(single) < energy(initial));
        for (const count of [4, 24, 240]) {
          const stepped = ball(initial);
          for (let i = 0; i < count; i++) applyClothFriction(stepped, totalTime / count);
          for (const key of ['vx', 'vy', 'wx', 'wy']) close(stepped[key], single[key]);
        }
      }
    }
  });

  it('stops rolling at zero without reversing its direction or leaving residual spin', () => {
    const b = ball({ vx: 3, vy: 4, wx: -4 / R, wy: 3 / R });
    applyClothFriction(b, 10);
    for (const key of ['vx', 'vy', 'wx', 'wy']) close(b[key], 0);
    assert.equal(energy(b), 0);
  });

  it('supports zero rolling resistance for calibration and preserves steady natural roll', () => {
    const b = ball({ vx: 700 });
    applyClothFriction(b, 10, { rollFriction: 0 });
    close(b.vx, 500);
    close(slip(b), 0);
    applyClothFriction(b, 100, { rollFriction: 0 });
    close(b.vx, 500);
  });

  it('modifies only horizontal velocity and angular velocity, leaving side spin independent', () => {
    const b = ball({ vx: 700, x: 45, y: 100, sideOmega: -90, type: 'cue' });
    const result = applyClothFriction(b, 0.01);
    assert.equal(result, b);
    assert.ok(b.vx < 700);
    assert.equal(b.sideOmega, -90);
    assert.equal(b.r, R);
    assert.equal(b.x, 45);
    assert.equal(b.y, 100);
    assert.equal(b.type, 'cue');
  });

  it('leaves a resting ball and a zero-duration step unchanged', () => {
    const b = ball();
    applyClothFriction(b, 0.1);
    assert.deepEqual(b, ball());
    const moving = ball({ vx: 700, wy: -100 });
    const before = { ...moving };
    applyClothFriction(moving, 0);
    assert.deepEqual(moving, before);
  });
});
