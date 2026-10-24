export type AmbienceMode = 'morning' | 'night';

export type SceneAmbience = {
  setMode: (mode: AmbienceMode) => void;
  setEnabled: (enabled: boolean) => void;
  dispose: () => void;
};

function noiseBuffer(context: AudioContext) {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function createSceneAmbience(context: AudioContext): SceneAmbience {
  const noise = noiseBuffer(context);
  const morning = context.createGain();
  const night = context.createGain();
  morning.gain.value = 0;
  night.gain.value = 0;
  morning.connect(context.destination);
  night.connect(context.destination);

  // A soft, filtered noise bed suggests wind without playing a large audio file.
  const wind = context.createBufferSource();
  const windFilter = context.createBiquadFilter();
  const windGain = context.createGain();
  wind.buffer = noise;
  wind.loop = true;
  windFilter.type = 'lowpass';
  windFilter.frequency.value = 360;
  windGain.gain.value = 0.045;
  wind.connect(windFilter).connect(windGain).connect(morning);
  wind.start();

  // Low filtered noise forms the steady fire bed; short random bursts add crackle.
  const fire = context.createBufferSource();
  const fireFilter = context.createBiquadFilter();
  const fireGain = context.createGain();
  fire.buffer = noise;
  fire.loop = true;
  fireFilter.type = 'bandpass';
  fireFilter.frequency.value = 580;
  fireFilter.Q.value = 0.5;
  fireGain.gain.value = 0.018;
  fire.connect(fireFilter).connect(fireGain).connect(night);
  fire.start();

  let mode: AmbienceMode = 'morning';
  let enabled = false;
  let disposed = false;
  const transientSources = new Set<AudioBufferSourceNode | OscillatorNode>();

  function chirp(destination: AudioNode, start: number, pitch: number, duration: number, volume: number) {
    const tone = context.createOscillator();
    const gain = context.createGain();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(pitch, start);
    tone.frequency.exponentialRampToValueAtTime(pitch * 1.2, start + duration * 0.42);
    tone.frequency.exponentialRampToValueAtTime(pitch * 0.92, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    tone.connect(gain).connect(destination);
    transientSources.add(tone);
    tone.onended = () => { transientSources.delete(tone); tone.disconnect(); gain.disconnect(); };
    tone.start(start);
    tone.stop(start + duration + 0.01);
  }

  function crackle(start: number) {
    const burst = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    burst.buffer = noise;
    filter.type = 'highpass';
    filter.frequency.value = 950;
    const duration = 0.025 + Math.random() * 0.055;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.018 + Math.random() * 0.01, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    burst.connect(filter).connect(gain).connect(night);
    transientSources.add(burst);
    burst.onended = () => { transientSources.delete(burst); burst.disconnect(); filter.disconnect(); gain.disconnect(); };
    burst.start(start, Math.random());
    burst.stop(start + duration + 0.01);
  }

  const timer = window.setInterval(() => {
    if (!enabled || disposed || context.state !== 'running') return;
    const at = context.currentTime + 0.02;
    if (mode === 'morning') {
      if (Math.random() < 0.65) {
        const pitch = 2100 + Math.random() * 1300;
        const notes = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < notes; i++) chirp(morning, at + i * 0.15, pitch * (0.9 + Math.random() * 0.25), 0.1 + Math.random() * 0.08, 0.018);
      }
    } else {
      // A few short, evenly spaced cricket pulses keep the night bed gentle.
      if (Math.random() < 0.82) for (let i = 0; i < 4; i++) chirp(night, at + i * 0.085, 3900 + Math.random() * 450, 0.045, 0.009);
      if (Math.random() < 0.7) crackle(at + Math.random() * 0.45);
    }
  }, 1100);

  const updateGain = () => {
    const at = context.currentTime;
    morning.gain.setTargetAtTime(enabled && mode === 'morning' ? 1 : 0, at, 0.7);
    night.gain.setTargetAtTime(enabled && mode === 'night' ? 1 : 0, at, 0.7);
  };

  return {
    setMode(next) { mode = next; updateGain(); },
    setEnabled(next) { enabled = next; updateGain(); },
    dispose() {
      disposed = true;
      window.clearInterval(timer);
      wind.stop();
      fire.stop();
      transientSources.forEach(source => { try { source.stop(); } catch { /* already stopped */ } });
      wind.disconnect(); windFilter.disconnect(); windGain.disconnect();
      fire.disconnect(); fireFilter.disconnect(); fireGain.disconnect();
      morning.disconnect(); night.disconnect();
    },
  };
}
