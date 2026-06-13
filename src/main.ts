import './styles.css';
import { createAudioInput, type AudioInputController, type AudioPitchMessage } from './audioInput';
import { loadReference } from './reference';
import { PitchRenderer } from './renderer';
import { judgePitch, SessionScorer, type ScoreSnapshot } from './scorer';
import { asSeconds, type Hz, type JudgedPitchSample, type PreparedReference } from './types';

type Song = {
  id: string;
  title: string;
  url: string;
  free: boolean;
  license: 'PD' | 'licensed';
};

const SONGS: Song[] = [
  {
    id: 'furusato',
    title: 'ふるさと',
    url: `${import.meta.env.BASE_URL}furusato.json`,
    free: true,
    license: 'PD'
  }
];

const canvas = getElement<HTMLCanvasElement>('pitch-canvas');
const songSelect = getElement<HTMLSelectElement>('song-select');
const startButton = getElement<HTMLButtonElement>('start-button');
const stopButton = getElement<HTMLButtonElement>('stop-button');
const retryButton = getElement<HTMLButtonElement>('retry-button');
const statusText = getElement<HTMLElement>('status');
const pitchScore = getElement<HTMLElement>('pitch-score');
const voiceScore = getElement<HTMLElement>('voice-score');
const pitchReadout = getElement<HTMLElement>('pitch-readout');

const renderer = new PitchRenderer({ canvas });

let reference: PreparedReference | null = null;
let scorer: SessionScorer | null = null;
let audioInput: AudioInputController | null = null;
let startAudioTime = 0;
let animationFrame = 0;
let smoothedFreq: Hz | null = null;
let running = false;

startButton.addEventListener('click', () => {
  void startSession();
});

stopButton.addEventListener('click', () => {
  void finishSession('停止');
});

retryButton.addEventListener('click', () => {
  retryButton.hidden = true;
  void startSession();
});

void initialize();

async function initialize(): Promise<void> {
  populateSongs();
  reference = await loadSelectedReference();
  renderer.setReference(reference);
  renderer.render(0);
}

async function startSession(): Promise<void> {
  try {
    setControls({ starting: true });
    setStatus('準備中');
    resetScores();

    reference = await loadSelectedReference();
    renderer.setReference(reference);
    scorer = new SessionScorer(reference);

    audioInput = await createAudioInput(handlePitch);
    startAudioTime = audioInput.context.currentTime;
    smoothedFreq = null;
    running = true;

    setControls({ running: true });
    setStatus('採点中');
    tick();
  } catch (error) {
    console.error(error);
    setStatus('開始失敗');
    setControls({ idle: true });
  }
}

async function finishSession(status: string): Promise<void> {
  running = false;
  cancelAnimationFrame(animationFrame);
  setStatus(status);

  if (audioInput) {
    await audioInput.stop();
    audioInput = null;
  }

  updateScores(scorer?.snapshot() ?? null);
  setControls({ finished: true });
}

function tick(): void {
  if (!running || !reference || !audioInput) {
    return;
  }

  const elapsed = Math.max(0, audioInput.context.currentTime - startAudioTime);
  renderer.render(elapsed);

  if (elapsed >= Number(reference.durationSec) + 0.4) {
    void finishSession('完了');
    return;
  }

  animationFrame = requestAnimationFrame(tick);
}

function handlePitch(message: AudioPitchMessage): void {
  if (!running || !reference || !scorer) {
    return;
  }

  const timeSec = message.time - startAudioTime;
  if (timeSec < 0 || timeSec > Number(reference.durationSec) + 0.3) {
    return;
  }

  const freq = smoothFreq(message.freq);
  const judgement = scorer.addSample(timeSec, freq);
  const sample: JudgedPitchSample = {
    time: asSeconds(timeSec),
    freq,
    cents: judgement.cents,
    state: judgement.state
  };

  renderer.addSample(sample);
  updateScores(scorer.snapshot());
  updatePitchReadout(freq, judgement.cents);
}

function smoothFreq(freq: Hz | null): Hz | null {
  if (!freq) {
    smoothedFreq = null;
    return null;
  }

  if (!smoothedFreq) {
    smoothedFreq = freq;
    return freq;
  }

  const ratio = Number(freq) / Number(smoothedFreq);
  if (ratio > 1.8 || ratio < 0.55) {
    smoothedFreq = freq;
    return freq;
  }

  smoothedFreq = (Number(smoothedFreq) * 0.68 + Number(freq) * 0.32) as Hz;
  return smoothedFreq;
}

function updateScores(snapshot: ScoreSnapshot | null): void {
  if (!snapshot || snapshot.targetFrames === 0) {
    pitchScore.textContent = '--%';
    voiceScore.textContent = '--%';
    return;
  }

  pitchScore.textContent = `${Math.round(snapshot.pitchAccuracy * 100)}%`;
  voiceScore.textContent = `${Math.round(snapshot.voicingRate * 100)}%`;
}

function updatePitchReadout(freq: Hz | null, cents: number | null): void {
  if (!freq) {
    pitchReadout.textContent = '--';
    return;
  }

  const centsText = cents === null ? '' : ` / ${Math.round(cents)}c`;
  pitchReadout.textContent = `${Math.round(Number(freq))}Hz${centsText}`;
}

function resetScores(): void {
  pitchScore.textContent = '--%';
  voiceScore.textContent = '--%';
  pitchReadout.textContent = '--';
  renderer.clearSamples();
}

async function loadSelectedReference(): Promise<PreparedReference> {
  const song = SONGS.find((candidate) => candidate.id === songSelect.value) ?? SONGS[0];
  return loadReference(song.url);
}

function populateSongs(): void {
  songSelect.replaceChildren(
    ...SONGS.map((song) => {
      const option = document.createElement('option');
      option.value = song.id;
      option.textContent = song.title;
      option.disabled = !song.free || song.license !== 'PD';
      return option;
    })
  );
}

function setControls(state: {
  idle?: boolean;
  starting?: boolean;
  running?: boolean;
  finished?: boolean;
}): void {
  startButton.disabled = Boolean(state.starting || state.running);
  stopButton.disabled = !state.running;
  retryButton.hidden = !state.finished;
  songSelect.disabled = Boolean(state.starting || state.running);
}

function setStatus(text: string): void {
  statusText.textContent = text;
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element: ${id}`);
  }
  return element as T;
}
