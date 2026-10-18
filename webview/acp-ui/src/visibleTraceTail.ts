import { maxVisibleTraceItems } from "../../../src/protocol/visibleTrace";
import type { TraceItem } from "./chatReducer";

export { maxVisibleTraceItems };

export type VisibleTraceRow = {
  start: number;
  end: number;
  height: number;
};

export function visibleTraceTail(
  items: readonly TraceItem[],
  rows: readonly VisibleTraceRow[],
  viewportHeight: number,
): TraceItem[] {
  if (items.length === 0) {
    return [];
  }
  if (rows.length === 0 || viewportHeight <= 0) {
    return items.slice(-maxVisibleTraceItems);
  }
  let covered = 0;
  let first = rows.length - 1;
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row === undefined || !Number.isFinite(row.height) || row.height < 0) {
      continue;
    }
    covered += row.height;
    first = i;
    if (covered >= viewportHeight) {
      break;
    }
  }
  const startRow = rows[first];
  const endRow = rows[rows.length - 1];
  if (startRow === undefined || endRow === undefined) {
    return items.slice(-maxVisibleTraceItems);
  }
  const from = Number.isInteger(startRow.start) ? Math.max(0, startRow.start) : 0;
  const to = Number.isInteger(endRow.end)
    ? Math.min(items.length - 1, endRow.end)
    : items.length - 1;
  if (to < from) {
    return items.slice(-maxVisibleTraceItems);
  }
  const slice = items.slice(from, to + 1);
  if (slice.length > maxVisibleTraceItems) {
    return slice.slice(-maxVisibleTraceItems);
  }
  return slice;
}
