import { getTargetAt } from './reference';
import { asCents, type Cents, type Hz, type PitchState, type PreparedReference } from './types';

export type PitchJudgement = {
  state: PitchState;
  cents: Cents | null;
};

type ScoredFrame = {
  hasTarget: boolean;
  voiced: boolean;
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

export function judgePitch(
  freq: Hz | null,
  target: Hz | null,
  toleranceCents: number
): PitchJudgement {
  if (!target) {
    return { state: 'none', cents: null };
  }

  if (!freq) {
    return { state: 'silent', cents: null };
  }

  const cents = centsBetween(freq, target);
  if (Math.abs(Number(cents)) <= toleranceCents) {
    return { state: 'hit', cents };
  }

  return { state: Number(cents) > 0 ? 'sharp' : 'flat', cents };
}

export class SessionScorer {
  private readonly frames: ScoredFrame[] = [];

  constructor(private readonly reference: PreparedReference) {}

  addSample(timeSec: number, freq: Hz | null, toleranceCents: number): PitchJudgement {
    const target = getTargetAt(this.reference, timeSec);
    const judgement = judgePitch(freq, target?.freq ?? null, toleranceCents);

    if (target) {
      this.frames.push({
        hasTarget: true,
        voiced: freq !== null,
        cents: judgement.cents
      });
    }

    return judgement;
  }

  snapshot(toleranceCents: number): ScoreSnapshot {
    const targetFrames = this.frames.filter((frame) => frame.hasTarget).length;
    const voicedFrames = this.frames.filter((frame) => frame.hasTarget && frame.voiced).length;
    const hitFrames = this.frames.filter(
      (frame) =>
        frame.hasTarget && frame.cents !== null && Math.abs(Number(frame.cents)) <= toleranceCents
    ).length;

    return {
      targetFrames,
      voicedFrames,
      hitFrames,
      pitchAccuracy: targetFrames ? hitFrames / targetFrames : 0,
      voicingRate: targetFrames ? voicedFrames / targetFrames : 0
    };
  }
}
