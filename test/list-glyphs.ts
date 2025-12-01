import { readFileSync } from "fs";
import path from "path";
import { loadGlyphsFromPdf } from "../src/pdf-loader";

function fmt(n: number): string {
  return n.toFixed(2).padStart(8, " ");
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: node dist/test/list-glyphs.js <path-to-pdf>");
    process.exit(1);
  }

  const resolvedPath = path.resolve(filePath);
  console.log(`Reading PDF: ${resolvedPath}`);

  const buf = readFileSync(resolvedPath);
  const pages = await loadGlyphsFromPdf(Uint8Array.from(buf).buffer);

  pages.forEach(page => {
    console.log(`\n=== Page ${page.pageIndex} ===`);
    const sorted = [...page.glyphs].sort((a, b) => {
      const yDiff = b.bbox.y - a.bbox.y; // top to bottom
      if (Math.abs(yDiff) > 0.001) return yDiff;
      return a.bbox.x - b.bbox.x;
    });

    sorted.forEach((glyph, idx) => {
      const { x, y, width, height } = glyph.bbox;
      console.log(
        `${idx.toString().padStart(4, " ")} | "${glyph.text}" | x=${fmt(x)} y=${fmt(
          y
        )} w=${fmt(width)} h=${fmt(height)}`
      );
    });
  });
}

main().catch(err => {
  console.error("Error while listing glyphs:", err);
  process.exit(1);
});
