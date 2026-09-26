'use client';

import { useState } from 'react';

import { Facet } from '../../../ui/Facet';

/**
 * Live, because the point of the component is what a SET facet looks like
 * beside an unset one, and because the popup is the half that was extracted
 * from `RowMenu` rather than written again.
 *
 * Throwaway state. A specimen that wrote a real filter would change the screen
 * behind it from the library.
 */
const ROSTER = [
  { value: 'c1', label: 'Karthik Menon', find: '98840 11204' },
  { value: 'c2', label: 'Divya Krishnan', find: '99401 55210' },
  { value: 'c3', label: 'Aarav Iyer', find: '97890 33418' },
  { value: 'c4', label: 'Meera Reddy', find: '90032 77190' },
  { value: 'c5', label: 'Rohan Sharma', find: '98410 22876' },
  { value: 'c6', label: 'Sneha Nair', find: '89399 40012' },
  { value: 'c7', label: 'Vikram Rao', find: '99626 18830' },
  { value: 'c8', label: 'Priya Pillai', find: '94440 90761' },
  { value: 'c9', label: 'Arjun Subramanian', find: '90801 34528' },
  { value: 'c10', label: 'Lakshmi Varma', find: '95000 61147' },
  { value: 'c11', label: 'Nikhil Kumar', find: '97101 28840' },
  { value: 'c12', label: 'Ananya Balaji', find: '93810 55023' },
  { value: 'c13', label: 'Suresh Raghavan', find: '98407 71299' },
  { value: 'c14', label: 'Fatima Sheikh', find: '99521 30084' },
];

export function FacetSpecimen() {
  const [status, setStatus] = useState<string[]>(['done']);
  const [read, setRead] = useState<string[]>([]);
  const [client, setClient] = useState<string[]>([]);

  return (
    <div className="facets">
      <Facet
        label="Client"
        single
        /* The axis whose values are PEOPLE, and therefore the one with a find
           field. Fourteen names here so the list caps and scrolls the way a
           roster does; the real one is a hundred and forty. */
        width={288}
        search={{
          placeholder: 'Search by name or phone',
          empty: 'No client matches your search',
          noun: 'clients',
        }}
        selected={client}
        onChange={setClient}
        options={ROSTER}
      />
      <Facet
        label="Status"
        selected={status}
        onChange={setStatus}
        options={[
          { value: 'missed', label: 'Missed', count: 2 },
          { value: 'waiting', label: 'Waiting', count: 6 },
          { value: 'booked', label: 'Booked', count: 4 },
          { value: 'done', label: 'Done', count: 21 },
        ]}
      />
      <Facet
        label="Read status"
        single
        selected={read}
        onChange={setRead}
        options={[
          { value: 'unread', label: 'Unread', count: 4 },
          { value: 'read', label: 'Read', count: 17 },
        ]}
      />
    </div>
  );
}
