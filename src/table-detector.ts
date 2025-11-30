import type {
  Glyph,
  ParsedTable,
  TableCell,
  TableRow,
  Rect,
  TableExtractionOptions,
} from "./types";
import { inferRows, clusterPositions } from "./geometry";

/**
 * Assign a 1D value to the nearest center index.
 */
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

/**
 * Simple 1D k-means over a sorted set of positions.
 * Used to collapse many candidate column x-positions into K logical columns.
 */
function reclusterCenters1D(values: number[], k: number): number[] {
  if (values.length === 0) return [];
  if (values.length <= k) {
    return [...values].sort((a, b) => a - b);
  }

  const sorted = [...values].sort((a, b) => a - b);

  // Initialize means spaced across the sorted values
  let means = new Array(k).fill(0).map((_, i) => {
    const idx = Math.floor(((i + 0.5) * sorted.length) / k);
    return sorted[Math.min(idx, sorted.length - 1)];
  });

  for (let iter = 0; iter < 30; iter++) {
    const clusters: number[][] = Array.from({ length: k }, () => []);

    // Assign values to nearest mean
    for (const v of sorted) {
      let bestIndex = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let i = 0; i < k; i++) {
        const d = Math.abs(v - means[i]);
        if (d < bestDist) {
          bestDist = d;
          bestIndex = i;
        }
      }
      clusters[bestIndex].push(v);
    }

    // Recompute means
    const newMeans = means.slice();
    for (let i = 0; i < k; i++) {
      if (clusters[i].length > 0) {
        const sum = clusters[i].reduce((acc, v) => acc + v, 0);
        newMeans[i] = sum / clusters[i].length;
      }
    }

    const delta = newMeans.reduce(
      (max, m, i) => Math.max(max, Math.abs(m - means[i])),
      0
    );
    means = newMeans;
    if (delta < 0.1) break;
  }

  return means.sort((a, b) => a - b);
}

/**
 * Score a given column layout (centers) for this page region.
 * Lower score = better.
 */
function scoreColumnModel(
  glyphs: Glyph[],
  rowCenters: number[],
  columnCenters: number[]
): number {
  const numCols = columnCenters.length;
  if (numCols === 0) return Number.POSITIVE_INFINITY;
  if (glyphs.length === 0) return Number.POSITIVE_INFINITY;

  const totalGlyphs = glyphs.length;

  const colGlyphCounts = new Array<number>(numCols).fill(0);
  const colSquaredDistances = new Array<number>(numCols).fill(0);

  const rowUsedCols: Array<Set<number>> =
    rowCenters.length > 0
      ? Array.from({ length: rowCenters.length }, () => new Set<number>())
      : [];

  for (const glyph of glyphs) {
    const cx = glyph.bbox.x + glyph.bbox.width / 2;
    const cy = glyph.bbox.y + glyph.bbox.height / 2;

    const colIndex = findNearestIndex(cx, columnCenters);
    colGlyphCounts[colIndex]++;

    const dist = cx - columnCenters[colIndex];
    colSquaredDistances[colIndex] += dist * dist;

    if (rowCenters.length > 0) {
      const rowIndex = findNearestIndex(cy, rowCenters);
      rowUsedCols[rowIndex].add(colIndex);
    }
  }

  // 1) Compactness: average squared distance within columns
  const totalSquared = colSquaredDistances.reduce((sum, v) => sum + v, 0);
  const compactness = totalSquared / totalGlyphs; // units^2

  // 2) Empty columns: columns that have very few glyphs
  const minPerCol = Math.max(2, Math.floor(totalGlyphs * 0.01)); // at least 1% of glyphs or 2
  const emptyCols = colGlyphCounts.filter(c => c < minPerCol).length;

  // 3) Row consistency: variance of "used column count per row"
  let rowVariance = 0;
  if (rowUsedCols.length > 0) {
    const usedCounts = rowUsedCols.map(set => set.size);
    const meanUsed =
      usedCounts.reduce((sum, n) => sum + n, 0) /
      Math.max(usedCounts.length, 1);
    rowVariance =
      usedCounts.reduce((sum, n) => sum + (n - meanUsed) * (n - meanUsed), 0) /
      Math.max(usedCounts.length, 1);
  }

  // 4) Model complexity: more columns → slightly worse
  const complexity = numCols;

  // Weights (can be tuned later)
  const w1 = 1.0;   // compactness
  const w2 = 5.0;   // empty columns
  const w3 = 0.5;   // row variance
  const w4 = 0.1;   // complexity

  const cost = w1 * compactness + w2 * emptyCols + w3 * rowVariance + w4 * complexity;
  return cost;
}

/**
 * Automatically infer a reasonable column layout (centers) without knowing K.
 * We:
 *  - pre-cluster all x-centers into many bands (like before),
 *  - try K from min..max,
 *  - pick the K that gives the best score.
 */
function inferColumnsSmart(
  glyphs: Glyph[],
  rowCenters: number[],
  xTolerance: number,
  minCols: number,
  maxCols: number
): number[] {
  if (glyphs.length === 0) return [];

  const centersAll: number[] = glyphs.map(g => g.bbox.x + g.bbox.width / 2);

  // First collapse obvious duplicates / micro-jitter into pre-bands.
  const candidateCenters = clusterPositions(centersAll, xTolerance);
  if (candidateCenters.length === 0) return [];

  const maxK = Math.min(maxCols, candidateCenters.length);
  const minK = Math.min(minCols, maxK);

  if (maxK <= 0) return [];
  if (minK === maxK) {
    return reclusterCenters1D(candidateCenters, maxK);
  }

  let bestCenters: number[] = [];
  let bestScore = Number.POSITIVE_INFINITY;

  for (let k = minK; k <= maxK; k++) {
    const centersK = reclusterCenters1D(candidateCenters, k);
    const score = scoreColumnModel(glyphs, rowCenters, centersK);

    if (score < bestScore) {
      bestScore = score;
      bestCenters = centersK;
    }
  }

  return bestCenters;
}

/**
 * Main per-page extractor: given all glyphs on a page, infer a table grid and return rows/cells.
 * This still assumes "this region is a table", but internally chooses the column count K.
 */
export function extractTableFromGlyphs(
  pageIndex: number,
  glyphs: Glyph[],
  options: TableExtractionOptions = {}
): ParsedTable | null {
  if (glyphs.length === 0) return null;

  const xTolerance = options.xTolerance ?? 3;
  const yTolerance = options.yTolerance ?? 3;

  const minCols = options.minColumnCount ?? 2;
  const maxCols = options.maxColumnCount ?? 15;

  // 1) Infer rows first (vertical bands)
  const rowCenters = inferRows(glyphs, yTolerance);
  if (rowCenters.length === 0) {
    return null; // no grid-like structure
  }

  // 2) Infer columns using model selection over K
  const columnCenters = inferColumnsSmart(
    glyphs,
    rowCenters,
    xTolerance,
    minCols,
    maxCols
  );
  if (columnCenters.length === 0) {
    return null;
  }

  // 3) Allocate buckets [row][col] to collect glyphs
  const buckets: { glyphs: Glyph[] }[][] = [];
  for (let r = 0; r < rowCenters.length; r++) {
    const row: { glyphs: Glyph[] }[] = [];
    for (let c = 0; c < columnCenters.length; c++) {
      row.push({ glyphs: [] });
    }
    buckets.push(row);
  }

  // 4) Assign each glyph to a (row, col) cell
  for (const glyph of glyphs) {
    const cx = glyph.bbox.x + glyph.bbox.width / 2;
    const cy = glyph.bbox.y + glyph.bbox.height / 2;

    const colIndex = findNearestIndex(cx, columnCenters);
    const rowIndex = findNearestIndex(cy, rowCenters);

    if (
      rowIndex >= 0 &&
      rowIndex < buckets.length &&
      colIndex >= 0 &&
      colIndex < buckets[rowIndex].length
    ) {
      buckets[rowIndex][colIndex].glyphs.push(glyph);
    }
  }

  // 5) Decide which columns to keep as "logical" columns

  // First try: columns that are frequently used across rows
  const frequentCols = getFrequentlyUsedColumnIndices(buckets);

  let colIndicesToUse: number[];

  if (frequentCols && frequentCols.length > 0) {
    colIndicesToUse = frequentCols;
  } else {
    // Fallback: use template/header row heuristic (if you kept it)
    const logicalColIndices = getLogicalColumnIndices
      ? getLogicalColumnIndices(buckets)
      : null;

    colIndicesToUse =
      logicalColIndices && logicalColIndices.length > 0
        ? logicalColIndices
        : [...columnCenters.keys()];
  }
  // 6) Build TableRow/TableCell structures, preserving empty cells
  const rows: TableRow[] = [];
  for (let r = 0; r < rowCenters.length; r++) {
    const cells: TableCell[] = [];

    colIndicesToUse.forEach((colIdx, logicalIdx) => {
      const bucket = buckets[r][colIdx];

      if (bucket.glyphs.length === 0) {
        cells.push({
          rowIndex: r,
          columnIndex: logicalIdx,
          text: "",
          bbox: null,
        });
      } else {
        const text = bucket.glyphs
          .slice()
          .sort((a, b) => a.bbox.x - b.bbox.x)
          .map(g => g.text)
          .join("");

        const bbox = bboxFromGlyphs(bucket.glyphs);

        cells.push({
          rowIndex: r,
          columnIndex: logicalIdx,
          text,
          bbox,
        });
      }
    });

    rows.push({ rowIndex: r, cells });
  }

  // Drop leading empty rows so the first row becomes the header row.
  const trimmedRows = trimLeadingEmptyRows(rows);
  if (trimmedRows.length === 0) {
    return null;
  }

  // Keep only columns that have header values (or satisfy the first-column exception).
  const headerFilteredColumns = selectHeaderColumns(trimmedRows);
  if (headerFilteredColumns.length === 0) {
    return null;
  }

  const finalRows = remapRowsWithColumns(trimmedRows, headerFilteredColumns);

  const fullBbox = bboxFromGlyphs(glyphs);

  return {
    pageIndex,
    bbox: fullBbox,
    rows: finalRows,
  };
}

function getLogicalColumnIndices(
  buckets: { glyphs: Glyph[] }[][]
): number[] | null {
  if (buckets.length === 0) return null;

  // Count non-empty cells per row
  const nonEmptyCounts = buckets.map(
    row => row.filter(b => b.glyphs.length > 0).length
  );

  const maxNonEmpty = Math.max(...nonEmptyCounts);
  if (maxNonEmpty === 0) return null;

  const templateRowIndex = nonEmptyCounts.indexOf(maxNonEmpty);
  const templateRow = buckets[templateRowIndex];

  const logicalCols: number[] = [];
  templateRow.forEach((bucket, idx) => {
    if (bucket.glyphs.length > 0) {
      logicalCols.push(idx);
    }
  });

  // If we didn't actually reduce anything, bail out
  if (logicalCols.length === 0 || logicalCols.length === templateRow.length) {
    return null;
  }

  return logicalCols;
}

function getFrequentlyUsedColumnIndices(
  buckets: { glyphs: Glyph[] }[][]
): number[] | null {
  if (buckets.length === 0) return null;
  const numCols = buckets[0].length;
  if (numCols === 0) return null;

  const colUsage = new Array<number>(numCols).fill(0);

  // Count in how many rows each column has any glyphs
  for (const row of buckets) {
    row.forEach((bucket, colIdx) => {
      if (bucket.glyphs.length > 0) {
        colUsage[colIdx]++;
      }
    });
  }

  const maxUsage = Math.max(...colUsage);
  if (maxUsage === 0) return null;

  // Keep columns that are used "often enough".
  // Threshold: at least 50% of the usage of the most-used column.
  const threshold = maxUsage * 0.5;

  const kept: number[] = [];
  colUsage.forEach((count, idx) => {
    if (count >= threshold) {
      kept.push(idx);
    }
  });

  // If this didn't reduce anything, return null (no filtering)
  if (kept.length === 0 || kept.length === numCols) {
    return null;
  }

  return kept;
}

function trimLeadingEmptyRows(rows: TableRow[]): TableRow[] {
  const firstContentRow = rows.findIndex(row =>
    row.cells.some(cell => cell.text.trim() !== "")
  );

  if (firstContentRow === -1) {
    return [];
  }

  return rows.slice(firstContentRow).map((row, idx) => ({
    rowIndex: idx,
    cells: row.cells.map((cell, colIdx) => ({
      ...cell,
      rowIndex: idx,
      columnIndex: colIdx,
    })),
  }));
}

function selectHeaderColumns(rows: TableRow[]): number[] {
  if (rows.length === 0) return [];

  const headerRow = rows[0];
  const numCols = headerRow.cells.length;
  const kept: number[] = [];

  for (let col = 0; col < numCols; col++) {
    const columnCells = rows.map(r => r.cells[col]);
    const headerText = (columnCells[0]?.text ?? "").trim();
    const allEmpty = columnCells.every(cell => cell.text.trim() === "");

    if (allEmpty) continue;

    const keep =
      headerText !== "" ||
      (col === 0 &&
        headerText === "" &&
        columnCells.slice(1).length > 0 &&
        columnCells.slice(1).every(cell => cell.text.trim() !== ""));

    if (keep) {
      kept.push(col);
    }
  }

  return kept;
}

function remapRowsWithColumns(
  rows: TableRow[],
  columnIndices: number[]
): TableRow[] {
  return rows.map((row, rowIdx) => ({
    rowIndex: rowIdx,
    cells: columnIndices.map((colIdx, newColIdx) => {
      const cell = row.cells[colIdx];
      return {
        ...cell,
        rowIndex: rowIdx,
        columnIndex: newColIdx,
      };
    }),
  }));
}
