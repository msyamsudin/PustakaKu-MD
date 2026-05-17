import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export type PdfDocument = pdfjsLib.PDFDocumentProxy;

/**
 * Loads a PDF document and returns the proxy object.
 * This should be called once per file and the result should be cached.
 */
export async function loadPdfDocument(data: File | Uint8Array | ArrayBuffer): Promise<PdfDocument> {
  try {
    const arrayBuffer = data instanceof File ? await data.arrayBuffer() : data;
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      // Use standard fonts for better performance and compatibility
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/cmaps/',
      cMapPacked: true,
    });
    return await loadingTask.promise;
  } catch (error) {
    console.error("Error loading PDF document:", error);
    throw error;
  }
}

/**
 * Renders a specific page from an already loaded PDF document.
 * Returns a Blob of the rendered image and its dimensions.
 */
export function renderPageFromDoc(pdf: PdfDocument, pageNumber: number, scale: number = 2) {
  let renderTask: any = null;
  let cancelled = false;

  const promise = (async () => {
    try {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) throw new Error("Rendering cancelled");

      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { alpha: false });

      if (!context) throw new Error("Could not create canvas context");

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      // Set white background
      context.fillStyle = 'white';
      context.fillRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
        intent: 'display' as const,
        canvas: canvas
      };

      renderTask = page.render(renderContext);
      await renderTask.promise;

      if (cancelled) throw new Error("Rendering cancelled");

      const width = canvas.width;
      const height = canvas.height;

      // Return as Blob instead of Base64 string for memory efficiency
      return new Promise<{ blob: Blob, width: number, height: number }>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            page.cleanup();
            resolve({ blob, width, height });
          } else {
            reject(new Error("Failed to create blob from canvas"));
          }
        }, 'image/webp', 0.9);
      });
    } catch (error: any) {
      if (error.name === 'RenderingCancelledException' || error.message === "Rendering cancelled") {
        const cancelError = new Error("Rendering cancelled");
        cancelError.name = "RenderingCancelledException";
        throw cancelError;
      }
      console.error("Error rendering PDF page:", error);
      throw error;
    }
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch (e) { }
      }
    }
  };
}

/**
 * Concurrency limiter for thumbnail rendering.
 * Prevents overwhelming the PDF.js worker with too many simultaneous render tasks.
 */
class RenderQueue {
  private queue: Array<() => Promise<void>> = [];
  private running = 0;
  private readonly maxConcurrent: number;

  constructor(maxConcurrent = 6) {
    this.maxConcurrent = maxConcurrent;
  }

  add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        }
      });
      this.flush();
    });
  }

  private flush() {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.running++;
      task().finally(() => {
        this.running--;
        this.flush();
      });
    }
  }
}

export const thumbnailRenderQueue = new RenderQueue(6);


export async function getPdfPageCount(data: File | PdfDocument | Uint8Array | ArrayBuffer): Promise<number> {
  if (typeof data === 'object' && data !== null && 'numPages' in data) {
    return (data as PdfDocument).numPages;
  }

  try {
    const pdf = await loadPdfDocument(data as File | Uint8Array | ArrayBuffer);
    const numPages = pdf.numPages;
    pdf.destroy();
    return numPages;
  } catch (error) {
    console.error("Error getting PDF page count:", error);
    throw error;
  }
}

/**
 * Converts a Blob to a Base64 string.
 * Use sparingly and only when required by external APIs.
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Crops an image Blob based on normalized coordinates (0-1000).
 * box: [ymin, xmin, ymax, xmax]
 */
export async function cropImageFromBlob(blob: Blob, box: number[]): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      try {
        const [ymin, xmin, ymax, xmax] = box;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }

        const width = img.width;
        const height = img.height;

        const left = Math.max(0, (xmin / 1000) * width);
        const top = Math.max(0, (ymin / 1000) * height);
        const cropWidth = Math.min(width - left, ((xmax - xmin) / 1000) * width);
        const cropHeight = Math.min(height - top, ((ymax - ymin) / 1000) * height);

        if (cropWidth <= 0 || cropHeight <= 0) {
          reject(new Error("Invalid crop dimensions"));
          return;
        }

        canvas.width = cropWidth;
        canvas.height = cropHeight;

        ctx.drawImage(img, left, top, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

        canvas.toBlob((croppedBlob) => {
          URL.revokeObjectURL(url);
          if (croppedBlob) resolve(croppedBlob);
          else reject(new Error("Failed to create cropped blob"));
        }, 'image/webp', 0.9);
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image for cropping"));
    };
    img.src = url;
  });
}

/**
 * Slices a page image into multiple Blobs based on the detected layout regions.
 * Includes a small overlap to prevent cutting through text lines.
 */
export async function slicePageImage(
  blob: Blob,
  regions: any[] // LayoutRegion[]
): Promise<{ slices: Blob[]; labels: string[] }> {
  const slices: Blob[] = [];
  const labels: string[] = [];

  for (let i = 0; i < regions.length; i++) {
    const region = regions[i];
    
    // Add small overlap (2% of height) to avoid cutting mid-line
    const overlap = 0.02;
    const yStart = Math.max(0, region.yStart - (i > 0 ? overlap : 0));
    const yEnd = Math.min(1.0, region.yEnd + (i < regions.length - 1 ? overlap : 0));
    
    const xStart = region.xStart ?? 0;
    const xEnd = region.xEnd ?? 1.0;

    // Convert normalized 0-1 to 0-1000 for cropImageFromBlob
    const box = [
      yStart * 1000,
      xStart * 1000,
      yEnd * 1000,
      xEnd * 1000
    ];

    const cropped = await cropImageFromBlob(blob, box);
    slices.push(cropped);
    
    let label = region.type === 'full-width' ? 'Header/Footer' : `Column ${region.columnIndex + 1}`;
    labels.push(label);
  }

  return { slices, labels };
}
