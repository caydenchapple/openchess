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
  wrong: () => { blip({ freq: 220, dur: 0.12, type: 'triangle', gain: 0.1, slide: -60 }); blip({ freq: 165, dur: 0.2, type: 'triangle', gain: 0.1, slide: -40, delay: 0.09 }); },
  // lesson sounds: a soft tick for turning a card, a bright two-note chime for a right answer that climbs the longer your run is
  tap: () => blip({ freq: 620, dur: 0.035, type: 'sine', gain: 0.07 }),
  card: () => { blip({ freq: 440, dur: 0.05, type: 'triangle', gain: 0.06 }); blip({ freq: 587, dur: 0.07, type: 'triangle', gain: 0.06, delay: 0.04 }); },
  hint: () => { blip({ freq: 1175, dur: 0.07, gain: 0.05 }); blip({ freq: 1568, dur: 0.1, gain: 0.04, delay: 0.06 }); },
  right: (run = 0) => {
    const scale = [523, 587, 659, 784, 880, 1047, 1175, 1319]; const i = Math.min(Math.max(run - 1, 0), scale.length - 3);
    blip({ freq: scale[i], dur: 0.12, type: 'triangle', gain: 0.12 });
    blip({ freq: scale[i + 2], dur: 0.2, type: 'triangle', gain: 0.12, delay: 0.08 });
    blip({ freq: scale[i + 2] * 2, dur: 0.25, type: 'sine', gain: 0.03, delay: 0.08 });
  },
  fanfare: (power = 1) => {
    [523, 659, 784, 1047].forEach((f, k) => blip({ freq: f, dur: 0.22, type: 'triangle', gain: 0.11, delay: k * 0.09 }));
    if (power > 0.6) [784, 1047, 1319].forEach((f) => blip({ freq: f, dur: 0.6, type: 'sine', gain: 0.07, delay: 0.42 }));
    if (power > 0.6) for (let k = 0; k < 4; k++) blip({ freq: 2093 + k * 220, dur: 0.06, type: 'sine', gain: 0.03, delay: 0.5 + k * 0.07 });
  },
};

export function play(name, arg) {
  if (!get().settings.sound) return;
  SOUNDS[name]?.(arg);
}
