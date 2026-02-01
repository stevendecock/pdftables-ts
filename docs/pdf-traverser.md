# PdfTraverser
Use `PdfTraverser` + `TextItemTraverser` to navigate between text items by geometry.

```ts
import { readFileSync } from "fs";
import { PdfTraverser } from "pdftables-ts";

const buf = readFileSync("path/to/file.pdf");
const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const traverser = new PdfTraverser(arrayBuffer);
const value = (await traverser.findFirst("Some text"))
  .nextBelow()
  .nextLeft()
  .nextBelow({ maxDistance: 40 })
  .text();
```

## How PdfTraverser works
`PdfTraverser` loads text items (text runs with bounding boxes) and keeps a full-page context.
`findFirst` returns a `TextItemTraverser` that tracks a single "active" item and lets you move
to the next item in a direction based on bounding-box geometry.

Directional navigation rules:
- A candidate must be strictly in the requested direction based on bounding box edges
  (for example, `nextBelow` uses the vertical gap between the current bottom edge and the candidate top edge).
- Candidates are ranked by perpendicular alignment first, then by directional gap.
  This favors items in the same column/row over items that are just slightly closer but far off to the side.
- `maxDistance` and `minDistance` apply to the directional gap (not center distance).
- `xTolerance` and `yTolerance` constrain how far candidates can drift on the perpendicular axis.
- `requireOverlap` forces overlap on the perpendicular axis.

## PdfTraverser
- `new PdfTraverser(bufferOrPages)`
  - Accepts either an `ArrayBuffer` (PDF bytes) or preloaded `PageTextItems[]`.
- `PdfTraverser.fromPdfBuffer(buffer) => Promise<PdfTraverser>`
  - Loads the PDF and returns a traverser ready for sync navigation.
  - Default load options when no options are passed:
    - `merge: true`
    - `ignoreWhitespace: true`
    - `mergeOptions: { horizontalMergeGap: 10, verticalMergeGap: 3, spaceWidth: 2.5 }`
- `getPages() => Promise<PageTextItems[]>`
  - Loads and returns all text items.
- `findFirst(query, options?) => Promise<TextItemTraverser>`
  - Finds the first matching text item and returns a focused traverser.
  - Throws if no match is found.

`query` can be:
- `string` (matched by `options.match`)
- `RegExp`
- `(item, pointer) => boolean`

`FindTextItemOptions`:
- `pageIndex`: restrict search to a single page.
- `startPageIndex`: where to start scanning (default: first/last depending on `direction`).
- `direction`: `"forward"` or `"backward"`.
- `match`: `"exact" | "contains" | "startsWith" | "endsWith"`.
- `caseSensitive`: boolean.
- `includeWhitespace`: include whitespace-only items.

## TextItemTraverser
- `text() => string` returns the active item text.
- `item() => TextItem` returns the active item.
- `bbox() => Rect` returns the active item bounding box.
- `page() => PageTextItems` returns the active page info.
- `position() => { pageIndex, itemIndex }` returns the pointer.
- `nextAbove(options?)`, `nextBelow(options?)`, `nextLeft(options?)`, `nextRight(options?)`
  - Move to the nearest item in that direction.
- `next(direction, options?)`
  - Direction is `"up" | "down" | "left" | "right"`.

`MoveOptions`:
- `maxDistance`, `minDistance`: limits on how far to search.
- `xTolerance`, `yTolerance`: limit perpendicular drift (center-to-center).
- `samePageOnly`: default `true`.
- `requireOverlap`: require overlap on the perpendicular axis.
- `filter`: custom predicate to accept/reject candidates.
- `metric`: `"axis"` (default) or `"euclidean"`.
- `pageGap`: penalty multiplier for cross-page hops.
