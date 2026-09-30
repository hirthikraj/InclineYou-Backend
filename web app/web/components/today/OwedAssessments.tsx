'use client';

import { createContext, useContext } from 'react';

import type { OwedAssessment } from '@/lib/today/api';

/**
 * The earliest assessment each client owes today or earlier (Today L10), by
 * client id — read by the hero's chips so the *Assessment due* chip can sit on
 * the card of the client who is in front of the trainer.
 *
 * A context rather than a prop because the chips are drawn three levels down
 * (`Running`, `Next`, the upcoming card) and only one of them needs this; it is
 * `LastContactProvider`'s shape, for the same reason.
 */
const Owed = createContext<Record<string, OwedAssessment>>({});

export const OwedAssessmentsProvider = Owed.Provider;

/** This client's owed assessment, or `undefined` when they owe none. */
export function useOwedAssessment(clientId: string): OwedAssessment | undefined {
  return useContext(Owed)[clientId];
}
