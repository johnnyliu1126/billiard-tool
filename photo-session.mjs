import { TABLE_W, TABLE_H, BALL_R } from './mirror-method.mjs';

function clonePoint(point) {
  return { x: Number(point.x), y: Number(point.y) };
}

function solveLinear(matrix, values) {
  const n = values.length;
  const rows = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < n; column++) {
    let pivot = column;
    for (let row = column + 1; row < n; row++) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    if (Math.abs(rows[pivot][column]) < 1e-9) throw new Error('台面四角无法形成有效透视区域');
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const scale = rows[column][column];
    for (let i = column; i <= n; i++) rows[column][i] /= scale;
    for (let row = 0; row < n; row++) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let i = column; i <= n; i++) rows[row][i] -= factor * rows[column][i];
    }
  }
  return rows.map(row => row[n]);
}

function homography(from, to) {
  const matrix = [], values = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i], { x: u, y: v } = to[i];
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); values.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]); values.push(v);
  }
  return [...solveLinear(matrix, values), 1];
}

function transform(point, matrix) {
  const denominator = matrix[6] * point.x + matrix[7] * point.y + matrix[8];
  if (Math.abs(denominator) < 1e-9) throw new Error('坐标位于透视变换的无效区域');
  const x = (matrix[0] * point.x + matrix[1] * point.y + matrix[2]) / denominator;
  const y = (matrix[3] * point.x + matrix[4] * point.y + matrix[5]) / denominator;
  return { x: Math.abs(x) < 1e-9 ? 0 : x, y: Math.abs(y) < 1e-9 ? 0 : y };
}

const TABLE_RECT = [
  { x: 0, y: 0 }, { x: TABLE_W, y: 0 },
  { x: TABLE_W, y: TABLE_H }, { x: 0, y: TABLE_H },
];

export function imageToTablePoint(point, quad) {
  return transform(point, homography(quad, TABLE_RECT));
}

export function tableToImagePoint(point, quad) {
  return transform(point, homography(TABLE_RECT, quad));
}

function markerWithTablePosition(marker, quad) {
  const mapped = imageToTablePoint({ x: marker.sourceX, y: marker.sourceY }, quad);
  return {
    ...marker,
    x: Math.max(BALL_R, Math.min(TABLE_W - BALL_R, mapped.x)),
    y: Math.max(BALL_R, Math.min(TABLE_H - BALL_R, mapped.y)),
  };
}

function updateMarkers(session, markers = session.markers, quad = session.quad) {
  return { ...session, quad: quad.map(clonePoint), markers: markers.map(marker => markerWithTablePosition(marker, quad)) };
}

export function createPhotoSession(sourceImage, analysis) {
  if (!sourceImage?.width || !sourceImage?.height || !analysis?.quad || analysis.quad.length !== 4) {
    throw new Error('照片校正会话数据无效');
  }
  const quad = analysis.quad.map(clonePoint);
  const markers = (analysis.balls || []).map((ball, index) => {
    const source = tableToImagePoint(ball, quad);
    return {
      id: `ball-${index + 1}`,
      sourceX: source.x,
      sourceY: source.y,
      x: ball.x,
      y: ball.y,
      role: ball.kind === 'cue' ? 'cue' : 'object',
      color: ball.color || (ball.kind === 'cue' ? 'rgb(240,240,230)' : 'rgb(220,70,80)'),
      origin: 'detected',
    };
  });
  return {
    sourceWidth: sourceImage.width,
    sourceHeight: sourceImage.height,
    quad,
    markers,
    legalTargetIds: [],
    nextMarkerId: markers.length + 1,
  };
}

export function movePhotoCorner(session, cornerIndex, point) {
  if (!Number.isInteger(cornerIndex) || cornerIndex < 0 || cornerIndex > 3) return session;
  const quad = session.quad.map(clonePoint);
  quad[cornerIndex] = {
    x: Math.max(0, Math.min(session.sourceWidth - 1, Number(point.x))),
    y: Math.max(0, Math.min(session.sourceHeight - 1, Number(point.y))),
  };
  // Building the transform validates that the edited quadrilateral is still usable.
  homography(quad, TABLE_RECT);
  return updateMarkers(session, session.markers, quad);
}

export function movePhotoMarker(session, markerId, point) {
  const markers = session.markers.map(marker => marker.id === markerId ? {
    ...marker,
    sourceX: Math.max(0, Math.min(session.sourceWidth - 1, Number(point.x))),
    sourceY: Math.max(0, Math.min(session.sourceHeight - 1, Number(point.y))),
    origin: 'corrected',
  } : marker);
  return updateMarkers(session, markers);
}

export function addPhotoMarker(session, point, role = 'object') {
  const id = `ball-${session.nextMarkerId}`;
  const marker = {
    id,
    sourceX: Math.max(0, Math.min(session.sourceWidth - 1, Number(point.x))),
    sourceY: Math.max(0, Math.min(session.sourceHeight - 1, Number(point.y))),
    role: role === 'cue' ? 'cue' : 'object',
    color: role === 'cue' ? 'rgb(240,240,230)' : 'rgb(220,70,80)',
    origin: 'manual',
  };
  let markers = [...session.markers, marker];
  if (marker.role === 'cue') markers = markers.map(item => item.id !== id && item.role === 'cue' ? { ...item, role: 'object' } : item);
  return updateMarkers({ ...session, nextMarkerId: session.nextMarkerId + 1 }, markers);
}

export function removePhotoMarker(session, markerId) {
  return updateMarkers({
    ...session,
    legalTargetIds: session.legalTargetIds.filter(id => id !== markerId),
  }, session.markers.filter(marker => marker.id !== markerId));
}

export function setCueMarker(session, markerId) {
  if (!session.markers.some(marker => marker.id === markerId)) return session;
  const markers = session.markers.map(marker => ({
    ...marker,
    role: marker.id === markerId ? 'cue' : marker.role === 'cue' ? 'object' : marker.role,
  }));
  return updateMarkers({
    ...session,
    legalTargetIds: session.legalTargetIds.filter(id => id !== markerId),
  }, markers);
}

export function toggleLegalTarget(session, markerId) {
  const marker = session.markers.find(item => item.id === markerId);
  if (!marker || marker.role !== 'object') return session;
  const selected = session.legalTargetIds.includes(markerId);
  return {
    ...session,
    legalTargetIds: selected
      ? session.legalTargetIds.filter(id => id !== markerId)
      : [...session.legalTargetIds, markerId],
  };
}

export function buildPhotoScene(session) {
  const cueMarker = session.markers.find(marker => marker.role === 'cue');
  const allObjects = session.markers.filter(marker => marker.role === 'object').map(marker => ({
    id: marker.id, x: marker.x, y: marker.y, color: marker.color,
  }));
  return {
    cue: cueMarker ? { id: cueMarker.id, x: cueMarker.x, y: cueMarker.y } : null,
    allObjects,
    legalTargets: allObjects.filter(ball => session.legalTargetIds.includes(ball.id)),
  };
}
