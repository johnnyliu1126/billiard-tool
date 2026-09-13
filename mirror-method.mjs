// ==================== Mirror Method — Pure Calculation Functions ====================
// Extracted from index.html for testability and modularity.
// No DOM dependencies. Units: logical mm (2540 x 1270 table).

// Table dimensions (shared constants)
export const TABLE_W = 2540;
export const TABLE_H = 1270;
export const BALL_R = 28.575;
export const POCKET_R = 44;
export const SIDE_POCKET_R = 40;
const GEOMETRY_EPS = 1e-7;

function isFinitePoint(pt) {
  return pt != null && Number.isFinite(pt.x) && Number.isFinite(pt.y);
}

function isPlayableBallCenter(pt) {
  return isFinitePoint(pt) &&
    pt.x >= BALL_R - GEOMETRY_EPS && pt.x <= TABLE_W - BALL_R + GEOMETRY_EPS &&
    pt.y >= BALL_R - GEOMETRY_EPS && pt.y <= TABLE_H - BALL_R + GEOMETRY_EPS;
}

// Cushion definitions (table-edge cushions)
export const CUSHIONS = [
  { name: 'top',    x1: 0, y1: 0, x2: TABLE_W, y2: 0, horiz: true },
  { name: 'bottom', x1: 0, y1: TABLE_H, x2: TABLE_W, y2: TABLE_H, horiz: true },
  { name: 'left',   x1: 0, y1: 0, x2: 0, y2: TABLE_H, horiz: false },
  { name: 'right',  x1: TABLE_W, y1: 0, x2: TABLE_W, y2: TABLE_H, horiz: false },
];

// Ball-center cushions (offset by BALL_R — where the ball center actually reflects)
export const GHOST_CUSHIONS = [
  { name: 'top',    x1: 0, y1: BALL_R, x2: TABLE_W, y2: BALL_R, horiz: true },
  { name: 'bottom', x1: 0, y1: TABLE_H - BALL_R, x2: TABLE_W, y2: TABLE_H - BALL_R, horiz: true },
  { name: 'left',   x1: BALL_R, y1: 0, x2: BALL_R, y2: TABLE_H, horiz: false },
  { name: 'right',  x1: TABLE_W - BALL_R, y1: 0, x2: TABLE_W - BALL_R, y2: TABLE_H, horiz: false },
];

// Pocket positions
export const POCKET_POSITIONS = [
  { x: 0, y: 0, r: POCKET_R },
  { x: TABLE_W, y: 0, r: POCKET_R },
  { x: TABLE_W / 2, y: 0, r: SIDE_POCKET_R },
  { x: 0, y: TABLE_H, r: POCKET_R },
  { x: TABLE_W, y: TABLE_H, r: POCKET_R },
  { x: TABLE_W / 2, y: TABLE_H, r: SIDE_POCKET_R },
];

// ==================== PURE FUNCTIONS ====================

/**
 * Reflect a point across a cushion line.
 * @param {number} px - Point x
 * @param {number} py - Point y
 * @param {{ x1: number, y1: number, horiz: boolean }} cushion
 * @returns {{ x: number, y: number }} Reflected point
 */
export function reflectPoint(px, py, cushion) {
  if (cushion.horiz) {
    return { x: px, y: 2 * cushion.y1 - py };
  } else {
    return { x: 2 * cushion.x1 - px, y: py };
  }
}

/**
 * Find the intersection of two line segments (or infinite lines).
 * Returns the intersection point and the parameter t along segment 1→2.
 * @returns {{ x: number, y: number, t: number } | null}
 */
export function lineIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1), t };
}

/**
 * Squared distance from point (px, py) to line segment (x1,y1)→(x2,y2).
 */
export function distToSegmentSq(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return (px - x1) ** 2 + (py - y1) ** 2;
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const nearX = x1 + t * dx, nearY = y1 + t * dy;
  return (px - nearX) ** 2 + (py - nearY) ** 2;
}

/**
 * Check if a point on a cushion is within a valid segment
 * (not in a pocket gap area).
 */
export function pointOnCushionSegment(pt, cushion) {
  if (!isFinitePoint(pt)) return false;
  if (cushion.horiz) {
    if (Math.abs(pt.y - cushion.y1) > GEOMETRY_EPS ||
        pt.x < Math.min(cushion.x1, cushion.x2) - GEOMETRY_EPS ||
        pt.x > Math.max(cushion.x1, cushion.x2) + GEOMETRY_EPS) return false;
  } else {
    if (Math.abs(pt.x - cushion.x1) > GEOMETRY_EPS ||
        pt.y < Math.min(cushion.y1, cushion.y2) - GEOMETRY_EPS ||
        pt.y > Math.max(cushion.y1, cushion.y2) + GEOMETRY_EPS) return false;
  }
  if (cushion.horiz) {
    const sideX = TABLE_W / 2;
    const gaps = [
      { x: 0, r: POCKET_R },
      { x: TABLE_W, r: POCKET_R },
      { x: sideX, r: SIDE_POCKET_R },
    ];
    for (const gap of gaps) {
      if (Math.abs(pt.x - gap.x) < gap.r + BALL_R) return false;
    }
    return true;
  } else {
    const gaps = [
      { y: 0, r: POCKET_R },
      { y: TABLE_H, r: POCKET_R },
    ];
    for (const gap of gaps) {
      if (Math.abs(pt.y - gap.y) < gap.r + BALL_R) return false;
    }
    return true;
  }
}

/**
 * Whether a ball center can pass through a pocket opening at a given cushion.
 * Only the coordinate along the cushion is examined, so the simulation can use
 * this for balls just inside or outside its boundary. This is the simplified
 * straight-mouth model: side openings have radius 40 mm, corners 44 mm.
 * Mirror rebound candidates keep the larger r + BALL_R margin above to avoid
 * recommending a bounce at a pocket jaw.
 */
export function isPointInPocketOpening(pt, cushion) {
  if (!isFinitePoint(pt)) return false;
  if (cushion.horiz) {
    return Math.abs(pt.x) < POCKET_R ||
      Math.abs(pt.x - TABLE_W) < POCKET_R ||
      Math.abs(pt.x - TABLE_W / 2) < SIDE_POCKET_R;
  }
  return Math.abs(pt.y) < POCKET_R || Math.abs(pt.y - TABLE_H) < POCKET_R;
}

/** Check that the target reaches the selected mouth without first hitting rail. */
export function targetPathClearsCushions(targetBall, pocketTarget) {
  if (!isPlayableBallCenter(targetBall) || !isFinitePoint(pocketTarget)) return false;
  const pocket = POCKET_POSITIONS.find(p =>
    Math.abs(p.x - pocketTarget.x) < GEOMETRY_EPS &&
    Math.abs(p.y - pocketTarget.y) < GEOMETRY_EPS
  );
  if (!pocket) return false;

  const dx = pocket.x - targetBall.x, dy = pocket.y - targetBall.y;
  for (const cushion of GHOST_CUSHIONS) {
    const delta = cushion.horiz ? dy : dx;
    const start = cushion.horiz ? targetBall.y : targetBall.x;
    const edge = cushion.horiz ? cushion.y1 : cushion.x1;
    // Only an outward crossing is a possible obstruction. A target already
    // touching one cushion may move away from it toward an opposite pocket.
    const inward = edge < (cushion.horiz ? TABLE_H : TABLE_W) / 2 ? 1 : -1;
    if (delta * inward >= 0) continue;
    const t = (edge - start) / delta;
    if (t < -GEOMETRY_EPS || t > 1) continue;
    const hit = { x: targetBall.x + t * dx, y: targetBall.y + t * dy };
    const pocketOnThisRail = cushion.horiz
      ? (inward > 0 ? pocket.y === 0 : pocket.y === TABLE_H)
      : (inward > 0 ? pocket.x === 0 : pocket.x === TABLE_W);
    const offset = cushion.horiz ? Math.abs(hit.x - pocket.x) : Math.abs(hit.y - pocket.y);
    // Passing through a different mouth does not make a long path outside the
    // playable rectangle a valid route to the selected pocket.
    if (!pocketOnThisRail || !isPointInPocketOpening(hit, cushion) || offset >= pocket.r) return false;
  }
  return true;
}

/**
 * Generate all valid cushion sequences of length n.
 * Consecutive same-cushion hits are excluded.
 * @param {number} n - Number of cushions (1-5)
 * @returns {number[][]} Array of sequences (each sequence is an array of cushion indices 0-3)
 */
export function generateCushionSequences(n) {
  if (!Number.isInteger(n) || n < 0 || n > 5) {
    throw new RangeError('Cushion count must be an integer from 0 to 5');
  }
  const indices = [0, 1, 2, 3]; // top, bottom, left, right
  const result = [];

  function recurse(seq) {
    if (seq.length === n) {
      result.push([...seq]);
      return;
    }
    for (const idx of indices) {
      if (seq.length > 0 && idx === seq[seq.length - 1]) continue;
      recurse([...seq, idx]);
    }
  }

  recurse([]);
  return result;
}

/**
 * Calculate the ghost ball position (where cue ball must arrive to pocket target).
 * Ghost ball is placed BALL_R*2 behind the target ball, away from the pocket.
 *
 * @param {{ x: number, y: number }} targetBall
 * @param {{ x: number, y: number }} pocket
 * @returns {{ x: number, y: number }}
 */
export function calcGhostBall(targetBall, pocket) {
  const dx = targetBall.x - pocket.x;
  const dy = targetBall.y - pocket.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.01) return { x: targetBall.x, y: targetBall.y };
  return {
    x: targetBall.x + (dx / dist) * BALL_R * 2,
    y: targetBall.y + (dy / dist) * BALL_R * 2,
  };
}

/**
 * Check if a polyline path hits any obstacle (within safeDist).
 * @param {{ x: number, y: number }[]} points
 * @param {{ x: number, y: number }[]} obstacles
 * @param {number} safeDist - Minimum safe distance
 * @returns {boolean}
 */
export function pathHitsObstacle(points, obstacles, safeDist) {
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i], p2 = points[i + 1];
    for (const obs of obstacles) {
      const d = distToSegmentSq(obs.x, obs.y, p1.x, p1.y, p2.x, p2.y);
      if (d < safeDist * safeDist) return true;
    }
  }
  return false;
}

/**
 * Calculate all valid kick routes from cue ball to ghost ball via n cushions.
 * Uses the classic mirror method.
 *
 * @param {{ x: number, y: number }} cueBall
 * @param {{ x: number, y: number }} targetBall
 * @param {{ x: number, y: number }} pocketTarget
 * @param {{ x: number, y: number, type: string }[]} obstacles
 * @param {number} cushionCount - Number of cushions (1-5)
 * @returns {object[]} Array of valid routes, sorted by distance
 */
export function calculateKickRoutes(cueBall, targetBall, pocketTarget, obstacles, cushionCount) {
  const safeDist = BALL_R * 2.2;

  if (!isPlayableBallCenter(cueBall) || !isPlayableBallCenter(targetBall) ||
      !isFinitePoint(pocketTarget)) return [];
  if (!targetPathClearsCushions(targetBall, pocketTarget)) return [];

  // Ghost ball position
  const ghost = calcGhostBall(targetBall, pocketTarget);
  if (!isPlayableBallCenter(ghost)) return [];

  const sequences = generateCushionSequences(cushionCount);
  const validRoutes = [];

  for (const seq of sequences) {
    // Build mirrored targets (work backwards from ghost ball)
    let mirrorX = ghost.x, mirrorY = ghost.y;
    const mirroredTargets = [{ x: mirrorX, y: mirrorY }];

    for (let i = seq.length - 1; i >= 0; i--) {
      const gc = GHOST_CUSHIONS[seq[i]];
      const ref = reflectPoint(mirrorX, mirrorY, gc);
      mirrorX = ref.x;
      mirrorY = ref.y;
      mirroredTargets.unshift({ x: mirrorX, y: mirrorY });
    }

    // Unfold: from cueBall, trace through cushions
    let currentX = cueBall.x, currentY = cueBall.y;
    const hitPoints = [];
    const allPoints = [{ x: currentX, y: currentY }];
    let valid = true;

    for (let i = 0; i < seq.length; i++) {
      const gc = GHOST_CUSHIONS[seq[i]];
      const target = mirroredTargets[i];

      const inter = lineIntersection(
        currentX, currentY, target.x, target.y,
        gc.x1, gc.y1, gc.x2, gc.y2
      );

      if (!inter) { valid = false; break; }
      if (!pointOnCushionSegment(inter, gc)) { valid = false; break; }
      if (inter.t < 0 || inter.t > 1.05) { valid = false; break; }

      hitPoints.push({ x: inter.x, y: inter.y });
      allPoints.push({ x: inter.x, y: inter.y });
      currentX = inter.x;
      currentY = inter.y;
    }

    if (!valid) continue;

    // The target is also an obstacle until every requested cushion has been hit.
    // Checking only the red obstacles permits routes that hit the target early.
    if (pathHitsObstacle(allPoints, [targetBall], BALL_R * 2)) continue;

    // Last segment: hit point → ghost ball → pocket
    allPoints.push({ x: ghost.x, y: ghost.y });
    allPoints.push({ x: pocketTarget.x, y: pocketTarget.y });

    // Check obstacle collisions for cue ball path
    const cuePath = allPoints.slice(0, allPoints.length - 1);
    if (pathHitsObstacle(cuePath, obstacles, safeDist)) continue;

    // Check obstacle collisions for target ball path
    const tgtPath = [
      { x: targetBall.x, y: targetBall.y },
      { x: pocketTarget.x, y: pocketTarget.y }
    ];
    if (pathHitsObstacle(tgtPath, obstacles, safeDist)) continue;

    // Calculate total distance
    let totalDist = 0;
    for (let i = 0; i < allPoints.length - 1; i++) {
      const dx = allPoints[i + 1].x - allPoints[i].x;
      const dy = allPoints[i + 1].y - allPoints[i].y;
      totalDist += Math.sqrt(dx * dx + dy * dy);
    }

    // Check approach angle
    const lastSeg = allPoints[allPoints.length - 3];
    const ghostSeg = allPoints[allPoints.length - 2];
    const approachAngle = Math.atan2(ghostSeg.y - lastSeg.y, ghostSeg.x - lastSeg.x);
    const pocketAngle = Math.atan2(
      pocketTarget.y - targetBall.y, pocketTarget.x - targetBall.x
    );
    let angleDiff = Math.abs(approachAngle - pocketAngle);
    if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
    if (angleDiff > Math.PI * 0.28) continue;

    validRoutes.push({
      points: allPoints,
      cushionPoints: hitPoints,
      totalDist,
      angleDiff,
      sequence: seq.map(i => CUSHIONS[i].name),
      // Energy-aware scoring: each cushion bounce loses ~28% energy (restitution 0.72)
      // effectiveDist estimates the "felt" distance accounting for energy loss
      effectiveDist: totalDist / Math.pow(0.83, seq.length),
    });
  }

  // Sort by energy-aware effective distance (prefer routes that maintain more energy)
  validRoutes.sort((a, b) => a.effectiveDist - b.effectiveDist);

  return validRoutes.slice(0, 5);
}
