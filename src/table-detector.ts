import type {
  Glyph,
  ParsedTable,
  TableCell,
  TableRow,
  Rect,
  TableExtractionOptions,
} from "./types";
import { inferColumns, inferRows } from "./geometry";

interface CellBucket {
  glyphs: Glyph[];
}

function findNearestIndex(value: number, centers: number[]): number {
  let bestIndex = 0;
  let bestDist = Number.POSITIVE_INFINITY;

  for (let i = 0; i < centers.length; i++) {
    const d = Math.abs(value - centers[i]);
    if (d < bestDist) {
      bestDist = d;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function bboxFromGlyphs(glyphs: Glyph[]): Rect {
  const xMin = Math.min(...glyphs.map(g => g.bbox.x));
  const xMax = Math.max(...glyphs.map(g => g.bbox.x + g.bbox.width));
  const yMin = Math.min(...glyphs.map(g => g.bbox.y));
  const yMax = Math.max(...glyphs.map(g => g.bbox.y + g.bbox.height));
  return {
    x: xMin,
    y: yMin,
    width: xMax - xMin,
    height: yMax - yMin,
  };
}

export function extractTableFromGlyphs(
  pageIndex: number,
  glyphs: Glyph[],
  options: TableExtractionOptions = {}
): ParsedTable | null {
  if (glyphs.length === 0) return null;

  const xTolerance = options.xTolerance ?? 3;
  const yTolerance = options.yTolerance ?? 3;

  let columnCenters = inferColumns(glyphs, xTolerance);
  let rowCenters = inferRows(glyphs, yTolerance);

  if (options.expectedColumnCount && columnCenters.length !== options.expectedColumnCount) {
    // TODO: refine – for now we just log or ignore
    // In the future, you might re-cluster or merge/split bands.
  }

  const buckets: CellBucket[][] = [];
  for (let r = 0; r < rowCenters.length; r++) {
    const row: CellBucket[] = [];
    for (let c = 0; c < columnCenters.length; c++) {
      row.push({ glyphs: [] });
    }
    buckets.push(row);
  }

  for (const glyph of glyphs) {
    const cx = glyph.bbox.x + glyph.bbox.width / 2;
    const cy = glyph.bbox.y + glyph.bbox.height / 2;

    const colIndex = findNearestIndex(cx, columnCenters);
    const rowIndex = findNearestIndex(cy, rowCenters);

    buckets[rowIndex][colIndex].glyphs.push(glyph);
  }

  const rows: TableRow[] = [];
  for (let r = 0; r < rowCenters.length; r++) {
    const cells: TableCell[] = [];
    for (let c = 0; c < columnCenters.length; c++) {
      const bucket = buckets[r][c];
      if (bucket.glyphs.length === 0) {
        cells.push({
          rowIndex: r,
          columnIndex: c,
          text: "",
          bbox: null,
        });
      } else {
        const text = bucket.glyphs
          .slice()
          .sort((a, b) => a.bbox.x - b.bbox.x) // left-to-right within cell
          .map(g => g.text)
          .join(""); // or join with spaces if needed

        const bbox = bboxFromGlyphs(bucket.glyphs);

        cells.push({
          rowIndex: r,
          columnIndex: c,
          text,
          bbox,
        });
      }
    }
    rows.push({ rowIndex: r, cells });
  }

  const fullBbox = bboxFromGlyphs(glyphs);

  return {
    pageIndex,
    bbox: fullBbox,
    rows,
  };
}
