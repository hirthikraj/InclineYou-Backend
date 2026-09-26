'use client';

import { useEffect, useRef, useState } from 'react';

import { parseMarkup, type Mark } from '@/lib/text/markup';
import { useEscapeGuard } from './Modal';

/**
 * MarkupField — a box that shows the formatting it writes, over the plain text
 * column it saves to. Catalogue entry `c-markupfield`, `.mkpf`.
 *
 * ── THIS WAS A TEXTAREA FIRST, AND THAT WAS THE WRONG CALL ──────────────────
 *
 * The first version kept the markers visible — `**drive**` stayed `**drive**`
 * in the box, with a rendered *Reads as* line underneath — on the argument that
 * a textarea gives you the browser's undo, paste and selection for free and
 * that visible markers teach the vocabulary. Every word of that is true and it
 * still failed the only test that matters: **a trainer presses B and nothing in
 * the box changes.** The first question asked of it was "why are the buttons
 * not working", which is the correct reading of a toolbar whose effect appears
 * somewhere else on the screen. A preview is not feedback.
 *
 * A highlight overlay behind a transparent textarea — the usual repair — cannot
 * work here either, and the reason is font metrics: bold glyphs are wider, so
 * the painted text and the textarea's own line wrapping drift apart within a
 * sentence and the caret lands in the wrong place. One box, one font, no
 * emphasis. So the box is `contenteditable`.
 *
 * ── WHAT IS STORED IS STILL MARKDOWN, AND THAT IS THE WHOLE POINT ───────────
 *
 * The column is plain text and stays plain text: this component renders
 * `lib/text/markup.ts`'s nodes into the editable on the way in and serialises
 * the DOM back to the same four markers on the way out, on every keystroke.
 * Nothing else in the product ever sees HTML — `Markup` reads the markers to
 * draw the note wherever it is displayed, and the wire carries the string a
 * trainer could have typed by hand.
 *
 * ── THE THREE THINGS A `contenteditable` COSTS, AND WHAT PAYS THEM ──────────
 *
 * · **React must not own the DOM.** A controlled re-render on every keystroke
 *   puts the caret back at the start. So the editable is written imperatively,
 *   once, and only when the value arriving from outside differs from what this
 *   component last serialised — which is the case for *the dialog opened* and
 *   *an undo landed*, and never the case for *the trainer typed a letter*.
 * · **Paste carries a document.** `onPaste` takes `text/plain` and inserts it
 *   as text, so a paragraph pasted out of a browser arrives as a sentence
 *   rather than as somebody's stylesheet.
 * · **`execCommand` is deprecated and still the only API.** It is what every
 *   browser implements for bold/italic/underline in an editable, it keeps the
 *   native undo stack intact — which is what makes ⌘Z work on the text — and
 *   `styleWithCSS=false` makes it emit `<b>` and `<i>` rather than styled
 *   spans, which is what the serialiser reads.
 *
 * The keyboard is the full set: **⌘/Ctrl + B · I · U** for the marks, **⌘Z**
 * and **⌘⇧Z / Ctrl+Y** for undo and redo of the writing, and **⌘⏎** for the
 * caller's commit. Enter is a new line and stays one.
 *
 * ── WHAT IS DELIBERATELY NOT ON THE TOOLBAR ────────────────────────────────
 *
 * The design draws a **Text ▾** menu beside the marks. Its only two entries
 * would be *Text* and *Heading*, and **H** is already both in one press. Lists,
 * links, code and quotes are absent for the reason the format leaves them out:
 * this is a cue read on a phone between sets, not a document.
 */
export function MarkupField({
  value,
  onChange,
  label,
  hideLabel = true,
  placeholder,
  /** Ctrl/⌘+Enter — the caller's commit, since Enter is a new line in here. */
  onCommit,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  /** The accessible name of the box. Required — the toolbar is not a label. */
  label: string;
  /**
   * DEFAULTS TO TRUE, WHICH IS BACKWARDS FROM `Field` AND IS THE HONEST DEFAULT
   * HERE.
   *
   * This box has been the accessible name only since it was written, and its
   * three existing call-sites rely on that: a cue under a set row, a note in a
   * dialog and a comment in a thread are all named by the thing they are
   * attached to, and drawing a `.fld__l` over each would be a second title on a
   * surface that already has one.
   *
   * A form is the case that differs. The assessment editor stacks this under a
   * `TextField` whose label is drawn, and a field whose neighbour is labelled
   * and which is not reads as a box somebody forgot to finish. So the label is
   * drawable, and asked for — which is also what keeps the existing three
   * byte-identical.
   */
  hideLabel?: boolean;
  placeholder?: string;
  onCommit?: () => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  /** What this component last handed to `onChange`. See the header: the guard
   *  that stops a re-render from moving the caret. */
  const mine = useRef<string | null>(null);
  const [emoji, setEmoji] = useState(false);
  const [empty, setEmpty] = useState(!value);
  /** WHICH MARKS THE CARET IS STANDING IN. See `refresh`. */
  const [on, setOn] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (value === mine.current) return;
    el.innerHTML = htmlFor(value);
    mine.current = value;
    setEmpty(!value);
  }, [value]);

  /* ── THE TOOLBAR REPORTS THE CARET, IT DOES NOT JUST FIRE AT IT ───────────
     A button that only acts is a button you have to press to find out what it
     did — and once the box shows the marks, the missing half is the other
     direction: *what am I typing in right now*. So the four controls are
     TOGGLES that light when the selection is inside their mark, which also
     makes the second press legible as "take it off" rather than "do it again".

     `selectionchange` is the only event that fires for all of it: clicking into
     a bold word, arrowing into one, dragging a selection across two, and the
     state a collapsed caret carries after B is pressed with nothing selected —
     that last one is invisible to the DOM and is exactly what
     `queryCommandState` knows. Deprecated, like `execCommand` beside it, and
     the only API a browser offers for the question. */
  useEffect(() => {
    function refresh() {
      const el = box.current;
      const at = window.getSelection()?.anchorNode;
      if (!el || !at || !el.contains(at)) return;
      let line: Node | null = at;
      while (line && line.parentNode !== el) line = line.parentNode;
      setOn({
        bold: state('bold'),
        italic: state('italic'),
        underline: state('underline'),
        heading: line instanceof HTMLElement && line.classList.contains('mkpf__h'),
      });
    }
    document.addEventListener('selectionchange', refresh);
    return () => document.removeEventListener('selectionchange', refresh);
  }, []);

  /* `<b>`, not `<span style>`. Set once, globally, because the flag is a
     document-wide mode rather than a per-call argument. */
  useEffect(() => {
    try {
      document.execCommand('styleWithCSS', false, 'false');
    } catch {
      /* Not every engine has it; the serialiser reads inline styles too. */
    }
  }, []);

  /** Read the box back out as markdown and tell the caller. */
  function sync() {
    const el = box.current;
    if (!el) return;
    const next = serialize(el);
    /* EMPTIED MEANS EMPTIED, block class and all. Deleting every character
       leaves the editable holding the last block it had, so a note cleared out
       of a heading line kept writing headings — and the placeholder, which is
       drawn on this element, would have been drawn in the heading's face. */
    if (!next && el.querySelector('.mkpf__h')) el.innerHTML = '<div><br></div>';
    mine.current = next;
    setEmpty(next.length === 0);
    onChange(next);
  }

  function run(command: string, argument?: string) {
    box.current?.focus();
    document.execCommand(command, false, argument);
    sync();
    /* A mark applied to a selection that did not MOVE fires no
       `selectionchange`, so the lamp would stay on the previous answer until
       the caret was nudged — which is the one moment it is being watched. */
    setOn(o => ({ ...o, bold: state('bold'), italic: state('italic'), underline: state('underline') }));
  }

  /** The caret's line, as a block element of the editable. */
  function lineOf(): HTMLElement | null {
    const el = box.current;
    const at = window.getSelection()?.anchorNode;
    if (!el || !at) return null;
    let node: Node | null = at;
    while (node && node.parentNode !== el) node = node.parentNode;
    return node instanceof HTMLElement ? node : null;
  }

  return (
    <div className={['mkpf', className].filter(Boolean).join(' ')}>
      {/* A `<p>`, not a `<label>`: a label's `htmlFor` needs an `id` on a
          labelable control, and a `contenteditable` `<div>` is not one. The
          accessible name stays `aria-label` on the box — this is the same
          string, drawn, and `aria-hidden` so a reader is not told it twice. */}
      {!hideLabel && <p className="fld__l" aria-hidden="true">{label}</p>}
      <div className="mkpf__box">
        <div
          ref={box}
          className={`mkpf__ed${empty ? ' mkpf__ed--empty' : ''}`}
          contentEditable
          suppressContentEditableWarning
          /* A `contenteditable` is focusable but matches none of the selectors a
             focus trap looks for. `ModalHost` finds it by `[tabindex]`. */
          tabIndex={0}
          role="textbox"
          aria-multiline="true"
          aria-label={label}
          data-placeholder={placeholder}
          onInput={sync}
          onBlur={sync}
          onPaste={e => {
            /* TEXT, NEVER THE CLIPBOARD'S HTML. Four marks are the whole
               vocabulary; a pasted document brings tables, colours and font
               stacks into a column that is one sentence long. */
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, text);
            sync();
          }}
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && onCommit) {
              e.preventDefault();
              onCommit();
              return;
            }
            if (!(e.metaKey || e.ctrlKey) || e.altKey) return;

            /* ── UNDO AND REDO, TAKEN RATHER THAN LEFT TO THE BROWSER ───────
               An editable has a native history and ⌘Z walks it — but only for
               as long as nothing rewrites `innerHTML` underneath it, and this
               box is rewritten whenever a value arrives from outside (the
               dialog opening, a scope chip changing what is being edited).
               Driving `execCommand` and re-serialising afterwards keeps the
               model and that history in step; leaving it implicit meant a ⌘Z
               that moved the text in the box and not what would be saved.

               `⌘Z` / `⌘⇧Z`, and `Ctrl+Y` as well because that is redo on
               Windows. This is the note's OWN history: the builder's undo
               stack holds the structure of the session and deliberately keeps
               its hands off the two text fields — `WorkoutBuilder`'s reducer
               says so in as many words. */
            const z = e.key.toLowerCase();
            if (z === 'z' || z === 'y') {
              e.preventDefault();
              const redo = z === 'y' || e.shiftKey;
              run(redo ? 'redo' : 'undo');
              return;
            }

            const command = SHORTCUT[e.key.toLowerCase()];
            if (!command) return;
            /* Taken from the browser rather than left to it, so the three marks
               behave identically whatever the engine's own bindings are — and
               so ⌘B cannot reach the bookmark bar through an editable. */
            e.preventDefault();
            run(command);
          }}
        />

        {/* INSIDE THE FIELD'S BORDER, at its foot — the toolbar acts on the box
            above it. `onMouseDown` is prevented on every control: a button that
            took focus would collapse the selection it is about to format. */}
        <div className="mkpf__tb" role="toolbar" aria-label={`Formatting for ${label}`}>
          {MARKS.map(([key, command, mark, hint]) => (
            <button
              key={mark}
              type="button"
              className={`mkpf__b mkpf__b--${mark}${on[mark] ? ' mkpf__b--on' : ''}`}
              /* `aria-pressed` and not a second label: the control is one thing
                 in two states, and a name that changed with the state would be
                 announced as a different button every time it was used. */
              aria-pressed={Boolean(on[mark])}
              aria-label={hint}
              title={hint}
              onMouseDown={e => e.preventDefault()}
              onClick={() => run(command)}
            >
              {key}
            </button>
          ))}
          <button
            type="button"
            className={`mkpf__b mkpf__b--h${on.heading ? ' mkpf__b--on' : ''}`}
            aria-pressed={Boolean(on.heading)}
            aria-label="Heading — the line stands out"
            title="Heading — the line stands out"
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              /* A LINE, not a selection. `#` is a line prefix in the format and
                 pretending otherwise would let a trainer head half a sentence.
                 A class rather than `formatBlock`: an `<h3>` in here would be a
                 heading in the document outline of a screen that has one. */
              const line = lineOf();
              if (!line) return;
              const heading = line.classList.toggle('mkpf__h');
              box.current?.focus();
              sync();
              setOn(o => ({ ...o, heading }));
            }}
          >
            H
          </button>

          <Emoji
            open={emoji}
            onOpen={setEmoji}
            onPick={glyph => {
              run('insertText', glyph);
              setEmoji(false);
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** `queryCommandState`, with the throw some engines answer with swallowed. */
function state(command: string): boolean {
  try {
    return document.queryCommandState(command);
  } catch {
    return false;
  }
}

const MARKS: [string, string, Mark, string][] = [
  ['B', 'bold', 'bold', 'Bold'],
  ['I', 'italic', 'italic', 'Italic'],
  ['U', 'underline', 'underline', 'Underline'],
];

const SHORTCUT: Record<string, string | undefined> = {
  b: 'bold',
  i: 'italic',
  u: 'underline',
};

/* ──────────────────────────────────────────────── the two translations ── */

const ESCAPE: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

/**
 * Markdown in, editable DOM out.
 *
 * One `<div>` per line, which is what every browser produces for Enter in an
 * editable — building anything else means fighting the engine on the first
 * keystroke. An empty line carries a `<br>` for the same reason: without it the
 * div has no height and the trainer's blank line is invisible until they type.
 */
function htmlFor(value: string): string {
  return parseMarkup(value)
    .map(block => {
      const inner =
        block.spans
          .map(span => {
            const text = span.text.replace(/[&<>]/g, c => ESCAPE[c]);
            return span.marks.reduceRight((html, mark) => `<${TAG[mark]}>${html}</${TAG[mark]}>`, text);
          })
          .join('') || '<br>';
      return `<div${block.heading ? ' class="mkpf__h"' : ''}>${inner}</div>`;
    })
    .join('');
}

const TAG: Record<Mark, string> = { bold: 'b', italic: 'i', underline: 'u' };

/**
 * And back: editable DOM in, markdown out.
 *
 * ── IT READS THE SHAPE, NOT THE TAG NAMES IT WROTE ──────────────────────────
 *
 * `htmlFor` emits `<b>`, `<i>` and `<u>`, and by the time a trainer has typed
 * into it the box also holds whatever their browser produced — `<strong>` from
 * a paste, `<em>` from an engine that prefers it, a `font-weight` from one that
 * ignored `styleWithCSS`. All of them are read, because the alternative is a
 * mark that renders in the box and vanishes on save.
 */
function serialize(root: HTMLElement): string {
  const lines: string[] = [];
  /* Inline content sitting at the root with no block around it — which is what
     some engines leave behind for the first line ever typed into an empty
     editable. It belongs to the line before the first block. */
  let loose = '';

  for (const node of [...root.childNodes]) {
    if (!isBlock(node)) {
      loose += inline(node, []);
      continue;
    }
    if (loose) {
      lines.push(loose);
      loose = '';
    }
    const heading = node instanceof HTMLElement && node.classList.contains('mkpf__h');
    /* ITS CHILDREN, NOT THE BLOCK — `inline` answers a NESTED block with a
       leading newline (that is what makes a nested one a line of its own), and
       asking it about the block we are already in put that newline in front of
       every line in the note. One Enter saved as two. */
    const parts = [...node.childNodes]
      .map(child => inline(child, []))
      .join('')
      .split('\n');
    /* THE BROWSER'S PADDING `<br>` IS NOT A LINE. Every empty block carries one
       — it is what gives the line its height — and counting it made one press
       of Enter produce two newlines in the saved note. A trailing empty part is
       that padding; a MIDDLE empty part is a blank line somebody typed. */
    if (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
    for (const part of parts) lines.push(heading && part ? `# ${part}` : part);
  }
  if (loose) lines.push(loose);

  /* Trailing empties are the editable's own slack, not the trainer's. */
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

/**
 * One node's inline content, as markdown. `<br>` is a newline; a nested block —
 * which some engines produce on Enter inside a styled line — is one too, so a
 * caller splitting on `\n` gets the lines whichever shape the engine chose.
 */
function inline(node: Node, marks: Mark[]): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? '';
  if (!(node instanceof HTMLElement)) return '';
  if (node.tagName === 'BR') return '\n';

  const mark = markOf(node);
  const deeper = mark && !marks.includes(mark) ? [...marks, mark] : marks;
  const inner = [...node.childNodes].map(child => inline(child, deeper)).join('');
  if (isBlock(node)) return `\n${inner}`;
  /* WRAPPED ONLY IF THERE IS SOMETHING INSIDE. An empty `<b>` — what a browser
     leaves behind when a bolded word is deleted — would otherwise serialise as
     `****` and read back as four literal asterisks. And never twice: a `<b>`
     inside a `<b>` is one bold run, which is what `marks` is carrying. */
  if (!mark || !inner.trim() || marks.includes(mark)) return inner;
  return `${MARKER[mark]}${inner}${MARKER[mark]}`;
}

function isBlock(node: Node): boolean {
  return node instanceof HTMLElement && (node.tagName === 'DIV' || node.tagName === 'P');
}

const MARKER: Record<Mark, string> = { bold: '**', italic: '*', underline: '__' };

function markOf(el: HTMLElement): Mark | null {
  const tag = el.tagName;
  if (tag === 'B' || tag === 'STRONG') return 'bold';
  if (tag === 'I' || tag === 'EM') return 'italic';
  if (tag === 'U' || tag === 'INS') return 'underline';
  /* The engines that ignore `styleWithCSS=false` write these instead. */
  const style = el.style;
  if (style.fontWeight === 'bold' || Number(style.fontWeight) >= 600) return 'bold';
  if (style.fontStyle === 'italic') return 'italic';
  if (style.textDecoration.includes('underline')) return 'underline';
  return null;
}

/**
 * THE EMOJI, AND WHY IT IS A FIXED SHORT LIST.
 *
 * Emoji are plain text — they needed no format and no renderer, which is why
 * this button could have shipped before any of the rest. The list is sixteen
 * and it is the gym's: a full picker is a search field, a skin-tone menu and a
 * scrolling grid of two thousand glyphs, inside a dialog that is one field
 * wide, for a cue that wants a flame or a warning at most.
 */
const GLYPHS = ['💪', '🔥', '⚡', '✅', '⚠️', '⏱️', '🎯', '📈', '🧊', '🫁', '🙌', '👏', '🐢', '🪶', '🧠', '❗'];

function Emoji({
  open,
  onOpen,
  onPick,
}: {
  open: boolean;
  onOpen: (open: boolean) => void;
  onPick: (glyph: string) => void;
}) {
  const box = useRef<HTMLSpanElement>(null);

  /* ESCAPE CLOSES THE GRID AND NOTHING ELSE, and the guard is what makes that
     true. `stopImmediatePropagation` in capture is the repair every popover in
     this codebase reached for and it cannot work: a surrounding `ModalHost`
     added its capture listener first and answers first, so the dialog closed
     and took the half-written note with it. Measured, then fixed at the host —
     see `useEscapeGuard`. */
  useEscapeGuard(open);

  useEffect(() => {
    if (!open) return;
    function away(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) onOpen(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpen(false);
    }
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open, onOpen]);

  return (
    <span className="mkpf__em" ref={box}>
      <button
        type="button"
        className="mkpf__b mkpf__b--em"
        aria-label="Add an emoji"
        title="Add an emoji"
        aria-expanded={open}
        aria-haspopup="true"
        onMouseDown={e => e.preventDefault()}
        onClick={() => onOpen(!open)}
      >
        <SmileIcon />
      </button>
      {open && (
        <span className="mkpf__grid" role="group" aria-label="Emoji">
          {GLYPHS.map(glyph => (
            <button
              key={glyph}
              type="button"
              className="mkpf__g"
              aria-label={glyph}
              onMouseDown={e => e.preventDefault()}
              onClick={() => onPick(glyph)}
            >
              {glyph}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

function SmileIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
      <path d="M9 9.5h.01M15 9.5h.01" />
    </svg>
  );
}
