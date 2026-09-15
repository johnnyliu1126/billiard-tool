import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectTableQuad,
  rectifyTableImage,
  detectBallsOnTable,
  analyzeTablePhoto,
  findBestPhotoRoute,
} from '../photo-detection.mjs';
import { TABLE_W, TABLE_H, POCKET_POSITIONS } from '../mirror-method.mjs';

function image(width, height, color = [18, 20, 24, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(color, i);
  return { width, height, data };
}

function setPixel(img, x, y, color) {
  const i = (y * img.width + x) * 4;
  img.data.set(color, i);
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function fillPolygon(img, points, color) {
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (pointInPolygon(x + 0.5, y + 0.5, points)) setPixel(img, x, y, color);
    }
  }
}

function circle(img, cx, cy, radius, color) {
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      if (x >= 0 && y >= 0 && x < img.width && y < img.height && Math.hypot(x - cx, y - cy) <= radius) {
        setPixel(img, x, y, color);
      }
    }
  }
}

describe('table detection and perspective correction', () => {
  it('detects a trapezoidal green table amid a dark background', () => {
    const img = image(320, 220);
    const expected = [
      { x: 58, y: 40 }, { x: 270, y: 55 },
      { x: 294, y: 186 }, { x: 30, y: 176 },
    ];
    fillPolygon(img, expected, [20, 118, 79, 255]);
    const result = detectTableQuad(img);
    assert.ok(result.confidence > 0.7);
    result.quad.forEach((p, i) => {
      assert.ok(Math.hypot(p.x - expected[i].x, p.y - expected[i].y) < 9,
        `corner ${i} should be close to the felt corner`);
    });
  });

  it('rotates a portrait photo so the long table axis becomes horizontal', () => {
    const img = image(250, 340);
    fillPolygon(img, [
      { x: 74, y: 24 }, { x: 186, y: 38 },
      { x: 176, y: 310 }, { x: 55, y: 294 },
    ], [20, 118, 79, 255]);
    const { quad } = detectTableQuad(img);
    const mappedWidth = Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y);
    const mappedHeight = Math.hypot(quad[2].x - quad[1].x, quad[2].y - quad[1].y);
    assert.ok(mappedWidth > mappedHeight, 'the source long edge must map to table width');
  });

  it('rejects a photo without a sufficiently large felt-colored surface', () => {
    assert.throws(() => detectTableQuad(image(240, 160)), /未识别到台面/);
  });

  it('rectifies the detected felt area to a 2:1 table image', () => {
    const img = image(300, 200);
    fillPolygon(img, [
      { x: 42, y: 28 }, { x: 260, y: 42 },
      { x: 278, y: 170 }, { x: 25, y: 162 },
    ], [18, 124, 77, 255]);
    const detected = detectTableQuad(img);
    const rectified = rectifyTableImage(img, detected.quad, 400, 200);
    assert.equal(rectified.width, 400);
    assert.equal(rectified.height, 200);
    const center = (100 * rectified.width + 200) * 4;
    assert.ok(rectified.data[center + 1] > rectified.data[center]);
  });
});

describe('ball detection', () => {
  it('finds the white cue ball and colored object balls in logical table coordinates', () => {
    const img = image(508, 254, [18, 126, 80, 255]);
    circle(img, 102, 70, 6, [240, 238, 226, 255]);
    circle(img, 320, 116, 6, [225, 42, 38, 255]);
    circle(img, 400, 190, 6, [241, 195, 25, 255]);
    const found = detectBallsOnTable(img);
    assert.equal(found.filter(b => b.kind === 'cue').length, 1);
    assert.equal(found.filter(b => b.kind === 'object').length, 2);
    const cue = found.find(b => b.kind === 'cue');
    assert.ok(Math.abs(cue.x - 102 / 507 * TABLE_W) < 45);
    assert.ok(Math.abs(cue.y - 70 / 253 * TABLE_H) < 45);
  });

  it('runs the complete analysis and returns a usable confidence value', () => {
    const img = image(600, 360);
    fillPolygon(img, [
      { x: 60, y: 45 }, { x: 540, y: 45 },
      { x: 540, y: 315 }, { x: 60, y: 315 },
    ], [20, 122, 78, 255]);
    circle(img, 175, 130, 7, [242, 240, 230, 255]);
    circle(img, 390, 215, 7, [215, 36, 42, 255]);
    const result = analyzeTablePhoto(img, { outputWidth: 508 });
    assert.equal(result.balls.length, 2);
    assert.ok(result.confidence > 0.45);
  });

  it('detects a green object ball whose color is close to the felt', () => {
    const img = image(508, 254, [18, 126, 80, 255]);
    circle(img, 102, 70, 6, [240, 238, 226, 255]);
    circle(img, 320, 116, 6, [25, 145, 70, 255]);
    const found = detectBallsOnTable(img);
    assert.equal(found.filter(ball => ball.kind === 'object').length, 1);
  });

  it('does not report a soft felt shadow as an object ball', () => {
    const img = image(508, 254, [18, 126, 80, 255]);
    circle(img, 102, 70, 6, [240, 238, 226, 255]);
    circle(img, 320, 116, 6, [9, 63, 40, 255]);
    const found = detectBallsOnTable(img);
    assert.equal(found.filter(ball => ball.kind === 'object').length, 0);
  });

  it('separates two touching object balls', () => {
    const img = image(508, 254, [18, 126, 80, 255]);
    circle(img, 102, 70, 6, [240, 238, 226, 255]);
    circle(img, 320, 116, 6, [225, 42, 38, 255]);
    circle(img, 332, 116, 6, [241, 195, 25, 255]);
    const found = detectBallsOnTable(img);
    assert.equal(found.filter(ball => ball.kind === 'object').length, 2);
  });

  it('keeps a full-sized cue ball instead of a smaller white glare spot', () => {
    const img = image(508, 254, [18, 126, 80, 255]);
    circle(img, 102, 70, 6, [240, 238, 226, 255]);
    circle(img, 250, 110, 4, [255, 255, 255, 255]);
    circle(img, 340, 150, 6, [225, 42, 38, 255]);
    const cue = detectBallsOnTable(img).find(ball => ball.kind === 'cue');
    assert.ok(Math.abs(cue.imageX - 102) < 5);
  });
});

describe('automatic route choice from a photo', () => {
  it('tries every object ball and pocket and returns a route for the selected cushion count', () => {
    const cue = { x: 600, y: 600, kind: 'cue' };
    const objects = [
      { x: 1900, y: 600, kind: 'object' },
      { x: 1500, y: 250, kind: 'object' },
    ];
    const best = findBestPhotoRoute(cue, objects, 1);
    assert.ok(best);
    assert.ok(objects.includes(best.target));
    assert.ok(POCKET_POSITIONS.includes(best.pocket));
    assert.ok(best.routes.length > 0);
    assert.equal(best.routes[0].sequence.length, 1);
  });

  it('can constrain the automatic pocket search to one chosen object ball', () => {
    const cue = { x: 600, y: 600, kind: 'cue' };
    const objects = [
      { x: 1900, y: 600, kind: 'object' },
      { x: 1500, y: 250, kind: 'object' },
    ];
    const best = findBestPhotoRoute(cue, objects, 1, { targetIndex: 1 });
    assert.ok(best);
    assert.strictEqual(best.target, objects[1]);
  });

  it('searches only the explicitly selected set of legal targets', () => {
    const cue = { x: 600, y: 600, kind: 'cue' };
    const objects = [
      { x: 1900, y: 600, kind: 'object' },
      { x: 1500, y: 250, kind: 'object' },
      { x: 900, y: 900, kind: 'object' },
    ];
    const best = findBestPhotoRoute(cue, objects, 1, { targetIndexes: [0] });
    assert.ok(best);
    assert.equal(best.targetIndex, 0);
  });
});
