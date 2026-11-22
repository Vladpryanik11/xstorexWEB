/**
 * The intro's timeline, sound and star field (spec 2026-11-22-intro), ported from the owner's
 * xstorex-intro.html. Imperative on purpose: one canvas, one audio graph and a few text effects on
 * a frame clock. `createIntro` wires the gate; the returned function stops everything.
 */

type Classes = Readonly<Record<string, string>>;
type Task = { step(t: number): boolean };
type MusicRun = {
  T0: number;
  q: [number, () => void][];
  dry: GainNode;
  wet: GainNode;
  echo: GainNode;
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(arr: readonly T[] | string): T =>
  (arr as readonly T[])[(Math.random() * arr.length) | 0] as T;

/* ================= SCORE ================= */
/* F pedal under floating F-lydian chords at 129 BPM, eighth-note arpeggio, a slow glassy lead
   and high bell sparkle. Bar 11 (beat 40) is the arrival. */
const BPM = 129;
const BEAT = 60 / BPM;
const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const hz = (n: string): number => {
  const m = /^([A-G])(#|b)?(\d)$/.exec(n);
  if (!m) return 440;
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return 440 * 2 ** ((12 * (Number(m[3]) + 1) + (PC[m[1] ?? 'A'] ?? 9) + acc - 69) / 12);
};
const notes = (s: string) => (s ? s.split(' ').map(hz) : []);
const SCORE = [
  { pad: 'D4 F4 A4 B4', arp: 'F4 A4 B4 D5' }, // 1  Dm6/F
  { pad: 'D4 F4 A4 B4', arp: 'D5 B4 A4 F4' }, // 2
  { pad: 'D4 F4 A4 C5', arp: 'F4 A4 C5 D5' }, // 3  Dm7/F
  { pad: 'C4 E4 F4 A4', arp: 'C4 F4 A4 C5' }, // 4  Fmaj7
  { pad: 'C4 E4 F4 A4', arp: 'E5 C5 A4 F4' }, // 5
  { pad: 'D4 E4 F4 A4 C5', arp: 'D4 A4 C5 E5' }, // 6  Dm9/F   logo lights up
  { pad: 'C4 D4 G4 B4', arp: 'B4 G4 D5 C5' }, // 7  G/F
  { pad: 'C4 E4 G4 D5', arp: '' }, // 8  C(add9)/F  letters dissolve, breath
  { pad: 'F4 A4 C5 G5', arp: 'F4 A4 C5 G5' }, // 9  F(add9)    the star starts to come
  { pad: 'D4 G4 B4 D5', arp: 'G4 B4 D5 G5' }, // 10 G/F        tension
  { pad: 'C4 F4 A4 D5 G5', arp: 'F4 A4 C5 G5' }, // 11 F6/9       arrival
  { pad: 'C4 F4 A4 D5 G5', arp: '' }, // 12 ring out
];
const LEAD: [number, string, number][] = [
  [0, 'A5', 4],
  [4, 'G5', 2],
  [6, 'F5', 2],
  [8, 'A5', 2],
  [10, 'F5', 2],
  [12, 'F5', 3],
  [15, 'E5', 1],
  [16, 'F5', 2],
  [18, 'E5', 2],
  [20, 'F5', 2],
  [22, 'A5', 2],
  [24, 'G5', 3],
  [27, 'F5', 1],
  [28, 'G5', 4],
  [32, 'A5', 2],
  [34, 'C6', 2],
  [36, 'D6', 2],
  [38, 'C6', 1],
  [39, 'D6', 1],
  [40, 'A5', 6],
];
const SPARKLE = [0.12, 0.15, 0.18, 0.2, 0.22, 0.3, 0.32, 0.35, 0.4, 0.55, 0.45, 0.2];
/** Music ends at beat 55; the audio graph is closed a little after. */
const MUSIC_END_S = 56 * BEAT;

const GLYPHS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789#%&*+=<>/\\|ЖЗИЛФЦШЭЮЯ';
const BAR = BEAT * 4000; // ms

export type IntroHandle = { dispose(): void };

export function createIntro(
  root: HTMLElement,
  cls: Classes,
  opts: { onStart?(): void; onDone(): void },
): IntroHandle {
  const part = <T extends HTMLElement>(name: string) =>
    root.querySelector(`[data-part="${name}"]`) as T;
  const c = (name: string) => cls[name] ?? name;
  const stage = part('stage');
  const cv = part<HTMLCanvasElement>('space');
  const hud = part('hud');
  const log = part('log');
  const logo = part('logo');
  const rule = part('rule');
  const tag = part('tag');
  const sub = part('sub');
  const gate = part('gate');
  const startBtn = part<HTMLButtonElement>('start');
  const skipBtn = part<HTMLButtonElement>('skip');
  const flash = part('flash');
  const clock = part('clock');
  const raEl = part('ra');
  const html = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let disposed = false;
  let arrived = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.delete(id);
      if (!disposed) fn();
    }, ms);
    timers.add(id);
  };

  /* ================= AUDIO ================= */
  let ctx: AudioContext | null = null;
  let master: GainNode;
  let revIn: GainNode;
  let dlyIn: GainNode;
  let music: MusicRun | null = null;
  let muted = true;
  let lastTick = 0;
  let pumpTimer: ReturnType<typeof setInterval> | null = null;
  let silentLoop: HTMLAudioElement | null = null;
  let silentUrl = '';

  const now = () => (ctx ? ctx.currentTime : 0);

  function makeIR(seconds: number, decay: number) {
    const a = ctx as AudioContext;
    const len = a.sampleRate * seconds;
    const buf = a.createBuffer(2, len, a.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
    }
    return buf;
  }

  function initAudio() {
    if (ctx) return;
    const AC =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    // iPhone mutes Web Audio on the silent switch unless the page asks for playback.
    try {
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = 'playback';
    } catch {}
    try {
      const n = 4800;
      const b = new ArrayBuffer(44 + n * 2);
      const v = new DataView(b);
      const w = (o: number, str: string) => {
        for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i));
      };
      w(0, 'RIFF');
      v.setUint32(4, 36 + n * 2, true);
      w(8, 'WAVEfmt ');
      v.setUint32(16, 16, true);
      v.setUint16(20, 1, true);
      v.setUint16(22, 1, true);
      v.setUint32(24, 48000, true);
      v.setUint32(28, 96000, true);
      v.setUint16(32, 2, true);
      v.setUint16(34, 16, true);
      w(36, 'data');
      v.setUint32(40, n * 2, true);
      silentUrl = URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
      silentLoop = new Audio(silentUrl);
      silentLoop.loop = true;
      silentLoop.setAttribute('playsinline', '');
      silentLoop.play().catch(() => {});
    } catch {}
    ctx = new AC();
    const a = ctx;
    master = a.createGain();
    master.gain.value = 0.85;
    const comp = a.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    master.connect(comp).connect(a.destination);
    const rev = a.createConvolver();
    rev.buffer = makeIR(3.4, 2.2);
    revIn = a.createGain();
    revIn.gain.value = 0.55;
    revIn.connect(rev).connect(master);
    const dly = a.createDelay(1.5);
    dly.delayTime.value = BEAT * 0.75;
    const fb = a.createGain();
    fb.gain.value = 0.38;
    const dlp = a.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 3200;
    dlyIn = a.createGain();
    dlyIn.gain.value = 1;
    dlyIn.connect(dly);
    dly.connect(dlp);
    dlp.connect(fb).connect(dly);
    const dOut = a.createGain();
    dOut.gain.value = 0.3;
    dlp.connect(dOut).connect(master);
    dlp.connect(revIn);
    pumpTimer = setInterval(pump, 100);
  }

  /** Stops the sound for good: the context, the scheduler and the silent iPhone loop. */
  function closeAudio() {
    if (pumpTimer) clearInterval(pumpTimer);
    pumpTimer = null;
    music = null;
    if (silentLoop) {
      silentLoop.pause();
      silentLoop = null;
      URL.revokeObjectURL(silentUrl);
    }
    if (ctx) {
      const a = ctx;
      ctx = null;
      a.close().catch(() => {});
    }
  }

  // Route a voice: dry, reverb send, echo send; with a music run R, through that run's own sends.
  function out(node: AudioNode, pan = 0, dry = 1, wet = 0.5, echo = 0, R: MusicRun | null = null) {
    const a = ctx as AudioContext;
    let tail: AudioNode = node;
    if (a.createStereoPanner) {
      const p = a.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      tail = p;
    }
    const g1 = a.createGain();
    g1.gain.value = dry;
    tail.connect(g1).connect(R ? R.dry : master);
    if (wet) {
      const g2 = a.createGain();
      g2.gain.value = wet;
      tail.connect(g2).connect(R ? R.wet : revIn);
    }
    if (echo) {
      const g3 = a.createGain();
      g3.gain.value = echo;
      tail.connect(g3).connect(R ? R.echo : dlyIn);
    }
  }

  function osc(
    type: OscillatorType,
    freq: number,
    t: number,
    stop: number,
    dest: AudioNode,
    gain = 1,
    detune = 0,
  ) {
    const a = ctx as AudioContext;
    const o = a.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = a.createGain();
    g.gain.value = gain;
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(stop);
    return o;
  }

  function bell(freq: number, vel = 0.1, t = now(), R: MusicRun | null = null) {
    const a = ctx as AudioContext;
    const g = a.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    for (const [m, amp] of [
      [1, 1],
      [2.01, 0.28],
      [3.98, 0.08],
      [5.43, 0.03],
    ] as const)
      osc('sine', freq * m, t, t + 3.3, g, amp);
    out(g, rand(-0.6, 0.6), 0.35, 1, 0.7, R);
  }

  function pluck(freq: number, vel: number, t: number, lpf: number, R: MusicRun) {
    const a = ctx as AudioContext;
    const g = a.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    const lp = a.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = lpf;
    lp.Q.value = 0.7;
    osc('triangle', freq, t, t + 1.2, lp);
    osc('sine', freq * 2, t, t + 1.2, lp, 0.3);
    lp.connect(g);
    out(g, rand(-0.35, 0.35), 0.8, 0.55, 0.45, R);
  }

  function lead(freq: number, t: number, dur: number, vel: number, R: MusicRun) {
    const a = ctx as AudioContext;
    const g = a.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.35);
    g.gain.setValueAtTime(vel, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.2);
    const vib = a.createOscillator();
    vib.frequency.value = 5;
    const vg = a.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(6, t + 0.9);
    vib.connect(vg);
    for (const [type, det, amp] of [
      ['sine', 0, 1],
      ['sine', 7, 0.6],
      ['triangle', -5, 0.22],
    ] as const)
      vg.connect(osc(type, freq, t, t + dur + 1.3, g, amp, det).detune);
    vib.start(t);
    vib.stop(t + dur + 1.3);
    out(g, 0, 0.7, 0.9, 0.3, R);
  }

  function padChord(freqs: number[], t: number, tEnd: number, dest: AudioNode) {
    const a = ctx as AudioContext;
    const g = a.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + BEAT * 1.2);
    g.gain.setValueAtTime(1, tEnd);
    g.gain.linearRampToValueAtTime(0, tEnd + BEAT * 1.5);
    g.connect(dest);
    const stop = tEnd + BEAT * 1.6;
    for (const f of freqs) {
      osc('sawtooth', f, t, stop, g, 0.045, -7 + rand(-2, 2));
      osc('sawtooth', f, t, stop, g, 0.045, 7 + rand(-2, 2));
      osc('sine', f, t, stop, g, 0.03);
    }
  }

  /** Schedules the whole piece from now; returns the start time on the audio clock. */
  function startMusic() {
    const a = ctx as AudioContext;
    const T0 = now() + 0.05;
    const at = (b: number) => T0 + b * BEAT;
    const R: MusicRun = {
      T0,
      q: [],
      dry: a.createGain(),
      wet: a.createGain(),
      echo: a.createGain(),
    };
    R.dry.connect(master);
    R.wet.connect(revIn);
    R.echo.connect(dlyIn);
    const sch = (t: number, fn: () => void) => R.q.push([t, fn]); // built just before they sound
    // pad
    const padLP = a.createBiquadFilter();
    padLP.type = 'lowpass';
    padLP.Q.value = 0.8;
    const padBus = a.createGain();
    padLP.connect(padBus);
    out(padBus, 0, 0.7, 0.9, 0, R);
    const lf = padLP.frequency;
    lf.setValueAtTime(480, T0);
    lf.linearRampToValueAtTime(1300, at(20));
    lf.linearRampToValueAtTime(1500, at(27));
    lf.linearRampToValueAtTime(900, at(30));
    lf.linearRampToValueAtTime(2700, at(39.5));
    lf.linearRampToValueAtTime(4200, at(40.3));
    lf.linearRampToValueAtTime(1200, at(50));
    const pg = padBus.gain;
    pg.setValueAtTime(0, T0);
    pg.linearRampToValueAtTime(0.8, T0 + 1.2);
    pg.linearRampToValueAtTime(0.7, at(28));
    pg.linearRampToValueAtTime(0.62, at(32));
    pg.linearRampToValueAtTime(0.95, at(39.8));
    pg.linearRampToValueAtTime(1.05, at(40.5));
    pg.linearRampToValueAtTime(0, at(54));
    for (let i = 0; i < SCORE.length; i++) {
      let j = i;
      while (SCORE[j + 1] && SCORE[j + 1]?.pad === SCORE[i]?.pad) j++;
      const ch = notes(SCORE[i]?.pad ?? '');
      const s = at(i * 4);
      const e = at((j + 1) * 4);
      sch(s, () => padChord(ch, s, e, padLP));
      i = j;
    }
    // F pedal
    const bass = a.createGain();
    const blp = a.createBiquadFilter();
    blp.type = 'lowpass';
    blp.frequency.value = 320;
    bass.gain.setValueAtTime(0, T0);
    bass.gain.linearRampToValueAtTime(0.22, T0 + 1);
    bass.gain.setValueAtTime(0.22, at(39.5));
    bass.gain.linearRampToValueAtTime(0.3, at(40.3));
    bass.gain.linearRampToValueAtTime(0, at(54));
    blp.connect(bass);
    out(bass, 0, 1, 0.25, 0, R);
    osc('sine', hz('F1'), T0, at(55), blp, 1);
    osc('triangle', hz('F2'), T0, at(55), blp, 0.45);
    osc('sine', hz('C3'), T0, at(55), blp, 0.1);
    // arpeggio: eighths, sixteenths while the X approaches
    SCORE.forEach((s, i) => {
      const tones = notes(s.arp);
      if (!tones.length) return;
      const fast = i === 8 || i === 9;
      const steps = fast ? 16 : 8;
      const len = i === 10 ? 8 : steps;
      for (let k = 0; k < len; k++) {
        let v =
          i === 0
            ? 0.042 + k * 0.001
            : i < 8
              ? 0.05
              : i === 8
                ? 0.035 + (0.03 * k) / 16
                : i === 9
                  ? 0.065 + (0.03 * k) / 16
                  : 0.08 * 0.82 ** k;
        if (k % (steps / 4) === 0) v *= 1.25;
        const f = tones[k % tones.length] ?? 440;
        const t = at(i * 4 + (k * 4) / steps);
        const lp = 1400 + i * 160;
        sch(t, () => pluck(f, v, t, lp, R));
      }
    });
    // lead
    for (const [b, n, d] of LEAD)
      sch(at(b), () => lead(hz(n), at(b), d * BEAT, b < 32 ? 0.045 : 0.07, R));
    // sparkle on a sixteenth grid
    const SH = notes('E6 F6 G6 A6 C7 D7');
    SPARKLE.forEach((p, i) => {
      for (let k = 0; k < 16; k++)
        if (Math.random() < p) {
          const t = at(i * 4 + k / 4);
          sch(t, () => bell(pick<number>(SH), rand(0.012, 0.03), t, R));
        }
    });
    // arrival bloom
    notes('F5 A5 C6 D6 G6 A6').forEach((f, k) => {
      sch(at(40) + k * 0.07, () => bell(f, 0.075 - k * 0.008, at(40) + k * 0.07, R));
    });
    R.q.sort((x, y) => x[0] - y[0]);
    music = R;
    pump();
    return T0;
  }

  function pump() {
    if (!music || !ctx) return;
    const lim = now() + 1.2;
    while (music.q.length && (music.q[0]?.[0] ?? Infinity) < lim) music.q.shift()?.[1]();
  }

  function stopMusic(fade = 0.6) {
    if (!music || !ctx) return;
    const t = now();
    for (const gn of [music.dry.gain, music.wet.gain, music.echo.gain]) {
      gn.cancelScheduledValues(t);
      gn.setValueAtTime(gn.value, t);
      gn.linearRampToValueAtTime(0, t + fade + 0.001);
    }
    music = null;
  }

  function beep(
    freq: number,
    dur: number,
    type: OscillatorType = 'square',
    vel = 0.035,
    pan = rand(-0.4, 0.4),
    sweepTo = 0,
  ) {
    const a = ctx as AudioContext;
    const t = now();
    const o = a.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (sweepTo) o.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const hp = a.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 700;
    o.connect(hp).connect(g);
    o.start(t);
    o.stop(t + dur + 0.02);
    out(g, pan, 1, 0.18);
  }

  const sounding = () => !!ctx && !muted;
  const sfx = {
    key() {
      if (!sounding()) return;
      const t = now();
      if (t - lastTick < 0.03) return;
      lastTick = t;
      beep(pick<number>([1760, 2093, 2349, 2637, 3136]), 0.03, 'square', 0.075);
    },
    glyph() {
      if (!sounding()) return;
      const t = now();
      if (t - lastTick < 0.045) return;
      lastTick = t;
      beep(rand(2600, 5200), 0.02, 'sine', 0.07);
    },
    lock() {
      if (sounding()) beep(1397, 0.08, 'triangle', 0.11, rand(-0.3, 0.3), 2093);
    },
    ok() {
      if (!sounding()) return;
      beep(1047, 0.06, 'sine', 0.1, 0.2);
      setTimeout(() => sounding() && beep(1568, 0.1, 'sine', 0.1, 0.25), 60);
    },
    chirp() {
      if (sounding()) beep(3400, 0.1, 'sine', 0.08, rand(-0.5, 0.5), 700);
    },
    arrival() {
      if (!sounding()) return;
      notes('F5 A5 C6 D6 G6').forEach((f, i) => {
        bell(f, 0.08 - i * 0.01, now() + i * 0.07);
      });
    },
  };

  /* ================= SPACE ================= */
  const g2 = cv.getContext('2d');
  let W = 0;
  let H = 0;
  type Star = { x: number; y: number; z: number; pz: number; tw: number; b: number };
  const STARS: Star[] = [];
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = cv.clientWidth;
    H = cv.clientHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    g2?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function seedStar(s: Star, far: boolean) {
    s.x = rand(-1, 1);
    s.y = rand(-1, 1);
    s.z = far ? rand(0.7, 1) : rand(0.05, 1);
    s.pz = s.z;
    s.tw = rand(0, 6.28);
    s.b = rand(0.3, 1);
  }
  for (let i = 0; i < 520; i++) {
    const s = { x: 0, y: 0, z: 0, pz: 0, tw: 0, b: 0 };
    seedStar(s, false);
    STARS.push(s);
  }
  let speed = 0.012;
  let targetSpeed = 0.012;
  let starAlpha = 0;
  let targetStarAlpha = 0.55;
  /** The brand X on canvas. At tiny scale its rounded strokes collapse into a dot: just a star. */
  let xg: { x: number; y: number; s: number; a: number; fs: number } | null = null;

  function drawSpace(dt: number) {
    if (!g2) return;
    speed += (targetSpeed - speed) * Math.min(1, dt * 1.6);
    starAlpha += (targetStarAlpha - starAlpha) * Math.min(1, dt * 0.8);
    g2.clearRect(0, 0, W, H);
    drawStars(g2, dt, W / 2, H / 2, Math.max(W, H) * 0.55);
    drawX(g2);
  }
  function drawX(g: CanvasRenderingContext2D) {
    if (!xg || xg.a <= 0) return;
    const { fs, s } = xg;
    const hx = fs * 0.3 * s;
    const hy = fs * 0.36 * s;
    g.save();
    g.globalAlpha = xg.a;
    g.strokeStyle = '#f6f8ff';
    g.lineCap = 'round';
    g.lineWidth = Math.max(1.6, fs * 0.09 * s);
    if (s < 5) {
      g.shadowColor = 'rgba(205,225,255,.75)';
      g.shadowBlur = Math.min(26, 2 + s * 18);
    }
    g.beginPath();
    g.moveTo(xg.x - hx, xg.y - hy);
    g.lineTo(xg.x + hx, xg.y + hy);
    g.moveTo(xg.x + hx, xg.y - hy);
    g.lineTo(xg.x - hx, xg.y + hy);
    g.stroke();
    g.restore();
  }
  function drawStars(g: CanvasRenderingContext2D, dt: number, cx: number, cy: number, f: number) {
    const streak = speed > 0.08;
    g.lineCap = 'round';
    for (const s of STARS) {
      s.pz = s.z;
      s.z -= speed * dt;
      if (s.z <= 0.02) {
        seedStar(s, true);
        s.pz = s.z;
      }
      const sx = cx + (s.x / s.z) * f;
      const sy = cy + (s.y / s.z) * f;
      if (sx < -50 || sx > W + 50 || sy < -50 || sy > H + 50) {
        seedStar(s, true);
        continue;
      }
      s.tw += dt * 2.2;
      const near = 1 - s.z;
      const al =
        Math.min(1, (0.2 + near * 0.85) * s.b * (0.75 + 0.25 * Math.sin(s.tw))) * starAlpha;
      const r = Math.max(0.3, near * 1.4);
      if (streak) {
        const px = cx + (s.x / s.pz) * f;
        const py = cy + (s.y / s.pz) * f;
        g.strokeStyle = `rgba(240,244,255,${al})`;
        g.lineWidth = r;
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(sx, sy);
        g.stroke();
      } else {
        g.fillStyle = `rgba(240,244,255,${al})`;
        g.beginPath();
        g.arc(sx, sy, r, 0, 6.283);
        g.fill();
      }
    }
  }

  /* ================= TEXT EFFECTS ================= */
  const tasks: Task[] = [];
  // Decode text: each char flickers through random glyphs, then locks left to right.
  function decode(
    el: HTMLElement,
    text: string,
    { stagger = 45, flicker = [180, 420] as [number, number] } = {},
  ) {
    const t0 = performance.now();
    const chars = [...text].map((ch, i) => ({
      c: ch,
      start: t0 + i * stagger,
      end: t0 + i * stagger + rand(flicker[0], flicker[1]),
      cur: '',
      next: 0,
    }));
    tasks.push({
      step(t) {
        let s = '';
        let done = true;
        for (const ch of chars) {
          if (ch.c === ' ') {
            s += ' ';
            continue;
          }
          if (t < ch.start) {
            s += ' ';
            done = false;
          } else if (t < ch.end) {
            done = false;
            if (t > ch.next) {
              ch.cur = pick<string>(GLYPHS);
              ch.next = t + 50;
              sfx.glyph();
            }
            s += ch.cur;
          } else s += ch.c;
        }
        el.textContent = s;
        return done;
      },
    });
  }
  // Reverse decode: characters flicker into glyphs and vanish, right to left.
  function scrambleOut(el: HTMLElement, { stagger = 24, flick = 240 } = {}) {
    const text = [...(el.textContent ?? '')];
    const n = text.length;
    const t0 = performance.now();
    tasks.push({
      step(t) {
        let s = '';
        let done = true;
        for (let i = 0; i < n; i++) {
          const ch = text[i];
          const end = t0 + (n - 1 - i) * stagger + flick;
          if (ch === ' ' || t >= end) {
            s += ' ';
            continue;
          }
          done = false;
          s += t > end - flick ? pick<string>(GLYPHS) : ch;
        }
        sfx.glyph();
        el.textContent = s;
        return done;
      },
    });
  }
  function tween(ms: number, fn: (u: number) => void) {
    const t0 = performance.now();
    tasks.push({
      step(t) {
        const u = Math.min(1, (t - t0) / ms);
        fn(u);
        return u >= 1;
      },
    });
  }
  // Typewriter for the instruction: a dim label, then the hint in the accent colour.
  function typeLine(label: string, hint: string, cps = 42) {
    return new Promise<void>((res) => {
      const line = document.createElement('div');
      const a = document.createElement('span');
      const b = document.createElement('span');
      const cur = document.createElement('i');
      b.className = c('ok');
      cur.className = c('cursor');
      line.append(a, b, cur);
      log.append(line);
      let i = 0;
      let acc = 0;
      let last = performance.now();
      const text = label + hint;
      tasks.push({
        step(t) {
          acc += ((t - last) / 1000) * cps;
          last = t;
          while (acc >= 1 && i < text.length) {
            acc -= 1;
            const ch = text[i++] ?? '';
            (i <= label.length ? a : b).textContent += ch;
            if (ch !== ' ' && ch !== '.') sfx.key();
          }
          if (i >= text.length) {
            cur.remove();
            if (hint) sfx.ok();
            res();
            return true;
          }
          return false;
        },
      });
    });
  }
  // Logo: letters land one by one at scattered spots, flicker, then glide into place.
  function assembleLogo(word: string, gap: number) {
    logo.textContent = '';
    const spans = [...word].map((ch) => {
      const s = document.createElement('span');
      s.textContent = ch;
      logo.append(s);
      return s;
    });
    for (const s of spans) {
      s.style.width = `${s.getBoundingClientRect().width}px`;
      s.textContent = '';
    }
    const order = spans.map((_, i) => i).sort(() => Math.random() - 0.5);
    order.forEach((idx, k) => {
      later(() => {
        const s = spans[idx];
        const final = word[idx] ?? '';
        if (!s) return;
        const dx = reduce ? 0 : rand(-1, 1) * Math.min(W * 0.18, 220);
        const dy = reduce ? 0 : rand(-1, 1) * Math.min(H * 0.16, 140);
        s.style.transition = 'none';
        s.style.transform = `translate(${dx}px, ${dy}px)`;
        void s.offsetWidth;
        s.style.transition = '';
        s.classList.add(c('in'));
        sfx.chirp();
        const endFlicker = performance.now() + 380;
        let next = 0;
        tasks.push({
          step(t) {
            if (t < endFlicker) {
              if (t > next) {
                s.textContent = pick<string>(GLYPHS.slice(0, 33));
                next = t + 55;
                sfx.glyph();
              }
              return false;
            }
            s.textContent = final;
            s.style.transform = 'translate(0,0)';
            sfx.lock();
            return true;
          },
        });
      }, k * gap);
    });
  }

  /* ================= TIMELINE ================= */
  /* All cues sit on the music's bar grid (one bar = 4 beats ≈ 1.86 s): the instruction over bars
     1–4, the logo lights on bar 6, letters dissolve on bar 8, the star starts to come on bar 9 and
     the screen is white for the arrival chord on bar 11. */
  let t0 = 0;
  let clockOn = false;
  let running = false;
  const until = (ms: number) =>
    new Promise<void>((res, rej) => {
      const id = setTimeout(
        () => {
          timers.delete(id);
          if (disposed || arrived) rej(new Error('cancel'));
          else res();
        },
        Math.max(0, t0 + ms - performance.now()),
      );
      timers.add(id);
    });

  async function run() {
    if (running) return;
    running = true;
    opts.onStart?.();
    muted = false;
    initAudio();
    if (ctx) await ctx.resume().catch(() => {});
    try {
      // The logo font is not preloaded (spec): fetch it now so the letter widths are right.
      const family = getComputedStyle(logo).fontFamily;
      await Promise.race([
        document.fonts.load(`300 64px ${family}`, 'XSTOREX'),
        new Promise((r) => setTimeout(r, 1500)),
      ]);
    } catch {}
    if (disposed || arrived) return;
    gate.classList.add(c('gone'));
    t0 = performance.now();
    clockOn = true;
    if (ctx) {
      master.gain.cancelScheduledValues(now());
      master.gain.setValueAtTime(0.85, now());
      t0 += (startMusic() - now()) * 1000;
    }
    targetStarAlpha = 1;
    targetSpeed = 0.02;
    try {
      await until(700);
      hud.classList.add(c('on'));
      sfx.chirp();
      await until(BAR * 0.75);
      await typeLine('01  ДОСТУП ........ ', 'выбери удобный тариф');
      await until(BAR * 1.75);
      await typeLine('02  IPHONE ........ ', 'добавь своё устройство');
      await until(BAR * 2.75);
      await typeLine('03  ПРИЛОЖЕНИЯ .... ', 'устанавливай прямо из Safari');
      await until(BAR * 3.6);
      await typeLine('', 'СИСТЕМА ГОТОВА');
      await until(BAR * 4.15);
      log.style.opacity = '.35';
      assembleLogo('XSTOREX', reduce ? 120 : 190);
      await until(BAR * 5);
      logo.classList.add(c('lit'));
      rule.classList.add(c('on'));
      await until(BAR * 5.35);
      decode(tag, 'ПРИЛОЖЕНИЯ ДЛЯ IPHONE И IPAD', { stagger: 38 });
      await until(BAR * 6.05);
      decode(sub, 'установка прямо из safari', { stagger: 32, flicker: [120, 300] });
      // bar 8: everything dissolves back into glyphs, the X too
      await until(BAR * 7);
      log.style.opacity = '0';
      rule.classList.remove(c('on'));
      logo.classList.remove(c('lit'));
      scrambleOut(sub, { stagger: 16 });
      scrambleOut(tag, { stagger: 14 });
      sfx.chirp();
      await until(BAR * 7.2);
      const spans = [...logo.children] as HTMLElement[];
      spans.reverse().forEach((sp, k) => {
        later(() => {
          if (arrived) return;
          scrambleOut(sp, { flick: 260 });
          later(() => sp.classList.remove(c('in')), 200);
        }, k * 85);
      });
      // a star in the centre, no different from the others
      const fs = Math.min(W, H) * 0.1;
      const s0 = 0.006;
      xg = { x: W / 2, y: H / 2, s: s0, a: 0, fs };
      await until(BAR * 7.45);
      tween(900, (u) => {
        if (xg) xg.a = 0.85 * u;
      });
      // bar 9: it starts to come at us and opens into the X; white just before the arrival chord
      await until(BAR * 8);
      const Z = BAR * 2.1;
      const sEnd = (3 * Math.hypot(W, H)) / (fs * 0.09);
      tween(Z, (u) => {
        if (!xg) return;
        xg.s = s0 * (sEnd / s0) ** (u * u);
        xg.a = 0.85 + 0.15 * Math.min(1, u * 2);
        if (!reduce) targetSpeed = 0.02 + 0.7 * u * u;
      });
      await until(BAR * 9.55);
      arrive(false);
    } catch {
      /* cancelled */
    }
  }

  function arrive(skipped: boolean) {
    if (arrived || disposed) return;
    arrived = true;
    clockOn = false;
    if (skipped) tasks.length = 0; // otherwise the X keeps flying in under the white
    skipBtn.classList.add(c('off'));
    flash.classList.add(c('on'));
    if (skipped && ctx && !muted) {
      stopMusic(0.6);
      sfx.arrival();
    }
    // Sound outlives the stage: the arrival chord rings out, then the graph is closed.
    const audioLeft =
      skipped || !ctx ? 4 : Math.max(4, MUSIC_END_S - (performance.now() - t0) / 1000);
    setTimeout(closeAudio, audioLeft * 1000);
    // Under the white the page is already there, soft and slightly zoomed; the white melts off it.
    later(() => {
      stage.classList.add(c('hidden'));
      html.setAttribute('data-intro', 'reveal');
      void html.offsetWidth;
      html.setAttribute('data-intro', 'show');
      flash.classList.add(c('out'));
      later(finish, 2500);
    }, 800);
  }

  function finish() {
    html.removeAttribute('data-intro');
    stopLoop();
    opts.onDone();
  }

  function skip() {
    if (!running) opts.onStart?.();
    arrive(true);
  }

  /* ================= LOOP ================= */
  let raf = 0;
  let last = performance.now();
  function frame(t: number) {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    drawSpace(dt);
    for (let i = tasks.length - 1; i >= 0; i--) if (tasks[i]?.step(t)) tasks.splice(i, 1);
    if (clockOn) {
      const s = Math.max(0, (t - t0) / 1000);
      clock.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`;
      const ra = 35 * 60 + 17 + s * 7;
      raEl.textContent = `05h ${String(Math.floor(ra / 60) % 60).padStart(2, '0')}m ${String(Math.floor(ra) % 60).padStart(2, '0')}s`;
    }
    raf = requestAnimationFrame(frame);
  }
  function stopLoop() {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  }

  const onStart = () => void run();
  const onSkip = () => skip();
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') skip();
  };
  startBtn.addEventListener('click', onStart);
  skipBtn.addEventListener('click', onSkip);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', resize);
  resize();
  raf = requestAnimationFrame(frame);
  startBtn.focus({ preventScroll: true });

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      stopLoop();
      for (const id of timers) clearTimeout(id);
      timers.clear();
      startBtn.removeEventListener('click', onStart);
      skipBtn.removeEventListener('click', onSkip);
      document.removeEventListener('keydown', onKey);
      // Left mid-way (another page): silence now. After the arrival the sound fades on its own.
      if (!arrived) {
        stopMusic(0.3);
        setTimeout(closeAudio, 400);
        html.removeAttribute('data-intro');
      }
    },
  };
}
