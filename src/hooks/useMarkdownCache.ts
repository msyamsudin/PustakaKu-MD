import { useState, useEffect, useRef } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { cacheDB, STORES } from "../lib/cache";
import type { AppFile, MarkdownCacheMap } from "../lib/utils/types";

export function useMarkdownCache(file: AppFile | null) {
  const [markdown, setMarkdown] = useState("");
  const [markdownCache, setMarkdownCache] = useState<MarkdownCacheMap>({});
  const [selectedMarkdownPages, setSelectedMarkdownPages] = useState<Set<number>>(new Set());
  const markdownCacheRef = useRef<MarkdownCacheMap>({});

  // Keep ref in sync to avoid stale closures in callbacks
  useEffect(() => {
    markdownCacheRef.current = markdownCache;
  }, [markdownCache]);

  const handleClearMarkdown = async (currentPage: number) => {
    if (
      markdown &&
      (await ask("Clear current markdown result?", {
        title: "Confirm Clear",
        kind: "warning",
      }))
    ) {
      setMarkdown("");
      setMarkdownCache((prev) => {
        const next = { ...prev };
        delete next[currentPage];
        return next;
      });
      if (file) {
        cacheDB.delete(STORES.EXTRACTIONS, { path: file.path, pageNum: currentPage });
      }
    }
  };

  const handleDeleteMarkdownPage = async (pageNum: number, currentPage: number) => {
    if (
      !(await ask(`Delete markdown extraction for page ${pageNum}?`, {
        title: "Confirm Delete",
        kind: "warning",
      }))
    )
      return;

    setMarkdownCache((prev) => {
      const next = { ...prev };
      delete next[pageNum];
      return next;
    });

    if (file) {
      await cacheDB.delete(STORES.EXTRACTIONS, { path: file.path, pageNum });
    }

    if (pageNum === currentPage) {
      setMarkdown("");
    }

    setSelectedMarkdownPages((prev) => {
      const next = new Set(prev);
      next.delete(pageNum);
      return next;
    });
  };

  const handleBatchDeleteMarkdown = async (currentPage: number) => {
    const pagesToDelete = Array.from(selectedMarkdownPages);
    if (pagesToDelete.length === 0) return;

    if (
      !(await ask(
        `Delete markdown extraction for ${pagesToDelete.length} selected pages?`,
        { title: "Confirm Batch Delete", kind: "warning" }
      ))
    )
      return;

    setMarkdownCache((prev) => {
      const next = { ...prev };
      pagesToDelete.forEach((p) => delete next[p]);
      return next;
    });

    if (file) {
      await Promise.all(
        pagesToDelete.map((p) =>
          cacheDB.delete(STORES.EXTRACTIONS, { path: file.path, pageNum: p })
        )
      );
    }

    if (pagesToDelete.includes(currentPage)) {
      setMarkdown("");
    }

    setSelectedMarkdownPages(new Set());
  };

  const handleBatchCopyMarkdown = async () => {
    const pagesToCopy = Array.from(selectedMarkdownPages).sort((a, b) => a - b);
    if (pagesToCopy.length === 0) return;

    try {
      let combined = "";
      for (const pageNum of pagesToCopy) {
        const content = markdownCache[pageNum];
        if (content) {
          combined += `## Page ${pageNum}\n\n${content}\n\n---\n\n`;
        }
      }
      await navigator.clipboard.writeText(combined);
      alert(`Markdown from ${pagesToCopy.length} pages copied to clipboard!`);
    } catch (err) {
      console.error("Failed to copy!", err);
    }
  };

  return {
    markdown,
    setMarkdown,
    markdownCache,
    setMarkdownCache,
    markdownCacheRef,
    selectedMarkdownPages,
    setSelectedMarkdownPages,
    handleClearMarkdown,
    handleDeleteMarkdownPage,
    handleBatchDeleteMarkdown,
    handleBatchCopyMarkdown,
  };
}
