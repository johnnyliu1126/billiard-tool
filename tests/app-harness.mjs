// Run the real page script with a deterministic animation clock.
// Only the DOM/canvas boundary is stubbed; calculations and simulation are real.
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

export async function createApp() {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  let script = html.match(/<script(?: type="module")?>([\s\S]*?)<\/script>/)[1];
  const globals = {};
  for (const match of script.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/g)) {
    const module = await import(new URL('../' + match[2], import.meta.url));
    for (const binding of match[1].split(',')) {
      const [name, alias] = binding.trim().split(/\s+as\s+/);
      if (name) globals[alias || name] = module[name];
    }
  }
  script = script.replace(/import\s*\{[^}]+\}\s*from\s*['"][^'"]+['"];?/g, '');
  const context2d = new Proxy({}, { get: (_, key) => key.startsWith('create') ? () => ({ addColorStop() {} }) : () => {} });
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} },
      parentElement: { clientWidth: 800, clientHeight: 500 },
      addEventListener() {}, querySelectorAll: () => [], getContext: () => context2d,
      setAttribute() {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 150, height: 150 }),
      focus() {},
    });
    return elements.get(id);
  };
  let now = 0, id = 0;
  const callbacks = new Map();
  const context = vm.createContext({
    ...globals, console, URLSearchParams, setTimeout, clearTimeout,
    performance: { now: () => now },
    window: { devicePixelRatio: 1, addEventListener() {}, location: { search: '' } },
    document: { getElementById: element, querySelectorAll: () => [], addEventListener() {} },
    requestAnimationFrame(fn) { callbacks.set(++id, fn); return id; },
    cancelAnimationFrame(id) { callbacks.delete(id); },
  });
  vm.runInContext(script, context);
  const run = source => vm.runInContext(source, context);
  run('soundEnabled = false');
  return {
    run, element,
    get pendingFrames() { return callbacks.size; },
    tick(time) {
      now = time;
      const frame = [...callbacks.values()]; callbacks.clear();
      frame.forEach(fn => fn(now));
    },
    advance(ms, hz = 60) {
      const start = now;
      for (let i = 1; i <= Math.round(ms * hz / 1000); i++) this.tick(start + i * 1000 / hz);
    },
  };
}

export const SETUP_SHOT = `
  balls = [{type:'cue',x:800,y:600},{type:'target',x:2000,y:900}];
  pocketTarget = {x:2540,y:0};
  cueSpeed = 1;
  const testRoute = {points:[{x:800,y:600}],cushionPoints:[{x:2400,y:600}],sequence:['right']};
  runSimulation(testRoute);
`;
