import { writeTextFile, mkdir, writeFile } from "@tauri-apps/plugin-fs";
import { save, open } from "@tauri-apps/plugin-dialog";
import { renderPageFromDoc, cropImageFromBlob } from "../pdfUtils";
import { cacheDB, STORES } from "../cache";
import type { AppFile, PageCache } from "./types";

export interface ExportContext {
  file: AppFile;
  pageCache: PageCache;
  previewUrl: string | null;
  currentPdfPage: number;
  isPdf: boolean;
  pdfDoc: any;
}

export async function exportWithAssets(
  markdown: string,
  filePath: string,
  ctx: ExportContext
): Promise<void> {
  try {
    console.log(`[Export] Starting export to: ${filePath}`);

    // 1. Get base path and name
    const separator = filePath.includes("\\") ? "\\" : "/";
    const parts = filePath.split(separator);
    const fileName = parts.pop() || "";
    const baseDir = parts.join(separator);
    const baseName = fileName.replace(/\.[^/.]+$/, "");
    const assetsDirName = `${baseName}_assets`.replace(/\s+/g, "_");
    const assetsDirPath = `${baseDir}${separator}${assetsDirName}`;

    // 2. Identify all images (base64 AND crop references)
    const base64Regex = /!\[([^\]]*)\]\((data:image\/[^;]+;base64,([^)]+))\)/g;
    const cropRegex = /!\[([^\]]*)\]\(crop:(\d+):([^)]+)\)/g;

    const base64Matches = [...markdown.matchAll(base64Regex)];
    const cropMatches = [...markdown.matchAll(cropRegex)];

    console.log(
      `[Export] Found ${base64Matches.length} base64 images and ${cropMatches.length} crop references`
    );

    if (base64Matches.length === 0 && cropMatches.length === 0) {
      console.log("[Export] No assets found, saving markdown directly");
      await writeTextFile(filePath, markdown);
      return;
    }

    // 3. Create assets folder
    try {
      console.log(`[Export] Creating assets directory: ${assetsDirPath}`);
      await mkdir(assetsDirPath, { recursive: true });
    } catch (e) {
      console.warn("[Export] Assets directory might already exist", e);
    }

    let processedMarkdown = markdown;
    let assetCount = 1;

    // Handle base64 images
    for (const match of base64Matches) {
      try {
        const [fullMatch, alt, dataUrl, base64Content] = match;
        const extension = dataUrl.split(";")[0].split("/")[1] || "jpg";
        const assetFileName = `image_${assetCount}.${extension}`;
        const assetPath = `${assetsDirPath}${separator}${assetFileName}`;

        console.log(`[Export] Writing base64 image ${assetCount} to ${assetFileName}`);

        const binaryString = atob(base64Content.replace(/\s/g, ""));
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        await writeFile(assetPath, bytes);
        const relativePath = `./${assetsDirName}/${assetFileName}`;
        processedMarkdown = processedMarkdown.replace(
          fullMatch,
          `![${alt}](${relativePath})`
        );
        assetCount++;
      } catch (e) {
        console.error(`[Export] Failed to export base64 image ${assetCount}`, e);
      }
    }

    // Handle crop references
    for (const match of cropMatches) {
      const [fullMatch, alt, pageNumStr, coordsStr] = match;
      try {
        const pageNum = parseInt(pageNumStr);
        const coords = coordsStr.split(",").map((s) => parseFloat(s.trim()));

        console.log(`[Export] Processing crop for page ${pageNum}: ${coordsStr}`);

        let blob: Blob | null = null;

        // Priority 1: Check current preview if page matches
        if (pageNum === ctx.currentPdfPage && ctx.previewUrl) {
          console.log("[Export] Using current previewUrl for crop source");
          if (ctx.previewUrl.startsWith("blob:")) {
            blob = await fetch(ctx.previewUrl).then((r) => r.blob());
          } else if (ctx.previewUrl.startsWith("data:")) {
            const res = await fetch(ctx.previewUrl);
            blob = await res.blob();
          }
        }

        // Priority 2: Check pageCache
        if (!blob && ctx.pageCache[pageNum]) {
          console.log(`[Export] Using pageCache for page ${pageNum}`);
          blob = await fetch(ctx.pageCache[pageNum]).then((r) => r.blob());
        }

        // Priority 3: Check persistent cacheDB
        if (!blob) {
          console.log(`[Export] Fetching page ${pageNum} from cacheDB`);
          const stored = await cacheDB.get(STORES.PAGE_RENDERS, {
            path: ctx.file.path,
            pageNum,
          });
          if (stored instanceof Blob) blob = stored;
        }

        // Priority 4: Render on-demand (Fallback if missing from all caches)
        if (!blob && ctx.isPdf && ctx.pdfDoc) {
          console.log(
            `[Export] Page ${pageNum} missing from cache, rendering on-demand...`
          );
          try {
            const renderTask = renderPageFromDoc(ctx.pdfDoc, pageNum);
            blob = await renderTask.promise;
            if (ctx.file) {
              cacheDB.set(
                STORES.PAGE_RENDERS,
                { path: ctx.file.path, pageNum },
                blob
              );
            }
          } catch (renderError) {
            console.error(
              `[Export] Failed to render page ${pageNum} on-demand`,
              renderError
            );
          }
        }

        if (blob) {
          const croppedBlob = await cropImageFromBlob(blob, coords);
          const bytes = new Uint8Array(await croppedBlob.arrayBuffer());

          const assetFileName = `crop_p${pageNum}_${assetCount}.jpg`;
          const assetPath = `${assetsDirPath}${separator}${assetFileName}`;

          console.log(`[Export] Writing cropped image to ${assetFileName}`);
          await writeFile(assetPath, bytes);

          const relativePath = `./${assetsDirName}/${assetFileName}`;
          processedMarkdown = processedMarkdown.replace(
            fullMatch,
            `![${alt}](${relativePath})`
          );
          assetCount++;
        } else {
          console.warn(
            `[Export] Source blob for page ${pageNum} not found. Skipping crop.`
          );
        }
      } catch (e) {
        console.error(
          `[Export] Failed to export crop reference for page ${pageNumStr}`,
          e
        );
      }
    }

    // 4. Save the final markdown
    console.log("[Export] Writing final markdown file");
    await writeTextFile(filePath, processedMarkdown);
  } catch (e) {
    console.error("[Export] Export with assets failed", e);
    throw e;
  }
}

export async function saveSinglePage(
  markdown: string,
  file: AppFile,
  currentPage: number,
  ctx: ExportContext
): Promise<void> {
  const defaultPath = `${file.name.replace(/\.[^/.]+$/, "")}_page${currentPage}.md`;
  const filePath = await save({
    defaultPath,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });

  if (filePath) {
    await exportWithAssets(markdown, filePath, ctx);
  }
}

export async function batchDownload(
  markdownCache: Record<number, string>,
  file: AppFile,
  ctx: ExportContext
): Promise<void> {
  if (!file || Object.keys(markdownCache).length === 0) return;

  const selectedDir = await open({
    directory: true,
    multiple: false,
    title: "Select Folder to Save All Markdown Files",
  });

  if (!selectedDir || typeof selectedDir !== "string") return;

  const baseName = file.name.replace(/\.[^/.]+$/, "");
  const separator = selectedDir.includes("\\") ? "\\" : "/";
  let savedCount = 0;

  for (const [pageNum, content] of Object.entries(markdownCache)) {
    if (!content) continue;
    const fileName = `${baseName}_page${pageNum}.md`;
    const fullPath = `${selectedDir}${
      selectedDir.endsWith(separator) ? "" : separator
    }${fileName}`;
    await exportWithAssets(content, fullPath, ctx);
    savedCount++;
  }

  alert(`Successfully saved ${savedCount} files to: ${selectedDir}`);
}

export async function downloadCombined(
  markdownCache: Record<number, string>,
  file: AppFile,
  ctx: ExportContext
): Promise<void> {
  if (!file || Object.keys(markdownCache).length === 0) return;

  const sortedPages = Object.keys(markdownCache)
    .map(Number)
    .sort((a, b) => a - b);

  let combined = `# ${file.name}\n\n`;
  for (const pageNum of sortedPages) {
    const content = markdownCache[pageNum];
    if (content) {
      combined += `## Page ${pageNum}\n\n${content}\n\n---\n\n`;
    }
  }

  const defaultPath = `${file.name.replace(/\.[^/.]+$/, "")}_full.md`;
  const filePath = await save({
    defaultPath,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });

  if (filePath) {
    await exportWithAssets(combined, filePath, ctx);
  }
}
