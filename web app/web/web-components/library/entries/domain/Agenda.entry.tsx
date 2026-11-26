import { Blk, Bench, Cell } from '../../chrome/Blk';
import { SpecTable } from '../../chrome/Docs';
import { Agenda, AgendaRow } from '../../../ui/Agenda';
import { Avatar } from '../../../ui/Avatar';
import { Tag } from '../../../ui/Tag';
import { Button } from '../../../ui/Button';

/**
 * THE REST OF THE DAY, AS ONE RULED LIST.
 *
 * Written out of the 15 Sep 2026 `/today` pass, replacing `.slist` / `.srow`.
 */
export function AgendaEntry() {
  return (
    <>
      <Blk
        title="A row you can answer (26 Nov 2026)"
        lede={
          <>
            The Today revamp put <b>Done</b> and <b>No-show</b> on every session that has started and
            is not marked. The row is a <code>div</code> now and the NAME is the link, stretched over
            the row, so <code>actions</code> can hold buttons (an anchor may not). Leave out{' '}
            <code>time</code> and pass <code>meta</code> for a past session identified by its person
            — <i>Unmarked from last week</i>. On `/today` the rows are 70px with 36px avatars
            (§R in app.css, scoped); this bench shows the base.
          </>
        }
      >
        <Bench style={{ alignItems: 'stretch' }}>
          <Cell label="time gutter · answers on the row" stretch>
            <Agenda label="Specimen">
              <AgendaRow
                href="#"
                time="6:00"
                meridiem="AM"
                avatar={<Avatar name="Kavya Subramanian" id="ks" />}
                name="Kavya Subramanian"
                detail="Upper body · Week 6/12"
                trailing={<Tag tone="remote">Online</Tag>}
                actions={
                  <span className="mka">
                    <Button size="sm">Done</Button>
                    <Button size="sm">No-show</Button>
                  </span>
                }
              />
              <AgendaRow href="#" time="7:15" meridiem="AM" avatar={<Avatar name="Suresh Babu" id="sb" />} name="Suresh Babu" detail="Upper body · Week 9/12" state="done" />
            </Agenda>
          </Cell>
        </Bench>
        <Bench style={{ alignItems: 'stretch' }}>
          <Cell label="no time · the date as meta" stretch>
            <Agenda label="Specimen">
              <AgendaRow
                href="#"
                avatar={<Avatar name="Meera Iyer" id="mi" />}
                name="Meera Iyer"
                meta={<span className="tnum">Mon 23 Nov, 6:00 AM</span>}
                actions={
                  <span className="mka">
                    <Button size="sm">Done</Button>
                    <Button size="sm">No-show</Button>
                  </span>
                }
              />
            </Agenda>
          </Cell>
        </Bench>
      </Blk>
      <Blk
        title="What it replaced"
        lede={
          <>
            <code>.slist</code> drew each session as its own bordered card with a 7px gap, which
            cost <b>68px a row</b>. Nine sessions was 612px against a 586px content window, so the
            second block on `/today` did not fit in the viewport by itself, and the page showed nine
            boxes to say one thing. One list with a hairline between rows at <b>48px</b> each is
            432px for the same nine.
          </>
        }
      >
        <Bench style={{ alignItems: 'stretch' }}>
          <Cell label="four rows, three states" stretch>
            <Agenda>
              <AgendaRow
                href="#" time="6:00" meridiem="AM"
                avatar={<Avatar name="Rahul Sundaram" size="sm" />}
                name="Rahul Sundaram" detail="Upper A · Week 3/8" state="done"
              />
              <AgendaRow
                href="#" time="9:00" meridiem="AM"
                avatar={<Avatar name="Meera Reddy" size="sm" />}
                name="Meera Reddy" detail="Day 1 · Week 5/6" state="now"
                trailing={<Tag tone="floor">In Person</Tag>}
              />
              <AgendaRow
                href="#" time="10:00" meridiem="AM"
                avatar={<Avatar name="Manoj Krishnan" size="sm" />}
                name="Manoj Krishnan" detail="Rebuild A · Week 4/4"
                trailing={<Tag tone="remote">Online</Tag>}
              />
              <AgendaRow
                href="#" time="7:00" meridiem="PM"
                avatar={<Avatar name="Rohan Sharma" size="sm" />}
                name="Rohan Sharma" detail="Upper A · Week 7/8"
                trailing={<Tag tone="floor">In Person</Tag>}
              />
            </Agenda>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="The time gutter, and the number behind its width"
        lede={
          <>
            Mono and tabular in a fixed track, so every colon lands on the same x and the column can
            be read down as a column. 62px is arithmetic, not taste: the widest time this list draws
            is <code>10:00 AM</code>, which is 5 characters of 13.5px JetBrains Mono at ~8.1px
            (40.5px), a 4px gap and a 15px meridiem = <b>59.5px</b>. It was 58 and the meridiem
            overflowed its own track by 9px. Below 620px the two stack and the track drops to 46.
          </>
        }
      />

      <Blk
        title="A delivered session steps back, it does not leave"
        lede={
          <>
            <code>done</code> drops the name to <code>--tx-ink-3</code> and the weight to 500, and
            puts the tick in the state slot. It stays legible because it is still part of the
            day&rsquo;s tally: <i>7 of 9 done</i> is the figure at the foot of the page, and a
            trainer checking it wants to see WHICH seven.
          </>
        }
      />

      <SpecTable
        rows={[
          { property: 'Row height', value: '48px', token: '--tx-row2', note: 'Was 68 as separate cards' },
          { property: 'Time gutter', value: '62px, mono, tabular', token: '--tx-when', note: '46px and stacked below 620px' },
          { property: 'Meridiem', value: '11px, beside the hour', token: '--tx-micro', note: 'One value on one line above 620px' },
          { property: 'Delivered', value: 'ink-3, weight 500, tick', token: '--tx-ink-3', note: 'Never hidden' },
          { property: 'Running', value: '2px inset spine', token: '--tx-accent', note: 'The one row that is not merely scheduled' },
          { property: 'Avatar slot', value: '26px, always held', token: undefined, note: 'A row without one must not shift its name 26px left of every other row' },
        ]}
      />
    </>
  );
}
