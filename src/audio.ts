import type { MoveResult, Player, Winner } from './types.ts';
import { PLAYERS } from './types.ts';

const MUTE_KEY = 'FOE_AUDIO_MUTED';
const VOLUME_KEY = 'FOE_AUDIO_VOLUME';

type Wave = OscillatorType;

interface ToneOptions {
  frequency: number;
  endFrequency?: number;
  duration: number;
  gain?: number;
  delay?: number;
  wave?: Wave;
}

export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private effects: GainNode | null = null;
  private ambience: GainNode | null = null;
  private ambienceStarted = false;
  private muted = this.readMuted();
  private volume = this.readVolume();

  get isMuted(): boolean {
    return this.muted;
  }

  get isReady(): boolean {
    return this.context?.state === 'running';
  }

  private readMuted(): boolean {
    try {
      return window.localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  }

  private readVolume(): number {
    try {
      const stored = Number(window.localStorage.getItem(VOLUME_KEY));
      return Number.isFinite(stored) && stored > 0 ? Math.min(stored, 1) : 0.72;
    } catch {
      return 0.72;
    }
  }

  async unlock(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.context.createGain();
      this.effects = this.context.createGain();
      this.ambience = this.context.createGain();
      this.effects.gain.value = 0.72;
      this.ambience.gain.value = 0.045;
      this.effects.connect(this.master);
      this.ambience.connect(this.master);
      this.master.connect(this.context.destination);
      this.applyMasterGain(false);
    }
    if (this.context.state === 'suspended') await this.context.resume();
    this.startAmbience();
  }

  setMuted(muted: boolean): boolean {
    this.muted = muted;
    try {
      window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // Ignore storage restrictions.
    }
    this.applyMasterGain(true);
    return this.muted;
  }

  toggleMuted(): boolean {
    return this.setMuted(!this.muted);
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0.05, volume));
    try {
      window.localStorage.setItem(VOLUME_KEY, String(this.volume));
    } catch {
      // Ignore storage restrictions.
    }
    this.applyMasterGain(true);
  }

  private applyMasterGain(smooth: boolean): void {
    if (!this.context || !this.master) return;
    const target = this.muted ? 0 : this.volume;
    if (smooth) this.master.gain.setTargetAtTime(target, this.context.currentTime, 0.025);
    else this.master.gain.value = target;
  }

  private tone(options: ToneOptions): void {
    if (!this.context || !this.effects || this.muted) return;
    const start = this.context.currentTime + (options.delay ?? 0);
    const stop = start + options.duration;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = options.wave ?? 'sine';
    oscillator.frequency.setValueAtTime(options.frequency, start);
    if (options.endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, options.endFrequency), stop);
    }
    const gain = options.gain ?? 0.12;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.018, options.duration * 0.2));
    envelope.gain.exponentialRampToValueAtTime(0.0001, stop);
    oscillator.connect(envelope);
    envelope.connect(this.effects);
    oscillator.start(start);
    oscillator.stop(stop + 0.02);
  }

  private noise(duration: number, gain = 0.035, highpass = 900): void {
    if (!this.context || !this.effects || this.muted) return;
    const samples = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, samples, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) channel[index] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    filter.type = 'highpass';
    filter.frequency.value = highpass;
    const start = this.context.currentTime;
    envelope.gain.setValueAtTime(gain, start);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.effects);
    source.start(start);
  }

  private startAmbience(): void {
    if (!this.context || !this.ambience || this.ambienceStarted) return;
    this.ambienceStarted = true;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 620;
    filter.Q.value = 0.7;
    filter.connect(this.ambience);

    const frequencies = [73.42, 110, 146.83];
    frequencies.forEach((frequency, index) => {
      if (!this.context) return;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const lfo = this.context.createOscillator();
      const lfoGain = this.context.createGain();
      oscillator.type = index === 0 ? 'sine' : 'triangle';
      oscillator.frequency.value = frequency;
      gain.gain.value = index === 0 ? 0.48 : 0.18;
      lfo.frequency.value = 0.045 + index * 0.018;
      lfoGain.gain.value = 0.055;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      oscillator.connect(gain);
      gain.connect(filter);
      oscillator.start();
      lfo.start();
    });
  }

  ui(): void {
    this.tone({ frequency: 420, endFrequency: 610, duration: 0.075, gain: 0.045, wave: 'triangle' });
  }

  confirm(): void {
    this.tone({ frequency: 330, endFrequency: 520, duration: 0.13, gain: 0.075, wave: 'triangle' });
    this.tone({ frequency: 660, duration: 0.11, gain: 0.035, delay: 0.045 });
  }

  invalid(): void {
    this.tone({ frequency: 150, endFrequency: 92, duration: 0.16, gain: 0.08, wave: 'sawtooth' });
  }

  clash(): void {
    this.noise(0.18, 0.06, 420);
    this.tone({ frequency: 190, endFrequency: 72, duration: 0.24, gain: 0.11, wave: 'square' });
  }

  peek(count: number): void {
    const notes = [740, 880, 1110, 1320];
    for (let index = 0; index < Math.min(count, 4); index += 1) {
      this.tone({
        frequency: notes[index] ?? 880,
        duration: 0.16,
        gain: 0.025,
        delay: index * 0.035,
        wave: 'sine',
      });
    }
  }

  move(move: MoveResult): void {
    const playerOffset = move.player === PLAYERS.YOU ? 1 : 0.72;
    const base = (move.info.isEven ? 220 : 246.94) * playerOffset;
    this.tone({
      frequency: base,
      endFrequency: base * (1 + Math.min(move.info.multiplier, 2.5) * 0.16),
      duration: 0.2,
      gain: move.player === PLAYERS.YOU ? 0.095 : 0.065,
      wave: move.player === PLAYERS.YOU ? 'triangle' : 'sine',
    });
    if (move.info.parityStreak > 1) {
      this.tone({
        frequency: base * 1.5,
        duration: 0.18,
        gain: 0.04,
        delay: 0.055,
        wave: 'sine',
      });
    }
    if (move.info.isFive) {
      [1, 1.25, 1.5].forEach((ratio, index) => {
        this.tone({ frequency: 392 * ratio, duration: 0.34, gain: 0.042, delay: index * 0.025, wave: 'sine' });
      });
      this.noise(0.08, 0.018, 2300);
    }
  }

  round(winner: Winner): void {
    const winning = winner === PLAYERS.YOU;
    const notes = winning ? [392, 493.88, 587.33, 783.99] : winner === 'TIE' ? [330, 392, 493.88] : [293.66, 233.08, 174.61];
    notes.forEach((frequency, index) => {
      this.tone({ frequency, duration: 0.42, gain: 0.06, delay: index * 0.085, wave: 'triangle' });
    });
  }

  match(winner: Winner): void {
    this.round(winner);
    if (winner === PLAYERS.YOU) {
      [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
        this.tone({ frequency, duration: 0.68, gain: 0.055, delay: 0.32 + index * 0.075, wave: 'sine' });
      });
    }
  }

  pause(): void {
    this.tone({ frequency: 360, endFrequency: 180, duration: 0.17, gain: 0.05, wave: 'triangle' });
  }

  resume(): void {
    this.tone({ frequency: 180, endFrequency: 420, duration: 0.16, gain: 0.05, wave: 'triangle' });
  }

  snapshot() {
    return { muted: this.muted, volume: this.volume, ready: this.isReady, procedural: true };
  }
}
