/**
 * A client's gender (V43, 22 Nov 2026) — the four answers the server takes, in the order they are offered.
 *
 * Asked on the add flow's first step beside the date of birth and editable on the Profile tab. It is never inferred
 * from a name, and "Prefer not to say" is a full answer, not a skip. No `server-only` (trap 18): the add flow and
 * the client file are client components.
 */
export type Gender = 'female' | 'male' | 'other' | 'prefer_not_to_say';

export const GENDERS: { value: Gender; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

export function asGender(v: unknown): Gender | null {
  return GENDERS.some((g) => g.value === v) ? (v as Gender) : null;
}

export function genderLabel(v: string | null | undefined): string | null {
  return GENDERS.find((g) => g.value === v)?.label ?? null;
}
