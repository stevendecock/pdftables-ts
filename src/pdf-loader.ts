import * as pdfjs from "pdfjs-dist";
import type { Glyph, Rect } from "./types";

// For Node: disable workers
// @ts-ignore

export interface PageGlyphs {
  pageIndex: number;
  width: number;
  height: number;
  glyphs: Glyph[];
}

export async function loadGlyphsFromPdf(buffer: ArrayBuffer): Promise<PageGlyphs[]> {
  const loadingTask = pdfjs.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;

  const pages: PageGlyphs[] = [];

  for (let pageIndex = 0; pageIndex < pdf.numPages; pageIndex++) {
    const page = await pdf.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();

    const glyphs: Glyph[] = [];

    for (const item of textContent.items as any[]) {
      const str: string = item.str;
      if (!str) continue;

      const transform: number[] = item.transform;
      // transform = [a, b, c, d, e, f]
      const x = transform[4];
      const y = transform[5];

      const width: number = item.width;
      // Rough estimate for height
      const height: number = Math.abs(transform[3]) || (item.height ?? 10);

      const bbox: Rect = { x, y, width, height };
      glyphs.push({ text: str, bbox });
    }

    pages.push({
      pageIndex,
      width: viewport.width,
      height: viewport.height,
      glyphs,
    });
  }

  return pages;
}
