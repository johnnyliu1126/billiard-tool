import {
  TABLE_W,
  TABLE_H,
  BALL_R,
  POCKET_POSITIONS,
  calculateKickRoutes,
} from './mirror-method.mjs';

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max ? d / max : 0, v: max };
}

function hueDistance(a, b) {
  const d = Math.abs(a - b);
  return Math.min(d, 360 - d);
}

function validateImage(image) {
  if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height) ||
      !image.data || image.data.length < image.width * image.height * 4) {
    throw new Error('照片数据无效');
  }
}

/** Detect the dominant green/blue felt component and return corners TL, TR, BR, BL. */
export function detectTableQuad(image) {
  validateImage(image);
  const { width, height, data } = image;
  const bins = new Float64Array(36);
  const step = Math.max(1, Math.floor(Math.min(width, height) / 260));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const hsv = rgbToHsv(data[i], data[i + 1], data[i + 2]);
      if (hsv.h >= 65 && hsv.h <= 230 && hsv.s >= 0.28 && hsv.v >= 0.16) {
        bins[Math.min(35, Math.floor(hsv.h / 10))] += 0.35 + hsv.s;
      }
    }
  }
  let dominantBin = -1;
  for (let i = 0; i < bins.length; i++) if (dominantBin < 0 || bins[i] > bins[dominantBin]) dominantBin = i;
  if (dominantBin < 0 || bins[dominantBin] < 20) throw new Error('未识别到台面，请让绿色或蓝色台呢完整入镜');
  const dominantHue = dominantBin * 10 + 5;

  const mask = new Uint8Array(width * height);
  let maskCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const hsv = rgbToHsv(data[i], data[i + 1], data[i + 2]);
      if (hsv.s >= 0.22 && hsv.v >= 0.12 && hueDistance(hsv.h, dominantHue) <= 32) {
        mask[y * width + x] = 1;
        maskCount++;
      }
    }
  }
  if (maskCount < width * height * 0.08) throw new Error('未识别到台面，请让绿色或蓝色台呢完整入镜');

  // Keep the largest connected felt region so clothing and nearby objects do not shift the corners.
  const visited = new Uint8Array(mask.length);
  let best = [];
  const queue = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;
    let head = 0, tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    const component = [];
    while (head < tail) {
      const p = queue[head++];
      component.push(p);
      const x = p % width, y = Math.floor(p / width);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const n = ny * width + nx;
          if (mask[n] && !visited[n]) { visited[n] = 1; queue[tail++] = n; }
        }
      }
    }
    if (component.length > best.length) best = component;
  }
  if (best.length < width * height * 0.07) throw new Error('未识别到连续台面，请避开遮挡并重新拍摄');

  let corners = [null, null, null, null];
  const scores = [Infinity, -Infinity, -Infinity, Infinity];
  for (const p of best) {
    const x = p % width, y = Math.floor(p / width);
    const sum = x + y, diff = x - y;
    if (sum < scores[0]) { scores[0] = sum; corners[0] = { x, y }; }
    if (diff > scores[1]) { scores[1] = diff; corners[1] = { x, y }; }
    if (sum > scores[2]) { scores[2] = sum; corners[2] = { x, y }; }
    if (diff < scores[3]) { scores[3] = diff; corners[3] = { x, y }; }
  }
  const edgeLength = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const horizontalEdges = edgeLength(corners[0], corners[1]) + edgeLength(corners[2], corners[3]);
  const verticalEdges = edgeLength(corners[1], corners[2]) + edgeLength(corners[3], corners[0]);
  if (verticalEdges > horizontalEdges) {
    // A portrait camera often records the table's long axis vertically.
    corners = [corners[3], corners[0], corners[1], corners[2]];
  }
  const polygonArea = Math.abs(corners.reduce((sum, p, i) => {
    const q = corners[(i + 1) % 4];
    return sum + p.x * q.y - q.x * p.y;
  }, 0)) / 2;
  if (polygonArea < width * height * 0.06) throw new Error('台面范围太小，请靠近一些并重新拍摄');
  const fillRatio = Math.min(1, best.length / Math.max(1, polygonArea));
  const coverage = Math.min(1, polygonArea / (width * height * 0.36));
  return {
    quad: corners,
    dominantHue,
    confidence: Math.max(0, Math.min(1, fillRatio * 0.65 + coverage * 0.35)),
  };
}

function solveLinear(matrix, values) {
  const n = values.length;
  const a = matrix.map((row, i) => [...row, values[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-10) throw new Error('台面透视角度过大，请从更高处重拍');
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const div = a[col][col];
    for (let k = col; k <= n; k++) a[col][k] /= div;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let k = col; k <= n; k++) a[row][k] -= factor * a[col][k];
    }
  }
  return a.map(row => row[n]);
}

function homographyFromRect(quad, width, height) {
  const src = [
    { x: 0, y: 0 }, { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 }, { x: 0, y: height - 1 },
  ];
  const matrix = [], values = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], { x: u, y: v } = quad[i];
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); values.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]); values.push(v);
  }
  return [...solveLinear(matrix, values), 1];
}

function project(h, x, y) {
  const d = h[6] * x + h[7] * y + h[8];
  return { x: (h[0] * x + h[1] * y + h[2]) / d, y: (h[3] * x + h[4] * y + h[5]) / d };
}

export function rectifyTableImage(image, quad, outputWidth = 760, outputHeight = Math.round(outputWidth / 2)) {
  validateImage(image);
  if (!Array.isArray(quad) || quad.length !== 4) throw new Error('台面四角数据无效');
  const width = Math.max(100, Math.round(outputWidth));
  const height = Math.max(50, Math.round(outputHeight));
  const h = homographyFromRect(quad, width, height);
  const out = new Uint8ClampedArray(width * height * 4);
  const { data } = image;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = project(h, x, y);
      const sx = Math.max(0, Math.min(image.width - 1, p.x));
      const sy = Math.max(0, Math.min(image.height - 1, p.y));
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const x1 = Math.min(image.width - 1, x0 + 1), y1 = Math.min(image.height - 1, y0 + 1);
      const fx = sx - x0, fy = sy - y0;
      const oi = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        const a = data[(y0 * image.width + x0) * 4 + c] * (1 - fx) + data[(y0 * image.width + x1) * 4 + c] * fx;
        const b = data[(y1 * image.width + x0) * 4 + c] * (1 - fx) + data[(y1 * image.width + x1) * 4 + c] * fx;
        out[oi + c] = a * (1 - fy) + b * fy;
      }
    }
  }
  return { width, height, data: out };
}

function median(values) {
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

function tableColor(image) {
  const rs = [], gs = [], bs = [];
  const marginX = Math.round(image.width * 0.04), marginY = Math.round(image.height * 0.07);
  const step = Math.max(2, Math.floor(image.width / 160));
  for (let y = marginY; y < image.height - marginY; y += step) {
    for (let x = marginX; x < image.width - marginX; x += step) {
      const i = (y * image.width + x) * 4;
      const hsv = rgbToHsv(image.data[i], image.data[i + 1], image.data[i + 2]);
      if (hsv.h >= 55 && hsv.h <= 240 && hsv.s > 0.18) {
        rs.push(image.data[i]); gs.push(image.data[i + 1]); bs.push(image.data[i + 2]);
      }
    }
  }
  if (rs.length < 20) throw new Error('透视校正后无法确认台呢颜色');
  const rgb = [median(rs), median(gs), median(bs)];
  return { rgb, hsv: rgbToHsv(...rgb) };
}

/** Locate ball-sized color components on an already rectified 2:1 table image. */
export function detectBallsOnTable(image) {
  validateImage(image);
  const { width, height, data } = image;
  const felt = tableColor(image);
  const raw = new Uint8Array(width * height);
  const radius = width * BALL_R / TABLE_W;
  const edge = Math.max(2, Math.ceil(radius * 0.75));
  for (let y = edge; y < height - edge; y++) {
    for (let x = edge; x < width - edge; x++) {
      const i = (y * width + x) * 4;
      const hsv = rgbToHsv(data[i], data[i + 1], data[i + 2]);
      const dr = data[i] - felt.rgb[0], dg = data[i + 1] - felt.rgb[1], db = data[i + 2] - felt.rgb[2];
      const colorDistance = Math.hypot(dr, dg, db) / 441.7;
      const white = hsv.v > 0.68 && hsv.s < 0.34;
      const nonFelt = hueDistance(hsv.h, felt.hsv.h) > 19 || Math.abs(hsv.v - felt.hsv.v) > 0.21 || colorDistance > 0.24;
      if (white || nonFelt) raw[y * width + x] = 1;
    }
  }
  // One-pixel dilation reconnects the white half and colored half of striped balls.
  const mask = raw.slice();
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const p = y * width + x;
    if (!raw[p]) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) mask[(y + dy) * width + x + dx] = 1;
  }

  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const expectedArea = Math.PI * radius * radius;
  const balls = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;
    let head = 0, tail = 0, minX = width, maxX = 0, minY = height, maxY = 0;
    let sx = 0, sy = 0;
    queue[tail++] = start; visited[start] = 1;
    while (head < tail) {
      const p = queue[head++], x = p % width, y = Math.floor(p / width);
      sx += x; sy += y; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if (mask[n] && !visited[n]) { visited[n] = 1; queue[tail++] = n; }
      }
    }
    const area = tail, bw = maxX - minX + 1, bh = maxY - minY + 1;
    if (area < expectedArea * 0.35 || area > expectedArea * 4.2) continue;
    if (bw < radius * 1.05 || bh < radius * 1.05 || bw > radius * 3.4 || bh > radius * 3.4) continue;
    if (Math.min(bw, bh) / Math.max(bw, bh) < 0.53) continue;
    const cx = sx / area, cy = sy / area;
    let total = 0, value = 0, saturation = 0, rr = 0, gg = 0, bb = 0;
    const sampleR = radius * 0.9;
    for (let y = Math.max(0, Math.floor(cy - sampleR)); y <= Math.min(height - 1, Math.ceil(cy + sampleR)); y++) {
      for (let x = Math.max(0, Math.floor(cx - sampleR)); x <= Math.min(width - 1, Math.ceil(cx + sampleR)); x++) {
        if (Math.hypot(x - cx, y - cy) > sampleR) continue;
        const i = (y * width + x) * 4, hsv = rgbToHsv(data[i], data[i + 1], data[i + 2]);
        rr += data[i]; gg += data[i + 1]; bb += data[i + 2]; value += hsv.v; saturation += hsv.s; total++;
      }
    }
    value /= total; saturation /= total;
    const kind = value > 0.68 && saturation < 0.32 ? 'cue' : 'object';
    balls.push({
      x: cx / (width - 1) * TABLE_W,
      y: cy / (height - 1) * TABLE_H,
      kind,
      confidence: Math.max(0, Math.min(1, 1 - Math.abs(area - expectedArea * 1.35) / (expectedArea * 2.8))),
      color: `rgb(${Math.round(rr / total)}, ${Math.round(gg / total)}, ${Math.round(bb / total)})`,
      imageX: cx,
      imageY: cy,
    });
  }
  balls.sort((a, b) => (a.kind === 'cue' ? -1 : 1) - (b.kind === 'cue' ? -1 : 1) || b.confidence - a.confidence);
  // A real table has one cue ball. Keep the most confident white candidate and treat extras as object balls.
  let keptCue = false;
  for (const ball of balls) {
    if (ball.kind === 'cue' && !keptCue) keptCue = true;
    else if (ball.kind === 'cue') ball.kind = 'object';
  }
  return balls.slice(0, 16);
}

export function analyzeTablePhoto(image, options = {}) {
  const table = detectTableQuad(image);
  const outputWidth = options.outputWidth || 760;
  const rectified = rectifyTableImage(image, table.quad, outputWidth, Math.round(outputWidth / 2));
  const balls = detectBallsOnTable(rectified);
  const cue = balls.find(ball => ball.kind === 'cue');
  const objectCount = balls.filter(ball => ball.kind === 'object').length;
  const ballConfidence = cue && objectCount ? balls.reduce((s, b) => s + b.confidence, 0) / balls.length : 0;
  const warnings = [];
  if (!cue) warnings.push('没有可靠识别到白色母球');
  if (!objectCount) warnings.push('没有识别到目标球');
  if (balls.length > 16) warnings.push('识别出的球过多，请减少反光后重拍');
  return {
    ...table,
    rectified,
    balls,
    confidence: table.confidence * 0.55 + ballConfidence * 0.45,
    warnings,
  };
}

/** Select the shortest valid kick route among object-ball / pocket combinations. */
export function findBestPhotoRoute(cue, objects, cushionCount, options = {}) {
  if (!cue || !Array.isArray(objects) || !objects.length) return null;
  const indexes = Number.isInteger(options.targetIndex) ? [options.targetIndex] : objects.map((_, i) => i);
  let best = null;
  for (const index of indexes) {
    const target = objects[index];
    if (!target) continue;
    const obstacles = objects.filter((_, i) => i !== index);
    for (let pocketIndex = 0; pocketIndex < POCKET_POSITIONS.length; pocketIndex++) {
      const pocket = POCKET_POSITIONS[pocketIndex];
      const routes = calculateKickRoutes(cue, target, pocket, obstacles, cushionCount);
      if (!routes.length) continue;
      const cutDistance = Math.hypot(target.x - pocket.x, target.y - pocket.y);
      const score = routes[0].effectiveDist + cutDistance * 0.12;
      if (!best || score < best.score) best = { target, targetIndex: index, pocket, pocketIndex, routes, score };
    }
  }
  return best;
}
