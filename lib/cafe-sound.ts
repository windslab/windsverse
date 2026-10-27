// Every sound in the café world, made on the fly with Web Audio (no audio files): ambience and
// wind, drizzle, rain and thunder, crickets at night, birds when a flock flies over, waves by the
// sea, the river, the cat (meows and a purr), Luna's footsteps on each kind of ground, her chores
// and the barista's machines. Sounds come from where they happen (panned and fading with
// distance from the camera).
import * as THREE from 'three';

export type Surface =
  | 'grass'
  | 'concrete'
  | 'tile'
  | 'wood'
  | 'sand'
  | 'asphalt'
  | 'gravel'
  | 'stone';

/** One-off sounds the explore game plays (cashier, cups, espresso machine, jumps). */
export type Sfx =
  | 'coin'
  | 'register'
  | 'cup'
  | 'pour'
  | 'stir'
  | 'grind-start'
  | 'grind-stop'
  | 'tamp'
  | 'brew-start'
  | 'brew-stop'
  | 'serve'
  | 'sit'
  | 'jump'
  | 'land'
  | 'click';

let active: CafeSound | null = null;
/** Play a one-off game sound (does nothing while sound is off). */
export function playSfx(name: Sfx) {
  active?.play(name);
}

export type SoundFrame = {
  camera: THREE.Camera;
  /** Where the player "hears" from (Luna in explore mode): distances are measured from here. */
  ear: THREE.Vector3;
  /** 0–1 times of day. */
  night: number;
  daylight: number;
  /** Weather (see lib/cafe-weather.ts). */
  rain: number;
  overcast: number;
  strikes: number;
  strikePoint: THREE.Vector3;
  /** A roof over the camera (rain sounds muffled, drumming on the roof). */
  covered: boolean;
  /** Distance from the camera to the sea's shore and to the river (Infinity when unknown). */
  sea: number;
  river: number;
  /** Bird flock position, if one is flying. */
  flock: THREE.Vector3 | null;
  cat: { position: THREE.Vector3; mood: string } | null;
  luna: { position: THREE.Vector3; task: string; umbrella: boolean } | null;
  /** Height of the camera above the ground nearby (windier up high). */
  altitude: number;
};

type CafeSound = ReturnType<typeof createCafeSound>;

function noise(context: AudioContext, seconds: number, kind: 'white' | 'brown') {
  const buffer = context.createBuffer(
    1,
    Math.floor(context.sampleRate * seconds),
    context.sampleRate,
  );
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    if (kind === 'white') data[i] = white;
    else {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
  }
  return buffer;
}

export function createCafeSound(context: AudioContext) {
  const white = noise(context, 3, 'white'),
    brown = noise(context, 4, 'brown');
  const master = context.createGain();
  master.gain.value = 0;
  // A gentle limiter so thunder and downpours never clip.
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.ratio.value = 8;
  master.connect(limiter).connect(context.destination);
  // Loudness meter (for checks in development).
  const meter = context.createAnalyser();
  meter.fftSize = 2048;
  limiter.connect(meter);
  const meterData = new Float32Array(meter.fftSize);
  let tap: MediaStreamAudioDestinationNode | null = null;
  // A small echo for stone (inside the tower).
  const echoIn = context.createGain(),
    echo = context.createDelay(0.5),
    echoBack = context.createGain(),
    echoOut = context.createGain();
  echo.delayTime.value = 0.12;
  echoBack.gain.value = 0.32;
  echoOut.gain.value = 0.5;
  echoIn.connect(echo).connect(echoBack).connect(echo);
  echo.connect(echoOut).connect(master);

  const nodes = new Set<AudioNode>();
  const own = <T extends AudioNode>(node: T) => (nodes.add(node), node);

  // --- Loops: a noise source through a filter chain into its own gain (and pan). --------------
  type Loop = {
    gain: GainNode;
    pan: StereoPannerNode;
    filters: BiquadFilterNode[];
    source: AudioBufferSourceNode;
  };
  const loop = (
    buffer: AudioBuffer,
    filters: [BiquadFilterType, number, number][],
    rate = 1,
  ): Loop => {
    const source = own(context.createBufferSource());
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = rate;
    let at: AudioNode = source;
    const chain = filters.map(([type, frequency, q]) => {
      const f = own(context.createBiquadFilter());
      f.type = type;
      f.frequency.value = frequency;
      f.Q.value = q;
      at.connect(f);
      at = f;
      return f;
    });
    const gain = own(context.createGain()),
      pan = own(context.createStereoPanner());
    gain.gain.value = 0;
    at.connect(gain).connect(pan).connect(master);
    source.start(0, Math.random() * buffer.duration);
    return { gain, pan, filters: chain, source };
  };
  const wind = loop(white, [
    ['lowpass', 420, 0.6],
    ['highpass', 60, 0.7],
  ]);
  const rainHeavy = loop(white, [
    ['bandpass', 1500, 0.35],
    ['lowpass', 7000, 0.5],
  ]);
  const rainLight = loop(white, [['highpass', 4200, 0.6]]);
  const roof = loop(brown, [['lowpass', 900, 0.7]]);
  const waves = loop(brown, [['lowpass', 520, 0.6]]);
  const wash = loop(white, [['bandpass', 1700, 0.5]]);
  const river = loop(white, [
    ['bandpass', 900, 1.1],
    ['peaking', 2400, 2],
  ]);
  const water = loop(white, [['bandpass', 1100, 1.6]]);
  const brew = loop(white, [
    ['highpass', 2600, 0.7],
    ['peaking', 700, 3],
  ]);
  const grinder = loop(white, [['bandpass', 2300, 1.2]]);
  const purr = loop(brown, [['lowpass', 320, 0.8]]);
  // The purr's rumble: a slow tremolo on its gain.
  const purrBeat = own(context.createOscillator()),
    purrDepth = own(context.createGain());
  purrBeat.frequency.value = 24;
  purrDepth.gain.value = 0;
  purrBeat.connect(purrDepth).connect(purr.gain.gain);
  purrBeat.start();
  // The grinder's motor whine under its rattle.
  const motor = own(context.createOscillator()),
    motorGain = own(context.createGain());
  motor.type = 'sawtooth';
  motor.frequency.value = 145;
  motorGain.gain.value = 0;
  const motorFilter = own(context.createBiquadFilter());
  motorFilter.type = 'lowpass';
  motorFilter.frequency.value = 900;
  motor.connect(motorFilter).connect(motorGain).connect(master);
  motor.start();

  // --- One-shots -------------------------------------------------------------------------------
  const transient = new Set<AudioScheduledSourceNode>();
  const done = (src: AudioScheduledSourceNode, ...rest: AudioNode[]) => {
    transient.add(src);
    src.onended = () => {
      transient.delete(src);
      src.disconnect();
      rest.forEach((n) => n.disconnect());
    };
  };
  const out = (pan: number, echoed: boolean) => {
    const p = context.createStereoPanner();
    p.pan.value = THREE.MathUtils.clamp(pan, -0.95, 0.95);
    p.connect(master);
    if (echoed) p.connect(echoIn);
    return p;
  };
  /** A burst of filtered noise. */
  const burst = (o: {
    at?: number;
    type?: BiquadFilterType;
    freq: number;
    freqTo?: number;
    q?: number;
    attack?: number;
    decay: number;
    gain: number;
    pan?: number;
    rate?: number;
    brown?: boolean;
    echo?: boolean;
  }) => {
    const at = o.at ?? context.currentTime,
      src = context.createBufferSource(),
      f = context.createBiquadFilter(),
      g = context.createGain(),
      p = out(o.pan ?? 0, !!o.echo);
    src.buffer = o.brown ? brown : white;
    src.playbackRate.value = o.rate ?? 1;
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.freq, at);
    if (o.freqTo) f.frequency.exponentialRampToValueAtTime(o.freqTo, at + o.decay);
    f.Q.value = o.q ?? 0.8;
    const attack = o.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + o.decay);
    src.connect(f).connect(g).connect(p);
    done(src, f, g, p);
    src.start(at, Math.random() * (src.buffer.duration - 1));
    src.stop(at + attack + o.decay + 0.05);
  };
  /** A pitched blip (sine/triangle/…) gliding from f0 to f1. */
  const tone = (o: {
    at?: number;
    wave?: OscillatorType;
    f0: number;
    f1?: number;
    attack?: number;
    decay: number;
    gain: number;
    pan?: number;
    echo?: boolean;
  }) => {
    const at = o.at ?? context.currentTime,
      osc = context.createOscillator(),
      g = context.createGain(),
      p = out(o.pan ?? 0, !!o.echo);
    osc.type = o.wave ?? 'sine';
    osc.frequency.setValueAtTime(o.f0, at);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, at + o.decay);
    const attack = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + o.decay);
    osc.connect(g).connect(p);
    done(osc, g, p);
    osc.start(at);
    osc.stop(at + attack + o.decay + 0.05);
  };
  /** A bird's chirp: a quick rising and falling whistle. */
  const chirp = (at: number, pitch: number, length: number, gain: number, pan: number) => {
    const osc = context.createOscillator(),
      g = context.createGain(),
      p = out(pan, false);
    osc.frequency.setValueAtTime(pitch, at);
    osc.frequency.exponentialRampToValueAtTime(pitch * 1.25, at + length * 0.4);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.9, at + length);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(g).connect(p);
    done(osc, g, p);
    osc.start(at);
    osc.stop(at + length + 0.02);
  };
  /** The cat: a little "meow" through two vowel formants. */
  const meow = (gain: number, pan: number, small = false) => {
    const at = context.currentTime,
      length = small ? 0.28 : 0.45 + Math.random() * 0.25,
      base = (small ? 620 : 470) * (0.9 + Math.random() * 0.25);
    const osc = context.createOscillator(),
      a = context.createBiquadFilter(),
      b = context.createBiquadFilter(),
      g = context.createGain(),
      p = out(pan, false);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base, at);
    osc.frequency.linearRampToValueAtTime(base * 1.45, at + length * 0.35);
    osc.frequency.linearRampToValueAtTime(base * 0.85, at + length);
    a.type = b.type = 'bandpass';
    a.Q.value = b.Q.value = 6;
    // "mi" → "aa" → "u": the formants open and close.
    a.frequency.setValueAtTime(700, at);
    a.frequency.linearRampToValueAtTime(1050, at + length * 0.45);
    a.frequency.linearRampToValueAtTime(600, at + length);
    b.frequency.setValueAtTime(2200, at);
    b.frequency.linearRampToValueAtTime(1600, at + length);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.05);
    g.gain.setValueAtTime(gain, at + length * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(a).connect(g);
    osc.connect(b).connect(g);
    g.connect(p);
    done(osc, a, b, g, p);
    osc.start(at);
    osc.stop(at + length + 0.05);
  };
  const thunder = (gain: number, delay: number, close: boolean) => {
    const at = context.currentTime + delay,
      length = 2.5 + Math.random() * 2.5;
    if (close) burst({ at, type: 'highpass', freq: 1400, decay: 0.5, gain: gain * 0.5 });
    // Rolling rumble: a few overlapping waves of deep noise.
    for (let i = 0; i < 3; i++)
      burst({
        at: at + i * (0.25 + Math.random() * 0.5),
        type: 'lowpass',
        freq: 260 - i * 50,
        freqTo: 90,
        attack: 0.12 + i * 0.1,
        decay: length - i * 0.5,
        gain: gain * (1 - i * 0.25),
        brown: true,
        pan: (Math.random() - 0.5) * 0.6,
      });
  };

  // --- Music: Luna playing the piano, guitar or cello (C – Am – F – G, gently). ---------------------
  const CHORDS = [
    [261.63, 329.63, 392.0],
    [220.0, 261.63, 329.63],
    [174.61, 220.0, 261.63],
    [196.0, 246.94, 293.66],
  ];
  /** A soft piano note: two partials, a quick strike and a long fade. */
  const pianoNote = (at: number, freq: number, gain: number, pan: number) => {
    tone({ at, f0: freq, decay: 1.4, attack: 0.006, gain, pan, wave: 'triangle' });
    tone({ at, f0: freq * 2, decay: 0.6, attack: 0.004, gain: gain * 0.25, pan });
  };
  /** A plucked string: a bright attack that mellows as it rings. */
  const pluck = (at: number, freq: number, gain: number, pan: number) => {
    const osc = context.createOscillator(),
      f = context.createBiquadFilter(),
      g = context.createGain(),
      p = out(pan, false);
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq * 8, at);
    f.frequency.exponentialRampToValueAtTime(freq * 1.5, at + 0.6);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 1.1);
    osc.connect(f).connect(g).connect(p);
    done(osc, f, g, p);
    osc.start(at);
    osc.stop(at + 1.15);
  };
  /** A bowed cello note: slow swell, warm and a little vibrato. */
  const bowed = (at: number, freq: number, length: number, gain: number, pan: number) => {
    const osc = context.createOscillator(),
      vib = context.createOscillator(),
      vibDepth = context.createGain(),
      f = context.createBiquadFilter(),
      g = context.createGain(),
      p = out(pan, false);
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    vib.frequency.value = 5.2;
    vibDepth.gain.setValueAtTime(0, at);
    vibDepth.gain.linearRampToValueAtTime(freq * 0.012, at + length * 0.5);
    vib.connect(vibDepth).connect(osc.frequency);
    f.type = 'lowpass';
    f.frequency.value = 1100;
    f.Q.value = 1.2;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.3);
    g.gain.setValueAtTime(gain, at + length - 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(f).connect(g).connect(p);
    done(osc, vib, vibDepth, f, g, p);
    vib.start(at);
    vib.stop(at + length + 0.05);
    osc.start(at);
    osc.stop(at + length + 0.05);
  };
  const music = { kind: '', at: 0, step: 0 };
  const playMusic = (kind: string, gain: number, pan: number) => {
    const now = context.currentTime;
    if (kind !== music.kind) {
      music.kind = kind;
      music.at = now + 0.3;
      music.step = 0;
    }
    if (!kind) return;
    // Schedule a little ahead so the rhythm stays even.
    while (music.at < now + 0.2) {
      const at = music.at,
        k = music.step++,
        chord = CHORDS[Math.floor(k / 8) % 4];
      if (kind === 'piano') {
        // Rolling arpeggio, with the bass on the first beat of each bar.
        const order = [0, 1, 2, 1, 0, 1, 2, 1];
        if (k % 8 === 0) pianoNote(at, chord[0] / 2, gain * 0.07, pan);
        pianoNote(at, chord[order[k % 8]] * (k % 8 >= 4 ? 2 : 1), gain * 0.055, pan);
        music.at += 0.3;
      } else if (kind === 'guitar') {
        // Down, down-up, up-down-up: a strum of the chord on each beat.
        const pattern = [1, 0, 1, 1, 0, 1, 1, 1];
        if (pattern[k % 8]) {
          const up = k % 2 === 1;
          const notes = [chord[0] / 2, chord[1] / 2, chord[2] / 2, chord[0], chord[1], chord[2]];
          (up ? [...notes].reverse().slice(0, 4) : notes).forEach((n, i) =>
            pluck(at + i * 0.014, n, gain * (up ? 0.02 : 0.03), pan),
          );
        }
        music.at += 0.26;
      } else {
        // Long notes walking down through the chords' roots and fifths.
        if (k % 4 === 0) bowed(at, chord[(k / 4) % 2 ? 2 : 0] / 2, 1.5, gain * 0.06, pan);
        music.at += 0.4;
      }
    }
  };

  // --- Footsteps: each surface has its own sound. -----------------------------------------------
  const step = (surface: Surface, run: boolean, wet: number, gain: number, pan: number) => {
    const at = context.currentTime,
      v = gain * (run ? 1.35 : 1) * (0.85 + Math.random() * 0.3),
      r = 0.9 + Math.random() * 0.2;
    switch (surface) {
      case 'grass':
        // Soft and full: a muffled brush of blades, a few gentle crunchy grains and a light
        // thud underfoot (no harsh hiss).
        burst({
          at,
          type: 'lowpass',
          freq: 1500 * r,
          freqTo: 550,
          q: 0.7,
          attack: 0.012,
          decay: 0.17,
          gain: 0.1 * v,
          pan,
        });
        for (let i = 0; i < 3; i++)
          burst({
            at: at + 0.012 + i * (0.018 + Math.random() * 0.02),
            freq: 1700 + Math.random() * 900,
            q: 2.2,
            decay: 0.028,
            gain: 0.022 * v,
            pan,
          });
        tone({ at, f0: 95 * r, f1: 60, decay: 0.07, gain: 0.05 * v, pan });
        break;
      case 'sand':
        burst({ at, type: 'lowpass', freq: 1300 * r, decay: 0.14, gain: 0.08 * v, pan });
        break;
      case 'gravel':
        for (let i = 0; i < 4; i++)
          burst({
            at: at + i * 0.018 + Math.random() * 0.01,
            freq: 3200 + Math.random() * 1800,
            q: 1.4,
            decay: 0.03,
            gain: 0.05 * v,
            pan,
          });
        break;
      case 'wood':
        tone({ at, f0: 175 * r, f1: 105, decay: 0.09, gain: 0.1 * v, pan });
        burst({ at, freq: 850 * r, q: 2.2, decay: 0.06, gain: 0.035 * v, pan });
        break;
      case 'stone':
        tone({ at, f0: 130 * r, f1: 75, decay: 0.05, gain: 0.07 * v, pan, echo: true });
        burst({ at, freq: 3400 * r, q: 1.2, decay: 0.035, gain: 0.05 * v, pan, echo: true });
        break;
      case 'asphalt':
        tone({ at, f0: 115 * r, f1: 70, decay: 0.05, gain: 0.06 * v, pan });
        burst({ at, freq: 2000 * r, q: 0.9, decay: 0.045, gain: 0.05 * v, pan });
        break;
      case 'tile':
        tone({ at, f0: 150 * r, f1: 90, decay: 0.045, gain: 0.06 * v, pan });
        burst({ at, type: 'highpass', freq: 3800 * r, decay: 0.025, gain: 0.05 * v, pan });
        break;
      default:
        // Concrete: a dull tap with a little grit.
        tone({ at, f0: 120 * r, f1: 72, decay: 0.05, gain: 0.07 * v, pan });
        burst({ at, freq: 2800 * r, q: 1, decay: 0.035, gain: 0.045 * v, pan });
    }
    // Puddles: a little splash when it's wet outside.
    if (wet > 0.05)
      burst({ at: at + 0.01, freq: 2600, q: 0.7, decay: 0.08, gain: 0.05 * v * wet, pan });
  };

  // --- State ----------------------------------------------------------------------------------
  let enabled = false,
    disposed = false,
    lastStrikes = -1,
    cricketAt = 0,
    birdAt = 0,
    dripAt = 0,
    patterAt = 0,
    meowAt = 0,
    lastMood = '',
    catWasNear = false,
    choreAt = 0,
    machineAt = 0,
    gustTarget = 0,
    gustAt = 0;
  const view = new THREE.Vector3();
  /** Pan and loudness (0–1) of a point as heard from the camera. */
  const hear = (camera: THREE.Camera, point: THREE.Vector3, reach: number) => {
    view.copy(point).applyMatrix4(camera.matrixWorldInverse);
    // Loudness by distance from the ear (Luna), direction from the camera.
    const distance = frame ? point.distanceTo(frame.ear) : view.length();
    return {
      pan: THREE.MathUtils.clamp(view.x / (Math.abs(view.z) + 1.5), -0.85, 0.85),
      gain: 1 / (1 + (distance / reach) ** 2),
      distance,
    };
  };
  const set = (param: AudioParam, value: number, smooth = 0.25) =>
    param.setTargetAtTime(value, context.currentTime, smooth);
  let frame: SoundFrame | null = null;

  const api = {
    setEnabled(on: boolean) {
      enabled = on;
      set(master.gain, on ? 1.7 : 0, 0.5);
      active = on ? api : active === api ? null : active;
    },
    enabled: () => enabled,
    /** The world's sound as a stream (for recording videos). */
    recordTap() {
      tap ??= context.createMediaStreamDestination();
      limiter.connect(tap);
      return tap.stream;
    },
    /** Current loudness (RMS of the output), for checks. */
    level() {
      meter.getFloatTimeDomainData(meterData);
      let sum = 0;
      for (const v of meterData) sum += v * v;
      return Math.sqrt(sum / meterData.length);
    },
    /** A footstep for Luna on `surface` (from the scene's footfall hook). */
    step(surface: Surface, run: boolean, wet: number, position: THREE.Vector3) {
      if (!enabled || !frame) return;
      const h = hear(frame.camera, position, 7);
      step(surface, run, wet, h.gain, h.pan);
    },
    play(name: Sfx) {
      if (!enabled || context.state !== 'running') return;
      const at = context.currentTime;
      const near = frame?.luna ? hear(frame.camera, frame.luna.position, 7) : { gain: 1, pan: 0 };
      const g = Math.max(0.4, near.gain),
        pan = near.pan;
      switch (name) {
        case 'coin':
          tone({ f0: 2400 + Math.random() * 600, decay: 0.12, gain: 0.05 * g, pan });
          tone({ at: at + 0.05, f0: 3300, decay: 0.1, gain: 0.03 * g, pan });
          break;
        case 'register':
          tone({ f0: 1320, decay: 0.5, gain: 0.06 * g, pan });
          tone({ at: at + 0.12, f0: 1760, decay: 0.6, gain: 0.05 * g, pan });
          burst({ at: at + 0.05, freq: 1500, q: 1, decay: 0.15, gain: 0.04 * g, pan });
          break;
        case 'cup':
        case 'serve':
          tone({ f0: 2100, decay: 0.15, gain: 0.05 * g, pan, wave: 'triangle' });
          tone({ at: at + 0.02, f0: 3150, decay: 0.1, gain: 0.025 * g, pan });
          tone({ at, f0: 240, f1: 150, decay: 0.05, gain: 0.04 * g, pan });
          if (name === 'serve') {
            tone({ at: at + 0.25, f0: 880, decay: 0.3, gain: 0.04 * g, pan });
            tone({ at: at + 0.4, f0: 1320, decay: 0.45, gain: 0.04 * g, pan });
          }
          break;
        case 'pour':
          burst({
            freq: 900,
            freqTo: 1500,
            q: 1.6,
            attack: 0.04,
            decay: 0.45,
            gain: 0.15 * g,
            pan,
          });
          break;
        case 'stir':
          for (let i = 0; i < 4; i++)
            tone({
              at: at + i * 0.13,
              f0: 2600 + Math.random() * 500,
              decay: 0.07,
              gain: 0.03 * g,
              pan,
            });
          break;
        case 'grind-start':
          set(grinder.gain.gain, 0.06 * g, 0.05);
          set(motorGain.gain, 0.025 * g, 0.05);
          break;
        case 'grind-stop':
          set(grinder.gain.gain, 0, 0.08);
          set(motorGain.gain, 0, 0.08);
          break;
        case 'tamp':
          tone({ f0: 180, f1: 90, decay: 0.08, gain: 0.09 * g, pan });
          tone({ at: at + 0.3, f0: 1200, decay: 0.08, gain: 0.04 * g, pan, wave: 'triangle' });
          break;
        case 'brew-start':
          set(brew.gain.gain, 0.05 * g, 0.3);
          tone({ f0: 90, decay: 1.5, attack: 0.3, gain: 0.03 * g, pan, wave: 'triangle' });
          break;
        case 'brew-stop':
          set(brew.gain.gain, 0, 0.15);
          for (let i = 0; i < 3; i++)
            tone({
              at: at + 0.15 + i * 0.22,
              f0: 1500 + i * 200,
              f1: 900,
              decay: 0.06,
              gain: 0.03 * g,
              pan,
            });
          break;
        case 'sit':
          tone({ f0: 210, f1: 160, decay: 0.12, gain: 0.05 * g, pan, wave: 'triangle' });
          burst({ freq: 600, q: 1.5, decay: 0.15, gain: 0.03 * g, pan });
          break;
        case 'jump':
          burst({ freq: 700, freqTo: 1800, q: 0.7, attack: 0.03, decay: 0.2, gain: 0.06 * g, pan });
          break;
        case 'land':
          tone({ f0: 140, f1: 70, decay: 0.09, gain: 0.08 * g, pan });
          burst({ type: 'lowpass', freq: 900, decay: 0.08, gain: 0.05 * g, pan });
          break;
        case 'click':
          tone({ f0: 1800, decay: 0.03, gain: 0.03, pan: 0 });
          break;
      }
    },
    /** Call each frame (cheap: sets a few targets and schedules short sounds now and then). */
    update(next: SoundFrame, time: number, dt: number) {
      frame = next;
      if (!enabled || disposed || context.state !== 'running') return;
      const f = next,
        now = context.currentTime,
        dry = 1 - f.rain;

      // Wind: always a soft bed, gustier when it's stormy and up high.
      if (time > gustAt) {
        gustAt = time + 2 + Math.random() * 5;
        gustTarget = Math.random();
      }
      const windy =
        0.02 + 0.02 * gustTarget + 0.035 * f.overcast + 0.02 * Math.min(1, f.altitude / 12);
      set(wind.gain.gain, windy * (f.covered ? 0.5 : 1), 1.2);
      set(wind.filters[0].frequency, 300 + 400 * gustTarget + 300 * f.overcast, 1.5);

      // Rain: a fine hiss and drops while drizzling; a full roar in a downpour; muffled with
      // drumming under a roof.
      const heavy = THREE.MathUtils.smoothstep(f.rain, 0.25, 1),
        drizzle = Math.min(1, f.rain * 5) * (1 - heavy * 0.6);
      set(rainHeavy.gain.gain, heavy * (f.covered ? 0.05 : 0.13), 0.6);
      set(rainHeavy.filters[1].frequency, f.covered ? 1100 : 7000, 0.3);
      set(rainLight.gain.gain, drizzle * (f.covered ? 0.006 : 0.022), 0.6);
      set(roof.gain.gain, f.covered ? f.rain * 0.12 : 0, 0.4);
      // Drops pattering nearby (leaves, puddles), more of them as it rains harder.
      if (f.rain > 0.02 && time > dripAt) {
        dripAt = time + 0.03 + (0.5 - Math.min(0.45, f.rain * 0.45)) * Math.random();
        tone({
          f0: 1800 + Math.random() * 2600,
          f1: 900 + Math.random() * 600,
          decay: 0.025,
          gain: (f.covered ? 0.006 : 0.016) * (0.4 + Math.random()),
          pan: Math.random() * 1.6 - 0.8,
        });
      }
      // Rain tapping on Luna's umbrella.
      if (f.luna?.umbrella && f.rain > 0.05 && time > patterAt) {
        patterAt = time + 0.02 + 0.2 * Math.random() * (1.2 - f.rain);
        const h = hear(f.camera, f.luna.position, 6);
        burst({
          type: 'highpass',
          freq: 3500 + Math.random() * 2000,
          decay: 0.02,
          gain: 0.035 * h.gain * (0.5 + Math.random()),
          pan: h.pan,
        });
      }
      // Thunder: after each lightning strike, later and softer the further away it was.
      if (lastStrikes < 0) lastStrikes = f.strikes;
      if (f.strikes !== lastStrikes) {
        lastStrikes = f.strikes;
        const h = hear(f.camera, f.strikePoint, 60);
        thunder(1.1 * Math.max(0.4, h.gain), Math.min(3.5, 0.3 + h.distance / 70), h.distance < 60);
      }

      // Crickets at night (quiet in the rain), in little bursts from different spots.
      const crickets = f.night * dry * (f.covered ? 0.5 : 1);
      if (crickets > 0.15 && time > cricketAt) {
        cricketAt = time + 0.3 + Math.random() * 1.1;
        const pitch = 3900 + Math.random() * 600,
          pan = Math.random() * 1.6 - 0.8,
          pulses = 3 + Math.floor(Math.random() * 4);
        for (let i = 0; i < pulses; i++)
          tone({
            at: now + 0.02 + i * 0.075,
            f0: pitch,
            decay: 0.04,
            attack: 0.006,
            gain: 0.012 * crickets * (0.6 + Math.random() * 0.6),
            pan,
          });
      }

      // Birds: chirping as a flock passes overhead (by day).
      if (f.flock && time > birdAt) {
        const h = hear(f.camera, f.flock, 40);
        if (h.gain > 0.05) {
          birdAt = time + 0.3 + Math.random() * 0.9;
          const pitch = 2200 + Math.random() * 1400,
            notes = 2 + Math.floor(Math.random() * 3);
          for (let i = 0; i < notes; i++)
            chirp(
              now + 0.02 + i * 0.14,
              pitch * (0.9 + Math.random() * 0.25),
              0.1 + Math.random() * 0.08,
              0.03 * h.gain,
              h.pan + (Math.random() - 0.5) * 0.3,
            );
        }
      }

      // Waves by the sea: a slow swell and wash.
      const seaNear = 1 / (1 + Math.max(0, f.sea / 14) ** 2);
      const swell = 0.5 + 0.5 * Math.sin(time * 0.85) * Math.sin(time * 0.31 + 1);
      set(waves.gain.gain, seaNear * (0.05 + 0.08 * swell), 0.4);
      set(wash.gain.gain, seaNear * 0.03 * swell * swell, 0.4);
      // The river babbling nearby.
      const riverNear = 1 / (1 + Math.max(0, (f.river - 3) / 5) ** 2);
      set(river.gain.gain, riverNear * 0.035, 0.5);
      set(river.filters[0].frequency, 700 + Math.random() * 600, 0.08);

      // The cat: a meow now and then when you're close (and when it starts to play), a purr
      // when it naps nearby.
      if (f.cat) {
        const h = hear(f.camera, f.cat.position, 3);
        const awake = f.cat.mood !== 'sleep';
        // A hello when Luna comes close, a meow now and then while she stays near.
        const near = h.distance < 1.6,
          hello = near && !catWasNear;
        catWasNear = near;
        if (
          h.distance < 5 &&
          awake &&
          (time > meowAt || hello || (f.cat.mood === 'play' && lastMood !== 'play'))
        ) {
          meowAt = time + (h.distance < 2.5 ? 5 : 9) + Math.random() * 8;
          meow(0.07 * Math.max(0.25, h.gain), h.pan, f.cat.mood === 'play');
        }
        lastMood = f.cat.mood;
        const purring = f.cat.mood === 'sleep' || f.cat.mood === 'groom' ? h.gain : 0;
        set(purr.gain.gain, 0.04 * purring, 0.5);
        set(purrDepth.gain, 0.035 * purring, 0.5);
        purr.pan.pan.setTargetAtTime(h.pan, now, 0.2);
      } else set(purr.gain.gain, 0);

      // Luna playing an instrument.
      const playing =
        f.luna && ['piano', 'guitar', 'cello'].includes(f.luna.task) ? f.luna.task : '';
      if (playing && f.luna) {
        const mh = hear(f.camera, f.luna.position, 8);
        playMusic(playing, Math.max(0.15, mh.gain), mh.pan * 0.6);
      } else playMusic('', 0, 0);

      // Luna's chores: broom swishes, cloth rubs, the watering can's stream; the barista's
      // machines while she makes drinks on her own.
      const luna = f.luna;
      const lh = luna ? hear(f.camera, luna.position, 7) : null;
      set(water.gain.gain, luna?.task === 'watering' && lh ? 0.05 * lh.gain : 0, 0.15);
      if (luna && lh && time > choreAt) {
        if (luna.task === 'sweeping') {
          choreAt = time + Math.PI / 4;
          burst({
            freq: 1400,
            freqTo: 3200,
            q: 0.6,
            attack: 0.05,
            decay: 0.28,
            gain: 0.05 * lh.gain,
            pan: lh.pan,
          });
        } else if (luna.task === 'wiping') {
          choreAt = time + 0.32;
          burst({
            freq: 3000 + Math.random() * 800,
            q: 2,
            attack: 0.03,
            decay: 0.18,
            gain: 0.07 * lh.gain,
            pan: lh.pan,
          });
          if (Math.random() < 0.25)
            tone({
              f0: 1700 + Math.random() * 400,
              decay: 0.08,
              gain: 0.008 * lh.gain,
              pan: lh.pan,
            });
        }
      }
      if (luna && lh && luna.task === 'preparing' && time > machineAt) {
        machineAt = time + 1.5 + Math.random() * 2.5;
        const pick = Math.random(),
          g = 0.8 * lh.gain;
        if (pick < 0.3)
          burst({
            type: 'highpass',
            freq: 2600,
            attack: 0.15,
            decay: 1.4,
            gain: 0.04 * g,
            pan: lh.pan,
          });
        else if (pick < 0.55)
          burst({ freq: 2300, q: 1.2, attack: 0.05, decay: 0.9, gain: 0.04 * g, pan: lh.pan });
        else if (pick < 0.8)
          burst({
            freq: 900,
            freqTo: 1500,
            q: 1.6,
            attack: 0.05,
            decay: 0.5,
            gain: 0.05 * g,
            pan: lh.pan,
          });
        else tone({ f0: 2200, decay: 0.12, gain: 0.04 * g, pan: lh.pan, wave: 'triangle' });
      }
      void dt;
    },
    dispose() {
      disposed = true;
      if (active === api) active = null;
      transient.forEach((s) => {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
      });
      for (const l of [
        wind,
        rainHeavy,
        rainLight,
        roof,
        waves,
        wash,
        river,
        water,
        brew,
        grinder,
        purr,
      ])
        l.source.stop();
      purrBeat.stop();
      motor.stop();
      nodes.forEach((n) => n.disconnect());
      [master, limiter, meter, echoIn, echo, echoBack, echoOut, motorFilter].forEach((n) =>
        n.disconnect(),
      );
    },
  };
  return api;
}
