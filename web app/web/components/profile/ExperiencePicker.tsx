'use client';

import { Chip, ChipRow } from '@/components/setup/Chips';
import { EXPERIENCE_BANDS } from '@/lib/setup/options';

/**
 * THE EXPERIENCE PICKER — five chips, one answer.
 *
 * One component, two callers: setup step 2 (`ExperienceForm`) and the
 * Experience tab of `/settings/profile`. Extracted for the reason
 * `CertificationPicker` was — a trainer editing an answer later must not meet a
 * second, subtly different version of the screen that collected it.
 *
 * **Experience is a band, not a number.** There is no dominant value so a
 * stepper is wrong; nothing changes visibly as you drag so a slider is wrong;
 * and a free field invites `0.5` and `50` and needs validation for a value you
 * would bucket anyway. Stored as one of five bands it also stays true next year
 * without anybody editing it — which matters more on the profile than in setup,
 * because the profile is where a stale number would sit for years.
 *
 * **The click selects; it does not save.** Setup writes on Continue, the
 * profile writes on Save. This used to write and navigate on the click itself
 * and that was wrong for a reason worth keeping written down: *a trainer who
 * mis-clicked has no way to see they did before the page has gone.*
 *
 * `value` is `null`/`''` for never answered, which on the profile is a real
 * state — the phone can finish setup with this step skipped in ways this half
 * cannot, and a screen that pre-selected a band to avoid drawing an empty row
 * would be answering the question for them.
 */
export function ExperiencePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string | null;
  onChange: (id: string) => void;
  /** A write is in flight. */
  disabled?: boolean;
}) {
  return (
    <ChipRow>
      {EXPERIENCE_BANDS.map((band) => (
        <Chip
          key={band.id}
          label={band.label}
          pressed={value === band.id}
          disabled={disabled}
          onClick={() => onChange(band.id)}
        />
      ))}
    </ChipRow>
  );
}
