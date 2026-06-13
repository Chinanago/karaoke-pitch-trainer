import './styles.css';
import { createAudioInput, type AudioInputController, type AudioPitchMessage } from './audioInput';
import { scheduleCountInClicks, scheduleGuideTone, type GuideTonePlayback } from './guideTone';
import { loadReference } from './reference';
import { PitchRenderer } from './renderer';
import { SessionScorer, type ScoreSnapshot } from './scorer';
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
    id: 'doremi',
    title: 'ドレミ音階',
    url: `${import.meta.env.BASE_URL}doremi.json`,
    free: true,
    license: 'PD'
  }
];

const canvas = getElement<HTMLCanvasElement>('pitch-canvas');
const songSelect = getElement<HTMLSelectElement>('song-select');
const startButton = getElement<HTMLButtonElement>('start-button');
const stopButton = getElement<HTMLButtonElement>('stop-button');
const retryButton = getElement<HTMLButtonElement>('retry-button');
const guideToggle = getElement<HTMLInputElement>('guide-toggle');
const statusText = getElement<HTMLElement>('status');
const pitchScore = getElement<HTMLElement>('pitch-score');
const voiceScore = getElement<HTMLElement>('voice-score');
const inputLevel = getElement<HTMLElement>('input-level');
const countdown = getElement<HTMLElement>('countdown');

const renderer = new PitchRenderer({ canvas });
const COUNTDOWN_BEATS = 3;
const SESSION_START_SAFETY_SEC = 0.08;
const INPUT_LEVEL_FULL_SCALE_RMS = 0.14;

let reference: PreparedReference | null = null;
let scorer: SessionScorer | null = null;
let audioInput: AudioInputController | null = null;
let guideTone: GuideTonePlayback | null = null;
let countInTone: GuideTonePlayback | null = null;
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

guideToggle.addEventListener('change', () => {
  syncGuideTone();
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
    const beatSec = 60 / reference.tempo_bpm;
    startAudioTime =
      audioInput.context.currentTime + COUNTDOWN_BEATS * beatSec + SESSION_START_SAFETY_SEC;
    smoothedFreq = null;

    countInTone = scheduleCountInClicks(audioInput.context, startAudioTime, beatSec, COUNTDOWN_BEATS);
    if (guideToggle.checked) {
      guideTone = scheduleGuideTone(audioInput.context, reference, startAudioTime);
    }

    setStatus('カウント');
    await runCountdown(audioInput.context, startAudioTime, beatSec);

    setControls({ running: true });
    setStatus('採点中');
    running = true;
    tick();
  } catch (error) {
    console.error(error);
    hideCountdown();
    stopGuideTone();
    stopCountInTone();
    if (audioInput) {
      await audioInput.stop();
      audioInput = null;
    }
    setStatus('開始失敗');
    setControls({ idle: true });
  }
}

async function finishSession(status: string): Promise<void> {
  running = false;
  cancelAnimationFrame(animationFrame);
  setStatus(status);
  hideCountdown();
  stopCountInTone();
  stopGuideTone();

  if (audioInput) {
    await audioInput.stop();
    audioInput = null;
  }

  updateScores(scorer?.snapshot() ?? null);
  if (reference) {
    renderer.render(Number(reference.durationSec));
  }
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

function syncGuideTone(): void {
  stopGuideTone();
  if (!running || !audioInput || !reference || !guideToggle.checked) {
    return;
  }

  const elapsed = Math.max(0, audioInput.context.currentTime - startAudioTime);
  guideTone = scheduleGuideTone(audioInput.context, reference, startAudioTime, elapsed);
}

function stopGuideTone(): void {
  if (guideTone) {
    guideTone.stop();
    guideTone = null;
  }
}

function stopCountInTone(): void {
  if (countInTone) {
    countInTone.stop();
    countInTone = null;
  }
}

async function runCountdown(
  context: AudioContext,
  sessionStartTime: number,
  beatSec: number
): Promise<void> {
  const labels = ['3', '2', '1'];
  const countStartTime = sessionStartTime - COUNTDOWN_BEATS * beatSec;

  countdown.hidden = false;
  labels.forEach((label, index) => {
    const showAt = countStartTime + index * beatSec;
    window.setTimeout(() => {
      countdown.textContent = label;
    }, Math.max(0, (showAt - context.currentTime) * 1000));
  });

  await waitUntilAudioTime(context, sessionStartTime);
  hideCountdown();
  window.setTimeout(() => {
    stopCountInTone();
  }, 160);
}

function hideCountdown(): void {
  countdown.hidden = true;
  countdown.textContent = '';
}

function waitUntilAudioTime(context: AudioContext, targetTime: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, (targetTime - context.currentTime) * 1000));
  });
}

function handlePitch(message: AudioPitchMessage): void {
  if (!running || !reference || !scorer) {
    return;
  }

  updateInputLevel(message.rms);
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

function resetScores(): void {
  pitchScore.textContent = '--%';
  voiceScore.textContent = '--%';
  updateInputLevel(0);
  renderer.clearSamples();
}

function updateInputLevel(rms: number): void {
  const scale = Math.max(0, Math.min(1, rms / INPUT_LEVEL_FULL_SCALE_RMS));
  inputLevel.style.transform = `scaleX(${scale})`;
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
  guideToggle.disabled = Boolean(state.starting);
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
