/*
 * Gun Splash 復刻版 — BGM engine (classic script, after core.js; the tracks are in js/bgm-tracks.js).
 *
 * Tracks are MML, one string per channel, parsed into tick events (48 ticks = a quarter note) and played by a
 * look-ahead sequencer on core's AudioContext (GS.audioNodes). The sound follows a 16-bit console's sampling sound chip:
 * one voice per channel (a new note keys the last one off), sampled-sounding instruments built from oscillators
 * and noise with ADSR envelopes, per-channel pan, one echo unit (feedback delay + low-pass) and a soft low-pass
 * on the whole bus. Effects (GS.sfx) are unchanged; BGM has its own bus under the same master volume.
 *
 * Scenes: a screen's def.bgm(state, params) returns a track id, null (fade out), 'pause' (hold the current
 * track) or undefined (leave it); core's GS.go asks it after enter(). The request is kept while 音 or おんがく is
 * off, so turning them on starts the scene's track. The page being hidden holds the music too (timers are
 * throttled there), and the manual being open lowers it.
 *
 * MML (this dialect):
 *   c d e f g a b   note; + or # sharp, - flat; then a length (1 2 4 8 16 32, 3 6 12 24 48 for triplets,
 *                   %n = n ticks) and dots.  c4.  e-8  f+16
 *   r               rest (same lengths)      ^len  tie: lengthens the last note, chord or rest
 *   {ceg}2          chord (notes start together; < > inside apply inside only)
 *   o4 > <          octave (o4 c = middle C, MIDI 60), up, down     k-2  transpose in semitones
 *   l8              default length            v0..15  volume         q1..8  gate (eighths of the length; q8 legato)
 *   p-8..8          pan (left .. right)       @name   instrument (see INST)
 *   [ ... ]n        repeat n times (default 2); a ":" inside ends the last pass there (first / second ending)
 *   L               loop point (every channel at the same tick)      |  bar line (checked)     ; comment
 *   drums (@drums): b kick, s snare, h hat, j open hat, y crash, m high tom, n low tom, x clap, z rim
 */
(function () {
  'use strict';
  const GS = window.GS;
  if (!GS) return;

  const TPQ = 48;                // ticks per quarter note
  const LOOKAHEAD = 0.25;        // seconds of music scheduled ahead of the AudioContext clock
  const SCHEDULE_MS = 25;        // how often schedule() tops the look-ahead up (while any track plays or fades out)
  const HURRY = 1.15;            // tempo for the last 15 s of a match
  // the BGM bus under the effects: the tracks average about -20 dBFS (render() + measureLevels()), so at 0.5 a
  // square-wave effect (GS.sfx, 0.16) stays about 6 dB above the music
  const BUS_LEVEL = 0.5;
  const DUCK = 0.35;             // the bus level is multiplied by this while the manual is open
  const VEL = Array.from({ length: 16 }, (_, v) => Math.pow(v / 15, 1.5));

  // =====================================================================
  // MML
  // =====================================================================
  const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  const DRUM = { b: 'kick', s: 'snare', h: 'hat', j: 'ohat', y: 'crash', m: 'tomh', n: 'toml', x: 'clap', z: 'rim' };

  // the text an error message quotes: 14 characters before position i and 6 from it
  const near = (s, i) => s.slice(Math.max(0, i - 14), i + 6);

  // [ ... ]n -> the body n times (innermost first); "a:b" inside plays "ab" each pass but only "a" on the last.
  // err(msg, quote): quote is the repeat in question (its start and end when it is long).
  function expandRepeats(s, err) {
    const re = /\[([^[\]]*)\](\d*)/;
    let m, guard = 0;
    while ((m = re.exec(s))) {
      const quote = m[0].length > 24 ? m[0].slice(0, 12) + ' … ' + m[0].slice(-10) : m[0];
      if (++guard > 2000) { err('too many repeats', quote); break; }
      const n = m[2] ? +m[2] : 2, body = m[1], k = body.indexOf(':');
      if (k >= 0 && body.indexOf(':', k + 1) >= 0) err('two ":" in one repeat', quote);
      if (n < 1 || n > 64) err('repeat count ' + n, quote);
      let out = '';
      for (let r = 0; r < n; r++) out += ' ' + (k >= 0 ? (r === n - 1 ? body.slice(0, k) : body.slice(0, k) + body.slice(k + 1)) : body) + ' ';
      s = s.slice(0, m.index) + out + s.slice(m.index + m[0].length);
    }
    const u = s.search(/[[\]]/);
    if (u >= 0) err('unbalanced [ ]', near(s, u));
    return s;
  }

  function parseMML(src, opt) {
    opt = opt || {};
    const name = opt.name || 'mml', bar = opt.bar || TPQ * 4, errors = [], ev = [], bars = [];
    // quote: the source text the error is about (null: none, for an empty source)
    const report = (msg, quote) => errors.push(name + ': ' + msg + (quote != null ? ' (near "' + quote.replace(/\s+/g, ' ').trim() + '")' : ''));
    let s = String(src || '').replace(/;[^\n]*/g, ' ');
    s = expandRepeats(s, report);
    let i = 0;
    const err = msg => report(msg, s ? near(s, i) : null);
    let t = 0, oct = 4, len = TPQ, vel = 12, gate = 7, tr = 0, pan = opt.pan || 0, inst = opt.inst || null, loopAt = -1, last = null;
    const kit = () => !!(inst && INST[inst] && INST[inst].kit);
    function int() {
      const m = /^[+-]?\d+/.exec(s.slice(i));
      if (!m) return null;
      i += m[0].length; return +m[0];
    }
    function length(def) {
      let d;
      if (s[i] === '%') {
        i++; const m = /^\d+/.exec(s.slice(i));
        if (!m) { err('bad %'); return def; }
        i += m[0].length; d = +m[0];
      } else {
        const m = /^\d+/.exec(s.slice(i));
        if (m) {
          i += m[0].length; const n = +m[0];
          if (!n || (TPQ * 4) % n) { err('bad length ' + n); d = def; } else d = (TPQ * 4) / n;
        } else d = def;
      }
      let add = d;
      while (s[i] === '.') { i++; add /= 2; d += add; }
      if (d % 1) err('length is not a whole tick');
      return d;
    }
    function pitch(letter, o) {
      let n = NOTE[letter];
      while (s[i] === '+' || s[i] === '#' || s[i] === '-') { n += s[i] === '-' ? -1 : 1; i++; }
      return 12 * (o + 1) + n + tr;
    }
    while (i < s.length) {
      const c = s[i];
      if (c === ' ' || c === '\n' || c === '\t' || c === '\r') { i++; continue; }
      if (c === '|') {
        i++; bars.push(t);
        if (t % bar) err('bar line ' + (t % bar) + ' ticks into bar ' + (Math.floor(t / bar) + 1));
        continue;
      }
      if (c === 'L') { i++; if (loopAt >= 0) err('second L'); loopAt = t; last = null; continue; }
      if (c === '@') {
        i++; const m = /^[a-z][a-z0-9]*/.exec(s.slice(i));
        if (!m) { err('bad @'); continue; }
        i += m[0].length;
        if (!INST[m[0]]) err('unknown instrument @' + m[0]);
        inst = m[0]; continue;
      }
      if (c === 'o') { i++; const n = int(); if (n == null || n < 0 || n > 8) err('bad o'); else oct = n; continue; }
      if (c === '>') { i++; oct++; continue; }
      if (c === '<') { i++; oct--; continue; }
      if (c === 'l') { i++; len = length(len); continue; }
      if (c === 'v') { i++; const n = int(); if (n == null || n < 0 || n > 15) err('bad v'); else vel = n; continue; }
      if (c === 'q') { i++; const n = int(); if (n == null || n < 1 || n > 8) err('bad q'); else gate = n; continue; }
      if (c === 'p') { i++; const n = int(); if (n == null || n < -8 || n > 8) err('bad p'); else pan = n / 8; continue; }
      if (c === 'k') { i++; const n = int(); if (n == null || Math.abs(n) > 24) err('bad k'); else tr = n; continue; }
      if (c === '^') {
        i++; const d = length(len);
        if (!last) err('^ with nothing to tie'); else last.forEach(e => { e.d += d; });
        t += d; continue;
      }
      if (c === 'r') { i++; t += length(len); last = []; continue; }
      if (c === '{') {
        i++; const ns = []; let o2 = oct;
        while (i < s.length && s[i] !== '}') {
          const ch = s[i];
          if (ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r') { i++; continue; }
          if (ch === '>') { o2++; i++; continue; }
          if (ch === '<') { o2--; i++; continue; }
          if (NOTE[ch] != null && !kit()) { i++; ns.push(pitch(ch, o2)); continue; }
          err('bad chord character "' + ch + '"'); i++;
        }
        if (s[i] !== '}') { err('unclosed {'); break; }
        i++;
        const d = length(len);
        if (!ns.length) err('empty chord');
        const es = ns.map(n => ({ t, d, n, v: vel, q: gate, inst, pan }));
        es.forEach(e => ev.push(e)); last = es; t += d; continue;
      }
      if (kit() && DRUM[c]) { i++; const d = length(len); ev.push({ t, d, dr: DRUM[c], v: vel, q: gate, inst, pan }); last = []; t += d; continue; }
      if (!kit() && NOTE[c] != null) {
        i++; const n = pitch(c, oct), d = length(len);
        const e = { t, d, n, v: vel, q: gate, inst, pan };
        ev.push(e); last = [e]; t += d; continue;
      }
      err('unexpected "' + c + '"'); i++;
    }
    if (!inst) err('no instrument');
    return { ev, len: t, loopAt, bars, errors };
  }

  function lowerBound(ev, tick) {
    let lo = 0, hi = ev.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (ev[m].t < tick) lo = m + 1; else hi = m; }
    return lo;
  }

  // =====================================================================
  // instruments
  // osc: sources [{ w: wave, r: frequency ratio, det: cents, g: level }]; env: a / d / s / r in seconds (s: the
  // sustain level, 0 = percussive: the note dies over about d); ring: a percussive note rings on past its gate (the
  // channel's next note still cuts it); lp: low-pass { f, from (Hz at the attack, gliding to f over t s), q, key
  // (follows the pitch) }; vib: { rate Hz, depth cents, delay s }; trem: { rate, depth 0..1 }; fm: a sine modulator
  // { r ratio, i index -> i1 over t s }; noise: breath level; gain: the voice level at v15; echo: the send to the
  // echo unit; range: the MIDI notes the lint accepts. kit: the drum set (see playDrum).
  // =====================================================================
  const INST = {
    lead: { osc: [{ w: 'pulse25' }], env: { a: 0.006, d: 0.16, s: 0.72, r: 0.07 }, lp: { f: 5200 }, vib: { rate: 5.6, depth: 14, delay: 0.16 }, gain: 0.15, echo: 0.42, range: [55, 98] },
    square: { osc: [{ w: 'pulse50' }], env: { a: 0.004, d: 0.12, s: 0.6, r: 0.05 }, lp: { f: 4200 }, gain: 0.12, echo: 0.3, range: [43, 98] },
    brass: { osc: [{ w: 'sawtooth', det: -7 }, { w: 'sawtooth', det: 7 }], env: { a: 0.018, d: 0.25, s: 0.75, r: 0.09 }, lp: { f: 2600, from: 650, t: 0.07, q: 1.1 }, vib: { rate: 5.2, depth: 10, delay: 0.25 }, gain: 0.12, echo: 0.35, range: [45, 86] },
    flute: { osc: [{ w: 'flute' }], noise: 0.05, env: { a: 0.035, d: 0.2, s: 0.82, r: 0.1 }, vib: { rate: 5, depth: 17, delay: 0.2 }, gain: 0.2, echo: 0.5, range: [60, 100] },
    strings: { osc: [{ w: 'sawtooth', det: -9 }, { w: 'sawtooth', det: 9 }, { w: 'sawtooth', r: 0.5, g: 0.35 }], env: { a: 0.12, d: 0.3, s: 0.85, r: 0.3 }, lp: { f: 2400, q: 0.5 }, vib: { rate: 4.6, depth: 8, delay: 0.3 }, gain: 0.075, echo: 0.4, range: [40, 93] },
    pad: { osc: [{ w: 'triangle' }, { w: 'sawtooth', det: 6, g: 0.3 }], env: { a: 0.18, d: 0.4, s: 0.8, r: 0.35 }, lp: { f: 1800, q: 0.4 }, gain: 0.085, echo: 0.4, range: [40, 88] },
    organ: { osc: [{ w: 'organ' }], env: { a: 0.01, d: 0.1, s: 0.9, r: 0.06 }, vib: { rate: 6.2, depth: 6, delay: 0 }, gain: 0.11, echo: 0.3, range: [36, 96] },
    marimba: { osc: [{ w: 'sine' }, { w: 'sine', r: 4, g: 0.22 }], env: { a: 0.002, d: 0.38, s: 0, r: 0.08 }, ring: true, gain: 0.3, echo: 0.4, range: [45, 96] },
    vibes: { osc: [{ w: 'sine' }, { w: 'sine', r: 3, g: 0.07 }], env: { a: 0.003, d: 1.1, s: 0, r: 0.25 }, ring: true, trem: { rate: 5.5, depth: 0.3 }, gain: 0.2, echo: 0.5, range: [53, 96] },
    epiano: { osc: [{ w: 'sine' }], fm: { r: 1, i: 2.2, i1: 0.3, t: 0.7 }, env: { a: 0.003, d: 1.4, s: 0, r: 0.15 }, gain: 0.2, echo: 0.35, range: [45, 91] },
    bell: { osc: [{ w: 'sine' }], fm: { r: 3.5, i: 1.6, i1: 0.15, t: 0.45 }, env: { a: 0.002, d: 0.9, s: 0, r: 0.25 }, ring: true, gain: 0.13, echo: 0.55, range: [67, 108] },
    pizz: { osc: [{ w: 'sawtooth' }], lp: { f: 1400, from: 3400, t: 0.06 }, env: { a: 0.003, d: 0.18, s: 0, r: 0.05 }, gain: 0.14, echo: 0.3, range: [40, 91] },
    bass: { osc: [{ w: 'bass' }], lp: { f: 1100, from: 2400, t: 0.08 }, env: { a: 0.004, d: 0.3, s: 0.55, r: 0.05 }, gain: 0.33, echo: 0, range: [26, 60] },
    synbass: { osc: [{ w: 'sawtooth' }, { w: 'pulse50', r: 0.5, g: 0.45 }], lp: { f: 520, from: 2600, t: 0.08, q: 3.5 }, env: { a: 0.003, d: 0.22, s: 0.6, r: 0.04 }, gain: 0.17, echo: 0, range: [26, 60] },
    drums: { kit: true, gain: 0.5, echo: 0.1 },
  };

  // =====================================================================
  // synthesis
  // =====================================================================
  function waves(ctx) {
    if (ctx.__gsBgmWaves) return ctx.__gsBgmWaves;
    const N = 40, W = {};
    const pw = fill => { const re = new Float32Array(N), im = new Float32Array(N); fill(re, im); return ctx.createPeriodicWave(re, im); };
    const pulse = d => pw(re => { for (let n = 1; n < N; n++) re[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * d); });
    W.pulse12 = pulse(0.125); W.pulse25 = pulse(0.25); W.pulse50 = pulse(0.5);
    W.organ = pw((re, im) => { [[1, 1], [2, 0.55], [3, 0.35], [4, 0.28], [6, 0.12], [8, 0.1]].forEach(([n, a]) => { im[n] = a; }); });
    W.flute = pw((re, im) => { im[1] = 1; im[2] = 0.2; im[3] = 0.1; im[4] = 0.04; });
    W.bass = pw((re, im) => { for (let n = 1; n < 16; n++) im[n] = Math.pow(n, -1.5) * (n === 2 ? 1.4 : 1); });
    ctx.__gsBgmWaves = W;
    return W;
  }
  // white noise from a fixed seed: every drum hit is the same "sample" (and renders are repeatable)
  function noise(ctx) {
    if (ctx.__gsBgmNoise) return ctx.__gsBgmNoise;
    const n = Math.floor(ctx.sampleRate * 0.5), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let x = 0x2545F491;
    for (let k = 0; k < n; k++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; d[k] = ((x >>> 0) / 4294967295) * 2 - 1; }
    ctx.__gsBgmNoise = b;
    return b;
  }
  const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);
  function gainNode(ctx, v) { const g = ctx.createGain(); g.gain.value = v; return g; }

  function playVoice(ctx, inst, t, dur, midi, amp, dest) {
    const f = hz(midi), e = inst.env, W = waves(ctx), srcs = [], nodes = [];
    const g = gainNode(ctx, 0); nodes.push(g);
    let head = g;
    if (inst.trem) {
      const tg = gainNode(ctx, 1 - inst.trem.depth / 2), lfo = ctx.createOscillator(), lg = gainNode(ctx, inst.trem.depth / 2);
      lfo.frequency.value = inst.trem.rate; lfo.connect(lg); lg.connect(tg.gain); tg.connect(head); head = tg;
      srcs.push(lfo); nodes.push(tg, lg);
    }
    if (inst.lp) {
      const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = inst.lp.q || 0.7;
      const k = inst.lp.key ? Math.max(0.5, f / 262) : 1, f1 = Math.min(16000, inst.lp.f * k);
      if (inst.lp.from) { fl.frequency.setValueAtTime(Math.min(16000, inst.lp.from * k), t); fl.frequency.setTargetAtTime(f1, t, (inst.lp.t || 0.1) / 3); }
      else fl.frequency.setValueAtTime(f1, t);
      fl.connect(head); head = fl; nodes.push(fl);
    }
    let vib = null;
    if (inst.vib) {
      const lfo = ctx.createOscillator(); lfo.frequency.value = inst.vib.rate;
      vib = gainNode(ctx, 0); const d0 = t + (inst.vib.delay || 0);
      vib.gain.setValueAtTime(0, t); vib.gain.setValueAtTime(0, d0); vib.gain.linearRampToValueAtTime(inst.vib.depth, d0 + 0.25);
      lfo.connect(vib); srcs.push(lfo); nodes.push(vib);
    }
    for (const o of inst.osc || []) {
      const osc = ctx.createOscillator();
      if (W[o.w]) osc.setPeriodicWave(W[o.w]); else osc.type = o.w;
      osc.frequency.setValueAtTime(f * (o.r || 1), t);
      if (o.det) osc.detune.setValueAtTime(o.det, t);
      if (vib) vib.connect(osc.detune);
      if (o.g != null && o.g !== 1) { const og = gainNode(ctx, o.g); osc.connect(og); og.connect(head); nodes.push(og); } else osc.connect(head);
      if (inst.fm) {
        const m = ctx.createOscillator(), dev = f * inst.fm.r, mg = gainNode(ctx, 0);
        m.frequency.setValueAtTime(dev, t);
        mg.gain.setValueAtTime(dev * inst.fm.i, t); mg.gain.setTargetAtTime(dev * inst.fm.i1, t, inst.fm.t / 3);
        m.connect(mg); mg.connect(osc.frequency); srcs.push(m); nodes.push(mg);
      }
      srcs.push(osc);
    }
    if (inst.noise) {
      const nz = ctx.createBufferSource(); nz.buffer = noise(ctx); nz.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = Math.min(12000, f * 2); bp.Q.value = 1.5;
      const ng = gainNode(ctx, inst.noise); nz.connect(bp); bp.connect(ng); ng.connect(head);
      srcs.push(nz); nodes.push(bp, ng);
    }
    g.connect(dest);
    const tA = t + e.a;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, tA);
    let stopAt;
    if (e.s > 0) {
      g.gain.setTargetAtTime(amp * e.s, tA, e.d / 3);
      const tR = Math.max(tA, t + dur); g.gain.setTargetAtTime(0, tR, e.r / 3); stopAt = tR + e.r * 2.5;
    } else {
      g.gain.setTargetAtTime(0, tA, e.d / 3);
      if (inst.ring) stopAt = tA + e.d * 2.5;
      else { const tR = Math.max(tA, t + dur); g.gain.setTargetAtTime(0, tR, e.r / 3); stopAt = Math.min(tA + e.d * 2.5, tR + e.r * 2.5); }
    }
    return finish({ g, srcs, nodes, start: t, tA, amp, stopAt: stopAt + 0.02 });
  }

  // the kit: every part goes through one gain (g), so a hat can choke the open hat
  function playDrum(ctx, name, t, amp, dest) {
    const srcs = [], nodes = [], g = gainNode(ctx, 1); nodes.push(g);
    const env = (node, peak, dec, at) => {
      node.gain.setValueAtTime(0, at); node.gain.linearRampToValueAtTime(peak, at + 0.001); node.gain.setTargetAtTime(0, at + 0.001, dec / 3);
    };
    const nz = (type, freq, q, peak, dec, delay) => {
      const at = t + (delay || 0), s = ctx.createBufferSource(); s.buffer = noise(ctx);
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = freq; fl.Q.value = q;
      const eg = gainNode(ctx, 0); env(eg, peak, dec, at);
      s.connect(fl); fl.connect(eg); eg.connect(g); s.start(at); s.__started = true; srcs.push(s); nodes.push(fl, eg);
    };
    const tone = (wave, f0, f1, tf, peak, dec) => {
      const o = ctx.createOscillator(); o.type = wave; o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + tf);
      const eg = gainNode(ctx, 0); env(eg, peak, dec, t);
      o.connect(eg); eg.connect(g); o.start(t); o.__started = true; srcs.push(o); nodes.push(eg);
    };
    let len = 0.3;
    switch (name) {
      case 'kick': tone('sine', 165, 42, 0.09, amp * 1.15, 0.3); nz('highpass', 2500, 0.7, amp * 0.22, 0.012); len = 0.55; break;
      case 'snare': nz('bandpass', 1850, 0.75, amp * 1.0, 0.15); tone('triangle', 205, 165, 0.05, amp * 0.5, 0.08); len = 0.4; break;
      case 'hat': nz('highpass', 7600, 0.6, amp * 0.32, 0.035); len = 0.1; break;
      case 'ohat': nz('highpass', 6900, 0.6, amp * 0.28, 0.24); len = 0.6; break;
      case 'crash': nz('highpass', 4300, 0.4, amp * 0.3, 1.1); len = 2.8; break;
      case 'tomh': tone('sine', 235, 165, 0.12, amp * 0.85, 0.24); len = 0.6; break;
      case 'toml': tone('sine', 150, 100, 0.14, amp * 0.9, 0.28); len = 0.7; break;
      case 'clap': [0, 0.011, 0.022].forEach((dl, k) => nz('bandpass', 1250, 1.1, amp * (k === 2 ? 0.85 : 0.55), k === 2 ? 0.14 : 0.008, dl)); len = 0.45; break;
      case 'rim': tone('triangle', 920, 920, 0.01, amp * 0.5, 0.025); nz('bandpass', 3200, 2, amp * 0.3, 0.012); len = 0.12; break;
      default: break;
    }
    g.connect(dest);
    return finish({ g, srcs, nodes, start: t, stopAt: t + len, grp: name === 'hat' || name === 'ohat' ? 'hh' : null });
  }
  function finish(v) {
    v.srcs.forEach(s => { if (!s.__started) { s.start(v.start); s.__started = true; } try { s.stop(v.stopAt); } catch (e) { /* stopped */ } });
    const last = v.srcs[v.srcs.length - 1];
    if (last) last.onended = () => { v.nodes.forEach(n => { try { n.disconnect(); } catch (e) { /* gone */ } }); v.srcs.forEach(s => { try { s.disconnect(); } catch (e) { /* gone */ } }); };
    return v;
  }
  // key off at time t (cut quickly; also for notes scheduled after t, which then never sound). Cancelling removes
  // the attack ramp when it ends after t, and a cancelled ramp drops the gain back to its start (0): inside the
  // attack the ramp is rebuilt up to t first, so a short note on a slow-attack instrument still sounds and a cut
  // mid-attack does not click.
  function cutVoice(v, t) {
    if (v.stopAt <= t) return;
    try {
      const p = v.g.gain;
      p.cancelScheduledValues(t);
      if (v.tA && t > v.start && t < v.tA) p.linearRampToValueAtTime((v.amp * (t - v.start)) / (v.tA - v.start), t);
      p.setTargetAtTime(0, t, 0.005);
    } catch (e) { /* gone */ }
    const at = Math.max(t + 0.03, 0);
    v.srcs.forEach(s => { try { s.stop(at); } catch (e) { /* already stopped */ } });
    v.stopAt = at;
  }

  // =====================================================================
  // bus (one per AudioContext) and players (one per playing track)
  // =====================================================================
  // busIn -> lp -> comp -> out (the bus level, see applyDuck) -> dest. Echo unit: echoIn -> delay -> elp -> ehp ->
  // echoOut -> busIn, and ehp -> fb -> delay (the repeats)
  function buildBus(ctx, dest) {
    const A = { ctx };
    A.busIn = gainNode(ctx, 1); A.echoIn = gainNode(ctx, 1);
    A.lp = ctx.createBiquadFilter(); A.lp.type = 'lowpass'; A.lp.frequency.value = 9500; A.lp.Q.value = 0.5;
    A.comp = ctx.createDynamicsCompressor();
    A.comp.threshold.value = -14; A.comp.knee.value = 8; A.comp.ratio.value = 3; A.comp.attack.value = 0.004; A.comp.release.value = 0.2;
    A.out = gainNode(ctx, BUS_LEVEL); A.outLevel = BUS_LEVEL;   // outLevel: the value A.out is heading for
    A.delay = ctx.createDelay(1); A.delay.delayTime.value = 0.22;
    A.elp = ctx.createBiquadFilter(); A.elp.type = 'lowpass'; A.elp.frequency.value = 2600;
    A.ehp = ctx.createBiquadFilter(); A.ehp.type = 'highpass'; A.ehp.frequency.value = 220;
    A.fb = gainNode(ctx, 0.35); A.echoOut = gainNode(ctx, 0.4);
    A.echoIn.connect(A.delay); A.delay.connect(A.elp); A.elp.connect(A.ehp); A.ehp.connect(A.fb); A.fb.connect(A.delay);
    A.ehp.connect(A.echoOut); A.echoOut.connect(A.busIn);
    A.busIn.connect(A.lp); A.lp.connect(A.comp); A.comp.connect(A.out); A.out.connect(dest);
    return A;
  }
  // the echo unit is shared: a new track's settings come in after the old tail is ducked out (40 ms, before the new
  // track's first note at +60 ms), so the delay line never jumps under a sounding echo. now: set at once (offline).
  function setEcho(A, echo, now) {
    const e = Object.assign({ delay: 0.22, fb: 0.35, wet: 0.4 }, echo || {});
    const v = [GS.clamp(e.delay, 0.016, 0.96), GS.clamp(e.fb, 0, 0.7), GS.clamp(e.wet, 0, 1)];
    if (A.echoNow && A.echoNow.every((x, k) => x === v[k])) return;
    A.echoNow = v;
    if (now != null) {
      A.delay.delayTime.setValueAtTime(v[0], now); A.fb.gain.setValueAtTime(v[1], now); A.echoOut.gain.setValueAtTime(v[2], now);
      return;
    }
    const t = A.ctx.currentTime, at = t + 0.04;
    [A.fb.gain, A.echoOut.gain].forEach(p => { p.cancelScheduledValues(t); p.setTargetAtTime(0, t, 0.008); });
    A.delay.delayTime.setValueAtTime(v[0], at);
    A.fb.gain.setValueAtTime(v[1], at);
    A.echoOut.gain.setTargetAtTime(v[2], at, 0.01);
  }

  function compile(track) {
    if (track._comp) return track._comp;
    const bar = (track.beats || 4) * TPQ, errors = [];
    const ch = track.ch.map((c, k) => {
      const r = parseMML(c.mml, { name: track.id + ' ch' + (k + 1), bar, pan: (c.pan || 0) / 8, inst: c.inst });
      r.errors.forEach(e => errors.push(e));
      r.ev.sort((a, b) => a.t - b.t);
      return { ev: r.ev, len: r.len, loopAt: r.loopAt, bars: r.bars, vol: c.vol == null ? 1 : c.vol, loopIdx: r.loopAt >= 0 ? lowerBound(r.ev, r.loopAt) : 0 };
    });
    const len = Math.max(0, ...ch.map(c => c.len)), loopAt = ch.length ? ch[0].loopAt : -1;
    track._comp = { bpm: track.bpm, len, loopAt, bar, ch, errors };
    return track._comp;
  }

  function createPlayer(A, track, offline) {
    const ctx = A.ctx, comp = compile(track), t0 = offline ? 0.05 : ctx.currentTime + 0.06;
    const P = { id: track.id, track, comp, A, ctx, offline: !!offline, tick: 0, time: t0, tempo: 1, holds: new Set(), killAt: 0,
      dead: false, ended: false, voices: [], hist: [] };
    P.dry = gainNode(ctx, 0); P.wet = gainNode(ctx, 0);
    P.dry.connect(A.busIn); P.wet.connect(A.echoIn);
    P.ch = comp.ch.map(c => {
      const out = gainNode(ctx, c.vol), send = gainNode(ctx, 0);
      let pan = null;
      if (ctx.createStereoPanner) { pan = ctx.createStereoPanner(); out.connect(pan); pan.connect(P.dry); } else out.connect(P.dry);
      out.connect(send); send.connect(P.wet);
      return { ev: c.ev, idx: 0, loopIdx: c.loopIdx, out, pan, send, voices: [], lastT: -1 };
    });
    fadePlayer(P, 1, t0 - 0.01, 0.004);
    return P;
  }
  // a player's own volume (its dry and echo sends) toward v from time at (time constant tc): fade-ins, holds, fades
  function fadePlayer(P, v, at, tc) {
    [P.dry, P.wet].forEach(g => { try { g.gain.cancelScheduledValues(at); g.gain.setTargetAtTime(v, at, tc); } catch (e) { /* gone */ } });
  }
  function fire(P, c, e, t, spt) {
    const inst = INST[e.inst]; if (!inst) return;
    const amp = (inst.gain || 0.1) * VEL[e.v];
    if (c.pan) c.pan.pan.setValueAtTime(GS.state.stereo === false ? 0 : GS.clamp(e.pan, -1, 1), t);
    c.send.gain.setValueAtTime(inst.echo || 0, t);
    let v;
    if (inst.kit) {
      const grp = e.dr === 'hat' || e.dr === 'ohat' ? 'hh' : null;
      if (grp) c.voices.forEach(x => { if (x.grp === grp) cutVoice(x, t); });
      v = playDrum(P.ctx, e.dr, t, amp, c.out);
    } else {
      // one sound-chip voice per channel: a new note (or chord) keys the sounding one off; a chord's notes share a tick
      if (c.lastT !== t) c.voices.forEach(x => cutVoice(x, t));
      c.lastT = t;
      const dur = e.q >= 8 ? e.d * spt : Math.max(spt, (e.d * spt * e.q) / 8);
      v = playVoice(P.ctx, inst, t, dur, e.n, amp, c.out);
    }
    c.voices = c.voices.filter(x => x.stopAt > t); c.voices.push(v);
    P.voices.push(v);
  }
  // one tick: fire its events (play = false skips them: catching up after a stall), then move on (looping at the end)
  function advanceTick(P, play) {
    const spt = 60 / (P.comp.bpm * TPQ * P.tempo);
    for (const c of P.ch) {
      while (c.idx < c.ev.length && c.ev[c.idx].t <= P.tick) { if (play && c.ev[c.idx].t === P.tick) fire(P, c, c.ev[c.idx], P.time, spt); c.idx++; }
    }
    if (!P.offline) { P.hist.push(P.tick, P.time); if (P.hist.length > 600) P.hist.splice(0, P.hist.length - 300); }
    P.tick++; P.time += spt;
    if (P.tick >= P.comp.len) {
      if (P.comp.loopAt < 0 || P.comp.loopAt >= P.comp.len) { P.ended = true; return; }
      P.tick = P.comp.loopAt; P.ch.forEach(c => { c.idx = c.loopIdx; });
    }
  }
  // schedule a player's notes up to the time horizon (and end it once its fade-out is over)
  function step(P, horizon) {
    if (P.dead) return;
    const now = P.ctx.currentTime;
    if (P.killAt && now >= P.killAt) { kill(P); return; }
    if (P.holds.size || P.ended || !P.comp.len) return;
    if (!P.offline && P.ctx.state !== 'running') return;
    let guard = 0;
    if (!P.offline && P.time < now - 0.08) { while (P.time < now && !P.ended && guard++ < 200000) advanceTick(P, false); }   // stalled: skip, keep the beat
    while (P.time < horizon && !P.ended && guard++ < 200000) advanceTick(P, true);
    if (P.voices.length > 64) P.voices = P.voices.filter(v => v.stopAt > now);
  }
  function hold(P, why) {
    if (P.holds.has(why)) return;
    P.holds.add(why);
    if (P.holds.size > 1 || P.dead) return;
    const now = P.ctx.currentTime;
    // rewind to the first tick not heard yet, so the music goes on from there
    for (let k = 0; k < P.hist.length; k += 2) {
      if (P.hist[k + 1] >= now) { const tick = P.hist[k]; P.tick = tick; P.ch.forEach(c => { c.idx = lowerBound(c.ev, tick); }); break; }
    }
    P.hist.length = 0;
    fadePlayer(P, 0, now, 0.008);
    P.voices.forEach(v => cutVoice(v, now)); P.voices = [];
    P.ch.forEach(c => { c.voices = []; c.lastT = -1; });
  }
  function unhold(P, why) {
    if (!P.holds.delete(why) || P.holds.size || P.dead) return;
    P.time = P.ctx.currentTime + 0.06;
    fadePlayer(P, 1, P.time - 0.01, 0.004);
  }
  function fadeOut(P, sec) {
    if (P.dead || P.killAt) return;
    const now = P.ctx.currentTime;
    fadePlayer(P, 0, now, Math.max(0.005, sec / 4));
    P.killAt = now + Math.max(0.03, sec);
    if (B.cur === P) B.cur = null;
  }
  function kill(P) {
    if (P.dead) return;
    P.dead = true;
    const now = P.ctx.currentTime;
    fadePlayer(P, 0, now, 0.008);
    P.voices.forEach(v => cutVoice(v, now + 0.02)); P.voices = [];
    B.players = B.players.filter(x => x !== P);
    if (B.cur === P) B.cur = null;
    setTimeout(() => {
      try { P.dry.disconnect(); P.wet.disconnect(); P.ch.forEach(c => { c.out.disconnect(); c.send.disconnect(); if (c.pan) c.pan.disconnect(); }); } catch (e) { /* gone */ }
    }, 300);
  }

  // =====================================================================
  // scenes
  // =====================================================================
  const TRACKS = [], BY_ID = {};
  // want: the track to play (the scene's, or a sound test's); sceneWant: the scene's own request
  const B = { want: null, sceneWant: null, paused: false, testing: false, hurry: false, hidden: typeof document !== 'undefined' && !!document.hidden, ignoreHidden: false,
    cur: null, players: [], timer: 0, bus: null };

  function bus() {
    const a = GS.audioNodes && GS.audioNodes();
    if (!a || !a.ctx || a.ctx.state === 'closed') return null;
    if (!B.bus || B.bus.ctx !== a.ctx) B.bus = buildBus(a.ctx, a.master);
    return B.bus;
  }
  const enabled = () => GS.state.sound > 0 && (GS.state.bgm !== false || B.testing);
  // the scheduler timer runs while there are players
  function ensureTimer() {
    if (B.players.length && !B.timer) B.timer = setInterval(schedule, SCHEDULE_MS);
    if (!B.players.length && B.timer) { clearInterval(B.timer); B.timer = 0; }
  }
  // the bus level: BUS_LEVEL, lowered (DUCK) while the manual is open
  function applyDuck(A) {
    const v = BUS_LEVEL * (GS.state.manualOpen ? DUCK : 1);
    if (Math.abs(v - A.outLevel) > 1e-4) { A.outLevel = v; A.out.gain.setTargetAtTime(v, A.ctx.currentTime, 0.08); }
  }
  // the scheduler tick (every SCHEDULE_MS, and at the end of sync()): every player's notes up to LOOKAHEAD ahead
  function schedule() {
    if (B.bus) applyDuck(B.bus);
    // a context the browser closed never reaches a fade's end: drop its players
    B.players.slice().forEach(P => { if (P.ctx.state === 'closed') kill(P); else step(P, P.ctx.currentTime + LOOKAHEAD); });
    ensureTimer();
  }
  function start(id) {
    const tr = BY_ID[id], A = bus();
    if (!tr || !A) { if (!tr) GS.warnOnce('bgm:' + id, 'unknown BGM', id); return; }
    if (B.cur) kill(B.cur);
    setEcho(A, tr.echo);
    const P = createPlayer(A, tr, false);
    P.tempo = B.hurry ? HURRY : 1;   // e.g. 音 turned off and on again in the last 15 s
    B.cur = P; B.players.push(P);
  }
  let bgmFlag = GS.state.bgm !== false;
  function sync() {
    // おんがく turned OFF also ends a sound test playing (it may play with おんがく OFF only until then)
    // (and the screen's own track is what turning it back on brings, not the test's)
    const flag = GS.state.bgm !== false;
    if (flag !== bgmFlag) { bgmFlag = flag; if (!flag) { B.testing = false; B.want = B.sceneWant; } }
    const A = bus();
    if (!A || !enabled()) { B.players.slice().forEach(kill); ensureTimer(); return; }
    if (B.cur && B.cur.A !== A) kill(B.cur);
    if (!B.want) { if (B.cur) fadeOut(B.cur, 0.1); }
    else if (!B.cur || B.cur.id !== B.want) start(B.want);
    const P = B.cur;
    if (P) {
      if (B.paused) hold(P, 'scene'); else unhold(P, 'scene');
      if (B.hidden && !B.ignoreHidden) hold(P, 'hidden'); else unhold(P, 'hidden');
    }
    applyDuck(A);
    ensureTimer();
    schedule();
  }
  // a scene's request: track id | null (fade out) | 'pause' (hold) | undefined (leave as it is)
  function scene(w) {
    if (w === undefined) return;
    B.testing = false;
    if (w === 'pause') { B.paused = true; sync(); return; }
    B.paused = false;
    if ((w || null) !== B.want) B.hurry = false;   // the hurry belongs to one match's music
    B.want = B.sceneWant = w || null;
    sync();
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { B.hidden = !!document.hidden; sync(); });
  }

  // =====================================================================
  // checks and offline rendering (self-test, sound previews)
  // =====================================================================
  function lint(track) {
    const comp = compile(track), errors = comp.errors.slice(), warnings = [];
    const lens = comp.ch.map(c => c.len), loops = comp.ch.map(c => c.loopAt);
    if (lens.some(l => l !== lens[0])) errors.push(track.id + ': channel lengths differ ' + JSON.stringify(lens.map(l => l / comp.bar)) + ' bars');
    if (loops.some(l => l !== loops[0])) errors.push(track.id + ': loop points differ ' + JSON.stringify(loops.map(l => l / comp.bar)) + ' bars');
    if (comp.len % comp.bar) errors.push(track.id + ': length is not whole bars (' + comp.len / comp.bar + ')');
    if (comp.loopAt > 0 && comp.loopAt % comp.bar) errors.push(track.id + ': loop point is not on a bar line');
    if (comp.ch.length > 8) errors.push(track.id + ': ' + comp.ch.length + ' channels (8 at most)');
    const spt = 60 / (comp.bpm * TPQ);
    comp.ch.forEach((c, k) => c.ev.forEach(e => {
      const inst = INST[e.inst];
      if (inst && inst.range && e.n != null && (e.n < inst.range[0] || e.n > inst.range[1])) {
        warnings.push(track.id + ' ch' + (k + 1) + ': ' + noteName(e.n) + ' out of @' + e.inst + ' range at ' + pos(comp, e.t));
      }
      // a note that ends inside the instrument's attack never reaches its level (slow strings / pad in fast runs)
      const gate = e.q >= 8 ? e.d : (e.d * e.q) / 8;
      if (inst && inst.env && e.n != null && gate * spt < inst.env.a) {
        warnings.push(track.id + ' ch' + (k + 1) + ': ' + noteName(e.n) + ' at ' + pos(comp, e.t) + ' is shorter than the @' + e.inst + ' attack');
      }
    }));
    // voices sounding at once (a chord = several voices); the budget is 8, like the 16-bit sound chips
    const pts = [];
    comp.ch.forEach(c => c.ev.forEach(e => { const d = e.dr ? Math.min(e.d, TPQ / 2) : e.d; pts.push([e.t, 1], [e.t + d, -1]); }));
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let n = 0, max = 0; pts.forEach(p => { n += p[1]; max = Math.max(max, n); });
    if (max > 8) warnings.push(track.id + ': up to ' + max + ' voices at once (the budget is 8)');
    return { id: track.id, errors, warnings, bars: comp.len / comp.bar, introBars: Math.max(0, comp.loopAt) / comp.bar,
      seconds: (comp.len * 60) / (comp.bpm * TPQ), loopSeconds: ((comp.len - Math.max(0, comp.loopAt)) * 60) / (comp.bpm * TPQ), voices: max };
  }
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = n => NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
  const pos = (comp, t) => 'bar ' + (Math.floor(t / comp.bar) + 1) + ' beat ' + (Math.floor((t % comp.bar) / TPQ) + 1) + (t % TPQ ? '+' + (t % TPQ) : '');
  // strong-beat clashes (a minor 2nd or minor 9th between two held notes on beats 1 and 3; major 7ths are left
  // alone, they are the maj7 chords): a list to look at, not errors
  function clashes(track) {
    const comp = compile(track), out = [], half = comp.bar / 2;
    for (let t = 0; t < comp.len; t += half) {
      const on = [];
      comp.ch.forEach((c, k) => c.ev.forEach(e => { if (e.n != null && e.t <= t && e.t + e.d > t && e.t + e.d - t >= TPQ / 2) on.push({ k, n: e.n }); }));
      for (let a = 0; a < on.length; a++) for (let b = a + 1; b < on.length; b++) {
        if (on[a].k === on[b].k) continue;
        const iv = Math.abs(on[a].n - on[b].n);
        if (iv === 1 || iv === 13) out.push(pos(comp, t) + ': ' + noteName(on[a].n) + ' (ch' + (on[a].k + 1) + ') / ' + noteName(on[b].n) + ' (ch' + (on[b].k + 1) + ')');
      }
    }
    return out;
  }
  // render a track offline: { buffer, introSec, loopSec } (intro + loops x loop + tail seconds)
  function render(id, opts) {
    opts = opts || {};
    const tr = BY_ID[id]; if (!tr) return Promise.reject(new Error('unknown BGM ' + id));
    const comp = compile(tr), sr = opts.sampleRate || 44100, tempo = opts.hurry ? HURRY : 1;
    const spt = 60 / (comp.bpm * TPQ * tempo), intro = Math.max(0, comp.loopAt) * spt, loop = (comp.len - Math.max(0, comp.loopAt)) * spt;
    const music = intro + loop * (opts.loops == null ? 1 : opts.loops), sec = 0.05 + music + (opts.tail == null ? 1.5 : opts.tail);
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new OAC(2, Math.ceil(sec * sr), sr);
    const A = buildBus(ctx, ctx.destination); setEcho(A, tr.echo, 0);
    const P = createPlayer(A, tr, true); P.tempo = tempo;
    // notes are made just in time, as in live play (the context suspends every 0.5 s): a graph holding every note of
    // the track at once renders many times slower
    // (Firefox has no OfflineAudioContext.suspend: there every note is made up front, slower but the same sound)
    const end = 0.05 + music, CH = 0.5;
    if (typeof ctx.suspend !== 'function') step(P, end);
    else {
      step(P, Math.min(end, CH + 0.25));
      for (let at = CH; at < sec - 0.01; at += CH) {
        ctx.suspend(at).then(() => { try { step(P, Math.min(end, at + CH + 0.25)); } finally { ctx.resume(); } }).catch(() => {});
      }
    }
    return ctx.startRendering().then(buffer => ({ buffer, introSec: intro, loopSec: loop, seconds: sec }));
  }
  // peak and RMS of a rendered buffer (linear and dB); { nan: true } if a sample is NaN
  function measureLevels(buffer) {
    let peak = 0, sum = 0, n = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const d = buffer.getChannelData(c);
      for (let k = 0; k < d.length; k++) { const v = d[k]; if (v !== v) return { nan: true }; const a = Math.abs(v); if (a > peak) peak = a; sum += v * v; n++; }
    }
    return { peak, rms: Math.sqrt(sum / Math.max(1, n)), peakDb: 20 * Math.log10(peak || 1e-9), rmsDb: 10 * Math.log10(sum / Math.max(1, n) || 1e-18) };
  }

  // =====================================================================
  // API
  // =====================================================================
  GS.bgm = {
    TPQ, INST, HURRY,
    tracks: () => TRACKS.slice(),
    track: id => BY_ID[id] || null,
    // js/bgm-tracks.js: GS.bgm.define({ id, no, name, bpm, beats?, echo?, ch: [{ inst, pan?, vol?, mml }] })
    // (opts.replace: swap a track of the same id, e.g. while writing one from the console)
    define(track, opts) {
      if (!track || !track.id) { console.warn('[GS] bgm.define: bad track'); return; }
      if (BY_ID[track.id]) {
        if (!(opts && opts.replace)) { console.warn('[GS] bgm.define: duplicate track', track.id); return; }
        TRACKS.splice(TRACKS.indexOf(BY_ID[track.id]), 1);
      }
      BY_ID[track.id] = track; TRACKS.push(track); TRACKS.sort((a, b) => (a.no || 99) - (b.no || 99));
    },
    // core GS.go -> the screen's def.bgm(state, params); a nested GS.go inside enter() leaves only the newest
    onScene(id, st, def, params) {
      if (!def || typeof def.bgm !== 'function') return;
      const c = GS.current; if (c.id !== id || c.state !== st) return;
      scene(def.bgm(st, params || {}));
    },
    scene,
    // サウンドテスト: play a track from the top (also with おんがく OFF; the next scene ends that)
    play(id) {
      if (!BY_ID[id]) return;
      B.testing = true; B.want = id; B.paused = false; B.hurry = false;
      if (B.cur) kill(B.cur);
      sync();
    },
    // fade the current track out over n frames (しゅつげき, the end of the demo); the scene wants silence then
    stop(frames) {
      B.want = B.sceneWant = null; B.paused = false; B.testing = false; B.hurry = false;
      if (B.cur) fadeOut(B.cur, Math.max(0.02, (frames || 0) / 60));
      ensureTimer();
    },
    // the last 15 s of a match: the current track 15% faster (until the scene's track changes)
    hurry(on) { B.hurry = !!on; if (B.cur) B.cur.tempo = on ? HURRY : 1; },
    sync,
    playing: () => (B.cur && !B.cur.dead ? B.cur.id : null),
    info() {
      const P = B.cur;
      return { want: B.want, paused: B.paused, testing: B.testing, hidden: B.hidden, players: B.players.length, timer: !!B.timer,
        cur: P ? { id: P.id, tick: P.tick, bar: Math.floor(P.tick / P.comp.bar) + 1, tempo: P.tempo, holds: Array.from(P.holds), ctx: P.ctx.state } : null,
        level: B.bus ? B.bus.outLevel : null };
    },
    // developer hook (console, automated browser checks), not used by the game: { ignoreHidden: true } keeps the
    // music playing in a hidden tab; returns the engine's internal state
    _test(o) { if (o && 'ignoreHidden' in o) { B.ignoreHidden = !!o.ignoreHidden; sync(); } return B; },
    // checks and offline rendering (GS.bgm.levels(buffer) measures a render())
    parse: parseMML, compile, lint, clashes, render, levels: measureLevels,
    selfTest() {
      const r = TRACKS.map(lint), bad = r.filter(x => x.errors.length);
      return { ok: TRACKS.length > 0 && !bad.length, tracks: r };
    },
  };
})();
