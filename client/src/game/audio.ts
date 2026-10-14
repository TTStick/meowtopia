// Tiny synthesized sound kit (no audio files): purrs, meows, blips and a soft
// generative music-box melody.
class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  sound = true;
  music = true;
  private musicTimer: any = null;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.18;
      this.musicGain.connect(this.master);
    } catch {
      return null;
    }
    return this.ctx;
  }

  unlock() {
    const c = this.ensure();
    if (c && c.state === 'suspended') void c.resume();
    if (this.music) this.startMusic();
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  blip(freq = 660, dur = 0.12) {
    if (!this.sound) return;
    const c = this.ensure();
    if (!c || !this.master) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 1.5, t + dur);
    this.env(g, t, 0.01, 0.25, dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  coin() {
    this.blip(988, 0.08);
    setTimeout(() => this.blip(1318, 0.14), 80);
  }

  sparkle() {
    [1046, 1318, 1568, 2093].forEach((f, i) => setTimeout(() => this.blip(f, 0.1), i * 70));
  }

  purr() {
    if (!this.sound) return;
    const c = this.ensure();
    if (!c || !this.master) return;
    const t = c.currentTime;
    const len = 1.4;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const tt = i / c.sampleRate;
      const am = 0.5 + 0.5 * Math.sin(tt * Math.PI * 2 * 24);
      const breath = Math.sin((tt / len) * Math.PI);
      d[i] = (Math.random() * 2 - 1) * am * breath;
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    const g = c.createGain();
    g.gain.value = 0.55;
    src.connect(lp).connect(g).connect(this.master);
    src.start(t);
  }

  meow(pitch = 1) {
    if (!this.sound) return;
    const c = this.ensure();
    if (!c || !this.master) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    const f0 = 520 * pitch;
    o.frequency.setValueAtTime(f0 * 0.8, t);
    o.frequency.linearRampToValueAtTime(f0 * 1.25, t + 0.12);
    o.frequency.linearRampToValueAtTime(f0 * 0.75, t + 0.45);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 6;
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.linearRampToValueAtTime(1600, t + 0.15);
    bp.frequency.linearRampToValueAtTime(700, t + 0.45);
    const g = c.createGain();
    this.env(g, t, 0.04, 0.35, 0.45);
    o.connect(bp).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.55);
  }

  setMusic(on: boolean) {
    this.music = on;
    if (on) this.startMusic();
    else this.stopMusic();
  }

  private startMusic() {
    const c = this.ensure();
    if (!c || this.musicTimer) return;
    const scale = [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3, 659.3];
    let step = 0;
    const play = () => {
      if (!this.music || !this.ctx || !this.musicGain) return;
      const t = this.ctx.currentTime;
      const night = new Date().getHours() >= 21 || new Date().getHours() < 6;
      const notes = step % 8 === 0 ? [0, 2, 4] : [Math.floor(Math.random() * scale.length)];
      for (const n of notes) {
        if (Math.random() < 0.25 && step % 8 !== 0) continue;
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = scale[n] * (night ? 0.5 : 1) * (step % 8 === 0 ? 0.5 : 1);
        const g = this.ctx.createGain();
        this.env(g, t, 0.02, step % 8 === 0 ? 0.12 : 0.2, 1.8);
        o.connect(g).connect(this.musicGain);
        o.start(t);
        o.stop(t + 2);
      }
      step++;
      this.musicTimer = setTimeout(play, (night ? 900 : 650) + Math.random() * 300);
    };
    this.musicTimer = setTimeout(play, 500);
  }

  private stopMusic() {
    clearTimeout(this.musicTimer);
    this.musicTimer = null;
  }
}

export const audio = new Audio();
