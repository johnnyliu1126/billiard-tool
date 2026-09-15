import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPhotoSession,
  imageToTablePoint,
  tableToImagePoint,
  movePhotoCorner,
  movePhotoMarker,
  addPhotoMarker,
  removePhotoMarker,
  setCueMarker,
  toggleLegalTarget,
  buildPhotoScene,
} from '../photo-session.mjs';
import { TABLE_W, TABLE_H } from '../mirror-method.mjs';

const QUAD = [
  { x: 90, y: 55 }, { x: 710, y: 80 },
  { x: 760, y: 440 }, { x: 45, y: 420 },
];

function analysis() {
  return {
    quad: QUAD,
    balls: [
      { x: 500, y: 500, kind: 'cue', color: 'rgb(240,240,230)' },
      { x: 1600, y: 700, kind: 'object', color: 'rgb(210,30,40)' },
      { x: 2000, y: 350, kind: 'object', color: 'rgb(230,190,30)' },
    ],
  };
}

describe('photo coordinate editing', () => {
  it('round-trips a point through a perspective quadrilateral', () => {
    const table = { x: 1730, y: 840 };
    const image = tableToImagePoint(table, QUAD);
    const restored = imageToTablePoint(image, QUAD);
    assert.ok(Math.abs(restored.x - table.x) < 0.01);
    assert.ok(Math.abs(restored.y - table.y) < 0.01);
  });

  it('retains source-image marker positions and recomputes table coordinates after a corner edit', () => {
    const session = createPhotoSession({ width: 800, height: 500 }, analysis());
    const before = session.markers[1];
    const moved = movePhotoCorner(session, 1, { x: 660, y: 105 });
    const after = moved.markers[1];
    assert.equal(after.sourceX, before.sourceX);
    assert.equal(after.sourceY, before.sourceY);
    assert.notEqual(after.x, before.x);
    assert.deepEqual(session.quad, QUAD, 'editing must not mutate the prior session');
  });

  it('supports moving, adding and deleting ball markers', () => {
    let session = createPhotoSession({ width: 800, height: 500 }, analysis());
    const firstObject = session.markers.find(marker => marker.role === 'object');
    session = movePhotoMarker(session, firstObject.id, { x: 420, y: 240 });
    assert.equal(session.markers.find(marker => marker.id === firstObject.id).sourceX, 420);
    session = addPhotoMarker(session, { x: 520, y: 260 });
    assert.equal(session.markers.length, 4);
    const added = session.markers.at(-1);
    assert.equal(added.role, 'object');
    session = removePhotoMarker(session, added.id);
    assert.equal(session.markers.length, 3);
  });

  it('can reassign the cue ball and select multiple legal targets explicitly', () => {
    let session = createPhotoSession({ width: 800, height: 500 }, analysis());
    const objects = session.markers.filter(marker => marker.role === 'object');
    session = setCueMarker(session, objects[0].id);
    assert.equal(session.markers.filter(marker => marker.role === 'cue').length, 1);
    assert.equal(session.markers.find(marker => marker.id === objects[0].id).role, 'cue');

    const eligible = session.markers.filter(marker => marker.role === 'object');
    session = toggleLegalTarget(session, eligible[0].id);
    session = toggleLegalTarget(session, eligible[1].id);
    const scene = buildPhotoScene(session);
    assert.equal(scene.legalTargets.length, 2);
    assert.ok(scene.cue);
    assert.equal(scene.allObjects.length, 2);
  });

  it('maps the exact four corners to the full Chinese-eight table rectangle', () => {
    const mapped = QUAD.map(point => imageToTablePoint(point, QUAD));
    assert.deepEqual(mapped.map(p => [Math.round(p.x), Math.round(p.y)]), [
      [0, 0], [TABLE_W, 0], [TABLE_W, TABLE_H], [0, TABLE_H],
    ]);
  });
});
