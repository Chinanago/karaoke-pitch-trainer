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

export async function createAudioInput(
  onPitch: (message: AudioPitchMessage) => void
): Promise<AudioInputController> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    }
  });

  const context = new AudioContext({ latencyHint: 'interactive' });
  await context.audioWorklet.addModule(pitchProcessorUrl);

  const source = context.createMediaStreamSource(stream);
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

  source.connect(processor);
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
      source.disconnect();
      silentSink.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      await context.close();
    }
  };
}
