// ==================== 2.5D Side-Spin Physics Model ====================
// Pure calculation functions — no DOM dependencies.
// Units: positions in mm, velocities in mm/s, angular velocity in rad/s.
//
// Mathematical conventions:
//   n = unit normal pointing INTO the table at a cushion contact
//   t = (-n.y, n.x) — unit tangent (90° counter-clockwise from n)
//   vn = dot(v, n) — normal speed
//   vt = dot(v, t) — tangential speed
//   Relative tangential sliding speed at contact: vt - sideOmega * ballRadius
//
// This ensures mirror symmetry: swapping left/right spin produces equal-and-opposite
// rebound offsets in mirrored ball positions.

// ==================== CONFIGURABLE PARAMETERS ====================

/** Maximum squirt angle (radians) at full side spin. The cue ball deflects
 *  laterally relative to the cue line by up to this angle. Typical real-world
 *  values are 0.5°–1.5° (0.009–0.026 rad). We use a slightly larger value for
 *  visible in-simulation effect. */
export const PHYS_SQUIRT_MAX_ANGLE = 0.018; // ~1.0°

/** Maximum initial sideOmega (rad/s) at full side spin. This is the angular
 *  velocity around the vertical (table-normal) axis. Scales with shot speed. */
export const PHYS_SIDE_SPIN_MAX = 60; // rad/s at reference speed of 3000 mm/s (3 m/s)

/** Side spin decay rate on the cloth (fraction lost per second).
 *  A value of 2.5 means sideOmega halves roughly every 0.28 s of travel. */
export const PHYS_SIDE_SPIN_DECAY = 2.5; // 1/s

/** Tangential friction coefficient at cushion contact. Controls how much
 *  the relative sliding speed at the contact patch affects the rebound. */
export const PHYS_CUSHION_TANGENTIAL_FRICTION = 0.35;

/** Fraction of sideOmega retained after a cushion bounce.
 *  0.55 means ~45% of side spin is lost on each cushion hit. */
export const PHYS_CUSHION_SIDE_SPIN_RETENTION = 0.55;

// ==================== PURE FUNCTIONS ====================

/**
 * Calculate the squirt (deflection) angle for a given side-spin intensity.
 * Positive spinSign = right spin, negative = left spin.
 * Returns the angle in radians to ADD to the aim direction.
 * (Right spin → cue ball squirts left, so compensate by aiming right.)
 *
 * @param {number} spinSign - Normalized side-spin intensity: -1 (full left) to +1 (full right)
 * @param {number} speed - Shot speed in mm/s (used for reference, not currently scaled)
 * @returns {number} Squirt compensation angle in radians
 */
export function calcSquirtAngle(spinSign, speed) {
  // Returns the AIM COMPENSATION angle to add to the cue direction.
  // Right spin (positive sign) → cue ball squirts left → compensate by aiming right (+).
  // Left spin (negative sign) → cue ball squirts right → compensate by aiming left (-).
  // Matches the existing convention: cueSpin 'right' → aimAng += angle.
  return spinSign * PHYS_SQUIRT_MAX_ANGLE;
}

/**
 * Calculate the initial sideOmega for a shot.
 *
 * @param {number} spinSign - Normalized side-spin intensity: -1 to +1
 * @param {number} speed - Shot speed in mm/s
 * @returns {number} Initial sideOmega in rad/s
 */
export function calcInitialSideOmega(spinSign, speed) {
  // sideOmega scales with shot speed: faster shot = more spin RPM
  const referenceSpeed = 3000; // mm/s (3 m/s)
  return spinSign * PHYS_SIDE_SPIN_MAX * (speed / referenceSpeed);
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
  // Normal rebound: standard reflection with restitution
  const vnOut = -vn * cushionRestitution;

  // Per design spec: "零侧旋时，库边反射沿用当前结果，避免影响现有无赛路线"
  // The original behavior scales the full mirror reflection by e,
  // preserving the angle of reflection = angle of incidence.
  if (Math.abs(sideOmega) < 0.01) {
    return {
      vnOut,
      vtOut: vt * cushionRestitution, // scale tangential too (preserves angle)
      sideOmegaOut: 0,
    };
  }

  // Relative tangential sliding speed at contact patch
  // Ball surface speed at contact = sideOmega * r (positive t direction)
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
  // acceleration is (r * tau / I) * r = r² * F / I = 5/2 * F/m
  // Combined: a_contact = F/m + (5/2)F/m = (7/2)F/m
  // So effective mass ratio for tangential impulse is 2/7
  const effectiveMassRatio = 2 / 7;
  let frictionImpulse = contactSlipSpeed / effectiveMassRatio;

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

  // Apply side spin retention (energy loss in spin on cushion contact)
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
