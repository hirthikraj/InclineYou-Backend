/** The client's settings and privacy wire (api-contract 1.2, ps-l1 and ps-l2). Types only: reads go through `portalGet`, writes through server actions. */
export interface PrefsWire {
  hideWeight: boolean;
  autoRestTimer: boolean;
  notify: { programUpdated: boolean; sessionReminder: boolean; trainerNote: boolean; personalBest: boolean; packChanged: boolean; assessment: boolean };
  channels: { whatsapp: boolean; push: boolean };
  whatsapp: { reminderOffered: boolean; optedIn: boolean };
  nominee: { name: string; phone: string } | null;
  version: string;
}

export interface PrivacyWire {
  trainerName: string;
  policyVersion: string | null;
  acceptedAt: number | null;
  sees: { key: string; label: string; healthItems?: string[]; clientCanSee?: boolean }[];
  doesNotSee: string[];
  sharedNotes: number;
  privateNotesKept: boolean;
}
