export type Hz = number & { readonly __brand: 'Hz' };
export type Midi = number & { readonly __brand: 'Midi' };
export type Cents = number & { readonly __brand: 'Cents' };
export type Beat = number & { readonly __brand: 'Beat' };
export type Seconds = number & { readonly __brand: 'Seconds' };

export type PitchSample = { time: Seconds; freq: Hz | null };

export interface RefNote {
  start: Beat;
  dur: Beat;
  note: Midi;
}

export interface Reference {
  tempo_bpm: number;
  ref_a4: number;
  notes: RefNote[];
}

export interface TimedRefNote extends RefNote {
  startSec: Seconds;
  endSec: Seconds;
  freq: Hz;
}

export interface PreparedReference extends Reference {
  notes: TimedRefNote[];
  durationSec: Seconds;
  minMidi: Midi;
  maxMidi: Midi;
}

export interface PitchDetector {
  detect(frame: Float32Array, sampleRate: number): Hz | null;
}

export type PitchState = 'hit' | 'sharp' | 'flat' | 'silent' | 'none';

export interface JudgedPitchSample extends PitchSample {
  cents: Cents | null;
  state: PitchState;
}

export const asHz = (value: number): Hz => value as Hz;
export const asMidi = (value: number): Midi => value as Midi;
export const asCents = (value: number): Cents => value as Cents;
export const asBeat = (value: number): Beat => value as Beat;
export const asSeconds = (value: number): Seconds => value as Seconds;
