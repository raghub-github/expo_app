"use client";

import { memo, useMemo } from "react";
import { FixedSizeList, type ListChildComponentProps } from "react-window";
import { CxAppHomeStateLink } from "@/components/cxapp-home/CxAppHomeStateLink";
import type { GeoStateRow } from "@/lib/geo/list-active-states";

const ROW_H = 46;
const COLS = 3;
const VIRTUALIZE_AFTER = 24;

type Props = {
  states: GeoStateRow[];
};

type RowData = { rows: GeoStateRow[][] };

const GridRow = memo(function GridRow({
  index,
  style,
  data,
}: ListChildComponentProps<RowData>) {
  const row = data.rows[index] ?? [];
  return (
    <div style={style} className="grid grid-cols-1 gap-1.5 px-0 sm:grid-cols-2 lg:grid-cols-3">
      {row.map((state) => (
        <CxAppHomeStateLink key={state.id} stateId={state.id} name={state.name} />
      ))}
    </div>
  );
});

/** Virtualized state/UT grid — only mounts visible rows for large lists. */
export function CxAppHomeStatesVirtualGrid({ states }: Props) {
  const chunked = useMemo(() => {
    const rows: GeoStateRow[][] = [];
    for (let i = 0; i < states.length; i += COLS) {
      rows.push(states.slice(i, i + COLS));
    }
    return rows;
  }, [states]);

  const itemData = useMemo<RowData>(() => ({ rows: chunked }), [chunked]);
  const useVirtual = states.length >= VIRTUALIZE_AFTER;
  const height = Math.min(420, Math.max(ROW_H * 4, chunked.length * ROW_H));

  if (!useVirtual) {
    return (
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {states.map((state) => (
          <CxAppHomeStateLink key={state.id} stateId={state.id} name={state.name} />
        ))}
      </div>
    );
  }

  return (
    <FixedSizeList
      height={height}
      width="100%"
      itemCount={chunked.length}
      itemSize={ROW_H}
      itemData={itemData}
      overscanCount={4}
    >
      {GridRow}
    </FixedSizeList>
  );
}
