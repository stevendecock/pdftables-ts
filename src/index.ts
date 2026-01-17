import { loadGlyphsFromPdf } from "./pdf-loader.js";
import { extractTableFromGlyphs } from "./table-detector.js";
import type {
  ParsedTable,
  TableExtractionOptions,
  PdfTableExtractorApi,
  TableObjects,
  TableCellValue,
} from "./types.js";

export * from "./types.js";

export class PdfTableExtractor implements PdfTableExtractorApi {
  async extractTables(
    buffer: ArrayBuffer,
    options: TableExtractionOptions = {}
  ): Promise<ParsedTable[]> {
    const pages = await loadGlyphsFromPdf(buffer);
    const pageTables: ParsedTable[] = [];

    for (const page of pages) {
      const table = extractTableFromGlyphs(page.pageIndex, page.glyphs, options);
      if (table) pageTables.push(table);
    }

    return mergeSequentialTables(pageTables);
  }

  async extractTablesAsObjects(
    buffer: ArrayBuffer,
    options: TableExtractionOptions = {}
  ): Promise<TableObjects[]> {
    const tables = await this.extractTables(buffer, options);
    return tables.map(table => tableToObjects(table, options));
  }
}

function mergeSequentialTables(tables: ParsedTable[]): ParsedTable[] {
  if (tables.length === 0) return [];

  const merged: ParsedTable[] = [];

  for (const table of tables) {
    const normalized = normalizeTableRows(table);
    const last = merged[merged.length - 1];

    if (last && canMergeTables(last, normalized)) {
      const rowsToAppend = shouldDropRepeatedHeader(last, normalized)
        ? normalized.rows.slice(1)
        : normalized.rows;

      const offset = last.rows.length;
      const remappedRows = rowsToAppend.map((row, idx) => ({
        rowIndex: offset + idx,
        cells: row.cells.map((cell, colIdx) => ({
          ...cell,
          rowIndex: offset + idx,
          columnIndex: colIdx,
        })),
      }));

      last.rows.push(...remappedRows);
      // Keep the bbox and pageIndex of the starting page.
    } else {
      merged.push(normalized);
    }
  }

  return merged;
}

function normalizeTableRows(table: ParsedTable): ParsedTable {
  return {
    ...table,
    rows: table.rows.map((row, rowIdx) => ({
      rowIndex: rowIdx,
      cells: row.cells.map((cell, colIdx) => ({
        ...cell,
        rowIndex: rowIdx,
        columnIndex: colIdx,
      })),
    })),
  };
}

function canMergeTables(prev: ParsedTable, next: ParsedTable): boolean {
  const prevCols = prev.rows[0]?.cells.length ?? 0;
  const nextCols = next.rows[0]?.cells.length ?? 0;
  if (prevCols === 0 || nextCols === 0) return false;
  return prevCols === nextCols;
}

function shouldDropRepeatedHeader(prev: ParsedTable, next: ParsedTable): boolean {
  const prevHeader = getHeaderTexts(prev);
  const nextHeader = getHeaderTexts(next);

  const prevHasHeader = prevHeader.some(Boolean);
  const nextHasHeader = nextHeader.some(Boolean);

  return prevHasHeader && nextHasHeader && headersEqual(prevHeader, nextHeader);
}

function getHeaderTexts(table: ParsedTable): string[] {
  const headerRow = table.rows[0];
  if (!headerRow) return [];
  return headerRow.cells.map(cell => cell.text.trim());
}

function headersEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function tableToObjects(
  table: ParsedTable,
  options: TableExtractionOptions
): TableObjects {
  if (table.rows.length === 0) {
    return { pageIndex: table.pageIndex, headers: [], rows: [] };
  }

  const decimalSeparator = options.decimalSeparator ?? ".";

  const headerRowCount = countHeaderRows(table.rows, decimalSeparator);
  const headerRows = table.rows.slice(0, headerRowCount);
  const bodyRows = table.rows.slice(headerRowCount);

  const mergedHeaders = mergeHeaderRows(headerRows);
  const headerKeys = buildHeaderKeys(mergedHeaders);
  const columnValues = headerKeys.map((_, colIdx) =>
    bodyRows.map(row => row.cells[colIdx]?.text.trim() ?? "")
  );

  const numericColumns = columnValues.map(values =>
    isNumericColumn(values, decimalSeparator)
  );

  const rows = bodyRows.map(row => mapRowToObject(row, headerKeys, numericColumns, decimalSeparator));

  return {
    pageIndex: table.pageIndex,
    headers: headerKeys,
    rows,
  };
}

function countHeaderRows(rows: { cells: { text: string }[] }[], decimalSeparator: string): number {
  if (rows.length === 0) return 0;

  let headerCount = 0;
  for (const row of rows) {
    if (isLikelyDataRow(row, decimalSeparator)) break;
    headerCount++;
  }

  return Math.max(1, Math.min(headerCount, rows.length));
}

function mergeHeaderRows(rows: { cells: { text: string }[] }[]): string[] {
  if (rows.length === 0) return [];
  const colCount = rows[0].cells.length;

  const merged: string[] = [];
  for (let col = 0; col < colCount; col++) {
    const parts = rows
      .map(r => r.cells[col]?.text.trim() ?? "")
      .filter(text => text !== "");
    const combined = parts.join(" ").replace(/\s+/g, " ").trim();
    merged.push(combined);
  }

  return merged;
}

function isLikelyDataRow(row: { cells: { text: string }[] }, decimalSeparator: string): boolean {
  const values = row.cells.map(cell => cell.text.trim()).filter(text => text !== "");
  if (values.length === 0) return false;

  let numericish = 0;
  for (const value of values) {
    if (isDateLike(value) || parseNumericValue(value, decimalSeparator) !== null) {
      numericish++;
    }
  }

  const threshold = Math.max(2, Math.ceil(values.length * 0.5));
  return numericish >= threshold;
}

function isDateLike(value: string): boolean {
  const trimmed = value.trim();
  return /^\d{4}-\d{2}$/.test(trimmed);
}

function buildHeaderKeys(headers: string[]): string[] {
  const seen: Record<string, number> = {};

  return headers.map((header, idx) => {
    const base = header === "" ? `column${idx + 1}` : header;
    const count = (seen[base] ?? 0) + 1;
    seen[base] = count;
    return count === 1 ? base : `${base}_${count}`;
  });
}

function mapRowToObject(
  row: { cells: { text: string }[] },
  headerKeys: string[],
  numericColumns: boolean[],
  decimalSeparator: string
): Record<string, TableCellValue> {
  const record: Record<string, TableCellValue> = {};

  headerKeys.forEach((key, idx) => {
    const raw = row.cells[idx]?.text.trim() ?? "";
    if (numericColumns[idx]) {
      const parsed = parseNumericValue(raw, decimalSeparator);
      record[key] = parsed ?? undefined;
    } else {
      record[key] = raw;
    }
  });

  return record;
}

function isNumericColumn(values: string[], decimalSeparator: string): boolean {
  let sawNumeric = false;

  const allNumeric = values.every(value => {
    const trimmed = value.trim();
    if (trimmed === "") return true;
    const parsed = parseNumericValue(trimmed, decimalSeparator);
    if (parsed === null) return false;
    sawNumeric = true;
    return true;
  });

  return allNumeric && sawNumeric;
}

function parseNumericValue(value: string, decimalSeparator: string): number | null {
  if (value.trim() === "") return null;

  const normalized = normalizeNumberString(value, decimalSeparator);
  if (normalized === null) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeNumberString(value: string, decimalSeparator: string): string | null {
  const separator = decimalSeparator || ".";
  const escapedSeparator = escapeRegExp(separator);

  let normalized = value.replace(/\s+/g, "");

  if (separator !== ".") {
    const thousandSeparator = separator === "," ? "." : ",";
    const thousandPattern = new RegExp(
      `\\${thousandSeparator}(?=\\d{3}(?:\\${thousandSeparator}|${escapedSeparator}|$))`,
      "g"
    );
    normalized = normalized.replace(thousandPattern, "");
    normalized = normalized.replace(new RegExp(escapedSeparator, "g"), ".");
  } else {
    normalized = normalized.replace(/,(?=\d{3}(\.|,|$))/g, "");
  }

  return normalized;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
