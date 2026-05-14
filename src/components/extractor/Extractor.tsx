import { useState, useEffect } from "react";
import { TopBar } from "./TopBar";
import { PreviewPane } from "./PreviewPane";
import { ResultPane } from "./ResultPane";
import { BatchOverlay } from "./BatchOverlay";
import { saveSinglePage, batchDownload, downloadCombined } from "../../lib/utils/export";
import { useFileManagement } from "../../hooks/useFileManagement";
import { usePdfRenderer } from "../../hooks/usePdfRenderer";
import { useMarkdownCache } from "../../hooks/useMarkdownCache";
import { useExtraction } from "../../hooks/useExtraction";

export function Extractor() {
  // UI-only state
  const [isCopied, setIsCopied] = useState(false);
  const [showPageGrid, setShowPageGrid] = useState(false);
  const [showMarkdownGrid, setShowMarkdownGrid] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Custom hooks
  const fileMgmt = useFileManagement();
  const pdf = usePdfRenderer(fileMgmt.file, fileMgmt.isPdf);
  const mdCache = useMarkdownCache(fileMgmt.file);
  const extraction = useExtraction({
    file: fileMgmt.file,
    previewUrl: pdf.previewUrl,
    currentPdfPage: pdf.currentPdfPage,
    markdown: mdCache.markdown,
    config: fileMgmt.config,
    pdfDoc: pdf.pdfDoc,
    pageCache: pdf.pageCache,
    thumbCache: pdf.thumbCache,
    setMarkdown: mdCache.setMarkdown,
    setMarkdownCache: mdCache.setMarkdownCache,
    setPageCache: pdf.setPageCache,
    setCurrentPdfPage: pdf.setCurrentPdfPage,
    setErrorMsg: fileMgmt.setErrorMsg,
  });

  // Destructure for convenience
  const { file, isPdf, config, errorMsg, setFile, setErrorMsg, handleFileOpen: openFile, loadFile } = fileMgmt;
  const {
    pdfDoc, setPdfDoc, pdfPageCount, setPdfPageCount,
    currentPdfPage, setCurrentPdfPage,
    previewUrl, setPreviewUrl,
    pageCache, setPageCache, thumbCache, setThumbCache,
    isRenderingPage, handlePageChange
  } = pdf;
  const {
    markdown, setMarkdown, markdownCache, setMarkdownCache, markdownCacheRef,
    selectedMarkdownPages, setSelectedMarkdownPages,
    handleClearMarkdown, handleDeleteMarkdownPage,
    handleBatchDeleteMarkdown, handleBatchCopyMarkdown,
  } = mdCache;
  const {
    isExtracting, isPageExtracting, isStreaming, usage, setUsage, cost, setCost, extractDuration, setExtractDuration,
    isBatchProcessing, batchProgress, selectedPages, setSelectedPages,
    handleExtract, handleBatchExtract, handleCancel,
    togglePageSelection, selectAllPages, selectUnextractedPages,
  } = extraction;

  // Restore last document on mount
  useEffect(() => {
    const restoreState = async () => {
      const lastState = localStorage.getItem("pustakaku-last-doc");
      if (lastState) {
        try {
          const state = JSON.parse(lastState);
          if (state.path) {
            const result = await loadFile(state.path, state.page || 1, state.markdown || "", true);
            if (result) {
              if (result.pdfDoc) {
                setPdfDoc(result.pdfDoc);
                setPdfPageCount(result.pageCount);
                setCurrentPdfPage(result.validPage);
              }
              setPageCache(result.savedPages);
              setThumbCache(result.savedThumbs);
              setMarkdownCache(prev => ({ ...prev, ...result.savedExtractions }));
              if (result.previewBlobUrl) setPreviewUrl(result.previewBlobUrl);
              setMarkdown(result.savedExtractions[result.validPage] || state.markdown || "");
            }
          }
        } catch (e) { console.error("Failed to restore document state", e); }
      }
      setIsInitialLoad(false);
    };
    restoreState();
  }, []);

  // Persist state on relevant changes
  useEffect(() => {
    if (isInitialLoad || !file) return;
    try {
      localStorage.setItem("pustakaku-last-doc", JSON.stringify({
        path: file.path, name: file.name, page: currentPdfPage, markdown,
      }));
    } catch (e) { console.warn("Failed to save state", e); }
  }, [file, currentPdfPage, markdown, isInitialLoad]);

  // --- Handlers ---

  const handleFileOpen = async () => {
    const selected = await openFile();
    if (!selected) return;
    const result = await loadFile(selected.path);
    if (result) {
      if (pdfDoc) pdfDoc.destroy();
      if (result.pdfDoc) {
        setPdfDoc(result.pdfDoc);
        setPdfPageCount(result.pageCount);
        setCurrentPdfPage(result.validPage);
      } else {
        setPdfDoc(null);
        setPdfPageCount(0);
        setCurrentPdfPage(1);
      }
      setPageCache(result.savedPages);
      setThumbCache(result.savedThumbs);
      setMarkdownCache({ ...result.savedExtractions });
      if (result.previewBlobUrl) setPreviewUrl(result.previewBlobUrl);
      setMarkdown(result.savedExtractions[result.validPage] || "");
      setUsage(null);
      setCost(null);
      setExtractDuration(null);
      setSelectedPages(new Set());
      setShowPageGrid(false);
    }
  };

  const handleCloseDocument = () => {
    Object.values(pageCache).forEach(url => URL.revokeObjectURL(url));
    Object.values(thumbCache).forEach(url => URL.revokeObjectURL(url));
    setFile(null);
    setPreviewUrl(null);
    setMarkdown("");
    setPageCache({});
    setThumbCache({});
    setMarkdownCache({});
    setPdfPageCount(0);
    setCurrentPdfPage(1);
    setErrorMsg(null);
    setUsage(null);
    setCost(null);
    setExtractDuration(null);
    setSelectedPages(new Set());
    setShowPageGrid(false);
    localStorage.removeItem("pustakaku-last-doc");
  };

  const handlePageClick = (pageNum: number) => {
    setMarkdownCache(prev => ({ ...prev, [currentPdfPage]: markdown }));
    setCurrentPdfPage(pageNum);
    setMarkdown(markdownCacheRef.current[pageNum] || "");
  };

  const handleCopy = async () => {
    if (!markdown) return;
    try {
      setIsCopied(true);
      await navigator.clipboard.writeText(markdown);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) { console.error("Failed to copy!", err); }
  };

  const getExportCtx = () => ({
    file: file!,
    pageCache,
    previewUrl: previewUrl,
    currentPdfPage,
    isPdf: isPdf,
    pdfDoc: pdfDoc,
  });

  return (
    <div className="h-full flex flex-col gap-3">
      <TopBar
        file={file}
        config={config}
        previewUrl={previewUrl}
        markdown={markdown}
        markdownCacheCount={Object.keys(markdownCache).length}
        isExtracting={isExtracting}
        isCopied={isCopied}
        showPageGrid={showPageGrid}
        showMarkdownGrid={showMarkdownGrid}
        selectedPagesCount={selectedPages.size}
        usage={usage}
        cost={cost}
        extractDuration={extractDuration}
        onFileOpen={handleFileOpen}
        onCloseDocument={handleCloseDocument}
        onExtract={handleExtract}
        onCopy={handleCopy}
        onSave={() => saveSinglePage(markdown, file!, currentPdfPage, getExportCtx())}
        onBatchDownload={() => batchDownload(markdownCache, file!, getExportCtx())}
        onDownloadCombined={() => downloadCombined(markdownCache, file!, getExportCtx())}
        onToggleBatchMode={() => {
          const next = !showPageGrid;
          setShowPageGrid(next);
          setShowMarkdownGrid(next);
          if (next) selectUnextractedPages(pdfPageCount, markdownCache);
        }}
      />

      {errorMsg && (
        <div className="bg-destructive/10 text-destructive border border-destructive/20 p-2.5 rounded-md text-xs font-medium">
          {errorMsg}
        </div>
      )}

      <div className="flex-1 flex gap-3 min-h-0">
        <PreviewPane
          file={file}
          isPdf={isPdf}
          pdfDoc={pdfDoc}
          pdfPageCount={pdfPageCount}
          currentPdfPage={currentPdfPage}
          previewUrl={previewUrl}
          thumbCache={thumbCache}
          setThumbCache={setThumbCache}
          markdownCache={markdownCache}
          selectedPages={selectedPages}
          showPageGrid={showPageGrid}
          isRenderingPage={isRenderingPage}
          onPageChange={(delta) => handlePageChange(delta, markdown, setMarkdown, markdownCacheRef, setMarkdownCache)}
          onToggleGrid={setShowPageGrid}
          onSelectAll={() => selectAllPages(pdfPageCount)}
          onSelectUnextracted={() => selectUnextractedPages(pdfPageCount, markdownCache)}
          onClearSelection={() => setSelectedPages(new Set())}
          onTogglePageSelection={togglePageSelection}
          onBatchExtract={handleBatchExtract}
          onPageClick={handlePageClick}
        />

        <ResultPane
          markdown={markdown}
          markdownCache={markdownCache}
          currentPdfPage={currentPdfPage}
          pdfPageCount={pdfPageCount}
          isPdf={isPdf}
          pageCache={pageCache}
          isExtracting={isPageExtracting}
          isStreaming={isStreaming}
          showMarkdownGrid={showMarkdownGrid}
          selectedMarkdownPages={selectedMarkdownPages}
          onToggleGrid={setShowMarkdownGrid}
          onSelectMarkdownPage={(pageNum) => setSelectedMarkdownPages(prev => {
            const next = new Set(prev);
            if (next.has(pageNum)) next.delete(pageNum);
            else next.add(pageNum);
            return next;
          })}
          onSelectAll={() => setSelectedMarkdownPages(new Set(Object.keys(markdownCache).map(Number)))}
          onSelectNone={() => setSelectedMarkdownPages(new Set())}
          onBatchCopy={handleBatchCopyMarkdown}
          onBatchDelete={() => handleBatchDeleteMarkdown(currentPdfPage)}
          onDeletePage={(pageNum) => handleDeleteMarkdownPage(pageNum, currentPdfPage)}
          onPageClick={handlePageClick}
          onClearMarkdown={() => handleClearMarkdown(currentPdfPage)}
        />
      </div>

      {isBatchProcessing && (
        <BatchOverlay
          progress={batchProgress}
          isExtracting={isPageExtracting}
          isStreaming={isStreaming}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
