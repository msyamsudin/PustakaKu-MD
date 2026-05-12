import { useState, useEffect, memo } from "react";
import { cropImageFromBlob } from "../lib/pdfUtils";

interface CroppedImageProps {
  src: string;
  alt: string;
  pageCache: Record<number, string>;
  className?: string;
}

export const CroppedImage = memo(function CroppedImage({ 
  src, alt, pageCache, className = "" 
}: CroppedImageProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let croppedUrl: string | null = null;

    const process = async () => {
      try {
        const parts = src.split(':');
        if (parts.length < 3) return;
        
        const pageNum = parseInt(parts[1]);
        const coords = parts[2].split(',').map(parseFloat);
        const blobUrl = pageCache[pageNum];
        
        if (blobUrl && coords.length >= 4) {
          const blob = await fetch(blobUrl).then(r => r.blob());
          const croppedBlob = await cropImageFromBlob(blob, coords);
          if (isMounted) {
            croppedUrl = URL.createObjectURL(croppedBlob);
            setUrl(croppedUrl);
          }
        } else {
          if (isMounted) setError(true);
        }
      } catch (e) {
        console.error("Failed to render dynamic crop", e);
        if (isMounted) setError(true);
      }
    };
    process();
    return () => { 
      isMounted = false; 
      if (croppedUrl) URL.revokeObjectURL(croppedUrl);
    };
  }, [src, pageCache]);

  if (error) return (
    <span className="p-3 bg-destructive/5 border border-destructive/20 rounded-lg text-[10px] text-destructive italic block">
      Reference to page image missing or invalid coordinates.
    </span>
  );
  
  if (!url) return (
    <span className="w-full h-32 bg-secondary/10 animate-pulse rounded-lg flex items-center justify-center">
      <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </span>
  );
  
  return (
    <span className={`rounded-lg overflow-hidden border border-border bg-white/5 p-1 flex ${className}`}>
      <img 
        src={url} 
        alt={alt} 
        className="w-full h-auto max-h-[500px] object-contain rounded shadow-sm" 
      />
    </span>
  );
});
