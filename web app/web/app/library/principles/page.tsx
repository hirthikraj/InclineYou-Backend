import { Blk } from '@/web-components/library/chrome/Blk';
import { Sec, Tbl } from '@/web-components/library/chrome/Sec';
import { bySlug } from '@/web-components/library/system/parts';

/**
 * Part 1 — design principles.
 *
 * ── WHY THE PRINCIPLES ARE NOT ADJECTIVES ───────────────────────────────────
 *
 * The published example of this part is "Design with simplicity and clarity",
 * and the honest thing to say about that sentence is that no design decision
 * has ever lost an argument to it. Nobody proposes the complicated, unclear
 * option. A principle earns its place by being the side somebody can LOSE on,
 * which means it has to name what this product gives up.
 *
 * So these are stated as trades. "Density is a feature; decoration is not"
 * costs the product the airy layout that photographs well. "The row is the
 * receipt" costs it the satisfying toast on every save. Each one is a real
 * argument this product has already had, and the row shows what it cost.
 *
 * The ten heuristics below are Nielsen's, in the product's own vocabulary, and
 * they are copied from `UIUX-SKILL.md` rather than re-derived — that file is
 * the gate a component passes before it ships, and a second wording of the gate
 * would be a second gate.
 */
export const metadata = { title: 'Design principles · Design system' };

const TRADES = [
  {
    k: 'floor',
    p: 'The gym floor wins',
    give: 'Desktop-first polish, and any interaction that needs two hands or a steady read.',
    why: 'A trainer is mid-session with one hand busy. Every rule in this system is that person’s side of the argument.',
  },
  {
    k: 'density',
    p: 'Density is a feature; decoration is not',
    give: 'The airy layout. 34px desk controls, 44px rows, a 248px rail.',
    why: 'A 48px button in a desktop toolbar reads as a phone app in a window. The screen’s job is to hold a day, not to breathe.',
  },
  {
    k: 'receipt',
    p: 'The row that changed is the receipt',
    give: 'The satisfying confirmation on every save.',
    why: 'An answer where the reader is already looking beats an answer somewhere else. A toast is the last resort — for the confirm with no row on screen.',
  },
  {
    k: 'words',
    p: 'The trainer’s words, not the schema’s',
    give: 'The precision of the storage model in the copy.',
    why: '“₹2,400 pending” and “Pack ends in 3 sessions” are the money book’s words in the money book’s order. `status = active` is a fact about a database.',
  },
  {
    k: 'once',
    p: 'One question, one control, one spelling',
    give: 'The locally-perfect control that this one screen wanted.',
    why: 'Two copies of a picker is how one answer set ends up with two spellings. New colours: 0 is a figure this library prints on purpose.',
  },
  {
    k: 'prevent',
    p: 'Prevent the error before improving the message',
    give: 'Freedom in the input. ₹ lives outside the field; a day count is matched at apply time.',
    why: 'The best error copy in the world is still an error. And a client-side check stricter than the server’s refuses what the server would have taken.',
  },
  {
    k: 'exit',
    p: 'Every action has an exit; destruction has a typed one',
    give: 'The frictionless delete.',
    why: 'A checkbox is pressed by the same reflex that pressed the button. The delete-account screen asks for the phone number, typed.',
  },
  {
    k: 'refuse',
    p: 'A component states when not to use it',
    give: 'The component that quietly grows to fit every request.',
    why: 'A component without a refusal list grows into its neighbours, and the catalogue ends up with two answers to one question.',
  },
];

const HEURISTICS = [
  ['1 · Visibility of system status', 'Answer every write on the row it changed. Working state goes on the control itself; under ~300ms, nothing at all.'],
  ['2 · Match with the real world', 'Say “₹2,400 pending”, not `status = pending`. Storage facts never reach the copy.'],
  ['3 · User control and freedom', 'A move gets its ten-second take-back, a panel its Escape. Never confirm the routine — a second “Are you sure” on an ordinary save teaches people to click through the one that matters.'],
  ['4 · Consistency and standards', 'Reuse the extracted control rather than redrawing it. Keep a policy number in every copy it has, or a countdown lies.'],
  ['5 · Error prevention', 'Disable with a reason, constrain the input, and keep client-side checks looser than the server’s.'],
  ['6 · Recognition over recall', 'A payment is decided while looking at the payments table, so the panel keeps it visible. Name the target in the final button.'],
  ['7 · Flexibility and efficiency', 'Accelerators that do not punish the first use: ⌘K, single-key hints, arrow movement where a tablist promises it — never as the only route.'],
  ['8 · Aesthetic and minimalist design', 'Hold the measured densities. Spend glass only on the overlay layer; tables, cards and money stay flat and opaque.'],
  ['9 · Recognise, diagnose, recover', 'Branch on the error code, never the HTTP status. “That code isn’t right. 2 tries left.” — fact, consequence, count. No apology, no blame.'],
  ['10 · Help and documentation', 'A sentence where the question occurs, never a help page a gym-floor user will not open.'],
];

const GATE = [
  ['States', 'default · hover · active · focus-visible · disabled · loading if it can wait · error if it can refuse'],
  ['Targets', '24px minimum (WCAG 2.2 SC 2.5.8), 32px preferred, met with `::before` slop rather than by inflating the visual'],
  ['Contrast', '4.5:1 for text in both themes, measured after the material behind it'],
  ['Keyboard', 'Reachable, operable, escapable, with a visible `:focus-visible` ring — never a bare `:focus`'],
  ['Announcement', 'The right role and nothing extra: a tag has no role, a toast is `status`, a failure is `alert`'],
  ['Motion', 'Under 400ms, entrance curve on entrances, spring only on knob-sized changes, and the whole vocabulary collapses under `prefers-reduced-motion`'],
  ['Meaning', 'Colour never alone — the word carries it. Lime is a fill, never a stroke, never text on light'],
  ['Copy', 'Active voice, the trainer’s words, the consequence before the button that causes it'],
  ['When not to use', 'Written down. A component without a refusal list grows into its neighbours'],
];

export default function Page() {
  return (
    <Sec part={bySlug('principles')!}>
      <Blk
        title="The one-line version"
        lede={
          <>
            Everything below is an expansion of one sentence, and when two rules disagree it is the sentence
            that settles it.
          </>
        }
      >
        <p
          style={{
            fontFamily: 'var(--tx-brand)',
            fontSize: 25,
            fontWeight: 800,
            letterSpacing: '-.03em',
            lineHeight: 1.3,
            color: 'var(--tx-ink)',
            maxWidth: '22ch',
            margin: '6px 0 4px',
          }}
        >
          A trainer on a gym floor, mid-session, one hand busy.
        </p>
        <p className="blk__p">
          Not a persona and not an aspiration — a posture. It decides the row height, the target size, the
          reason a confirmation appears on the row rather than in a corner, and the reason the accelerator is
          never the only route.
        </p>
      </Blk>

      <Blk
        title="The principles, as trades"
        tag="what each one costs"
        lede={
          <>
            A principle nobody can lose an argument to is decoration. Nobody proposes the complicated,
            unclear option, so “design with clarity” settles nothing. Each of these names what the product
            gives up, which is the half that makes it usable in a review.
          </>
        }
      >
        <Tbl
          cols={['Principle', 'What it costs', 'Why it wins anyway']}
          rows={TRADES.map((t) => ({ key: t.k, cells: [<b key="p">{t.p}</b>, t.give, t.why] }))}
        />
      </Blk>

      <Blk
        title="The ten heuristics, applied"
        tag="nielsen, in this product’s words"
        lede={
          <>
            The published set, compressed into this product’s own vocabulary so that applying one never needs
            a translation step. The full text — with the do and don’t under each — is the shipping gate in{' '}
            <code>design-system/webapp/webapp/UIUX-SKILL.md</code>.
          </>
        }
      >
        <Tbl
          cols={['Heuristic', 'As this product applies it']}
          rows={HEURISTICS.map(([k, v]) => ({ key: k, cells: [<b key="k">{k}</b>, v] }))}
        />
      </Blk>

      <Blk
        title="The component quality gate"
        tag="run before a component is called done"
        lede={<>A component ships when every line answers yes. Nine questions, no partial credit.</>}
      >
        <Tbl
          cols={['Check', 'What it means']}
          rows={GATE.map(([k, v]) => ({ key: k, cells: [<b key="k">{k}</b>, v] }))}
        />
      </Blk>
    </Sec>
  );
}
