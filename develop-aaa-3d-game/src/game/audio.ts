import type { SoundKind } from "./blocks";

/**
 * Everything is synthesised at runtime — no audio assets.
 * Filtered noise bursts + resonant bodies give each material its own voice.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private nightOsc: OscillatorNode | null = null;
  private nightGain: GainNode | null = null;
  volume = 0.7;
  enabled = true;

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = this.volume;
    master.connect(ctx.destination);
    this.master = master;

    // white noise buffer
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    this.startAmbience();
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = this.enabled ? v : 0;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? this.volume : 0;
  }

  private noise(dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = "bandpass", sweep = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuf || !this.enabled) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(60, freq + sweep), ctx.currentTime + dur);
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
  }

  private tone(freq: number, dur: number, gain: number, type: OscillatorType = "sine", slide = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const o = ctx.createOscillator();
    o.type = type;
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private profile(kind: SoundKind) {
    switch (kind) {
      case "grass":
      case "plant":
        return { freq: 2400, q: 0.8, dur: 0.09, gain: 0.16, type: "highpass" as BiquadFilterType };
      case "dirt":
        return { freq: 620, q: 1.1, dur: 0.13, gain: 0.24, type: "lowpass" as BiquadFilterType };
      case "sand":
        return { freq: 3600, q: 0.6, dur: 0.14, gain: 0.13, type: "highpass" as BiquadFilterType };
      case "wood":
        return { freq: 420, q: 3.2, dur: 0.16, gain: 0.3, type: "bandpass" as BiquadFilterType };
      case "glass":
        return { freq: 5200, q: 2.4, dur: 0.2, gain: 0.2, type: "bandpass" as BiquadFilterType };
      case "liquid":
        return { freq: 900, q: 1.4, dur: 0.22, gain: 0.2, type: "bandpass" as BiquadFilterType };
      default:
        return { freq: 1150, q: 1.7, dur: 0.14, gain: 0.26, type: "bandpass" as BiquadFilterType };
    }
  }

  hit(kind: SoundKind) {
    const p = this.profile(kind);
    this.noise(p.dur * 0.6, p.freq, p.q, p.gain * 0.45, p.type, -p.freq * 0.2);
  }

  breakBlock(kind: SoundKind) {
    const p = this.profile(kind);
    this.noise(p.dur * 1.5, p.freq * 0.85, p.q * 0.7, p.gain, p.type, -p.freq * 0.35);
    if (kind === "stone") this.tone(140, 0.14, 0.16, "triangle", -60);
    if (kind === "glass") {
      this.tone(2600, 0.1, 0.07, "square", -900);
      this.noise(0.22, 6800, 1.2, 0.1, "highpass");
    }
    if (kind === "wood") this.tone(180, 0.18, 0.14, "triangle", -70);
  }

  place(kind: SoundKind) {
    const p = this.profile(kind);
    this.noise(p.dur, p.freq * 0.7, p.q, p.gain * 0.9, p.type);
    this.tone(kind === "wood" ? 210 : 130, 0.1, 0.12, "triangle", -40);
  }

  step(kind: SoundKind) {
    const p = this.profile(kind);
    this.noise(p.dur * 0.55, p.freq * (0.85 + Math.random() * 0.3), p.q * 0.8, p.gain * 0.34, p.type);
  }

  jump() {
    this.noise(0.07, 900, 1.2, 0.09, "bandpass");
  }

  land(power: number) {
    this.noise(0.14, 420, 0.9, 0.1 + power * 0.22, "lowpass", -200);
    this.tone(90, 0.12, 0.08 * power, "sine", -30);
  }

  splash() {
    this.noise(0.4, 1400, 0.7, 0.24, "bandpass", -900);
    this.noise(0.25, 500, 1.1, 0.16, "lowpass");
  }

  ui(up = true) {
    this.tone(up ? 660 : 420, 0.07, 0.09, "square", up ? 180 : -120);
  }

  openInventory() {
    this.tone(340, 0.09, 0.07, "triangle", 120);
    this.noise(0.1, 2600, 0.8, 0.05, "highpass");
  }

  deny() {
    this.tone(150, 0.12, 0.11, "sawtooth", -50);
  }

  levelUp() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 0.1, "triangle"), i * 90));
  }

  /* ---------------- weather ---------------- */
  private rainSrc: AudioBufferSourceNode | null = null;
  private rainGain: GainNode | null = null;
  private rainFilter: BiquadFilterNode | null = null;
  private patterGain: GainNode | null = null;

  private startRain() {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuf || this.rainSrc) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1500;
    f.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.value = 0;
    // low body of the rain
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    const bg = ctx.createGain();
    bg.gain.value = 0;
    src.connect(f).connect(g).connect(this.master);
    src.connect(lp).connect(bg).connect(this.master);
    src.start();
    this.rainSrc = src;
    this.rainGain = g;
    this.rainFilter = f;
    this.patterGain = bg;
  }

  /** kind: 0 clear · 1 rain · 2 storm · 3 snow */
  setWeather(kind: number, intensity: number) {
    this.startRain();
    const ctx = this.ctx;
    if (!ctx || !this.rainGain || !this.rainFilter || !this.patterGain) return;
    const t = ctx.currentTime;
    const wet = kind === 1 || kind === 2 ? intensity : kind === 3 ? intensity * 0.42 : 0;
    this.rainGain.gain.setTargetAtTime(wet * 0.16, t, 1.4);
    this.patterGain.gain.setTargetAtTime(wet * 0.11, t, 1.8);
    this.rainFilter.frequency.setTargetAtTime(kind === 3 ? 700 : 1200 + intensity * 2200, t, 1.2);
  }

  thunder(near: boolean) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuf || !this.enabled) return;
    const t = ctx.currentTime;
    const dur = near ? 2.6 : 4.2;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(near ? 900 : 320, t);
    lp.frequency.exponentialRampToValueAtTime(near ? 120 : 70, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(near ? 0.55 : 0.24, t + (near ? 0.05 : 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.1);
    // sub rumble
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(near ? 52 : 34, t);
    o.frequency.exponentialRampToValueAtTime(22, t + dur);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(near ? 0.4 : 0.16, t + 0.2);
    og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(og).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  /** little procedural songbird */
  bird() {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const notes = 2 + Math.floor(Math.random() * 3);
    const base = 1700 + Math.random() * 1500;
    const t0 = ctx.currentTime;
    for (let i = 0; i < notes; i++) {
      const t = t0 + i * (0.07 + Math.random() * 0.06);
      const o = ctx.createOscillator();
      o.type = "sine";
      const f0 = base * (0.85 + Math.random() * 0.5);
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * (1.2 + Math.random() * 0.7), t + 0.05);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.045 + Math.random() * 0.03, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.12);
    }
  }

  discovery() {
    const ctx = this.ctx;
    if (!ctx) return;
    [659, 880, 1174, 1568].forEach((f, i) =>
      window.setTimeout(() => this.tone(f, 0.34, 0.075, "triangle"), i * 85)
    );
    this.noise(0.5, 5200, 0.7, 0.045, "highpass");
  }

  whoosh() {
    this.noise(0.75, 700, 0.5, 0.13, "bandpass", 2600);
  }

  private startAmbience() {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuf) return;
    // wind
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 380;
    f.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = 0.018;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    this.windGain = g;
    this.windFilter = f;
    // slow LFO on the wind
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(f.frequency);
    lfo.start();

    // deep night drone
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 58;
    const og = ctx.createGain();
    og.gain.value = 0;
    osc.connect(og).connect(this.master);
    osc.start();
    this.nightOsc = osc;
    this.nightGain = og;
  }

  /** 0 = day, 1 = deep night; also used for underwater muffling */
  setAmbience(night: number, underwater: boolean, cave: number) {
    if (!this.ctx || !this.windGain || !this.windFilter || !this.nightGain) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(underwater ? 0.05 : 0.014 + night * 0.02 + cave * 0.01, t, 0.6);
    this.windFilter.frequency.setTargetAtTime(underwater ? 220 : 340 + night * 120, t, 0.8);
    this.nightGain.gain.setTargetAtTime(night * 0.035 * (1 - (underwater ? 0.7 : 0)), t, 1.2);
    if (this.nightOsc) this.nightOsc.frequency.setTargetAtTime(58 + cave * 8, t, 2);
  }
}

export const sfx = new Sfx();
