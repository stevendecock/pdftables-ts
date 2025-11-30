import { loadGlyphsFromPdf } from "./pdf-loader";
import { extractTableFromGlyphs } from "./table-detector";
import type {
  ParsedTable,
  TableExtractionOptions,
  PdfTableExtractorApi,
  TableObjects,
} from "./types";

export * from "./types";

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
    return tables.map(tableToObjects);
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

function tableToObjects(table: ParsedTable): TableObjects {
  if (table.rows.length === 0) {
    return { pageIndex: table.pageIndex, headers: [], rows: [] };
  }

  const headerCells = table.rows[0].cells;
  const headerKeys = buildHeaderKeys(headerCells.map(cell => cell.text.trim()));

  const rows = table.rows.slice(1).map(row => {
    const record: Record<string, string> = {};
    headerKeys.forEach((key, idx) => {
      record[key] = row.cells[idx]?.text.trim() ?? "";
    });
    return record;
  });

  return {
    pageIndex: table.pageIndex,
    headers: headerKeys,
    rows,
  };
}

function buildHeaderKeys(headers: string[]): string[] {
  const seen: Record<string, number> = {};

  return headers.map((header, idx) => {
    const base = header === "" ? `column_${idx + 1}` : header;
    const count = (seen[base] ?? 0) + 1;
    seen[base] = count;
    return count === 1 ? base : `${base}_${count}`;
  });
}
