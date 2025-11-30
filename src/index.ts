import { loadGlyphsFromPdf } from "./pdf-loader";
import { extractTableFromGlyphs } from "./table-detector";
import type {
  ParsedTable,
  TableExtractionOptions,
  PdfTableExtractor,
} from "./types";

export * from "./types";

export class DefaultPdfTableExtractor implements PdfTableExtractor {
  async extractTables(
    buffer: ArrayBuffer,
    options: TableExtractionOptions = {}
  ): Promise<ParsedTable[]> {
    const pages = await loadGlyphsFromPdf(buffer);
    const tables: ParsedTable[] = [];

    for (const page of pages) {
      const table = extractTableFromGlyphs(page.pageIndex, page.glyphs, options);
      if (table) tables.push(table);
    }

    return tables;
  }
}

// Convenience function
export async function extractTablesFromPdf(
  buffer: ArrayBuffer,
  options?: TableExtractionOptions
): Promise<ParsedTable[]> {
  const extractor = new DefaultPdfTableExtractor();
  return extractor.extractTables(buffer, options);
}
