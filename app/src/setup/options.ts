/**
 * The answer sets for trainer setup.
 *
 * From `agent/design system/screens/xreptrainersetup.html`. Two things about
 * the ordering are deliberate and should survive any edit:
 *
 *   · nothing here is alphabetical. Every list is ordered by how often an
 *     Indian trainer actually picks it, because the first three entries are the
 *     only ones most people will read;
 *   · K11 leads the certifications because it is the Indian default, and
 *     "Not certified yet" is a first-class option rather than an absence.
 *     India has no licensing requirement for personal trainers — no mandated
 *     certificate, no statutory register, no protected title — so a flow that
 *     treats "uncertified" as a failure state is lying about the profession.
 *
 * Ids are stable and are what gets stored; the labels are display-only and can
 * be reworded without migrating anything.
 */

export interface Option {
  id: string;
  label: string;
  /** Second line, list rows only. */
  note?: string;
}

/**
 * Experience is a BAND, not a number. There is no dominant value so a stepper
 * is wrong, nothing changes visibly as you drag so a slider is wrong, and a
 * free field invites `0.5` and `50` and needs validation for a value you would
 * bucket anyway. Stored as a band it also stays true next year without anyone
 * editing it.
 */
export const EXPERIENCE_BANDS: Option[] = [
  { id: 'lt1', label: 'Less than a year' },
  { id: '1_2', label: '1–2 years' },
  { id: '3_5', label: '3–5 years' },
  { id: '6_10', label: '6–10 years' },
  { id: '10_plus', label: '10+ years' },
];

/** Up to five, and the cap is the point — a trainer who "does everything" tells a client nothing. */
export const SPECIALITY_CAP = 5;

export const SPECIALITIES: Option[] = [
  { id: 'strength', label: 'Strength & conditioning' },
  { id: 'weight_loss', label: 'Weight loss' },
  { id: 'muscle_gain', label: 'Muscle gain' },
  { id: 'rehab', label: 'Post-injury rehab' },
  { id: 'sports', label: 'Sports performance' },
  { id: 'natal', label: 'Pre & post-natal' },
  { id: 'powerlifting', label: 'Powerlifting' },
  { id: 'functional', label: 'Functional fitness' },
  { id: 'senior', label: 'Senior fitness' },
  { id: 'calisthenics', label: 'Calisthenics' },
  { id: 'bodybuilding', label: 'Bodybuilding prep' },
  { id: 'yoga', label: 'Yoga' },
];

/**
 * "Not certified yet" is exclusive: holding it alongside a certificate is a
 * contradiction, and letting both stand would put a nonsense pair on a profile.
 */
export const NOT_CERTIFIED = 'none';

/** The chips on the screen — the short head of the list. */
export const CERTIFICATIONS_COMMON: string[] = ['k11_cpt', 'cpr', 'ace_cpt', 'nasm_cpt', NOT_CERTIFIED];

/** The full searchable list behind "Search certifications". */
export const CERTIFICATIONS: Option[] = [
  { id: 'k11_cpt', label: 'K11 — Certified Personal Trainer', note: 'Most common in India' },
  { id: 'ace_cpt', label: 'ACE — Certified Personal Trainer', note: 'American Council on Exercise' },
  { id: 'nasm_cpt', label: 'NASM — Certified Personal Trainer', note: 'National Academy of Sports Medicine' },
  { id: 'issa_cpt', label: 'ISSA — Certified Personal Trainer', note: 'ISSA, United States' },
  { id: 'golds', label: "Gold's Gym — Certificate I / II in Fitness", note: "Gold's Gym Fitness Institute" },
  { id: 'spefl_l4', label: 'SPEFL-SC — Fitness Trainer, NSQF Level 4', note: 'Government of India · NSQF' },
  { id: 'cpr', label: 'CPR & First Aid', note: 'Basic life support' },
  { id: NOT_CERTIFIED, label: 'Not certified yet', note: 'A real answer, not a blank' },
];

/**
 * Zero of the eight platforms in the teardown ask this. In a market where a
 * client may specifically want a Tamil-speaking coach, it is one field no
 * competitor can match — which is why this step has no Skip.
 */
export const LANGUAGES: Option[] = [
  { id: 'ta', label: 'Tamil' },
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'Hindi' },
  { id: 'te', label: 'Telugu' },
  { id: 'ml', label: 'Malayalam' },
  { id: 'kn', label: 'Kannada' },
  { id: 'mr', label: 'Marathi' },
  { id: 'bn', label: 'Bengali' },
  { id: 'gu', label: 'Gujarati' },
  { id: 'pa', label: 'Punjabi' },
];

/** The handles most Indian trainers will actually have, for the bad-format help. */
export const UPI_HANDLES = ['@okhdfcbank', '@ybl', '@paytm', '@upi', '@oksbi'];

/**
 * Anything the trainer typed themselves is stored with this prefix, so a custom
 * value is never mistaken for a catalogue id and the label survives round-trips
 * without a lookup table.
 */
const CUSTOM = 'custom:';

export function customId(label: string): string {
  return CUSTOM + label.trim();
}

export function isCustom(id: string): boolean {
  return id.startsWith(CUSTOM);
}

/** Resolves an id to its label, whether it came from a catalogue or was typed. */
export function labelFor(id: string, catalogue: Option[]): string {
  if (isCustom(id)) return id.slice(CUSTOM.length);
  return catalogue.find((o) => o.id === id)?.label ?? id;
}

/** Ids to a readable list: "Strength, weight loss, rehab". */
export function labelList(ids: string[], catalogue: Option[], limit = 3): string {
  const labels = ids.slice(0, limit).map((id) => labelFor(id, catalogue));
  const rest = ids.length - labels.length;
  return rest > 0 ? `${labels.join(', ')} +${rest}` : labels.join(', ');
}
