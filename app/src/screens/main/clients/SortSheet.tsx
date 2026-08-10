/**
 * 2e · Sort.
 *
 * A sheet rather than another chip row, for one reason: sort is single-choice
 * and chips imply multi-select. The five orders are five questions a trainer
 * actually asks — who needs chasing, where is Ananya, who have I not seen, who
 * is running out, who owes me — and picking one applies it and closes.
 */

import React from 'react';
import { List, Radio, Row, Sheet } from '../../../design';
import { SORTS, type SortKey } from '../../../clients/roster';

export default function SortSheet({
  visible,
  value,
  onPick,
  onClose,
}: {
  visible: boolean;
  value: SortKey;
  onPick: (key: SortKey) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Sort by">
      <List>
        {SORTS.map((sort) => (
          <Row
            key={sort.key}
            grouped
            minHeight={54}
            title={sort.label}
            subtitle={sort.hint}
            selected={sort.key === value}
            leading={<Radio checked={sort.key === value} />}
            onPress={() => {
              onPick(sort.key);
              onClose();
            }}
          />
        ))}
      </List>
    </Sheet>
  );
}
