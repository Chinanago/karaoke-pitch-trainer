import { PitchDetector as PitchyDetectorCore } from 'pitchy';

declare const sampleRate: number;
declare const currentTime: number;
declare function registerProcessor(
  name: string,
  processorCtor: typeof AudioWorkletProcessor
): void;

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean;
}

// Larger windows stabilize low voices but add latency. Smaller windows react
// faster but make 100-150Hz detection less stable.
const FRAME_SIZE = 4096;
const HOP_SIZE = 512;
const MIN_RMS = 0.01;
// Lower this if recognition is still too strict on real microphones.
const MIN_CLARITY = 0.55;
const MIN_VOICE_HZ = 70;
const MAX_VOICE_HZ = 1100;

class PitchProcessor extends AudioWorkletProcessor {
  private readonly frame = new Float32Array(FRAME_SIZE);
  private readonly detector = PitchyDetectorCore.forFloat32Array(FRAME_SIZE);
  private writeIndex = 0;

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (output) {
      output.fill(0);
    }

    if (!input) {
      return true;
    }

    for (const sample of input) {
      this.frame[this.writeIndex] = sample;
      this.writeIndex += 1;

      if (this.writeIndex >= FRAME_SIZE) {
        this.detect();
        this.frame.copyWithin(0, HOP_SIZE);
        this.writeIndex = FRAME_SIZE - HOP_SIZE;
      }
    }

    return true;
  }

  private detect(): void {
    const rms = this.getRms();
    let freq: number | null = null;
    let clarity = 0;

    if (rms >= MIN_RMS) {
      const result = this.detector.findPitch(this.frame, sampleRate);
      const pitch = result[0];
      clarity = result[1];

      if (
        Number.isFinite(pitch) &&
        clarity >= MIN_CLARITY &&
        pitch >= MIN_VOICE_HZ &&
        pitch <= MAX_VOICE_HZ
      ) {
        freq = pitch;
      }
    }

    this.port.postMessage({
      time: currentTime,
      freq,
      clarity,
      rms
    });
  }

  private getRms(): number {
    let sum = 0;
    for (const sample of this.frame) {
      sum += sample * sample;
    }
    return Math.sqrt(sum / this.frame.length);
  }
}

registerProcessor('pitch-processor', PitchProcessor);
