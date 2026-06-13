import {
  asBeat,
  asHz,
  asMidi,
  asSeconds,
  type Beat,
  type Hz,
  type Midi,
  type PreparedReference,
  type Reference,
  type TimedRefNote
} from './types';

type RawRefNote = {
  start: number;
  dur: number;
  note: number;
};

type RawReference = {
  tempo_bpm: number;
  ref_a4: number;
  notes: RawRefNote[];
};

export async function loadReference(url: string): Promise<PreparedReference> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load reference: ${response.status}`);
  }

  const raw = (await response.json()) as RawReference;
  return prepareReference({
    tempo_bpm: raw.tempo_bpm,
    ref_a4: raw.ref_a4,
    notes: raw.notes.map((note) => ({
      start: asBeat(note.start),
      dur: asBeat(note.dur),
      note: asMidi(note.note)
    }))
  });
}

export function prepareReference(reference: Reference): PreparedReference {
  if (reference.tempo_bpm <= 0) {
    throw new Error('Reference tempo must be positive.');
  }

  const secondsPerBeat = 60 / reference.tempo_bpm;
  const notes = reference.notes
    .map<TimedRefNote>((note) => {
      const startSec = Number(note.start) * secondsPerBeat;
      const endSec = (Number(note.start) + Number(note.dur)) * secondsPerBeat;
      return {
        ...note,
        startSec: asSeconds(startSec),
        endSec: asSeconds(endSec),
        freq: midiToHz(note.note, reference.ref_a4)
      };
    })
    .sort((a, b) => Number(a.startSec) - Number(b.startSec));

  const lastEnd = notes.reduce((max, note) => Math.max(max, Number(note.endSec)), 0);
  const midiValues = notes.map((note) => Number(note.note));

  return {
    ...reference,
    notes,
    durationSec: asSeconds(lastEnd),
    minMidi: asMidi(Math.min(...midiValues)),
    maxMidi: asMidi(Math.max(...midiValues))
  };
}

export function transposeReference(
  reference: PreparedReference,
  semitones: number
): PreparedReference {
  if (semitones === 0) {
    return reference;
  }

  const notes = reference.notes.map<TimedRefNote>((note) => {
    const transposedNote = asMidi(Number(note.note) + semitones);
    return {
      ...note,
      note: transposedNote,
      freq: midiToHz(transposedNote, reference.ref_a4)
    };
  });
  const midiValues = notes.map((note) => Number(note.note));

  return {
    ...reference,
    notes,
    minMidi: asMidi(Math.min(...midiValues)),
    maxMidi: asMidi(Math.max(...midiValues))
  };
}

export function beatToSeconds(beat: Beat, tempoBpm: number) {
  return asSeconds((Number(beat) * 60) / tempoBpm);
}

export function midiToHz(note: Midi, refA4: number): Hz {
  return asHz(refA4 * 2 ** ((Number(note) - 69) / 12));
}

export function hzToMidi(freq: Hz): Midi {
  return asMidi(69 + 12 * Math.log2(Number(freq) / 440));
}

export function getTargetAt(reference: PreparedReference, timeSec: number): TimedRefNote | null {
  return (
    reference.notes.find(
      (note) => timeSec >= Number(note.startSec) && timeSec < Number(note.endSec)
    ) ?? null
  );
}

export function noteName(midi: Midi): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const rounded = Math.round(Number(midi));
  const octave = Math.floor(rounded / 12) - 1;
  return `${names[((rounded % 12) + 12) % 12]}${octave}`;
}
