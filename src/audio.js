// Tiny synthesized sound effects (no audio files needed). Every sound is
// rate-limited so 3x speed with 40 towers doesn't turn into noise.
let ctx = null, master = null, noiseBuf = null;
const last = {};
const MIN_GAP = { shot: 0.05, sniper: 0.12, minigun: 0.06, shotgun: 0.1, flame: 0.12, zap: 0.1, bolt: 0.08, launch: 0.12, die: 0.06, explode: 0.08, spit: 0.3, leak: 0.2 };

export const audio = {
  volume: 0.5,
  muted: false,
  init() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = this.muted ? 0 : this.volume;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch { ctx = null; }
  },
  setVolume(v) { this.volume = v; if (master) master.gain.value = this.muted ? 0 : v; },
  setMuted(m) { this.muted = m; if (master) master.gain.value = m ? 0 : this.volume; },
  play(name) {
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;
    const gap = MIN_GAP[name] ?? 0.05;
    if (last[name] && now - last[name] < gap) return;
    last[name] = now;
    const fn = SOUNDS[name];
    if (fn) fn(now);
  },
};

function noise(t, dur, { freq = 1000, q = 1, type = 'bandpass', gain = 0.3, attack = 0.002, sweep = null } = {}) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
}

function tone(t, dur, { freq = 440, to = null, type = 'sine', gain = 0.2, attack = 0.005 } = {}) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

const SOUNDS = {
  shot: (t) => { noise(t, 0.08, { freq: 1800, q: 0.8, gain: 0.16 }); tone(t, 0.05, { freq: 180, to: 60, type: 'square', gain: 0.05 }); },
  minigun: (t) => noise(t, 0.05, { freq: 2200, q: 1, gain: 0.1 }),
  sniper: (t) => { noise(t, 0.3, { freq: 900, q: 0.6, gain: 0.32, sweep: 200 }); tone(t, 0.18, { freq: 120, to: 40, type: 'square', gain: 0.12 }); },
  shotgun: (t) => { noise(t, 0.22, { freq: 700, q: 0.5, gain: 0.32, type: 'lowpass', sweep: 200 }); },
  flame: (t) => noise(t, 0.2, { freq: 400, q: 0.4, gain: 0.08, type: 'lowpass' }),
  zap: (t) => { tone(t, 0.15, { freq: 1400, to: 180, type: 'sawtooth', gain: 0.07 }); noise(t, 0.1, { freq: 5000, q: 2, gain: 0.06 }); },
  bolt: (t) => { tone(t, 0.12, { freq: 520, to: 1400, type: 'square', gain: 0.05 }); noise(t, 0.06, { freq: 3000, gain: 0.08 }); },
  launch: (t) => { tone(t, 0.15, { freq: 240, to: 90, type: 'triangle', gain: 0.2 }); noise(t, 0.1, { freq: 600, gain: 0.1 }); },
  explode: (t) => { noise(t, 0.6, { freq: 500, q: 0.4, gain: 0.4, type: 'lowpass', sweep: 60 }); tone(t, 0.4, { freq: 90, to: 30, type: 'sine', gain: 0.3 }); },
  die: (t) => { tone(t, 0.18, { freq: 160 + Math.random() * 60, to: 70, type: 'sawtooth', gain: 0.05 }); noise(t, 0.1, { freq: 400, gain: 0.08 }); },
  bossDie: (t) => { tone(t, 1.2, { freq: 110, to: 30, type: 'sawtooth', gain: 0.2 }); noise(t, 1.0, { freq: 300, gain: 0.3, type: 'lowpass', sweep: 50 }); },
  boss: (t) => { tone(t, 1.4, { freq: 70, to: 55, type: 'sawtooth', gain: 0.18, attack: 0.2 }); tone(t + 0.1, 1.2, { freq: 104, to: 82, type: 'sawtooth', gain: 0.1, attack: 0.2 }); },
  spit: (t) => { noise(t, 0.2, { freq: 900, q: 3, gain: 0.15, sweep: 300 }); },
  leak: (t) => { tone(t, 0.3, { freq: 220, to: 110, type: 'square', gain: 0.12 }); },
  place: (t) => { tone(t, 0.12, { freq: 180, to: 90, type: 'triangle', gain: 0.25 }); noise(t, 0.12, { freq: 300, gain: 0.15, type: 'lowpass' }); },
  upgrade: (t) => { [523, 659, 784, 1046].forEach((f, i) => tone(t + i * 0.06, 0.18, { freq: f, type: 'triangle', gain: 0.12 })); },
  sell: (t) => { tone(t, 0.08, { freq: 988, type: 'square', gain: 0.06 }); tone(t + 0.08, 0.2, { freq: 1318, type: 'square', gain: 0.06 }); },
  click: (t) => tone(t, 0.05, { freq: 700, to: 500, type: 'triangle', gain: 0.1 }),
  error: (t) => { tone(t, 0.12, { freq: 200, type: 'square', gain: 0.08 }); tone(t + 0.12, 0.15, { freq: 150, type: 'square', gain: 0.08 }); },
  wave: (t) => { tone(t, 0.5, { freq: 196, type: 'sawtooth', gain: 0.1, attack: 0.05 }); tone(t + 0.25, 0.7, { freq: 262, type: 'sawtooth', gain: 0.1, attack: 0.05 }); },
  waveEnd: (t) => { [392, 523, 659].forEach((f, i) => tone(t + i * 0.08, 0.25, { freq: f, type: 'triangle', gain: 0.12 })); },
  plane: (t) => { noise(t, 2.0, { freq: 200, q: 0.5, gain: 0.25, type: 'lowpass', attack: 0.6 }); },
  win: (t) => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(t + i * 0.12, 0.4, { freq: f, type: 'triangle', gain: 0.15 })); },
  lose: (t) => { [392, 330, 262, 196].forEach((f, i) => tone(t + i * 0.2, 0.5, { freq: f, type: 'sawtooth', gain: 0.1 })); },
};
