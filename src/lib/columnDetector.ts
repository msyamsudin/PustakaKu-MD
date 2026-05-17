import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface LayoutRegion {
  type: 'full-width' | 'column';
  yStart: number;       // normalized 0-1 (top of page)
  yEnd: number;         // normalized 0-1 (bottom of region)
  xStart?: number;      // normalized 0-1 (for column regions)
  xEnd?: number;        // normalized 0-1 (for column regions)
  columnIndex?: number;  // 0 = left, 1 = right
}

export interface LayoutAnalysis {
  isMultiColumn: boolean;
  columnCount: number;          // 1 or 2
  gutterXNormalized?: number;   // center of the gutter (0-1)
  regions: LayoutRegion[];      // ordered list of regions for slicing
  confidence: number;           // 0-1 confidence in the detection
}

/**
 * Analyzes the layout of a PDF page using text content coordinates.
 * Detects if the page has multiple columns and identifies the gutter position.
 */
export async function analyzePageLayout(page: any): Promise<LayoutAnalysis> {
  try {
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });
    const { width, height } = viewport;

    // 1. Extract text item boxes in normalized coordinates (0-1)
    // PDF coordinates origin is bottom-left. We convert to top-left (0,0)
    const items = textContent.items.map((item: any) => {
      const tx = pdfjsLib.Util.transform(viewport.transform, (item as any).transform);
      // tx[4] is X, tx[5] is Y (baseline)
      // Since PDF Y is bottom-up, and viewport transform handles conversion to top-down
      // We'll trust the transformed coordinates for viewport space
      const x = tx[4];
      const y = tx[5];
      const itemWidth = item.width;
      const itemHeight = item.height;

      return {
        x: x / width,
        y: y / height,
        w: itemWidth / width,
        h: itemHeight / height,
        str: item.str
      };
    });

    if (items.length < 10) {
      return { isMultiColumn: false, columnCount: 1, regions: [], confidence: 1.0 };
    }

    // 2. Build X-axis histogram to find the gutter
    const binCount = 100;
    const histogram = new Array(binCount).fill(0);
    
    items.forEach((item: any) => {
      if (!item.str.trim()) return;
      const startBin = Math.max(0, Math.floor(item.x * binCount));
      const endBin = Math.min(binCount - 1, Math.floor((item.x + item.w) * binCount));
      for (let i = startBin; i <= endBin; i++) {
        histogram[i]++;
      }
    });

    // 3. Search for a gutter in the middle region (30% to 70%)
    const middleStart = Math.floor(binCount * 0.3);
    const middleEnd = Math.floor(binCount * 0.7);
    const minGutterBins = 5; // 5% of width as requested

    let bestGutterStart = -1;
    let maxGutterWidth = 0;
    let currentGutterStart = -1;
    let currentGutterWidth = 0;

    for (let i = middleStart; i <= middleEnd; i++) {
      if (histogram[i] === 0) {
        if (currentGutterStart === -1) currentGutterStart = i;
        currentGutterWidth++;
      } else {
        if (currentGutterWidth >= minGutterBins && currentGutterWidth > maxGutterWidth) {
          bestGutterStart = currentGutterStart;
          maxGutterWidth = currentGutterWidth;
        }
        currentGutterStart = -1;
        currentGutterWidth = 0;
      }
    }
    // Check end of loop
    if (currentGutterWidth >= minGutterBins && currentGutterWidth > maxGutterWidth) {
      bestGutterStart = currentGutterStart;
      maxGutterWidth = currentGutterWidth;
    }

    if (bestGutterStart === -1) {
      return { isMultiColumn: false, columnCount: 1, regions: [], confidence: 0.8 };
    }

    const gutterX = (bestGutterStart + maxGutterWidth / 2) / binCount;
    
    // 4. Identify Y-threshold for Header (where text stops being full-width or starts respecting the gutter)
    // We'll scan Y-rows.
    const rowCount = 100;
    const rowHistogram = new Array(rowCount).fill(null).map(() => ({
      minX: 1,
      maxX: 0,
      count: 0,
      hasLeft: false,
      hasRight: false,
      spansGutter: false
    }));

    items.forEach((item: any) => {
      if (!item.str.trim()) return;
      const row = Math.max(0, Math.min(rowCount - 1, Math.floor(item.y * rowCount)));
      const stats = rowHistogram[row];
      stats.minX = Math.min(stats.minX, item.x);
      stats.maxX = Math.max(stats.maxX, item.x + item.w);
      stats.count++;
      
      if (item.x + item.w < gutterX) stats.hasLeft = true;
      if (item.x > gutterX) stats.hasRight = true;
      if (item.x < gutterX && (item.x + item.w) > gutterX) stats.spansGutter = true;
    });

    // Detect where the multi-column body starts
    let bodyStartRow = -1;
    for (let i = 0; i < rowCount; i++) {
      const stats = rowHistogram[i];
      if (stats.count === 0) continue;
      
      // If a row has text on both sides of the gutter but NOT spanning it, it's likely multi-column
      if (stats.hasLeft && stats.hasRight && !stats.spansGutter) {
        bodyStartRow = i;
        break;
      }
    }

    // Detect where the multi-column body ends (footer)
    let bodyEndRow = rowCount - 1;
    for (let i = rowCount - 1; i > (bodyStartRow === -1 ? 0 : bodyStartRow); i--) {
      const stats = rowHistogram[i];
      if (stats.count === 0) continue;
      if (stats.hasLeft && stats.hasRight && !stats.spansGutter) {
        bodyEndRow = i;
        break;
      }
    }

    if (bodyStartRow === -1) {
      return { isMultiColumn: false, columnCount: 1, regions: [], confidence: 0.7 };
    }

    const ySplitHeader = bodyStartRow / rowCount;
    const ySplitFooter = (bodyEndRow + 1) / rowCount;

    const regions: LayoutRegion[] = [];
    
    // Add Header if it exists
    if (ySplitHeader > 0.05) {
      regions.push({
        type: 'full-width',
        yStart: 0,
        yEnd: ySplitHeader
      });
    }

    // Add Columns
    regions.push({
      type: 'column',
      yStart: ySplitHeader,
      yEnd: ySplitFooter,
      xStart: 0,
      xEnd: gutterX,
      columnIndex: 0
    });
    regions.push({
      type: 'column',
      yStart: ySplitHeader,
      yEnd: ySplitFooter,
      xStart: gutterX,
      xEnd: 1.0,
      columnIndex: 1
    });

    // Add Footer if it exists
    if (ySplitFooter < 0.95) {
      regions.push({
        type: 'full-width',
        yStart: ySplitFooter,
        yEnd: 1.0
      });
    }

    return {
      isMultiColumn: true,
      columnCount: 2,
      gutterXNormalized: gutterX,
      regions,
      confidence: 0.9
    };

  } catch (error) {
    console.error("Layout analysis failed:", error);
    return { isMultiColumn: false, columnCount: 1, regions: [], confidence: 0 };
  }
}
