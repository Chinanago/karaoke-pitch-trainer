import { getTargetAt } from './reference';
import { asCents, type Cents, type Hz, type PitchState, type PreparedReference } from './types';

export type PitchJudgement = {
  state: PitchState;
  cents: Cents | null;
};

export type ScoreSnapshot = {
  targetFrames: number;
  voicedFrames: number;
  hitFrames: number;
  pitchAccuracy: number;
  voicingRate: number;
};

export function centsBetween(freq: Hz, target: Hz): Cents {
  return asCents(1200 * Math.log2(Number(freq) / Number(target)));
}

export function judgePitch(freq: Hz | null, target: Hz | null): PitchJudgement {
  if (!target) {
    return { state: 'none', cents: null };
  }

  if (!freq) {
    return { state: 'silent', cents: null };
  }

  const cents = centsBetween(freq, target);
  if (Math.abs(Number(cents)) <= 50) {
    return { state: 'hit', cents };
  }

  return { state: Number(cents) > 50 ? 'sharp' : 'flat', cents };
}

export class SessionScorer {
  private targetFrames = 0;
  private voicedFrames = 0;
  private hitFrames = 0;

  constructor(private readonly reference: PreparedReference) {}

  addSample(timeSec: number, freq: Hz | null): PitchJudgement {
    const target = getTargetAt(this.reference, timeSec);
    const judgement = judgePitch(freq, target?.freq ?? null);

    if (target) {
      this.targetFrames += 1;
      if (freq) {
        this.voicedFrames += 1;
      }
      if (judgement.state === 'hit') {
        this.hitFrames += 1;
      }
    }

    return judgement;
  }

  snapshot(): ScoreSnapshot {
    return {
      targetFrames: this.targetFrames,
      voicedFrames: this.voicedFrames,
      hitFrames: this.hitFrames,
      pitchAccuracy: this.targetFrames ? this.hitFrames / this.targetFrames : 0,
      voicingRate: this.targetFrames ? this.voicedFrames / this.targetFrames : 0
    };
  }
}
