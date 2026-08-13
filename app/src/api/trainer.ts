/**
 * The trainer's own profile — `/v1/trainers/me`.
 *
 * Everything trainer setup collects lands here. Read as a tolerant reader:
 * fields this build doesn't know about are ignored, and fields the server
 * hasn't got yet come back absent rather than breaking the parse.
 */

import { api } from './client';

export interface TrainerProfile {
  id: string;
  phone: string;
  name: string;
  upiVpa: string | null;
  /** A band id — 'lt1' | '1_2' | '3_5' | '6_10' | '10_plus' — never a number of years. */
  experienceBand: string | null;
  specialities: string[];
  certifications: string[];
  languages: string[];
  /** The server's answer to "is trainer setup still owed". */
  setupComplete: boolean;
  setupCompletedAt: string | null;
  /**
   * Screen 06 · money. A null gym name means no gym — an independent trainer
   * keeps all of it, and the "your share" line is hidden rather than shown as
   * a full bar that says nothing.
   */
  gymName?: string | null;
  /** What the GYM keeps, on floor sessions. Remote is always 0%. */
  gymSharePercent?: number | null;
  /**
   * Screens 07–16 · settings. Flat keys under `trainer.metadata.prefs`.
   *
   * Untyped here on purpose: the phone is the source of truth for these and
   * `settings/prefs.ts` owns the shape. This is the server's copy, read once on
   * a fresh install, and it may contain keys a newer build wrote.
   */
  preferences?: Record<string, unknown>;
}

/**
 * Every field is optional and omitting one leaves it alone. An empty string or
 * an empty array is NOT the same as omitting: it clears that field. The setup
 * flow sends the whole profile in one call; Settings will send one field.
 */
export interface TrainerUpdate {
  name?: string;
  upiVpa?: string;
  experienceBand?: string;
  specialities?: string[];
  certifications?: string[];
  languages?: string[];
  /** Stamps setup as finished. The server never un-stamps it. */
  completeSetup?: boolean;
  /** An empty string means "left the gym" — it clears the percentage too. */
  gymName?: string;
  gymSharePercent?: number;
  /**
   * Merged key by key, not replaced — one switch at a time must not blank the
   * other eight. A key set to null is a deletion.
   */
  preferences?: Record<string, unknown>;
}

export function getTrainer() {
  return api.get<TrainerProfile>('/v1/trainers/me');
}

export function updateTrainer(patch: TrainerUpdate) {
  return api.patch<TrainerProfile>('/v1/trainers/me', patch);
}
