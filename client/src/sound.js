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

const SOUNDS = {
  move: () => blip({ freq: 220, dur: 0.05, type: 'triangle', gain: 0.18, slide: -60 }),
  capture: () => { blip({ freq: 160, dur: 0.09, type: 'square', gain: 0.1, slide: -80 }); blip({ freq: 300, dur: 0.04, type: 'triangle', gain: 0.1 }); },
  castle: () => { blip({ freq: 220, dur: 0.05, type: 'triangle', gain: 0.16 }); blip({ freq: 260, dur: 0.05, type: 'triangle', gain: 0.16, delay: 0.07 }); },
  check: () => blip({ freq: 520, dur: 0.12, type: 'sawtooth', gain: 0.07, slide: 120 }),
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
