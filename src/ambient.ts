import type { Player } from './types.ts';
import { PLAYERS } from './types.ts';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
}

interface Ripple {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  color: string;
}

export class AmbientScene {
  private readonly context: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private ripples: Ripple[] = [];
  private width = 0;
  private height = 0;
  private frame = 0;
  private mode: 'menu' | 'game' | 'paused' = 'menu';
  private reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is unavailable');
    this.context = context;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.frame = window.requestAnimationFrame((time) => this.draw(time));
  }

  setMode(mode: 'menu' | 'game' | 'paused'): void {
    this.mode = mode;
  }

  pulse(player: Player | 'FIVE' | 'NEUTRAL', x = 0.5, y = 0.5): void {
    const color =
      player === PLAYERS.YOU
        ? '82, 211, 255'
        : player === PLAYERS.CPU
          ? '255, 96, 132'
          : player === 'FIVE'
            ? '217, 139, 255'
            : '255, 207, 102';
    this.ripples.push({ x: x * this.width, y: y * this.height, radius: 8, alpha: 0.48, color });
  }

  burst(player: Player | 'FIVE', count = 8): void {
    for (let index = 0; index < count; index += 1) {
      this.pulse(player, 0.5 + (Math.random() - 0.5) * 0.34, 0.5 + (Math.random() - 0.5) * 0.22);
    }
  }

  private resize(): void {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.floor(this.width * ratio);
    this.canvas.height = Math.floor(this.height * ratio);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const targetCount = Math.max(28, Math.round((this.width * this.height) / 28_000));
    this.particles = Array.from({ length: targetCount }, () => ({
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      vx: (Math.random() - 0.5) * 0.12,
      vy: (Math.random() - 0.5) * 0.12,
      radius: 0.6 + Math.random() * 1.5,
      alpha: 0.12 + Math.random() * 0.42,
    }));
  }

  private draw(time: number): void {
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);

    const drift = this.mode === 'paused' || this.reduceMotion ? 0 : this.mode === 'game' ? 0.75 : 1;
    for (const particle of this.particles) {
      particle.x += particle.vx * drift;
      particle.y += particle.vy * drift;
      if (particle.x < -4) particle.x = this.width + 4;
      if (particle.x > this.width + 4) particle.x = -4;
      if (particle.y < -4) particle.y = this.height + 4;
      if (particle.y > this.height + 4) particle.y = -4;
      const twinkle = 0.72 + Math.sin(time * 0.0007 + particle.x) * 0.28;
      context.beginPath();
      context.fillStyle = `rgba(177, 213, 255, ${particle.alpha * twinkle})`;
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fill();
    }

    if (!this.reduceMotion) {
      for (const ripple of this.ripples) {
        ripple.radius += 1.8;
        ripple.alpha *= 0.96;
        context.beginPath();
        context.strokeStyle = `rgba(${ripple.color}, ${ripple.alpha})`;
        context.lineWidth = 1.5;
        context.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
        context.stroke();
      }
      this.ripples = this.ripples.filter((ripple) => ripple.alpha > 0.015);
    }

    this.frame = window.requestAnimationFrame((nextTime) => this.draw(nextTime));
  }

  destroy(): void {
    window.cancelAnimationFrame(this.frame);
  }
}
