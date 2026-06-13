import type { Hz } from './types';
import pitchProcessorUrl from './pitch-processor.ts?worker&url';

export type AudioPitchMessage = {
  time: number;
  freq: Hz | null;
  clarity: number;
  rms: number;
};

export type AudioInputController = {
  context: AudioContext;
  stop: () => Promise<void>;
};

type WorkletMessage = {
  time: number;
  freq: number | null;
  clarity: number;
  rms: number;
};

const rawVocalConstraints: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false
};

// Raise this if normal singing is still too quiet for f0 detection; lower it
// if loud singing clips or becomes unstable. This gain is detection-only.
const INPUT_DETECTION_GAIN = 2.0;

export async function createAudioInput(
  onPitch: (message: AudioPitchMessage) => void
): Promise<AudioInputController> {
  const stream = await getVocalStream();

  const context = new AudioContext({ latencyHint: 'interactive' });
  await context.audioWorklet.addModule(pitchProcessorUrl);

  const source = context.createMediaStreamSource(stream);
  const detectionGain = context.createGain();
  detectionGain.gain.value = INPUT_DETECTION_GAIN;
  const processor = new AudioWorkletNode(context, 'pitch-processor', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1]
  });
  const silentSink = context.createGain();
  silentSink.gain.value = 0;

  processor.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
    onPitch({
      time: event.data.time,
      freq: event.data.freq as Hz | null,
      clarity: event.data.clarity,
      rms: event.data.rms
    });
  };

  source.connect(detectionGain);
  detectionGain.connect(processor);
  processor.connect(silentSink);
  silentSink.connect(context.destination);

  if (context.state === 'suspended') {
    await context.resume();
  }

  return {
    context,
    stop: async () => {
      processor.port.onmessage = null;
      processor.disconnect();
      detectionGain.disconnect();
      source.disconnect();
      silentSink.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      await context.close();
    }
  };
}

async function getVocalStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      // Disable speech-call processing because it can reshape sung vowels and
      // destabilize f0 detection. Some browsers ignore these hints.
      audio: rawVocalConstraints
    });
  } catch (error) {
    if (isConstraintFailure(error)) {
      return navigator.mediaDevices.getUserMedia({ audio: true });
    }
    throw error;
  }
}

function isConstraintFailure(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'OverconstrainedError' ||
      error.name === 'ConstraintNotSatisfiedError' ||
      error.name === 'TypeError')
  );
}
