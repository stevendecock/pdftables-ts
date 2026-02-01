import type { Rect, TextItem } from "./types.js";
import { loadTextItemsFromPdf, LoadTextItemsOptions, type PageTextItems } from "./pdf-loader.js";

export type TextItemQuery =
  | string
  | RegExp
  | ((item: TextItem, pointer: TextItemPointer) => boolean);

export interface TextItemPointer {
  pageIndex: number;
  itemIndex: number;
}

export interface FindTextItemOptions {
  /** Search only within this page index. */
  pageIndex?: number;
  /** Page index to start scanning from (default: first page for forward, last page for backward). */
  startPageIndex?: number;
  /** Scan pages forward or backward. */
  direction?: "forward" | "backward";
  /** String matching strategy when query is a string. */
  match?: "exact" | "contains" | "startsWith" | "endsWith";
  /** Whether to match case-sensitively (default: false). */
  caseSensitive?: boolean;
  /** Include whitespace-only items during scan (default: false). */
  includeWhitespace?: boolean;
}

export interface MoveOptions {
  /** Maximum distance along the chosen metric (default: Infinity). */
  maxDistance?: number;
  /** Minimum distance to consider (default: 0). */
  minDistance?: number;
  /** For vertical moves, require candidate center to be within this x distance. */
  xTolerance?: number;
  /** For horizontal moves, require candidate center to be within this y distance. */
  yTolerance?: number;
  /** Only search within the current page (default: true). */
  samePageOnly?: boolean;
  /** Require overlapping projections on the perpendicular axis. */
  requireOverlap?: boolean;
  /** Additional predicate to filter candidates. */
  filter?: (item: TextItem, pointer: TextItemPointer) => boolean;
  /** Distance metric to rank candidates (default: axis). */
  metric?: "axis" | "euclidean";
  /** Penalty multiplier for cross-page moves when samePageOnly is false. */
  pageGap?: number;
}

export class PdfTraverser {
  private pages: PageTextItems[] | null;
  private buffer: ArrayBuffer | null;
  private loadPromise: Promise<PageTextItems[]> | null;

  /**
   * Create a traverser from a PDF buffer or preloaded pages.
   * When passing a buffer, methods like findFirst are async.
   */
  constructor(source: ArrayBuffer | PageTextItems[]) {
    if (Array.isArray(source)) {
      this.pages = source;
      this.buffer = null;
      this.loadPromise = null;
    } else {
      this.pages = null;
      this.buffer = source;
      this.loadPromise = null;
    }
  }

  /** Load text items from a PDF buffer and return a ready-to-use traverser. */
  static async fromPdfBuffer(
    buffer: ArrayBuffer,
    options?: LoadTextItemsOptions
  ): Promise<PdfTraverser> {
    const effectiveOptions =
      options ??
      ({
        merge: true,
        ignoreWhitespace: true,
        mergeOptions: {
          horizontalMergeGap: 10,
          verticalMergeGap: 3,
          spaceWidth: 2.5,
        },
      } satisfies LoadTextItemsOptions);
    const pages = await loadTextItemsFromPdf(buffer, effectiveOptions);
    return new PdfTraverser(pages);
  }

  /** Retrieve all page text items (loads the PDF if needed). */
  async getPages(): Promise<PageTextItems[]> {
    return this.ensurePages();
  }

  /**
   * Find the first matching text item and return a TextItemTraverser focused on it.
   * Throws if no match is found.
   */
  async findFirst(
    query: TextItemQuery,
    options: FindTextItemOptions = {}
  ): Promise<TextItemTraverser> {
    return this.findNth(query, 1, options);
  }

  /**
   * Find the Nth matching text item (1-based) and return a TextItemTraverser focused on it.
   * Throws if no match is found.
   */
  async findNth(
    query: TextItemQuery,
    index: number,
    options: FindTextItemOptions = {}
  ): Promise<TextItemTraverser> {
    if (!Number.isInteger(index) || index < 1) {
      throw new Error("Index must be an integer greater than or equal to 1.");
    }

    const pages = await this.ensurePages();
    const matcher = buildMatcher(query, options);
    const pointer = findNthMatch(pages, matcher, index, options);

    if (!pointer) {
      throw new Error("No text item matched the query.");
    }

    return new TextItemTraverser(pages, pointer);
  }

  private async ensurePages(): Promise<PageTextItems[]> {
    if (this.pages) return this.pages;
    if (!this.buffer) {
      this.pages = [];
      return this.pages;
    }
    if (!this.loadPromise) {
      this.loadPromise = loadTextItemsFromPdf(this.buffer);
    }
    this.pages = await this.loadPromise;
    return this.pages;
  }
}

export class TextItemTraverser {
  private pages: PageTextItems[];
  private pointer: TextItemPointer;

  constructor(pages: PageTextItems[], pointer: TextItemPointer) {
    this.pages = pages;
    this.pointer = pointer;
  }

  /** Return the text content of the active item. */
  text(): string {
    return this.item().text;
  }

  /** Return the active text item. */
  item(): TextItem {
    const page = this.page();
    const item = page.items[this.pointer.itemIndex];
    if (!item) {
      throw new Error("Active text item is out of bounds.");
    }
    return item;
  }

  /** Return the bounding box of the active item. */
  bbox(): Rect {
    return this.item().bbox;
  }

  /** Return the active page data. */
  page(): PageTextItems {
    const page = this.pages[this.pointer.pageIndex];
    if (!page) {
      throw new Error("Active page is out of bounds.");
    }
    return page;
  }

  /** Return the active pointer (page index + item index). */
  position(): TextItemPointer {
    return { ...this.pointer };
  }

  /** Select the next item above the current one. */
  nextAbove(options: MoveOptions = {}): TextItemTraverser {
    return this.next("up", options);
  }

  /** Select the next item below the current one. */
  nextBelow(options: MoveOptions = {}): TextItemTraverser {
    return this.next("down", options);
  }

  /** Select the next item to the left of the current one. */
  nextLeft(options: MoveOptions = {}): TextItemTraverser {
    return this.next("left", options);
  }

  /** Select the next item to the right of the current one. */
  nextRight(options: MoveOptions = {}): TextItemTraverser {
    return this.next("right", options);
  }

  /**
   * Select the next item in the given direction, applying MoveOptions.
   * Throws if no candidate is found.
   */
  next(direction: "up" | "down" | "left" | "right", options: MoveOptions = {}): TextItemTraverser {
    const next = findNextPointer(this.pages, this.pointer, direction, options);
    if (!next) {
      const { pageIndex, itemIndex } = this.pointer;
      throw new Error(
        `No text item found ${direction} from page ${pageIndex} item ${itemIndex}.`
      );
    }
    return new TextItemTraverser(this.pages, next);
  }
}

function buildMatcher(
  query: TextItemQuery,
  options: FindTextItemOptions
): (item: TextItem, pointer: TextItemPointer) => boolean {
  if (typeof query === "function") {
    return query;
  }

  if (query instanceof RegExp) {
    return (item: TextItem) => query.test(item.text);
  }

  const matchMode = options.match ?? "contains";
  const caseSensitive = options.caseSensitive ?? false;

  return (item: TextItem) => {
    const text = caseSensitive ? item.text : item.text.toLowerCase();
    const needle = caseSensitive ? query : query.toLowerCase();

    switch (matchMode) {
      case "exact":
        return text === needle;
      case "startsWith":
        return text.startsWith(needle);
      case "endsWith":
        return text.endsWith(needle);
      default:
        return text.includes(needle);
    }
  };
}

function findNthMatch(
  pages: PageTextItems[],
  matcher: (item: TextItem, pointer: TextItemPointer) => boolean,
  index: number,
  options: FindTextItemOptions
): TextItemPointer | null {
  const includeWhitespace = options.includeWhitespace ?? false;
  const direction = options.direction ?? "forward";
  let matchCount = 0;

  if (typeof options.pageIndex === "number") {
    const page = pages[options.pageIndex];
    if (!page) return null;
    const sorted = sortItemsForReadOrder(page.items);
    for (const entry of sorted) {
      if (!includeWhitespace && entry.item.text.trim() === "") continue;
      const pointer = { pageIndex: options.pageIndex, itemIndex: entry.index };
      if (matcher(entry.item, pointer)) {
        matchCount += 1;
        if (matchCount === index) return pointer;
      }
    }
    return null;
  }

  const defaultStart =
    direction === "backward" ? Math.max(0, pages.length - 1) : 0;
  const requestedStart = options.startPageIndex ?? defaultStart;
  const maxIndex = Math.max(0, pages.length - 1);
  const startPage = Math.min(Math.max(requestedStart, 0), maxIndex);
  const pageIndices = pages.map((_, idx) => idx);
  const orderedIndices =
    direction === "backward"
      ? pageIndices.slice(0, startPage + 1).reverse()
      : pageIndices.slice(startPage);

  for (const pageIndex of orderedIndices) {
    const page = pages[pageIndex];
    if (!page) continue;
    const sorted = sortItemsForReadOrder(page.items);
    for (const entry of sorted) {
      if (!includeWhitespace && entry.item.text.trim() === "") continue;
      const pointer = { pageIndex, itemIndex: entry.index };
      if (matcher(entry.item, pointer)) {
        matchCount += 1;
        if (matchCount === index) return pointer;
      }
    }
  }

  return null;
}

function sortItemsForReadOrder(items: TextItem[]): Array<{ item: TextItem; index: number }> {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const yDiff = b.item.bbox.y - a.item.bbox.y;
      if (Math.abs(yDiff) > 0.001) return yDiff;
      return a.item.bbox.x - b.item.bbox.x;
    });
}

function findNextPointer(
  pages: PageTextItems[],
  current: TextItemPointer,
  direction: "up" | "down" | "left" | "right",
  options: MoveOptions
): TextItemPointer | null {
  const samePageOnly = options.samePageOnly ?? true;
  const includePages = samePageOnly
    ? [current.pageIndex]
    : pages.map((_, idx) => idx);
  const currentItem = pages[current.pageIndex]?.items[current.itemIndex];
  if (!currentItem) return null;

  const currentCenter = rectCenter(currentItem.bbox);
  const minDistance = options.minDistance ?? 0;
  const maxDistance = options.maxDistance;
  const metric = options.metric ?? "axis";
  const pageGap = options.pageGap ?? 10000;

  const candidates: Array<{
    pointer: TextItemPointer;
    primary: number;
    perpendicular: number;
    distance: number;
    pagePenalty: number;
  }> = [];

  for (const pageIndex of includePages) {
    const page = pages[pageIndex];
    if (!page) continue;
    for (let itemIndex = 0; itemIndex < page.items.length; itemIndex++) {
      if (pageIndex === current.pageIndex && itemIndex === current.itemIndex) continue;
      const item = page.items[itemIndex];
      if (options.filter && !options.filter(item, { pageIndex, itemIndex })) continue;

      const center = rectCenter(item.bbox);
      const dx = center.x - currentCenter.x;
      const dy = center.y - currentCenter.y;

      const gap = primaryGap(direction, currentItem.bbox, item.bbox);
      if (gap === null || gap < minDistance) continue;

      const withinPerpendicular = isWithinPerpendicular(
        direction,
        currentItem.bbox,
        item.bbox,
        options
      );
      if (!withinPerpendicular) continue;

      const primary = gap;
      const perpendicular = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
      const distance =
        metric === "euclidean" ? Math.sqrt(dx * dx + dy * dy) : primary;

      if (typeof maxDistance === "number" && distance > maxDistance) continue;

      const pagePenalty = samePageOnly ? 0 : Math.abs(pageIndex - current.pageIndex) * pageGap;

      candidates.push({
        pointer: { pageIndex, itemIndex },
        primary,
        perpendicular,
        distance,
        pagePenalty,
      });
    }
  }

  if (candidates.length === 0) return null;

  const verticalMove = direction === "up" || direction === "down";
  candidates.sort((a, b) => {
    if (a.pagePenalty !== b.pagePenalty) return a.pagePenalty - b.pagePenalty;
    if (verticalMove) {
      if (a.perpendicular !== b.perpendicular) return a.perpendicular - b.perpendicular;
      if (a.primary !== b.primary) return a.primary - b.primary;
    } else {
      if (a.perpendicular !== b.perpendicular) return a.perpendicular - b.perpendicular;
      if (a.primary !== b.primary) return a.primary - b.primary;
    }
    return a.distance - b.distance;
  });

  return candidates[0].pointer;
}

function primaryGap(
  direction: "up" | "down" | "left" | "right",
  current: Rect,
  candidate: Rect
): number | null {
  switch (direction) {
    case "up":
      return candidate.y - (current.y + current.height);
    case "down":
      return current.y - (candidate.y + candidate.height);
    case "left":
      return current.x - (candidate.x + candidate.width);
    case "right":
      return candidate.x - (current.x + current.width);
    default:
      return null;
  }
}

function isWithinPerpendicular(
  direction: "up" | "down" | "left" | "right",
  current: Rect,
  candidate: Rect,
  options: MoveOptions
): boolean {
  if (options.requireOverlap) {
    if (direction === "up" || direction === "down") {
      return rangesOverlap(current.x, current.x + current.width, candidate.x, candidate.x + candidate.width);
    }
    return rangesOverlap(current.y, current.y + current.height, candidate.y, candidate.y + candidate.height);
  }

  if (direction === "up" || direction === "down") {
    if (typeof options.xTolerance !== "number") return true;
    const currentCenter = current.x + current.width / 2;
    const candidateCenter = candidate.x + candidate.width / 2;
    return Math.abs(candidateCenter - currentCenter) <= options.xTolerance;
  }

  if (typeof options.yTolerance !== "number") return true;
  const currentCenter = current.y + current.height / 2;
  const candidateCenter = candidate.y + candidate.height / 2;
  return Math.abs(candidateCenter - currentCenter) <= options.yTolerance;
}

function rangesOverlap(a1: number, a2: number, b1: number, b2: number): boolean {
  return Math.max(a1, b1) <= Math.min(a2, b2);
}

function rectCenter(rect: Rect): { x: number; y: number } {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}
