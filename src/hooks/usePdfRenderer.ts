import { useState, useEffect, useRef } from "react";
import { renderPageFromDoc } from "../lib/pdfUtils";
import { cacheDB, STORES } from "../lib/cache";
import type { AppFile, PageCache } from "../lib/utils/types";
import type { PDFDocumentProxy } from "pdfjs-dist";

export function usePdfRenderer(file: AppFile | null, isPdf: boolean) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [currentPdfPage, setCurrentPdfPage] = useState(1);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pageCache, setPageCache] = useState<PageCache>({});
  const [thumbCache, setThumbCache] = useState<PageCache>({});
  const [isRenderingPage, setIsRenderingPage] = useState(false);
  const renderRef = useRef<{ cancel: () => void } | null>(null);

  // Cleanup PDF document on unmount
  useEffect(() => {
    return () => {
      if (pdfDoc) pdfDoc.destroy();
    };
  }, [pdfDoc]);

  // Render page when currentPdfPage or pdfDoc changes
  useEffect(() => {
    if (!pdfDoc || !isPdf) return;

    const render = async () => {
      // Check memory cache first
      if (pageCache[currentPdfPage]) {
        setPreviewUrl(pageCache[currentPdfPage]);
        return;
      }

      // Check persistent cache (IndexedDB)
      if (file) {
        try {
          const cachedBlob = await cacheDB.get(STORES.PAGE_RENDERS, { path: file.path, pageNum: currentPdfPage });
          if (cachedBlob instanceof Blob) {
            const blobUrl = URL.createObjectURL(cachedBlob);
            setPageCache(prev => ({ ...prev, [currentPdfPage]: blobUrl }));
            setPreviewUrl(blobUrl);
            return;
          }
        } catch (e) {
          console.warn("Cache check failed", e);
        }
      }

      // Cancel previous render if any
      if (renderRef.current) {
        renderRef.current.cancel();
      }

      try {
        setIsRenderingPage(true);

        const renderTask = renderPageFromDoc(pdfDoc, currentPdfPage);
        renderRef.current = renderTask;

        const result = await renderTask.promise;
        const blobUrl = URL.createObjectURL(result.blob);

        setPageCache((prev) => {
          const next = { ...prev, [currentPdfPage]: blobUrl };
          if (file) {
            cacheDB.set(STORES.PAGE_RENDERS, { path: file.path, pageNum: currentPdfPage }, result.blob);
          }
          return next;
        });
        setPreviewUrl(blobUrl);
      } catch (e: any) {
        if (e.name === "RenderingCancelledException") {
          console.log(`Rendering page ${currentPdfPage} cancelled (expected)`);
        } else {
          console.error("Failed to render PDF page", e);
        }
      } finally {
        setIsRenderingPage(false);
        renderRef.current = null;
      }
    };

    render();

    return () => {
      if (renderRef.current) {
        renderRef.current.cancel();
      }
    };
  }, [pdfDoc, currentPdfPage, isPdf]);

  const handlePageChange = (
    delta: number,
    markdown: string,
    setMarkdown: (val: string) => void,
    markdownCacheRef: React.MutableRefObject<Record<number, string>>,
    setMarkdownCache: (fn: (prev: Record<number, string>) => Record<number, string>) => void
  ) => {
    if (!pdfDoc || !isPdf) return;
    const newPage = currentPdfPage + delta;
    if (newPage >= 1 && newPage <= pdfPageCount) {
      setMarkdownCache((prev) => ({ ...prev, [currentPdfPage]: markdown }));
      setCurrentPdfPage(newPage);
      setMarkdown(markdownCacheRef.current[newPage] || "");
    }
  };

  return {
    pdfDoc,
    setPdfDoc,
    pdfPageCount,
    setPdfPageCount,
    currentPdfPage,
    setCurrentPdfPage,
    previewUrl,
    setPreviewUrl,
    pageCache,
    setPageCache,
    thumbCache,
    setThumbCache,
    isRenderingPage,
    renderRef,
    handlePageChange,
  };
}
