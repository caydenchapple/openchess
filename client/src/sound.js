// Tiny synthesized sound effects (no audio files to download).
import { get } from './store.js';

let ctx;
function ac() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

function blip({ freq = 440, dur = 0.06, type = 'sine', gain = 0.12, slide = 0, delay = 0 }) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

// A wooden "knock": a short burst of filtered noise (the click) over a low thump (the body of the piece landing on the board).
let noiseBuf;
function knock({ gain = 0.5, pitch = 180, bright = 1800, dur = 0.07, delay = 0 } = {}) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, Math.floor(a.sampleRate * 0.12), a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  }
  const n = a.createBufferSource(); n.buffer = noiseBuf;
  const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = bright; f.Q.value = 0.9;
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(f).connect(g).connect(a.destination);
  n.start(t); n.stop(t + dur + 0.02);
  blip({ freq: pitch, dur: dur * 1.6, type: 'sine', gain: gain * 0.55, slide: -pitch * 0.45, delay });
}

const SOUNDS = {
  move: () => knock({ gain: 0.45, pitch: 190, bright: 1700 }),
  capture: () => { knock({ gain: 0.7, pitch: 150, bright: 1300, dur: 0.09 }); knock({ gain: 0.35, pitch: 240, bright: 2400, dur: 0.05, delay: 0.035 }); },
  castle: () => { knock({ gain: 0.45, pitch: 200 }); knock({ gain: 0.5, pitch: 170, delay: 0.11 }); },
  check: () => { knock({ gain: 0.5, pitch: 190 }); blip({ freq: 700, dur: 0.16, type: 'sine', gain: 0.05, slide: 160, delay: 0.05 }); },
  end: () => { blip({ freq: 392, dur: 0.18, gain: 0.12 }); blip({ freq: 294, dur: 0.3, gain: 0.12, delay: 0.16 }); },
  low: () => blip({ freq: 880, dur: 0.04, type: 'square', gain: 0.05 }),
  start: () => { blip({ freq: 330, dur: 0.1, gain: 0.1 }); blip({ freq: 440, dur: 0.14, gain: 0.1, delay: 0.1 }); },
  wrong: () => blip({ freq: 140, dur: 0.18, type: 'sawtooth', gain: 0.08, slide: -40 }),
  right: () => { blip({ freq: 523, dur: 0.1, gain: 0.1 }); blip({ freq: 784, dur: 0.16, gain: 0.1, delay: 0.09 }); },
};

export function play(name) {
  if (!get().settings.sound) return;
  SOUNDS[name]?.();
}
