import { PitchDetector as PitchyDetectorCore } from 'pitchy';
import { asHz, type Hz, type PitchDetector } from './types';

const MIN_VOICE_HZ = 60;
const MAX_VOICE_HZ = 1200;
const DEFAULT_CLARITY = 0.76;

export class PitchyDetector implements PitchDetector {
  private detector: ReturnType<typeof PitchyDetectorCore.forFloat32Array> | null = null;
  private frameSize = 0;

  constructor(private readonly clarityThreshold = DEFAULT_CLARITY) {}

  detect(frame: Float32Array, sampleRate: number): Hz | null {
    if (this.frameSize !== frame.length) {
      this.detector = PitchyDetectorCore.forFloat32Array(frame.length);
      this.frameSize = frame.length;
    }

    const rms = getRms(frame);
    if (rms < 0.01 || !this.detector) {
      return null;
    }

    const [pitch, clarity] = this.detector.findPitch(frame, sampleRate);
    if (
      !Number.isFinite(pitch) ||
      clarity < this.clarityThreshold ||
      pitch < MIN_VOICE_HZ ||
      pitch > MAX_VOICE_HZ
    ) {
      return null;
    }

    return asHz(pitch);
  }
}

export function getRms(frame: Float32Array): number {
  let sum = 0;
  for (const sample of frame) {
    sum += sample * sample;
  }
  return Math.sqrt(sum / frame.length);
}
