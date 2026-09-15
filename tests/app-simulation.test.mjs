import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, SETUP_SHOT } from './app-harness.mjs';

test('simulation advances the same physical distance at 60 Hz and 120 Hz', async () => {
  const slow = await createApp(), fast = await createApp();
  slow.run(SETUP_SHOT); fast.run(SETUP_SHOT);
  slow.advance(300, 60); fast.advance(300, 120);
  assert.ok(Math.abs(slow.run('simPhysicsBodies[0].x') - fast.run('simPhysicsBodies[0].x')) < 0.01);
});

test('stopping and immediately restarting does not leave an old simulation callback', async () => {
  const clean = await createApp(), restarted = await createApp();
  clean.run(SETUP_SHOT); restarted.run(SETUP_SHOT);
  restarted.run('stopSimulation(); runSimulation(testRoute)');
  assert.equal(restarted.pendingFrames, clean.pendingFrames);
  clean.advance(300); restarted.advance(300);
  const actual = restarted.run('physicsTrails[0].points.length');
  assert.equal(actual, clean.run('physicsTrails[0].points.length'));
});

test('target entering a different pocket is reported as wrong pocket', async () => {
  const app = await createApp(); app.run(SETUP_SHOT);
  app.run(`for (const b of simPhysicsBodies) { b.vx=0; b.vy=0; b.omega=0; b.wx=0; b.wy=0; }
    simPhysicsBodies[1].x=0; simPhysicsBodies[1].y=0;`);
  app.advance(3000);
  assert.equal(app.run('simResult?.wrongPocket'), true);
  assert.equal(app.run('simResult?.success'), false);
});

test('target pocketing does not hide a subsequent cue scratch', async () => {
  const app = await createApp(); app.run(SETUP_SHOT);
  app.run(`simPhysicsBodies[1].x=2540; simPhysicsBodies[1].y=0;`);
  app.advance(300);
  assert.equal(app.run('simRunning'), true, 'keep simulating the moving cue after target pockets');
  app.run(`simPhysicsBodies[0].x=0; simPhysicsBodies[0].y=0;`);
  app.advance(3000);
  assert.equal(app.run('simResult?.cueScratched'), true);
  assert.equal(app.run('simResult?.success'), false);
});

test('cue-face offset controls side-spin strength continuously', async () => {
  const app = await createApp();
  app.run(SETUP_SHOT);
  const weak = app.run('stopSimulation(); cueSpin="right"; cueFaceHitX=.7; runSimulation(testRoute); simPhysicsBodies[0].sideOmega');
  const strong = app.run('stopSimulation(); cueFaceHitX=.9; runSimulation(testRoute); simPhysicsBodies[0].sideOmega');
  assert.ok(Math.abs(strong) > Math.abs(weak) * 1.9);
});

test('editing the layout clears a stale manually adjusted route', async () => {
  const app = await createApp(); app.run(SETUP_SHOT);
  app.run('stopSimulation(); customRoute=testRoute; hasCalculated=true; addBall(1400,900,"obstacle")');
  assert.equal(app.run('customRoute'), null);
  assert.equal(app.run('hasCalculated'), false);
});

test('a 10 m/s rail impact rebounds once without gaining speed', async () => {
  const app = await createApp();
  app.run(`balls=[{type:'cue',x:800,y:635}]; pocketTarget={x:1270,y:0}; cueSpeed=10;
    cueFaceHitX=.5; cueFaceHitY=.5;
    testRoute={points:[{x:800,y:635}],cushionPoints:[{x:2540,y:635}],sequence:['right']};
    runSimulation(testRoute);`);
  app.advance(350, 120);
  const body = app.run('simPhysicsBodies[0]');
  assert.ok(body.x >= 28.575 && body.x <= 2540 - 28.575);
  assert.ok(body.vx < 0, 'ball must be travelling away from the rail');
  assert.ok(Math.hypot(body.vx, body.vy) < 10000, 'passive rail must not add speed');
});

test('a high-speed shot through a side-pocket mouth is not bounced by the safety clamp', async () => {
  const app = await createApp();
  app.run(`balls=[{type:'cue',x:1270,y:300}]; pocketTarget={x:1270,y:0}; cueSpeed=10;
    cueFaceHitX=.5; cueFaceHitY=.5;
    testRoute={points:[{x:1270,y:300}],cushionPoints:[{x:1270,y:0}],sequence:['top']};
    runSimulation(testRoute);`);
  app.advance(100, 120);
  assert.equal(app.run('simResult?.cueScratched'), true);
});

test('a fast impact just outside a side-pocket mouth uses the spin-aware cushion response', async () => {
  const app = await createApp();
  app.run(`balls=[{type:'cue',x:1320,y:300}]; pocketTarget={x:1270,y:0}; cueSpeed=10;
    cueFaceHitX=.5; cueFaceHitY=.5;
    testRoute={points:[{x:1320,y:300}],cushionPoints:[{x:1320,y:0}],sequence:['top']};
    runSimulation(testRoute); simPhysicsBodies[0].vx=0; simPhysicsBodies[0].vy=-10000; simPhysicsBodies[0].sideOmega=100;`);
  app.advance(50, 120);
  assert.ok(app.run('simPhysicsBodies[0].vy') > 0, 'ball should rebound into the table');
  assert.ok(Math.abs(app.run('simPhysicsBodies[0].vx')) > 1, 'rail friction should couple side spin into tangential speed');
});
