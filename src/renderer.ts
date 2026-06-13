import { hzToMidi, noteName } from './reference';
import type { Hz, JudgedPitchSample, Midi, PitchState, PreparedReference } from './types';

type RendererOptions = {
  canvas: HTMLCanvasElement;
};

const COLORS: Record<PitchState, string> = {
  hit: '#1f9d6b',
  sharp: '#d84747',
  flat: '#2f67d8',
  silent: '#9aa4b2',
  none: '#9aa4b2'
};

export class PitchRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private reference: PreparedReference | null = null;
  private samples: JudgedPitchSample[] = [];
  private width = 0;
  private height = 0;
  private dpr = 1;

  constructor(options: RendererOptions) {
    this.canvas = options.canvas;
    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D context is unavailable.');
    }
    this.ctx = context;

    const resize = () => this.resize();
    resize();
    new ResizeObserver(resize).observe(this.canvas);
  }

  setReference(reference: PreparedReference | null): void {
    this.reference = reference;
    this.samples = [];
  }

  addSample(sample: JudgedPitchSample): void {
    this.samples.push(sample);
    const cutoff = Number(sample.time) - 14;
    while (this.samples.length && Number(this.samples[0].time) < cutoff) {
      this.samples.shift();
    }
  }

  clearSamples(): void {
    this.samples = [];
  }

  render(currentTimeSec: number): void {
    this.resize();
    this.drawBackground();

    if (!this.reference) {
      this.drawEmptyState('曲を選択');
      return;
    }

    const metrics = this.getMetrics();
    this.drawGrid(metrics);
    this.drawReferenceBars(currentTimeSec, metrics);
    this.drawSamples(currentTimeSec, metrics);
    this.drawPlayhead(metrics.headX);
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const nextDpr = Math.max(1, window.devicePixelRatio || 1);
    const nextWidth = Math.max(320, Math.floor(rect.width));
    const nextHeight = Math.max(260, Math.floor(rect.height));

    if (nextWidth === this.width && nextHeight === this.height && nextDpr === this.dpr) {
      return;
    }

    this.width = nextWidth;
    this.height = nextHeight;
    this.dpr = nextDpr;
    this.canvas.width = Math.floor(nextWidth * nextDpr);
    this.canvas.height = Math.floor(nextHeight * nextDpr);
    this.ctx.setTransform(nextDpr, 0, 0, nextDpr, 0, 0);
  }

  private getMetrics() {
    const reference = this.reference;
    const minMidi = reference ? Number(reference.minMidi) - 3 : 56;
    const maxMidi = reference ? Number(reference.maxMidi) + 3 : 72;
    const top = 28;
    const bottom = this.height - 30;
    const headX = Math.max(92, this.width * 0.28);
    const pxPerSec = Math.max(72, Math.min(112, this.width / 7.5));

    return {
      minMidi,
      maxMidi,
      top,
      bottom,
      headX,
      pxPerSec,
      plotHeight: bottom - top
    };
  }

  private timeToX(timeSec: number, currentTimeSec: number, metrics: ReturnType<PitchRenderer['getMetrics']>) {
    return metrics.headX + (timeSec - currentTimeSec) * metrics.pxPerSec;
  }

  private midiToY(midi: number, metrics: ReturnType<PitchRenderer['getMetrics']>) {
    const span = metrics.maxMidi - metrics.minMidi;
    return metrics.bottom - ((midi - metrics.minMidi) / span) * metrics.plotHeight;
  }

  private drawBackground(): void {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  private drawGrid(metrics: ReturnType<PitchRenderer['getMetrics']>): void {
    this.ctx.save();
    this.ctx.strokeStyle = '#e2e8f0';
    this.ctx.lineWidth = 1;
    this.ctx.fillStyle = '#64748b';
    this.ctx.font = '12px system-ui, sans-serif';
    this.ctx.textBaseline = 'middle';

    for (let midi = Math.floor(metrics.minMidi); midi <= Math.ceil(metrics.maxMidi); midi += 1) {
      const y = this.midiToY(midi, metrics);
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();

      if (midi % 2 === 0) {
        this.ctx.fillText(noteName(midi as Midi), 12, y);
      }
    }

    this.ctx.restore();
  }

  private drawReferenceBars(currentTimeSec: number, metrics: ReturnType<PitchRenderer['getMetrics']>): void {
    if (!this.reference) {
      return;
    }

    for (const note of this.reference.notes) {
      const start = Number(note.startSec);
      const end = Number(note.endSec);
      const x = this.timeToX(start, currentTimeSec, metrics);
      const width = Math.max(3, (end - start) * metrics.pxPerSec);
      if (x > this.width || x + width < 0) {
        continue;
      }

      const y = this.midiToY(Number(note.note), metrics);
      const isCurrent = currentTimeSec >= start && currentTimeSec < end;
      this.roundRect(x, y - 8, width, 16, 7);
      this.ctx.fillStyle = isCurrent ? '#f2b84b' : '#334155';
      this.ctx.fill();
    }
  }

  private drawSamples(currentTimeSec: number, metrics: ReturnType<PitchRenderer['getMetrics']>): void {
    let previous: { x: number; y: number; color: string } | null = null;

    for (const sample of this.samples) {
      if (!sample.freq) {
        previous = null;
        continue;
      }

      const x = this.timeToX(Number(sample.time), currentTimeSec, metrics);
      if (x < -10 || x > this.width + 10) {
        continue;
      }

      const y = this.midiToY(Number(hzToMidi(sample.freq as Hz)), metrics);
      const color = COLORS[sample.state];

      if (previous && Math.abs(previous.x - x) < metrics.pxPerSec * 0.4) {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 3;
        this.ctx.lineCap = 'round';
        this.ctx.beginPath();
        this.ctx.moveTo(previous.x, previous.y);
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
      }

      this.ctx.fillStyle = color;
      this.ctx.beginPath();
      this.ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      this.ctx.fill();
      previous = { x, y, color };
    }
  }

  private drawPlayhead(x: number): void {
    this.ctx.save();
    this.ctx.strokeStyle = '#111827';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(x, 14);
    this.ctx.lineTo(x, this.height - 14);
    this.ctx.stroke();
    this.ctx.restore();
  }

  private drawEmptyState(text: string): void {
    this.ctx.fillStyle = '#64748b';
    this.ctx.font = '600 16px system-ui, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(text, this.width / 2, this.height / 2);
  }

  private roundRect(x: number, y: number, width: number, height: number, radius: number): void {
    const r = Math.min(radius, width / 2, height / 2);
    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + width - r, y);
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    this.ctx.lineTo(x + width, y + height - r);
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    this.ctx.lineTo(x + r, y + height);
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    this.ctx.lineTo(x, y + r);
    this.ctx.quadraticCurveTo(x, y, x + r, y);
    this.ctx.closePath();
  }
}
