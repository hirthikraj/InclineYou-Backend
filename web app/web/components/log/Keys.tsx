/**
 * THE ACCELERATOR BAR.
 *
 * Krause & Harley (2024) give it three rules and this bar obeys all three.
 *
 * *"Style them in a way that differentiates them from the corresponding
 * GUI-command label"*, and *"accelerators should be readily available, yet easy
 * to ignore"* — so they live in mono `<kbd>` at the FOOT of the frame, never in
 * the labels of the buttons they duplicate, and the bar is the last thing in the
 * reading order rather than the first.
 *
 * *"Increasing efficiency and productivity really matters only for repeat
 * tasks."* A trainer logs twelve sets a session and four sessions a morning —
 * about forty-eight rows before nine o'clock, which is the most repeated action
 * in the product. It is why this is the only screen in the set with a bar.
 *
 * *"Do not override commonly known shortcuts."* ⌘Z is undo and nothing else.
 * Nothing here rebinds copy, paste, select-all or print, and ⌘↵ — the one
 * non-obvious binding — is printed here and duplicated as the primary button on
 * the open slot.
 */
export function Keys({ undoable }: { undoable: boolean }) {
  return (
    <div className="keys">
      <b><kbd>Tab</kbd> across the row</b>
      <b><kbd>↵</kbd> commit, and open the next set</b>
      <b><kbd>⌘</kbd><kbd>↵</kbd> accept last time&rsquo;s numbers</b>
      <b><kbd>↑</kbd><kbd>↓</kbd> between sets</b>
      <b><kbd>N</kbd> a note on this set</b>
      <b style={{ opacity: undoable ? 1 : 0.55 }}>
        <kbd>⌘Z</kbd> {undoable ? 'put the deleted set back' : 'undo'}
      </b>
    </div>
  );
}
