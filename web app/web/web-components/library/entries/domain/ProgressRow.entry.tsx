import { Card, CardBody, CardHead } from "../../../ui/Card";
import { ProgressRow, ProgressRows } from "../../../ui/ProgressRow";
import { Table, Row } from "../../../ui/Table";
import { Blk, Bench, Cell } from "../../chrome/Blk";
import { Cmp } from "../../chrome/Cmp";
import { DoDont, SpecTable } from "../../chrome/Docs";
import { byId } from "../../../registry";

/* Real shapes from the dev database — `cli_018` over twelve weeks, which is the
   report the component was built against. A hand-written specimen here would
   encode the same assumptions as the code it is documenting; these are the rows
   that produced the measurements in the notes below. */
const WEIGHT = [73.6, 74.2, 73.9, 74.4, 73.4];
const WAIST = [92.9, 92.4, 92.6, 93.0];
const STEP_UP = [77.5, 77.5, 80, 80, 82.5, 82.5, 85, 85, 85];
const PALLOF = [25, 25, 25, 25, 27.5, 27.5, 27.5, 27.5, 27.5];

export function ProgressRowEntry() {
  const entry = byId("c-progrow")!;

  return (
    <Cmp
      entry={entry}
      status="beta"
      meta={[
        { k: "Component", v: <code>ui/ProgressRow.tsx</code> },
        { k: "Class", v: <code>.pgr</code> },
        { k: "Parts", v: "5 — __id · __n · __m · __s · __f" },
        {
          k: "Made of",
          v: (
            <>
              <code>c-change</code> + <code>c-trendchart</code>
            </>
          ),
        },
        { k: "Tones", v: "none, except the delta" },
        { k: "Used in", v: "the client progress report" },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            A name, a footnote, the series drawn at 46px, and{" "}
            <code>c-change</code> on the end. It is a <b>composite</b> rather
            than a new primitive — nothing here draws a figure or a line of its
            own, which is what stops the report&rsquo;s spelling of a change
            drifting from the portal&rsquo;s. The list is{" "}
            <code>ProgressRows</code> and the rows go inside it; that is not
            tidiness, and the reason is two blocks down.
          </>
        }
      >
        <Bench pad={false} style={{ padding: "18px 20px" }}>
          <Cell
            label="MEASUREMENTS · NO DELTA, BECAUSE A TAPE HAS NO GOOD DIRECTION"
            stretch
          >
            <div style={{ width: 820 }}>
              {/* One cell per bench, and it is not a preference. `.bench__row` is
                a wrapping flex row, so two cells in it are ~350px each — under
                `.pgr`'s own 461px container query — and the bench built to show
                the three-track row rendered the two-track one with `Step-Up`
                clipped to `St…`. A specimen that documents the wrong layout is
                worse than one specimen. The stacked form has its own block. */}
              <Card>
                <CardHead title="Measurements" />
                <CardBody>
                  <ProgressRows>
                    <ProgressRow
                      name="Weight"
                      meta="5 readings · 23 Jul to 21 Sep"
                      series={WEIGHT}
                      from={73.6}
                      to={73.4}
                      unit="kg"
                    />
                    <ProgressRow
                      name="Waist"
                      meta="4 readings · 22 Aug to 21 Sep"
                      series={WAIST}
                      from={92.9}
                      to={93}
                      unit="cm"
                    />
                  </ProgressRows>
                </CardBody>
              </Card>
            </div>
          </Cell>
        </Bench>
        <Bench pad={false} style={{ padding: "18px 20px" }}>
          <Cell label="LIFTS · WITH THE ONE SANCTIONED ACCENT" stretch>
            <div style={{ width: 820 }}>
              <Card>
                <CardHead title="Getting stronger" />
                <CardBody>
                  <ProgressRows>
                    <ProgressRow
                      name="Step-Up"
                      meta="9 days · 27 sets"
                      series={STEP_UP}
                      from={77.5}
                      to={85}
                      unit="kg"
                      delta="+10%"
                    />
                    <ProgressRow
                      name="Pallof Press"
                      meta="9 days · 27 sets"
                      series={PALLOF}
                      from={25}
                      to={27.5}
                      unit="kg"
                      delta="+10%"
                    />
                  </ProgressRows>
                </CardBody>
              </Card>
            </div>
          </Cell>
        </Bench>
        <p className="blk__p">
          The two lists are the same component and the difference between them
          is one prop. <code>delta</code> carries the only accent the row may
          draw, and a measurement passes none — see the last block.
        </p>
      </Blk>

      <Blk
        title="The pair is the claim; the series is the evidence for it"
        lede={
          <>
            This is the whole reason the component exists, and it is a defect
            about CONTENT rather than about layout.{" "}
            <code>73.6 &rarr; 73.4</code> is <b>two readings out of the five</b>{" "}
            that row admits to, and the three in the middle are the story: a
            client who held steady and a client who put on a kilo and took it
            back off print the identical row and are not the same client. The
            second is a conversation the trainer wants to be having, and the
            endpoints delete it.
            <br />
            <br />
            Which is also why the lift rows keep their pair unchanged. The pair
            is deliberately first-day-against-best-day, so a block closing on a
            deload does not read as a loss — an honest simplification, and the
            line beside it is the part it simplifies away.
          </>
        }
      >
        <DoDont
          yes={{
            figure: (
              <div style={{ width: "100%" }}>
                <ProgressRows>
                  <ProgressRow
                    name="Weight"
                    meta="5 readings · 23 Jul to 21 Sep"
                    series={WEIGHT}
                    from={73.6}
                    to={73.4}
                    unit="kg"
                  />
                </ProgressRows>
              </div>
            ),
            caption: (
              <>
                Down <b>0.2 kg</b>, and visibly up 0.8 and back again on the
                way. Both facts are on the row, and the footnote says how many
                readings are behind them.
              </>
            ),
          }}
          no={{
            figure: (
              <div style={{ width: "100%" }}>
                <Table caption="The four-column table this replaced">
                  <Row
                    cells={[
                      { key: "w", content: "Weight", className: "strong" },
                      {
                        key: "r",
                        content: "73.6 → 73.4 kg",
                        style: { color: "var(--tx-ink-3)" },
                      },
                      { key: "d", content: "−0.2", numeric: true },
                      {
                        key: "n",
                        content: "5 readings",
                        style: { color: "var(--tx-ink-3)" },
                      },
                    ]}
                  />
                </Table>
              </div>
            ),
            caption: (
              <>
                The report&rsquo;s own markup until this pass. It states that
                there are five readings and shows two of them &mdash; and
                MEASURED at a 1536px window it was{" "}
                <b>973px wide for four short cells</b>, with <code>Weight</code>{" "}
                sitting 300px from its own figure.
              </>
            ),
          }}
        />
      </Blk>

      <Blk
        title="The list owns the tracks, and that is what subgrid is for"
        lede={
          <>
            Each row was its own grid, which sized the <code>auto</code> change
            track <b>per row</b>. MEASURED at 390px across the report&rsquo;s
            twelve rows, <code>.pgr__f</code> came out anywhere from{" "}
            <b>138px</b> to <b>184px</b> — so the elastic name track was 46px
            narrower on the widest rows, the footnote wrapped to two lines on
            three of six measurements and stayed on one for the rest, and the
            rows came out <b>140px against 122</b> with the same content in
            them. Three rows taller than their neighbours for no visible reason
            is a list that looks broken, and the figures did not line up down
            the column either &mdash; which is most of what a column of figures
            is for.
            <br />
            <br />
            <code>ProgressRows</code> is a <code>grid</code> and each{" "}
            <code>.pgr</code> takes <code>grid-template-columns: subgrid</code>,
            so the <code>auto</code> column is sized once against the widest
            change in the set. Nothing needs a magic width: a{" "}
            <code>min-width</code> big enough for{" "}
            <code>1,200 kg &rarr; 1,350 kg</code> would be dead space on every
            row of a client who trains in single digits.
          </>
        }
      >
        <Bench pad={false} style={{ padding: "18px 20px" }}>
          <Cell label="SIX ROWS, SIX CHANGE WIDTHS, ONE SHARED TRACK" stretch>
            <div style={{ width: 820 }}>
              <Card>
                <CardBody>
                  <ProgressRows>
                    <ProgressRow
                      name="Body fat"
                      meta="5 readings"
                      series={[25.8, 26.1, 25.9, 25.7, 25.6]}
                      from={25.8}
                      to={25.6}
                      unit="%"
                    />
                    <ProgressRow
                      name="Weight"
                      meta="5 readings"
                      series={WEIGHT}
                      from={73.6}
                      to={73.4}
                      unit="kg"
                    />
                    <ProgressRow
                      name="Hip"
                      meta="4 readings"
                      series={[100.2, 100.5, 100.4, 100.7]}
                      from={100.2}
                      to={100.7}
                      unit="cm"
                    />
                    <ProgressRow
                      name="Lat Pulldown"
                      meta="9 days · 27 sets"
                      series={[57.5, 57.5, 60, 60, 62.5]}
                      from={57.5}
                      to={62.5}
                      unit="kg"
                      delta="+9%"
                    />
                  </ProgressRows>
                </CardBody>
              </Card>
            </div>
          </Cell>
        </Bench>
        <p className="blk__p">
          Every figure&rsquo;s right edge is on one line and every row is the
          same height, whatever the change in it is. It is behind an{" "}
          <code>@supports</code> — the fallback is the per-row grid this
          replaced, which is ragged and entirely readable, and worth guarding
          rather than assuming because it is the only subgrid in the stylesheet.
        </p>
      </Blk>

      <Blk
        title="Under 461px it stacks, and the chart keeps its own width"
        lede={
          <>
            A <code>@container</code> query and not a viewport one, for the
            reason the rail makes unavoidable: this list lives in a
            sidecar&rsquo;s main column, so the same 1180px viewport hands it
            either 492px or 912px depending on whether a control 248px to the
            left is open. No viewport number can be right for both.
            <br />
            <br />
            461 is the arithmetic, not a round figure: the widest change on the
            report is <code>100.2 cm &rarr; 100.7 cm</code> at 158px, the name
            wants 120px to be worth having, the spark&rsquo;s track is 148px,
            and 158 + 148 + 120 with two 18px gaps is 462. Below it the pair and
            the name share the top line and the chart takes the row under them
            &mdash; which keeps{" "}
            <b>every chart the same width as every other one</b>, the one thing
            a column of charts is for.
          </>
        }
      >
        <Bench pad={false} style={{ padding: "18px 20px" }}>
          <Cell label="390px · THE PHONE, AND THE REPORT'S OWN ROWS">
            <div style={{ width: 358 }}>
              <Card>
                <CardBody>
                  <ProgressRows>
                    <ProgressRow
                      name="Weight"
                      meta="5 readings · 23 Jul to 21 Sep"
                      series={WEIGHT}
                      from={73.6}
                      to={73.4}
                      unit="kg"
                    />
                    <ProgressRow
                      name="Lat Pulldown"
                      meta="9 days · 27 sets"
                      series={[57.5, 57.5, 60, 60, 62.5]}
                      from={57.5}
                      to={62.5}
                      unit="kg"
                      delta="+9%"
                    />
                  </ProgressRows>
                </CardBody>
              </Card>
            </div>
          </Cell>
        </Bench>
        <p className="blk__p">
          Stacked, the name gets the row&rsquo;s width less the change beside
          it: MEASURED here, a 324px list gives the change <b>146px</b> and the
          name <b>128px</b>, where three tracks at this width would leave the
          name 30px of the 324 after a 148px spark. That is what the swap buys,
          and it is a bigger name rather than an unlimited one:{" "}
          <code>Machine Chest Press</code> is 154px and still ellipses here,
          which is the right outcome. The ellipsis is on the NAME and never on
          the figure — a truncated movement is a row you can still ask about,
          and a truncated number is a row that lies.
        </p>
      </Blk>

      <Blk
        title="Under three readings it says so rather than drawing a line"
        lede={
          <>
            Two points is a line segment. It draws a slope with no shape in it
            and invites a client to read a trend off two tape measurements,
            which is the one thing the series was added to prevent — so the slot
            prints <code>too few readings</code> through <code>TrendChart</code>
            &rsquo;s own <code>hidden</code> prop instead.
            <br />
            <br />
            It is the slot at the slot&rsquo;s height, not nothing: drawing
            nothing would let the rows either side close up and the column stop
            being a column. <code>.trend--off</code>&rsquo;s own{" "}
            <code>min-height:120px</code> and dashed border are released rather
            than restated smaller — MEASURED, they made a two-reading row{" "}
            <b>147px against its neighbours&rsquo; 72</b>, so the row with the
            least behind it was twice the height of the row with the most. And
            at 46px in a column of drawn lines a dashed rectangle is the loudest
            thing on the card, saying <i>there is nothing here</i>.
          </>
        }
      >
        <Bench pad={false} style={{ padding: "18px 20px" }}>
          <Cell label="ONE READING · NO BASELINE, SO NO CHANGE EITHER" stretch>
            <div style={{ width: 820 }}>
              <Card>
                <CardBody>
                  <ProgressRows>
                    <ProgressRow
                      name="Chest, first reading"
                      meta="1 reading · 21 Sep"
                      series={[100.5]}
                      from={null}
                      to={100.5}
                      unit="cm"
                    />
                    <ProgressRow
                      name="Arm"
                      meta="2 readings · 22 Aug to 21 Sep"
                      series={[34.1, 34.6]}
                      from={34.1}
                      to={34.6}
                      unit="cm"
                    />
                    <ProgressRow
                      name="Waist"
                      meta="4 readings · 22 Aug to 21 Sep"
                      series={WAIST}
                      from={92.9}
                      to={93}
                      unit="cm"
                    />
                  </ProgressRows>
                </CardBody>
              </Card>
            </div>
          </Cell>
        </Bench>
        <p className="blk__p">
          The first row passes <code>from={"{null}"}</code>, which is{" "}
          <code>c-change</code>&rsquo;s prop for exactly this and draws the
          figure alone with no arrow. A first reading is not a change, and{" "}
          <code>100.5 &rarr; 100.5</code> would be a claim about a movement
          nobody measured.
        </p>
      </Blk>

      <Blk
        title="No tone on the pair, and the line is not an exception"
        lede={
          <>
            Inherited from <code>c-change</code> and worth restating, because a
            CHART is where somebody reaches for green and red first. A waist
            going up on a client adding muscle is the plan working and the same
            number on a client cutting is not, and this product holds no field
            that tells them apart — <code>client.goal</code> is the
            trainer&rsquo;s free text.
            <br />
            <br />
            So <code>.trend__l</code> is <code>--tx-accent-text</code> for every
            series whichever way it points. That is not a loophole in the rule:
            the accent there is saying <i>this is the series</i>, and{" "}
            <b>a shape is not a verdict</b>. The one sanctioned accent that{" "}
            <i>is</i> a verdict is <code>delta</code>, which a caller sets for a
            strength gain alone — unambiguous in one direction.
          </>
        }
      >
        <Bench pad={false} style={{ padding: "18px 20px" }}>
          <Cell label="TWO SERIES, OPPOSITE DIRECTIONS, IDENTICAL INK" stretch>
            <div style={{ width: 820 }}>
              <Card>
                <CardBody>
                  <ProgressRows>
                    <ProgressRow
                      name="Waist, on a cut"
                      meta="5 readings"
                      series={[95.2, 94.4, 93.8, 93.1, 92.4]}
                      from={95.2}
                      to={92.4}
                      unit="cm"
                    />
                    <ProgressRow
                      name="Chest, on a bulk"
                      meta="5 readings"
                      series={[98.5, 99.4, 100.2, 101.6, 102.3]}
                      from={98.5}
                      to={102.3}
                      unit="cm"
                    />
                  </ProgressRows>
                </CardBody>
              </Card>
            </div>
          </Cell>
        </Bench>
        <SpecTable
          rows={[
            {
              property: "name",
              token: "ReactNode",
              value: "required",
              note: "Ellipses on one line — the row never grows to fit a movement name.",
            },
            {
              property: "series",
              token: "number[]",
              value: "required",
              note: "Oldest first. Under three points the chart is not drawn.",
            },
            {
              property: "from",
              token: "number | null",
              value: "required",
              note: "Null draws the figure alone — a first reading is not a change.",
            },
            {
              property: "to",
              token: "number",
              value: "required",
              note: "Passed straight to `c-change`. Nothing here compares them.",
            },
            {
              property: "unit",
              token: "string",
              value: "required",
              note: "Rendered against both figures — one spelling, always.",
            },
            {
              property: "meta",
              token: "ReactNode",
              value: "—",
              note: "How the figure was arrived at. A footnote under the name, never a cell.",
            },
            {
              property: "delta",
              token: "string",
              value: "—",
              note: "The one accent. Strength gains only — see above.",
            },
            {
              property: "label",
              token: "string",
              value: "name",
              note: "The chart’s accessible name. Set it where `name` is not a plain string.",
            },
          ]}
        />
      </Blk>
    </Cmp>
  );
}
