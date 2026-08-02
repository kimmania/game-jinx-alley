/** Synthesized Web Audio sound manager — no assets. */

export class SoundManager {
  private ctx: AudioContext | null = null;
  soundOn = true;
  musicOn = true;
  private musicNodes: { osc: OscillatorNode; gain: GainNode }[] = [];

  private ac(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.15, when = 0): void {
    if (!this.soundOn) return;
    const ac = this.ac();
    if (!ac) return;
    const t0 = ac.currentTime + when;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  }

  /** Board light tick during spin. */
  tick(): void {
    this.tone(880, 0.03, 'square', 0.06);
  }
  /** Prize won chime. */
  prize(): void {
    this.tone(660, 0.12, 'triangle', 0.18);
    this.tone(990, 0.18, 'triangle', 0.15, 0.09);
  }
  /** Cash tile blip. */
  cash(): void {
    this.tone(520, 0.08, 'square', 0.12);
    this.tone(780, 0.1, 'square', 0.1, 0.06);
  }
  /** +Spin arpeggio. */
  spinBonus(): void {
    this.tone(440, 0.08, 'triangle', 0.14);
    this.tone(660, 0.08, 'triangle', 0.14, 0.08);
    this.tone(880, 0.14, 'triangle', 0.14, 0.16);
  }
  /** Vault door ka-chunk. */
  vault(): void {
    this.tone(120, 0.18, 'square', 0.25);
    this.tone(80, 0.3, 'sine', 0.3, 0.1);
    this.tone(1320, 0.06, 'triangle', 0.08, 0.22);
  }
  /** Jinx sting. */
  jinx(): void {
    this.tone(220, 0.25, 'sawtooth', 0.2);
    this.tone(155, 0.35, 'sawtooth', 0.2, 0.12);
    this.tone(110, 0.5, 'sawtooth', 0.18, 0.26);
  }
  /** Gallery completion fanfare. */
  fanfare(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.16, i * 0.12));
  }
  /** Run-end tally step (escalating pitch). */
  tally(step: number): void {
    this.tone(500 + step * 40, 0.06, 'square', 0.1);
  }

  /** Simple ambient music loop (two detuned sines, very quiet). */
  startMusic(): void {
    if (!this.musicOn || this.musicNodes.length) return;
    const ac = this.ac();
    if (!ac) return;
    for (const [freq, vol] of [[110, 0.025], [165, 0.018]] as const) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.value = vol;
      osc.connect(gain).connect(ac.destination);
      osc.start();
      this.musicNodes.push({ osc, gain });
    }
  }
  stopMusic(): void {
    for (const n of this.musicNodes) {
      try {
        n.osc.stop();
      } catch {
        /* already stopped */
      }
    }
    this.musicNodes = [];
  }
}

export const sounds = new SoundManager();
