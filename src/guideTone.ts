import type { PreparedReference } from './types';

const GUIDE_GAIN = 0.17;
const ATTACK_SEC = 0.01;
const RELEASE_SEC = 0.05;
const COUNT_CLICK_GAIN = 0.22;
const COUNT_CLICK_DURATION_SEC = 0.065;

export type GuideTonePlayback = {
  stop: () => void;
};

export function scheduleGuideTone(
  context: AudioContext,
  reference: PreparedReference,
  sessionStartTime: number,
  fromTimeSec = 0
): GuideTonePlayback {
  const nodes: Array<OscillatorNode | GainNode> = [];

  for (const note of reference.notes) {
    const noteStartSec = Number(note.startSec);
    const noteEndSec = Number(note.endSec);
    if (noteEndSec <= fromTimeSec) {
      continue;
    }

    const startAt = Math.max(context.currentTime, sessionStartTime + noteStartSec);
    const endAt = sessionStartTime + noteEndSec;
    if (endAt <= context.currentTime) {
      continue;
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const attackEnd = Math.min(startAt + ATTACK_SEC, endAt);
    const releaseStart = Math.max(attackEnd, endAt - RELEASE_SEC);

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(Number(note.freq), startAt);

    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(GUIDE_GAIN, attackEnd);
    gain.gain.setValueAtTime(GUIDE_GAIN, releaseStart);
    gain.gain.linearRampToValueAtTime(0, endAt);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(endAt + 0.01);

    oscillator.addEventListener('ended', () => {
      oscillator.disconnect();
      gain.disconnect();
    });

    nodes.push(oscillator, gain);
  }

  // Future hook: schedule a four-beat count-in click before sessionStartTime.
  return {
    stop: () => {
      for (const node of nodes) {
        try {
          node.disconnect();
          if (node instanceof OscillatorNode) {
            node.stop();
          }
        } catch {
          // Already stopped or disconnected.
        }
      }
      nodes.length = 0;
    }
  };
}

export function scheduleCountInClicks(
  context: AudioContext,
  sessionStartTime: number,
  beatSec: number,
  count = 3
): GuideTonePlayback {
  const nodes: Array<OscillatorNode | GainNode> = [];

  for (let index = 0; index < count; index += 1) {
    const clickAt = sessionStartTime - (count - index) * beatSec;
    scheduleClick(context, clickAt, 880, nodes);
  }

  scheduleClick(context, sessionStartTime, 1320, nodes);

  return {
    stop: () => {
      for (const node of nodes) {
        try {
          node.disconnect();
          if (node instanceof OscillatorNode) {
            node.stop();
          }
        } catch {
          // Already stopped or disconnected.
        }
      }
      nodes.length = 0;
    }
  };
}

function scheduleClick(
  context: AudioContext,
  startAt: number,
  frequency: number,
  nodes: Array<OscillatorNode | GainNode>
): void {
  if (startAt < context.currentTime) {
    return;
  }

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const endAt = startAt + COUNT_CLICK_DURATION_SEC;

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(COUNT_CLICK_GAIN, startAt + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.001, endAt);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(endAt + 0.01);

  oscillator.addEventListener('ended', () => {
    oscillator.disconnect();
    gain.disconnect();
  });

  nodes.push(oscillator, gain);
}
