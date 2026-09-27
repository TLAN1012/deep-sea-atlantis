// All audio is synthesised with WebAudio: ocean rumble, motor hum, bubbles, shutter, chimes, whale calls.
export class Sound {
  constructor() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.7; this.master.connect(c.destination);
    // brown-ish noise loop for the ocean ambience
    const len = c.sampleRate * 4, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    this.noiseBuf = buf;
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    this.amb = c.createBiquadFilter(); this.amb.type = 'lowpass'; this.amb.frequency.value = 500;
    this.ambGain = c.createGain(); this.ambGain.gain.value = 0.5;
    src.connect(this.amb).connect(this.ambGain).connect(this.master); src.start();
    // motor
    this.motor = c.createOscillator(); this.motor.type = 'sawtooth'; this.motor.frequency.value = 45;
    const mf = c.createBiquadFilter(); mf.type = 'lowpass'; mf.frequency.value = 180;
    this.motorGain = c.createGain(); this.motorGain.gain.value = 0;
    this.motor.connect(mf).connect(this.motorGain).connect(this.master); this.motor.start();
    this.bubbleT = 2; this.whaleT = 12; this.zone = '';
  }
  resume() { if (this.ctx.state !== 'running') this.ctx.resume(); }
  now() { return this.ctx.currentTime; }

  tone(freq, dur, { type = 'sine', vol = 0.2, slide = 0, delay = 0, attack = 0.01 } = {}) {
    const c = this.ctx, t = this.now() + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  noise(dur, { freq = 2000, q = 1, vol = 0.3, type = 'bandpass' } = {}) {
    const c = this.ctx, t = this.now();
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random() * 3); s.stop(t + dur);
  }
  shutter() { this.noise(0.08, { freq: 3500, q: 0.8, vol: 0.8 }); this.noise(0.12, { freq: 1800, q: 2, vol: 0.5 }); this.tone(1400, 0.05, { type: 'square', vol: 0.05 }); }
  click() { this.tone(900, 0.06, { type: 'triangle', vol: 0.12 }); }
  bubbles() { for (let i = 0; i < 6; i++) this.tone(300 + Math.random() * 500, 0.12, { vol: 0.08, slide: 2.2, delay: i * 0.07 }); }
  chime(big) {
    const notes = big ? [523, 659, 784, 1047, 1319] : [784, 988, 1175];
    notes.forEach((n, i) => this.tone(n, 0.9, { type: 'triangle', vol: 0.14, delay: i * 0.09 }));
  }
  fanfare() {
    [392, 523, 659, 784, 1047].forEach((n, i) => this.tone(n, 1.8, { type: 'triangle', vol: 0.15, delay: i * 0.18 }));
    [131, 196].forEach(n => this.tone(n, 4, { type: 'sine', vol: 0.25, delay: 0.9, attack: 0.8 }));
  }
  whale() {
    const base = 180 + Math.random() * 120;
    this.tone(base, 2.2, { vol: 0.07, slide: 1.6, attack: 0.6 });
    this.tone(base * 1.6, 1.8, { vol: 0.05, slide: 0.55, attack: 0.5, delay: 2 });
  }
  setZone(z) { this.zone = z; }
  update(player, depth, dt) {
    const t = this.now();
    this.amb.frequency.setTargetAtTime(Math.max(140, 520 - depth * 1.6), t, 0.5);
    const spd = player.vel.length() / player.speed;
    this.motorGain.gain.setTargetAtTime(player.inSub ? 0.03 + spd * 0.08 : 0, t, 0.2);
    this.motor.frequency.setTargetAtTime(40 + spd * 35, t, 0.2);
    if ((this.bubbleT -= dt) < 0) {
      this.bubbleT = player.inSub ? 3 + Math.random() * 5 : 2.5 + Math.random() * 2;
      const n = player.inSub ? 2 : 4;
      for (let i = 0; i < n; i++) this.tone(250 + Math.random() * 400, 0.1, { vol: 0.04, slide: 2, delay: i * 0.09 });
    }
    if ((this.whaleT -= dt) < 0) {
      this.whaleT = 20 + Math.random() * 25;
      if (this.zone === '開闊海域' || this.zone === '巨藻森林' || this.zone === '暮光層') this.whale();
    }
  }
}
