// Horizontal motion of a homogeneous solid sphere on level cloth.
// Units: mm, mm/s, radians/s, seconds. I = (2/5) m r².
//
// The table uses x right and y down. Use a consistent algebraic basis:
//   contact slip u = (vx - r*wy, vy + r*wx)
//   natural roll  = (wx, wy) = (-vy/r, vx/r)
// For a launch direction (dx,dy), a signed follow/draw spin w is
//   (wx,wy) = (-dy*w, dx*w); positive w follows, negative w draws.
// Canvas presentation does not change these component signs.
//
// Derivation/reference: University of Alaska Fairbanks Physics 211,
// "Sliding to Rolling", pp. 37–39:
// https://ffden-2.phys.uaf.edu/DEN.Lect.27.pdf
// Full vector/event equations, derived by the pooltool author:
// https://ekiefl.github.io/2020/04/24/pooltool-theory/

/**
 * Advance cloth friction without changing positions, radius, or sideOmega.
 * Mutates and returns the supplied state; has no global state or DOM effects.
 *
 * Sliding friction opposes contact slip, not center-of-mass velocity. Its
 * torque gives dw = (5/(2r)) * (dvy, -dvx), so du = (7/2) dv. The exact
 * sliding-to-rolling time is 2|u|/(7*muSlide*g). Any remaining time uses
 * rolling resistance while keeping the no-slip constraint exactly.
 *
 * @param {{vx:number, vy:number, wx:number, wy:number, r:number}} ball
 *   Finite components and positive radius. wx/wy are fixed table-axis spin.
 * @param {number} dt Nonnegative time in seconds.
 * @param {{gravity?:number, slideFriction?:number, rollFriction?:number}} options
 *   Nonnegative coefficients. rollFriction*g is measured rolling deceleration,
 *   rather than a point-contact Coulomb force that would create new slip.
 * @returns {typeof ball}
 */
export function applyClothFriction(ball, dt, {
  gravity = 9810,
  slideFriction = 0.2,
  rollFriction = 0.01,
} = {}) {
  if (dt <= 0) return ball;

  const { r } = ball;
  const ux = ball.vx - r * ball.wy;
  const uy = ball.vy + r * ball.wx;
  const slipSpeed = Math.hypot(ux, uy);
  let rollingTime = dt;

  if (slipSpeed > 0) {
    const slidingDecel = slideFriction * gravity;
    if (slidingDecel === 0) return ball;
    const timeToRoll = (2 / 7) * slipSpeed / slidingDecel;
    const slidingTime = Math.min(dt, timeToRoll);
    // The 2/7 impulse cap prevents overshooting zero slip through roundoff.
    const impulseScale = Math.min(slidingDecel * slidingTime / slipSpeed, 2 / 7);
    const dvx = -ux * impulseScale;
    const dvy = -uy * impulseScale;
    ball.vx += dvx;
    ball.vy += dvy;
    ball.wx += (5 / (2 * r)) * dvy;
    ball.wy -= (5 / (2 * r)) * dvx;
    if (dt < timeToRoll) return ball;
    rollingTime -= slidingTime;
  }

  const speed = Math.hypot(ball.vx, ball.vy);
  const nextSpeed = Math.max(0, speed - rollFriction * gravity * rollingTime);
  if (nextSpeed === 0) {
    ball.vx = 0;
    ball.vy = 0;
    ball.wx = 0;
    ball.wy = 0;
    return ball;
  }

  const ratio = nextSpeed / speed;
  ball.vx *= ratio;
  ball.vy *= ratio;
  ball.wx = -ball.vy / r;
  ball.wy = ball.vx / r;
  return ball;
}
