import { TABLE_W, TABLE_H, BALL_R, POCKET_POSITIONS } from './mirror-method.mjs';

export const SCENE_STORAGE_KEY = 'billiard-tool.scene.v1';
const BALL_TYPES = new Set(['cue', 'target', 'obstacle']);
const HEIGHTS = new Set(['low', 'mid', 'high']);
const SPINS = new Set(['left', 'none', 'right']);

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validBall(ball) {
  return ball && BALL_TYPES.has(ball.type) && finite(ball.x) && finite(ball.y) &&
    ball.x >= BALL_R && ball.x <= TABLE_W - BALL_R &&
    ball.y >= BALL_R && ball.y <= TABLE_H - BALL_R;
}

function validPocket(point) {
  if (point == null) return true;
  return POCKET_POSITIONS.some(pocket => pocket.x === point.x && pocket.y === point.y);
}

export function sanitizeScene(input) {
  if (!input || !Array.isArray(input.balls) || input.balls.length > 16 || !input.balls.every(validBall)) {
    throw new Error('保存的球位无效');
  }
  if (input.balls.filter(ball => ball.type === 'cue').length > 1 ||
      input.balls.filter(ball => ball.type === 'target').length > 1) throw new Error('球位角色无效');
  if (!validPocket(input.pocketTarget)) throw new Error('保存的袋口无效');
  if (!Number.isInteger(input.cushionCount) || input.cushionCount < 1 || input.cushionCount > 5) throw new Error('颗星数无效');
  if (!finite(input.cueSpeed) || input.cueSpeed < 1 || input.cueSpeed > 10) throw new Error('出杆速度无效');
  if (!HEIGHTS.has(input.cueHeight) || !SPINS.has(input.cueSpin)) throw new Error('杆法设置无效');
  return {
    balls: input.balls.map(ball => ({ x: ball.x, y: ball.y, type: ball.type })),
    pocketTarget: input.pocketTarget ? { x: input.pocketTarget.x, y: input.pocketTarget.y } : null,
    cushionCount: input.cushionCount,
    cueSpeed: input.cueSpeed,
    cueHeight: input.cueHeight,
    cueSpin: input.cueSpin,
  };
}

export function saveScene(storage, scene) {
  try {
    storage.setItem(SCENE_STORAGE_KEY, JSON.stringify({ version: 1, scene: sanitizeScene(scene) }));
    return true;
  } catch {
    return false;
  }
}

export function loadScene(storage) {
  try {
    const raw = storage.getItem(SCENE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1) return null;
    return sanitizeScene(parsed.scene);
  } catch {
    return null;
  }
}
