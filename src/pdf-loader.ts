import * as pdfjs from "pdfjs-dist";
import type { Rect, TextItem } from "./types.js";

// For Node: disable workers
// @ts-ignore

export interface PageTextItems {
  pageIndex: number;
  width: number;
  height: number;
  items: TextItem[];
}

export interface LoadTextItemsOptions {
  /** When false, do not merge text items. Default: false. */
  merge?: boolean;
  /** Drop text items that are whitespace-only. Default: true. */
  ignoreWhitespace?: boolean;
  /** Options controlling merge behavior (used only when merge is true). */
  mergeOptions?: {
    /** Merge horizontally adjacent items when the gap is <= this value. */
    horizontalMergeGap?: number;
    /** Merge vertically adjacent items when the gap is <= this value. */
    verticalMergeGap?: number;
    /** Horizontal alignment tolerance used for vertical merges. */
    xTolerance?: number;
    /** Vertical alignment tolerance used for horizontal merges. */
    yTolerance?: number;
    /** Prefer horizontal merges over vertical merges when both are possible. Default: true. */
    preferHorizontal?: boolean;
    /**
     * When merging horizontally, insert one space per spaceWidth of gap.
     * For example, a gap of 5 with spaceWidth 2.5 yields two spaces.
     */
    spaceWidth?: number;
  };
}

export async function loadTextItemsFromPdf(
  buffer: ArrayBuffer,
  options: LoadTextItemsOptions = {}
): Promise<PageTextItems[]> {
  const loadingTask = pdfjs.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;

  const pages: PageTextItems[] = [];
  const ignoreWhitespace = options.ignoreWhitespace ?? true;
  const mergeEnabled = options.merge ?? false;
  const mergeOptions = options.mergeOptions ?? {};
  const horizontalMergeGap = mergeOptions.horizontalMergeGap ?? 0;
  const verticalMergeGap = mergeOptions.verticalMergeGap ?? 0;
  const xTolerance = mergeOptions.xTolerance ?? 0;
  const yTolerance = mergeOptions.yTolerance ?? 0;
  const preferHorizontal = mergeOptions.preferHorizontal ?? true;
  const spaceWidth = mergeOptions.spaceWidth ?? 0;

  for (let pageIndex = 0; pageIndex < pdf.numPages; pageIndex++) {
    const page = await pdf.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();

    const items: TextItem[] = [];

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
      if (!ignoreWhitespace || str.trim() !== "") {
        items.push({ text: str, bbox });
      }
    }

    const mergedItems =
      mergeEnabled && (horizontalMergeGap > 0 || verticalMergeGap > 0)
        ? mergeTextItems(
            items,
            horizontalMergeGap,
            verticalMergeGap,
            xTolerance,
            yTolerance,
            preferHorizontal,
            spaceWidth
          )
        : items;

    pages.push({
      pageIndex,
      width: viewport.width,
      height: viewport.height,
      items: mergedItems,
    });
  }

  return pages;
}

function mergeTextItems(
  items: TextItem[],
  horizontalMergeGap: number,
  verticalMergeGap: number,
  xTolerance: number,
  yTolerance: number,
  preferHorizontal: boolean,
  spaceWidth: number
): TextItem[] {
  if (items.length === 0) return [];

  const working: TextItem[] = items.map(item => ({ ...item, bbox: { ...item.bbox } }));

  if (preferHorizontal) {
    mergePass(
      working,
      "horizontal",
      horizontalMergeGap,
      verticalMergeGap,
      xTolerance,
      yTolerance,
      spaceWidth
    );
    mergePass(
      working,
      "vertical",
      horizontalMergeGap,
      verticalMergeGap,
      xTolerance,
      yTolerance,
      spaceWidth
    );
    mergePass(
      working,
      "horizontal",
      horizontalMergeGap,
      verticalMergeGap,
      xTolerance,
      yTolerance,
      spaceWidth
    );
    return working;
  }

  mergePass(
    working,
    "any",
    horizontalMergeGap,
    verticalMergeGap,
    xTolerance,
    yTolerance,
    spaceWidth
  );
  return working;
}

function rangesOverlap(a1: number, a2: number, b1: number, b2: number): boolean {
  return Math.max(a1, b1) <= Math.min(a2, b2);
}

function isAlignedHorizontal(a: Rect, b: Rect, yTolerance: number): boolean {
  if (yTolerance <= 0) return rangesOverlap(a.y, a.y + a.height, b.y, b.y + b.height);
  const aTop = a.y + a.height;
  const bTop = b.y + b.height;
  const aBottom = a.y;
  const bBottom = b.y;
  const aCenter = a.y + a.height / 2;
  const bCenter = b.y + b.height / 2;
  return (
    Math.abs(aTop - bTop) <= yTolerance ||
    Math.abs(aBottom - bBottom) <= yTolerance ||
    Math.abs(aCenter - bCenter) <= yTolerance
  );
}

function isAlignedVertical(a: Rect, b: Rect, xTolerance: number): boolean {
  if (xTolerance <= 0) return rangesOverlap(a.x, a.x + a.width, b.x, b.x + b.width);
  const aLeft = a.x;
  const bLeft = b.x;
  const aRight = a.x + a.width;
  const bRight = b.x + b.width;
  const aCenter = a.x + a.width / 2;
  const bCenter = b.x + b.width / 2;
  return (
    Math.abs(aLeft - bLeft) <= xTolerance ||
    Math.abs(aRight - bRight) <= xTolerance ||
    Math.abs(aCenter - bCenter) <= xTolerance
  );
}

function findBestMergeCandidate(
  items: TextItem[],
  horizontalMergeGap: number,
  verticalMergeGap: number,
  xTolerance: number,
  yTolerance: number,
  preferHorizontal: boolean
): { aIndex: number; bIndex: number; direction: "horizontal" | "vertical"; gap: number } | null {
  let best: { aIndex: number; bIndex: number; direction: "horizontal" | "vertical"; gap: number } | null = null;
  let bestHorizontal: { aIndex: number; bIndex: number; direction: "horizontal" | "vertical"; gap: number } | null = null;
  let bestVertical: { aIndex: number; bIndex: number; direction: "horizontal" | "vertical"; gap: number } | null = null;
  const overlapEpsilon = 1e-6;

  for (let i = 0; i < items.length; i++) {
    for (let j = 0; j < items.length; j++) {
      if (i === j) continue;
      const a = items[i];
      const b = items[j];

      if (horizontalMergeGap > 0 && isAlignedHorizontal(a.bbox, b.bbox, yTolerance)) {
        let gap = b.bbox.x - (a.bbox.x + a.bbox.width);
        if (gap < 0 && gap > -overlapEpsilon) gap = 0;
        if (gap >= 0 && gap <= horizontalMergeGap) {
          const candidate: { aIndex: number; bIndex: number; direction: "horizontal" | "vertical"; gap: number } = {
            aIndex: i,
            bIndex: j,
            direction: "horizontal",
            gap,
          };
          best = chooseBetterCandidate(best, candidate);
          bestHorizontal = chooseBetterCandidate(bestHorizontal, candidate);
        }
      }

      if (verticalMergeGap > 0 && isAlignedVertical(a.bbox, b.bbox, xTolerance)) {
        let gap = a.bbox.y - (b.bbox.y + b.bbox.height);
        if (gap < 0 && gap > -overlapEpsilon) gap = 0;
        if (gap >= 0 && gap <= verticalMergeGap) {
          const candidate: { aIndex: number; bIndex: number; direction: "horizontal" | "vertical"; gap: number } = {
            aIndex: i,
            bIndex: j,
            direction: "vertical",
            gap,
          };
          best = chooseBetterCandidate(best, candidate);
          bestVertical = chooseBetterCandidate(bestVertical, candidate);
        }
      }
    }
  }

  if (!preferHorizontal) return best;
  return bestHorizontal ?? bestVertical;
}

function mergePass(
  working: TextItem[],
  directionMode: "horizontal" | "vertical" | "any",
  horizontalMergeGap: number,
  verticalMergeGap: number,
  xTolerance: number,
  yTolerance: number,
  spaceWidth: number
): void {
  while (true) {
    const candidate = findBestMergeCandidate(
      working,
      directionMode === "horizontal" ? horizontalMergeGap : 0,
      directionMode === "vertical" ? verticalMergeGap : 0,
      xTolerance,
      yTolerance,
      directionMode === "any"
    );
    if (!candidate) break;

    const { aIndex, bIndex, direction, gap } = candidate;
    const a = working[aIndex];
    const b = working[bIndex];
    const joiner =
      direction === "vertical"
        ? "\n"
        : spaceWidth > 0 && gap >= spaceWidth
        ? " ".repeat(Math.max(1, Math.floor(gap / spaceWidth)))
        : "";

    const mergedText = `${a.text}${joiner}${b.text}`;
    const mergedItem: TextItem = {
      text: mergedText,
      bbox: unionRects(a.bbox, b.bbox),
    };

    const first = Math.min(aIndex, bIndex);
    const second = Math.max(aIndex, bIndex);
    working.splice(second, 1);
    working.splice(first, 1, mergedItem);
  }
}

function chooseBetterCandidate(
  current: { aIndex: number; bIndex: number; direction: "horizontal" | "vertical"; gap: number } | null,
  next: { aIndex: number; bIndex: number; direction: "horizontal" | "vertical"; gap: number }
): { aIndex: number; bIndex: number; direction: "horizontal" | "vertical"; gap: number } {
  if (!current) return next;
  if (next.gap < current.gap) return next;
  return current;
}

function unionRects(a: Rect, b: Rect): Rect {
  const xMin = Math.min(a.x, b.x);
  const yMin = Math.min(a.y, b.y);
  const xMax = Math.max(a.x + a.width, b.x + b.width);
  const yMax = Math.max(a.y + a.height, b.y + b.height);
  return { x: xMin, y: yMin, width: xMax - xMin, height: yMax - yMin };
}
