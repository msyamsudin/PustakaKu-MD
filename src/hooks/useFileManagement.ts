import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { loadPdfDocument } from "../lib/pdfUtils";
import { cacheDB, STORES } from "../lib/cache";
import type { AppFile, AppConfig, PageCache, MarkdownCacheMap } from "../lib/utils/types";
import type { PDFDocumentProxy } from "pdfjs-dist";

interface LoadFileResult {
  pdfDoc: PDFDocumentProxy | null;
  pageCount: number;
  savedPages: PageCache;
  savedThumbs: PageCache;
  savedExtractions: MarkdownCacheMap;
  validPage: number;
  isPdfFile: boolean;
  previewBlobUrl?: string; // for non-PDF images
}

export function useFileManagement() {
  const [file, setFile] = useState<AppFile | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Load config from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("pustakaku-settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.provider && parsed.selectedModel) {
          setConfig(parsed);
        }
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    }
  }, []);

  const loadFile = async (
    path: string,
    page: number = 1,
    _initialMarkdown: string = "",
    isRestoration: boolean = false
  ): Promise<LoadFileResult | null> => {
    const fileName = path.split(/[/\\]/).pop() || "unknown";
    try {
      const isPdfFile = path.toLowerCase().endsWith(".pdf");
      const fileData = await readFile(path);

      setFile({ name: fileName, path });
      setErrorMsg(null);

      // Load persistent caches (convert stored Blobs to Blob URLs)
      // Note: We don't load PAGE_RENDERS here to avoid massive memory usage.
      // They are loaded on-demand in usePdfRenderer.
      const [savedThumbsRaw, savedExtractions] = await Promise.all([
        cacheDB.getAllForFile(STORES.THUMBNAILS, path),
        cacheDB.getAllForFile(STORES.EXTRACTIONS, path),
      ]);

      const savedThumbs: PageCache = {};
      Object.entries(savedThumbsRaw).forEach(([pageNum, val]) => {
        if (val instanceof Blob) savedThumbs[Number(pageNum)] = URL.createObjectURL(val);
      });

      if (!isPdfFile) {
        setIsPdf(false);
        const blob = new Blob([fileData]);
        const blobUrl = URL.createObjectURL(blob);
        return {
          pdfDoc: null,
          pageCount: 1,
          savedPages: { 1: blobUrl },
          savedThumbs,
          savedExtractions: savedExtractions as MarkdownCacheMap,
          validPage: 1,
          isPdfFile: false,
          previewBlobUrl: blobUrl,
        };
      } else {
        setIsPdf(true);
        const doc = await loadPdfDocument(fileData);
        const validPage = Math.min(Math.max(1, page), doc.numPages);
        return {
          pdfDoc: doc,
          pageCount: doc.numPages,
          savedPages: {}, // Will be populated on-demand
          savedThumbs,
          savedExtractions: savedExtractions as MarkdownCacheMap,
          validPage,
          isPdfFile: true,
        };
      }
    } catch (e) {
      console.error("Failed to load file", e);
      setErrorMsg(
        `Failed to load file: ${fileName}. It may have been moved, deleted, or permission was denied.`
      );
      if (!isRestoration) {
        localStorage.removeItem("pustakaku-last-doc");
      }
      return null;
    }
  };

  const handleFileOpen = async (): Promise<{ path: string } | null> => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          { name: "Documents", extensions: ["pdf", "png", "jpg", "jpeg", "webp"] },
        ],
      });
      if (selected && typeof selected === "string") {
        return { path: selected };
      }
    } catch (e) {
      console.error("Error opening file", e);
      setErrorMsg("Failed to open file dialog.");
    }
    return null;
  };

  return {
    file,
    setFile,
    isPdf,
    setIsPdf,
    config,
    setConfig,
    errorMsg,
    setErrorMsg,
    isInitialLoad,
    setIsInitialLoad,
    loadFile,
    handleFileOpen,
  };
}
