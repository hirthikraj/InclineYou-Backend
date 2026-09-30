'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { deleteTemplate } from '@/lib/assessments/actions';
import type { TemplatesData } from '@/lib/assessments/api';
import { assessmentsTabs } from '@/lib/assessments/address';
import { templateShape, type TemplateWire } from '@/lib/assessments/vocab';
import { PageTabs } from '@/components/shell/PageTabs';
import { TopBar } from '@/components/shell/TopBar';
import { Button } from '@/web-components/ui/Button';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { Message } from '@/web-components/ui/Message';
import { Modal, ModalHost } from '@/web-components/ui/Modal';
import { PageHeader } from '@/web-components/ui/PageHeader';
import { RowMenu } from '@/web-components/ui/RowMenu';
import { SearchField } from '@/web-components/ui/SearchField';
import { Table, Row, type Column } from '@/web-components/ui/Table';
import { Checklist, Plus } from './Icons';
import { TemplateEditor } from './TemplateEditor';

/**
 * `/clients/assessments/templates` — THE SHELF OF BLUEPRINTS.
 *
 * ── WHY IT IS A TAB AND NOT A PAGE OF THE SECTION ───────────────────────────
 *
 * `nav.tsx`'s rule is that a strip above a page is *views of this page* and a
 * pane row is a different place. `/programs`' *Templates* tab is the precedent
 * and the test is the same: both tabs answer one question — *what am I asking
 * this roster* — of two shelves, the sent ones and the blueprints. What differs
 * is whose row it is and therefore the verb. That is a view.
 *
 * ── THE SEARCH IS LOCAL HERE AND A ROUND TRIP ON THE OTHER TAB ──────────────
 *
 * Deliberately, and it is not an inconsistency: the list is paged over
 * thirty-three rows and this is every template a trainer has, which is two. A
 * `?q=` on a list of two is a server round trip to filter a list already in the
 * browser, and the URL would be carrying a filter over a set small enough to
 * read.
 */
export function Templates({ data }: { data: TemplatesData }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ row: TemplateWire | null } | null>(null);
  const [asking, setAsking] = useState<TemplateWire | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const q = search.trim().toLowerCase();
  const rows = q
    ? data.templates.filter((t) => t.name.toLowerCase().includes(q))
    : data.templates;

  function remove(row: TemplateWire) {
    setError(null);
    start(async () => {
      const result = await deleteTemplate(row.id);
      setAsking(null);
      if (!result.ok) {
        setError(result.message ?? 'That did not delete.');
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <TopBar crumb="Clients · Assessments" title="Templates" />

      <main className="main body--flush asm" id="main-content">
        <PageHeader
          className="ph--pglist"
          title="Assessment templates"
          sub={
            data.templates.length === 1
              ? '1 blueprint'
              : `${data.templates.length} blueprints`
          }
          actions={
            <Button variant="primary" onClick={() => setEditing({ row: null })}>
              <Plus size={15} />
              New assessment
            </Button>
          }
        >
          <div className="asm__tabs">
            <PageTabs
              label="Assessments view"
              current="templates"
              tabs={assessmentsTabs('templates', { list: data.assessmentTotal })}
            />
            <SearchField
              className="asm__q"
              label="Search assessment templates"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              count={q ? { shown: rows.length, total: data.templates.length, noun: 'templates' } : undefined}
            />
          </div>
        </PageHeader>

        <div className="asm__body">
          {error && <Message tone="err">{error}</Message>}

          {rows.length === 0 ? (
            q ? (
              <EmptyState
                kind="filtered"
                title="No assessment matches"
                body="Try a shorter search."
                action={<Button variant="secondary" onClick={() => setSearch('')}>Clear the search</Button>}
              />
            ) : (
              <EmptyState
                kind="first-run"
                icon={<Checklist size={28} />}
                title="No assessments written yet"
                body="An assessment is what you ask for: a list of measurements, and questions about the block that just finished. Write one and you can send it to anybody on the roster."
                action={
                  <Button variant="primary" onClick={() => setEditing({ row: null })}>
                    Write the first one
                  </Button>
                }
              />
            )
          ) : (
            <div className="asm__t" style={{ marginTop: 16 }}>
              <Table
                caption={`${rows.length} assessment templates`}
                columns={COLUMNS}
              >
                {rows.map((t) => (
                  <Row
                    key={t.id}
                    header={
                      <button
                        type="button"
                        className="asm-open asm-open--name"
                        onClick={() => setEditing({ row: t })}
                      >
                        {t.name}
                      </button>
                    }
                    cells={[
                      { key: 'shape', label: 'Asks for', content: <span className="small">{templateShape(t)}</span> },
                      { key: 'made', label: 'Created on', content: <span className="asm__d">{DATE.format(new Date(t.createdAt))}</span> },
                      {
                        key: 'edited',
                        label: 'Edited on',
                        /* A template edited on the day it was written says a
                           dash rather than the same date twice. The client
                           file's Sessions tab measured exactly this: *Edited
                           on* was a copy of its neighbour on fifteen of
                           eighteen rows, and 150px of table went to it. */
                        content: (
                          <span className="asm__d">
                            {t.updatedAt === t.createdAt ? '—' : DATE.format(new Date(t.updatedAt))}
                          </span>
                        ),
                      },
                      {
                        key: 'act',
                        className: 'asm-c-act',
                        label: '',
                        content: (
                          <RowMenu
                            label={t.name}
                            items={[
                              { key: 'edit', label: 'Edit it', onSelect: () => setEditing({ row: t }) },
                              { separator: true, key: 'sep' },
                              { key: 'rm', label: 'Delete it', danger: true, onSelect: () => setAsking(t) },
                            ]}
                          />
                        ),
                      },
                    ]}
                  />
                ))}
              </Table>
            </div>
          )}
        </div>
      </main>

      {editing && (
        <TemplateEditor
          template={editing.row}
          catalog={data.catalog}
          onClose={(saved) => {
            setEditing(null);
            if (saved) router.refresh();
          }}
        />
      )}

      {asking && (
        /* IT ASKS FIRST, and it says what survives.
           The roster's Archive sets the pattern — a row that leaves with
           nowhere to bring it back from asks first — and what makes this one
           safe to confirm is the sentence: check-ins already sent are NOT
           deleted with the blueprint. A cascade would delete a client's answers
           because a trainer tidied their shelf. */
        <ModalHost onClose={() => setAsking(null)} cover="frame">
          <Modal
            title={`Delete ${asking.name}?`}
            confirm={{ label: busy ? 'Deleting…' : 'Delete it', danger: true, onClick: () => remove(asking) }}
            cancel={{ label: 'Keep it', onClick: () => setAsking(null) }}
          >
            <p style={{ margin: 0 }}>
              Assessments you have already given keep their own copy of the form — their
              measurements and answers stay exactly as they are. What goes is the blueprint, so
              you cannot give it again.
              {asking.liveCycles > 0 &&
                ` It is on ${asking.liveCycles} ${asking.liveCycles === 1 ? 'client' : 'clients'}' cycle${asking.liveCycles === 1 ? '' : 's'}; deleting it ends ${asking.liveCycles === 1 ? 'that cycle' : 'those cycles'}, and nothing more is booked from ${asking.liveCycles === 1 ? 'it' : 'them'}.`}
            </p>
          </Modal>
        </ModalHost>
      )}
    </>
  );
}

const DATE = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const COLUMNS: Column[] = [
  { key: 'name', label: 'Name' },
  { key: 'shape', label: 'Asks for' },
  { key: 'made', label: 'Created on' },
  { key: 'edited', label: 'Edited on' },
  { key: 'act', bare: true, label: '', className: 'asm-c-act' },
];
