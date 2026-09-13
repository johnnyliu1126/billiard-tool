// ==================== 2.5D Side-Spin Physics Model ====================
// Pure calculation functions — no DOM dependencies.
// Units: positions in mm, velocities in mm/s, angular velocity in rad/s.
//
// Mathematical conventions:
//   Screen coordinates: x right, y down; positive sideOmega is clockwise on screen.
//   n = unit normal pointing INTO the table at a cushion contact
//   t = (-n.y, n.x) — unit tangent (90° clockwise on screen from n)
//   vn = dot(v, n) — normal speed
//   vt = dot(v, t) — tangential speed
//   Relative tangential sliding speed at contact: vt - sideOmega * ballRadius
//
// This ensures mirror symmetry: swapping left/right spin produces equal-and-opposite
// rebound offsets in mirrored ball positions.

// ==================== CONFIGURABLE PARAMETERS ====================

/** Maximum squirt angle (radians) at full side spin relative to a fixed cue line.
 *  This is an uncalibrated model parameter; actual deflection depends on the cue. */
export const PHYS_SQUIRT_MAX_ANGLE = 0.018; // ~1.0°

// Chinese eight-ball baseline. The 0.83 low-speed value is close to the
// published effective rail result (~0.818) and the open-source Chinese-eight
// baseline. Above the 2.5 m/s rigid-cushion range, progressively soften the
// simplified response instead of extrapolating the low-speed coefficient.
export const PHYS_CUSHION_E_LOW = 0.83;
export const PHYS_CUSHION_E_HIGH = 0.76;
export const PHYS_CUSHION_RIGID_LIMIT = 2500; // mm/s
export const PHYS_CUSHION_HIGH_SPEED = 8000; // mm/s

/** Maximum initial sideOmega (rad/s) at full side spin. This is the angular
 *  velocity around the vertical (table-normal) axis. Scales with shot speed. */
export const PHYS_SIDE_SPIN_MAX = 60; // rad/s at reference speed of 3000 mm/s (3 m/s)
export const PHYS_SIDE_SPIN_LIMIT = 150; // public Chinese-eight engine baseline

/** Side spin decay rate on the cloth (fraction lost per second).
 *  A value of 2.5 means sideOmega halves roughly every 0.28 s of travel. */
export const PHYS_SIDE_SPIN_DECAY = 2.5; // 1/s

/** Tangential friction coefficient at cushion contact. Controls how much
 *  the relative sliding speed at the contact patch affects the rebound. */
export const PHYS_CUSHION_TANGENTIAL_FRICTION = 0.2;

/** Empirical damping applied to sideOmega after the friction impulse.
 *  The impulse itself can transfer tangential motion into spin. */
export const PHYS_CUSHION_SIDE_SPIN_RETENTION = 0.55;

// ==================== PURE FUNCTIONS ====================

export function calcCushionRestitution(speed) {
  const magnitude = Math.abs(Number.isFinite(speed) ? speed : 0);
  if (magnitude <= PHYS_CUSHION_RIGID_LIMIT) return PHYS_CUSHION_E_LOW;
  if (magnitude >= PHYS_CUSHION_HIGH_SPEED) return PHYS_CUSHION_E_HIGH;
  const ratio = (magnitude - PHYS_CUSHION_RIGID_LIMIT) /
    (PHYS_CUSHION_HIGH_SPEED - PHYS_CUSHION_RIGID_LIMIT);
  return PHYS_CUSHION_E_LOW + ratio * (PHYS_CUSHION_E_HIGH - PHYS_CUSHION_E_LOW);
}

/**
 * Calculate the squirt (deflection) angle for a given side-spin intensity.
 * Positive spinSign = right spin, negative = left spin.
 * Returns the actual launch deflection in radians to ADD to a fixed cue direction
 * in screen coordinates (x right, y down). Right spin squirts left (negative angle).
 * This is not an aiming compensation; compensating the cue would use the opposite sign.
 * See https://drdavepoolinfo.com/faq/squirt/straight-shot/ .
 *
 * @param {number} spinSign - Normalized side-spin intensity: -1 (full left) to +1 (full right)
 * @param {number} speed - Shot speed in mm/s (used for reference, not currently scaled)
 * @returns {number} Actual squirt deflection angle in radians
 */
export function calcSquirtAngle(spinSign, speed) {
  return -spinSign * PHYS_SQUIRT_MAX_ANGLE;
}

/**
 * Calculate the initial sideOmega for a shot.
 *
 * @param {number} spinSign - Normalized side-spin intensity: -1 to +1
 * @param {number} speed - Shot speed in mm/s
 * @returns {number} Initial sideOmega in rad/s
 */
export function calcInitialSideOmega(spinSign, speed) {
  // A right-of-centre cue impulse has negative r×F in x-right/y-down coordinates.
  // Hence right english produces negative (counterclockwise on screen) sideOmega.
  // Its magnitude scales with shot speed.
  const referenceSpeed = 3000; // mm/s (3 m/s)
  const raw = -spinSign * PHYS_SIDE_SPIN_MAX * (speed / referenceSpeed);
  return Math.max(-PHYS_SIDE_SPIN_LIMIT, Math.min(PHYS_SIDE_SPIN_LIMIT, raw));
}

/**
 * Apply cloth decay to sideOmega over a time step.
 *
 * @param {number} sideOmega - Current sideOmega (rad/s)
 * @param {number} dt - Time step in seconds
 * @returns {number} New sideOmega after decay
 */
export function decaySideOmega(sideOmega, dt) {
  if (Math.abs(sideOmega) < 0.01) return 0;
  // Exponential decay: omega *= exp(-k * dt) ≈ 1 - k*dt for small dt
  const factor = Math.exp(-PHYS_SIDE_SPIN_DECAY * dt);
  return sideOmega * factor;
}

/**
 * Calculate the cushion tangential friction impulse and resulting velocity/spin changes.
 *
 * On cushion contact with normal n (pointing INTO table) and tangent t:
 *   1. Compute relative tangential sliding speed at contact patch
 *   2. Apply friction impulse to reduce sliding, capped by normal impulse * mu
 *   3. Distribute impulse between tangential velocity change and sideOmega change
 *      using the moment of inertia for a solid sphere (I = 2/5 * m * r²)
 *
 * @param {number} vn - Normal velocity before rebound (mm/s, negative = toward cushion)
 * @param {number} vt - Tangential velocity before rebound (mm/s)
 * @param {number} sideOmega - Side spin before rebound (rad/s)
 * @param {number} ballRadius - Ball radius in mm
 * @param {number} cushionRestitution - Cushion restitution coefficient (e.g., 0.72)
 * @returns {{ vnOut: number, vtOut: number, sideOmegaOut: number }}
 *   New normal velocity, tangential velocity, and sideOmega after cushion contact.
 */
export function calcCushionBounce(vn, vt, sideOmega, ballRadius, cushionRestitution) {
  // A separating or tangent contact has no collision impulse.
  if (vn >= 0) return { vnOut: vn, vtOut: vt, sideOmegaOut: sideOmega };

  // Normal rebound: standard reflection with restitution
  const vnOut = -vn * cushionRestitution;

  // Geometric training approximation retained for the existing no-english routes:
  // scale both components by e to preserve the mirror angle. This special case
  // is not a physical zero-spin limit of the friction model below.
  if (Math.abs(sideOmega) < 0.01) {
    return {
      vnOut,
      vtOut: vt * cushionRestitution, // scale tangential too (preserves angle)
      sideOmegaOut: 0,
    };
  }

  // Relative tangential sliding speed at contact patch
  // Contact is at -r*n, so omega×(-r*n) contributes -sideOmega*r along t.
  // Relative sliding = vt - sideOmega * r
  const contactSlipSpeed = vt - sideOmega * ballRadius;

  // Normal impulse magnitude (per unit mass): Jn = -(1+e) * vn
  // (vn is negative when approaching, so Jn is positive)
  const normalImpulse = -(1 + cushionRestitution) * vn;

  // Maximum tangential impulse limited by friction coefficient
  const maxFrictionImpulse = PHYS_CUSHION_TANGENTIAL_FRICTION * normalImpulse;

  // Tangential impulse: try to zero the contact slip speed
  // Effective inertia for tangential direction at contact:
  // For a solid sphere, I = 2/5 m r², so angular contribution to contact
  // acceleration is r * tau / I = r² * F / I = 5/2 * F/m
  // Combined: a_contact = F/m + (5/2)F/m = (7/2)F/m
  // So effective mass ratio for tangential impulse is 2/7. Multiply slip by
  // this ratio: vt' = vt-j and omega' = omega+5j/(2r) give s' = s-(7/2)j.
  // The inertia, opposing friction and contact velocity relations are consistent
  // with Mathavan et al. (2010), sections 2.1–2.3, reduced to an equatorial 2D contact:
  // https://drdavepoolinfo.com/physics_articles/Mathavan_IMechE_2010.pdf
  const effectiveMassRatio = 2 / 7;
  let frictionImpulse = contactSlipSpeed * effectiveMassRatio;

  // Clamp to maximum (friction cannot exceed mu * normal_force)
  const absFriction = Math.abs(frictionImpulse);
  if (absFriction > maxFrictionImpulse) {
    frictionImpulse = Math.sign(frictionImpulse) * maxFrictionImpulse;
  }

  // Apply impulse to tangential velocity
  // (frictionImpulse opposes contact slip — it acts on the ball's center of mass)
  const vtOut = vt - frictionImpulse;

  // Apply impulse to sideOmega
  // Torque = frictionImpulse * r, angular acceleration = torque / I
  // delta_omega = frictionImpulse * r / (2/5 * m * r²) = 5 * frictionImpulse / (2 * r)
  const deltaOmega = (5 * frictionImpulse) / (2 * ballRadius);
  const sideOmegaOut = sideOmega + deltaOmega;

  // Additional empirical spin damping, separate from the impulse above.
  // It reduces energy but is not a resolved model of cushion deformation/contact height.
  const finalSideOmega = sideOmegaOut * PHYS_CUSHION_SIDE_SPIN_RETENTION;

  return {
    vnOut,
    vtOut,
    sideOmegaOut: finalSideOmega,
  };
}

/**
 * Convenience function to reflect a 2D velocity vector at a cushion,
 * applying both normal restitution and tangential friction with side spin.
 *
 * @param {number} vx - Ball velocity x (mm/s)
 * @param {number} vy - Ball velocity y (mm/s)
 * @param {number} sideOmega - Ball side spin (rad/s)
 * @param {number} nx - Cushion normal x (pointing INTO table)
 * @param {number} ny - Cushion normal y (pointing INTO table)
 * @param {number} ballRadius - Ball radius (mm)
 * @param {number} cushionE - Cushion restitution
 * @returns {{ vx: number, vy: number, sideOmega: number }} New velocity and side spin
 */
export function reflectVelocityWithSideSpin(vx, vy, sideOmega, nx, ny, ballRadius, cushionE) {
  // Decompose velocity into normal and tangential components
  const vn = vx * nx + vy * ny;
  const tx = -ny;
  const ty = nx;
  const vt = vx * tx + vy * ty;

  const result = calcCushionBounce(vn, vt, sideOmega, ballRadius, cushionE);

  // Reconstruct velocity vector
  const newVx = result.vnOut * nx + result.vtOut * tx;
  const newVy = result.vnOut * ny + result.vtOut * ty;

  return {
    vx: newVx,
    vy: newVy,
    sideOmega: result.sideOmegaOut,
  };
}
