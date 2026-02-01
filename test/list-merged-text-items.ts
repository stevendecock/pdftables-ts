import { readFileSync } from "fs";
import path from "path";
import { loadTextItemsFromPdf } from "../src/pdf-loader.js";

function fmt(n: number): string {
  return n.toFixed(2).padStart(8, " ");
}

async function main() {
  const filePath = process.argv[2] ?? "test-data/Engie_EASY_Vast.pdf";
  const resolvedPath = path.resolve(filePath);
  console.log(`Reading PDF: ${resolvedPath}`);

  const buf = readFileSync(resolvedPath);
  const pages = await loadTextItemsFromPdf(Uint8Array.from(buf).buffer, {
    merge: true,
    ignoreWhitespace: true,
    mergeOptions: {
      horizontalMergeGap: 10,
      verticalMergeGap: 3,
      spaceWidth: 2.5,
    },
  });

  pages.forEach(page => {
    console.log(`\n=== Page ${page.pageIndex} ===`);
    const sorted = [...page.items].sort((a, b) => {
      const yDiff = b.bbox.y - a.bbox.y;
      if (Math.abs(yDiff) > 0.001) return yDiff;
      return a.bbox.x - b.bbox.x;
    });

    sorted.forEach((item, idx) => {
      const { x, y, width, height } = item.bbox;
      console.log(
        `${idx.toString().padStart(4, " ")} | "${item.text}" | x=${fmt(x)} y=${fmt(
          y
        )} w=${fmt(width)} h=${fmt(height)}`
      );
    });
  });
}

main().catch(err => {
  console.error("Error while listing merged text items:", err);
  process.exit(1);
});
