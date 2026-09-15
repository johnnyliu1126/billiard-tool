import { BALL_R, POCKET_POSITIONS, calculateKickRoutes, distToSegmentSq } from './mirror-method.mjs';

function routeClearance(route, obstacles) {
  if (!obstacles.length) return Infinity;
  const cuePath = route.points.slice(0, -1);
  let minimum = Infinity;
  for (let i = 0; i < cuePath.length - 1; i++) {
    for (const obstacle of obstacles) {
      minimum = Math.min(minimum, Math.sqrt(distToSegmentSq(
        obstacle.x, obstacle.y,
        cuePath[i].x, cuePath[i].y,
        cuePath[i + 1].x, cuePath[i + 1].y,
      )) - BALL_R * 2);
    }
  }
  return minimum;
}

function scratchRisk(route, intendedPocket) {
  let risk = 0;
  for (const hit of route.cushionPoints) {
    for (const pocket of POCKET_POSITIONS) {
      if (pocket.x === intendedPocket.x && pocket.y === intendedPocket.y) continue;
      const distance = Math.hypot(hit.x - pocket.x, hit.y - pocket.y);
      const danger = pocket.r + BALL_R * 2.2;
      if (distance < danger) risk = Math.max(risk, 1 - distance / danger);
    }
  }
  return risk;
}

const DEFAULT_JITTERS = [
  [0, 0], [-12, 0], [12, 0], [0, -12], [0, 12],
  [-8, -8], [8, -8], [-8, 8], [8, 8],
];

export function evaluateGeometryTolerance(route, scene, options = {}) {
  const solver = options.solver || calculateKickRoutes;
  const jitters = options.jitters || DEFAULT_JITTERS;
  let kept = 0;
  for (const [dx, dy] of jitters) {
    const cue = { x: scene.cue.x + dx, y: scene.cue.y + dy };
    let candidates = [];
    try {
      candidates = solver(cue, scene.target, scene.pocket, scene.obstacles, scene.cushionCount, { limit: 20 });
    } catch {
      candidates = [];
    }
    if (candidates.some(candidate => candidate.sequence.join(',') === route.sequence.join(','))) kept++;
  }
  return { kept, total: jitters.length };
}

export function assessRouteQuality(route, scene, options = {}) {
  const clearanceMm = routeClearance(route, scene.obstacles || []);
  const cutAngleDeg = Math.abs(route.angleDiff || 0) * 180 / Math.PI;
  const scratch = scratchRisk(route, scene.pocket);
  const tolerance = (options.toleranceEvaluator || evaluateGeometryTolerance)(route, scene, options);
  const toleranceRatio = tolerance.total ? tolerance.kept / tolerance.total : 0;
  const distancePenalty = (route.effectiveDist || route.totalDist) / 100;
  const cutPenalty = cutAngleDeg * 1.1;
  const clearancePenalty = Number.isFinite(clearanceMm) ? Math.max(0, 180 - clearanceMm) * 0.42 : 0;
  const scratchPenalty = scratch * 60;
  const tolerancePenalty = (1 - toleranceRatio) * 95;
  const score = distancePenalty + cutPenalty + clearancePenalty + scratchPenalty + tolerancePenalty;

  const clearanceText = Number.isFinite(clearanceMm)
    ? `障碍余量约 ${Math.max(0, Math.round(clearanceMm))} mm`
    : '路径上无障碍球';
  const cutText = cutAngleDeg < 12 ? '切球角度较小' : cutAngleDeg < 30 ? '切球角度中等' : '切球角度较大';
  const scratchText = scratch > 0.45 ? '颗星点靠近非目标袋口' : '母球提前落袋风险较低';
  return {
    ...route,
    score,
    qualityScore: score,
    metrics: { cutAngleDeg, clearanceMm, scratchRisk: scratch, tolerance },
    explanation: `容错：扰动样本 ${tolerance.kept}/${tolerance.total} 保留同一路线；${clearanceText}；${cutText}；${scratchText}；行程约 ${(route.totalDist / 1000).toFixed(2)} m`,
  };
}

export function rankRouteAdvice(routes, scene, options = {}) {
  return routes
    .map(route => assessRouteQuality(route, scene, options))
    .sort((a, b) => a.qualityScore - b.qualityScore);
}
