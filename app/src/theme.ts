/**
 * The colours the app already used, pulled into one place so new screens don't
 * drift. Deliberately not a design system — the real visual pass comes later.
 */
export const colors = {
  indigo: '#4F46E5',
  indigoSoft: '#E0E7FF',
  indigoTint: '#EDF2FF',

  bg: '#F4F6FA',
  card: '#FFFFFF',

  ink: '#1A1A2E',
  body: '#555',
  muted: '#888',
  faint: '#AAA',
  hairline: '#EEF0F4',
  border: '#D0D5DD',
};

/** Chip fills, shared by status chips and the sync bar so tones stay consistent. */
export const tones = {
  good: { bg: '#E8F5E9', fg: '#2E7D32' },
  warn: { bg: '#FFF4E5', fg: '#B26A00' },
  danger: { bg: '#FDECEA', fg: '#C62828' },
  neutral: { bg: '#EEF0F4', fg: '#667085' },
};

export type Tone = keyof typeof tones;
