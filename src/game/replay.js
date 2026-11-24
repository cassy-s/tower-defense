// Replays. The simulation is deterministic, so a game is fully described by
// how it started (map, difficulty, RNG seed, or the save it resumed from) and
// the player's commands with the simulation tick each happened on
// (Game.command). Pure logic: runs in Node too, so tests can check that a
// recorded game replays to exactly the same end.
//
// A replay is a list of segments. A new game is one segment. Each time a run
// is resumed from its autosave, a new segment starts from that save (the
// resumed game reseeds its RNG, so it can't be one continuous stream).
//
//   { v, sim, map, diff, segs: [{ seed, start: save|null, cmds: [[tick, op, ...args]], end }], result }
import { Game, CMD } from './game.js';

export const REPLAY_VERSION = 1;

/** A segment for a game that is being played right now. */
export function liveSegment(game, seed, start) {
  return { seed, start, cmds: game.log, end: game.tick };
}

/** Snapshot of a finished (or saved) run's replay. Copies the live command list. */
export function makeReplay(game, segs, result = null) {
  return {
    v: REPLAY_VERSION, sim: simVersion(), map: game.mapId, diff: game.difficultyId,
    segs: segs.map((s) => ({ ...s, cmds: s.cmds.slice(), end: s.end })),
    result,
  };
}

/** What the end of a game looked like, to check a replay played out the same. */
export const resultOf = (g) => ({ state: g.state, wave: g.wave, lives: g.lives, kills: g.stats.kills, cash: g.cash });
export const sameResult = (a, b) => !!a && !!b && a.state === b.state && a.wave === b.wave && a.lives === b.lives && a.kills === b.kills && a.cash === b.cash;

/** A save without the parts a replay doesn't need. */
export function startOf(save) {
  if (!save) return null;
  const { replay, savedAt, ...rest } = save;
  return rest;
}

/** Steps a replay forward one simulation tick at a time. */
export class ReplayPlayer {
  constructor(replay) {
    if (!replay || replay.v !== REPLAY_VERSION || !Array.isArray(replay.segs) || !replay.segs.length) throw new Error('Not a replay');
    this.replay = replay;
    this.segIndex = -1;
    this.totalTicks = replay.segs.reduce((n, s) => n + s.end, 0);
    this.ticksBefore = 0;   // ticks in the segments already played
    this.openSegment(0);
  }

  get seg() { return this.replay.segs[this.segIndex]; }
  get lastSegment() { return this.segIndex === this.replay.segs.length - 1; }
  /** Played ticks over all segments, for the progress bar. */
  get tick() { return this.ticksBefore + this.game.tick; }
  get done() { return this.game.state !== 'playing' || (this.lastSegment && this.game.tick >= this.seg.end); }

  openSegment(i) {
    if (this.segIndex >= 0) this.ticksBefore += this.seg.end;
    this.segIndex = i;
    const s = this.seg, r = this.replay;
    const g = s.start ? Game.fromSave(s.start, { seed: s.seed }) : new Game({ mapId: r.map, difficulty: r.diff, seed: s.seed });
    if (!g) throw new Error('Replay segment cannot be loaded');
    this.game = g;
    this.cmd = 0;
  }

  /**
   * One simulation step: the commands for this tick, then Game.update.
   * Returns 'segment' when it moved on to the next segment (a new Game, so
   * the view must switch to it), 'done' at the end, otherwise null.
   */
  step(dt) {
    const s = this.seg;
    if (!this.lastSegment && this.game.tick >= s.end) { this.openSegment(this.segIndex + 1); return 'segment'; }
    if (this.done) return 'done';
    const g = this.game, cmds = s.cmds;
    while (this.cmd < cmds.length && cmds[this.cmd][0] <= g.tick) {
      const c = cmds[this.cmd++];
      g.runCommand(c[1], c.slice(2));
    }
    g.update(dt);
    return null;
  }

  /** Plays to the end without drawing anything. Returns the final game. */
  runToEnd(dt) {
    let guard = this.totalTicks + 10;
    while (!this.done && guard-- > 0) this.step(dt);
    return this.game;
  }
}

/**
 * Which version of the simulation is running: a hash of the content hashes of
 * the game and config modules in index.html's import map. A replay recorded on
 * another version may play out differently. 'dev' outside the browser.
 */
let cachedSim = null;
export function simVersion() {
  return (cachedSim ||= readSimVersion());
}

function readSimVersion() {
  if (typeof document === 'undefined') return 'dev';
  const map = document.querySelector('script[type="importmap"]');
  if (!map) return 'dev';
  let parts = '';
  try {
    const imports = JSON.parse(map.textContent).imports || {};
    for (const k of Object.keys(imports).sort()) if (/\/src\/(game|config)\//.test(k)) parts += imports[k];
  } catch { return 'dev'; }
  let h = 0x811c9dc5;
  for (let i = 0; i < parts.length; i++) { h ^= parts.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ------------------------------------------------------------- sharing ---
// A replay travels as compressed JSON in the address bar (#replay=...).
// Before compressing, commands are packed into one flat list per segment:
// ticks become the gap since the previous command, and placement coordinates
// (always multiples of 1/64) become whole numbers. A third shorter link.

/** How many arguments each command takes. */
const ARGS = { [CMD.place]: 3, [CMD.upgrade]: 1, [CMD.sell]: 1, [CMD.wave]: 0, [CMD.auto]: 1, [CMD.target]: 2, [CMD.ability]: 1, [CMD.delay]: 1 };

export function packCmds(cmds) {
  const out = [];
  let last = 0;
  for (const c of cmds) {
    out.push(c[0] - last, c[1]);
    last = c[0];
    if (c[1] === CMD.place) out.push(c[2], c[3] * 64, c[4] * 64);
    else for (let i = 2; i < c.length; i++) out.push(c[i]);
  }
  return out;
}

export function unpackCmds(flat) {
  const cmds = [];
  let tick = 0;
  for (let i = 0; i < flat.length;) {
    tick += flat[i];
    const op = flat[i + 1];
    const n = ARGS[op];
    if (n === undefined) throw new Error(`Unknown replay command ${op}`);
    const args = flat.slice(i + 2, i + 2 + n);
    if (op === CMD.place) { args[1] /= 64; args[2] /= 64; }
    cmds.push([tick, op, ...args]);
    i += 2 + n;
  }
  return cmds;
}

async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeReplay(replay) {
  const packed = { ...replay, packed: 1, segs: replay.segs.map((s) => ({ ...s, cmds: packCmds(s.cmds) })) };
  const bytes = await pipe(new TextEncoder().encode(JSON.stringify(packed)), new CompressionStream('deflate-raw'));
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function decodeReplay(code) {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const json = new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate-raw')));
  const r = JSON.parse(json);
  if (r.packed) {
    delete r.packed;
    for (const s of r.segs || []) s.cmds = unpackCmds(s.cmds);
  }
  return r;
}
