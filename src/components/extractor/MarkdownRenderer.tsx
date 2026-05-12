import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { BarChart3 } from "lucide-react";
import { CodeBlock } from "./CodeBlock";
import { CroppedImage } from "../CroppedImage";
import type { PageCache } from "../../lib/utils/types";

interface Props {
  markdown: string;
  pageCache: PageCache;
}

export function MarkdownRenderer({ markdown, pageCache }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      urlTransform={(value) => {
        if (value.startsWith('data:image/')) return value;
        if (value.startsWith('blob:')) return value;
        if (value.startsWith('crop:')) return value;
        const isSafe = /^(https?|mailto|tel):/i.test(value) || value.startsWith('#') || value.startsWith('/');
        return isSafe ? value : '';
      }}
      components={{
        img: ({ src, alt }) => {
          const isExtracted = src?.startsWith('data:image');
          const isCropRef = src?.startsWith('crop:');
          const isPlaceholder = src === 'graphic-placeholder' || src === 'placeholder';

          if (isExtracted || isCropRef || isPlaceholder) {
            return (
              <span className="my-6 p-4 bg-secondary/30 rounded-lg border border-primary/20 flex flex-col gap-3 group/graphic transition-all hover:bg-secondary/40">
                <span className="flex items-center gap-2.5 text-primary">
                  <span className="p-1.5 bg-primary/10 rounded">
                    <BarChart3 size={18} />
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-[0.15em]">
                    {(isExtracted || isCropRef) ? "Extracted Graphic" : "Visual Analysis"}
                  </span>
                </span>
                
                {isCropRef && (
                  <CroppedImage src={src!} alt={alt || ""} pageCache={pageCache} />
                )}

                {isExtracted && (
                  <span className="rounded-lg overflow-hidden border border-border bg-white/5 p-1 flex">
                    <img 
                      src={src} 
                      alt={alt} 
                      className="w-full h-auto max-h-[500px] object-contain rounded shadow-sm" 
                    />
                  </span>
                )}
                
                {alt && (
                  <span className="text-xs font-medium text-muted-foreground leading-relaxed italic border-l-2 border-primary/30 pl-3 block">
                    {alt}
                  </span>
                )}
              </span>
            );
          }
          
          // Unprocessed / Failed Image Fallback
          return (
            <span className="my-6 p-4 bg-destructive/10 rounded-lg border border-destructive/30 flex flex-col gap-3 transition-all">
              <span className="flex items-center gap-2.5 text-destructive">
                <span className="text-[11px] font-bold uppercase tracking-[0.15em]">
                  Missing Coordinates
                </span>
              </span>
              <span className="text-xs text-muted-foreground mb-1 block">
                The AI model identified an image but failed to provide its bounding box coordinates.
              </span>
              <span className="text-xs font-mono break-all text-muted-foreground bg-black/20 p-2 rounded block">
                AI Output: ![{alt || 'image'}]({src || ' '})
              </span>
              {alt && (
                <span className="text-xs font-medium text-muted-foreground leading-relaxed italic border-l-2 border-destructive/30 pl-3 block">
                  {alt}
                </span>
              )}
            </span>
          );
        },
        pre: ({ node, ...props }) => <pre className="my-6 overflow-hidden rounded-xl border border-border shadow-sm" {...props} />,
        code: ({ node, inline, className, children, ...props }: any) => {
          return !inline ? (
            <CodeBlock className={className}>{children}</CodeBlock>
          ) : (
            <code className="bg-secondary/50 px-1.5 py-0.5 rounded text-[0.9em] font-mono text-primary border border-primary/10" {...props}>
              {children}
            </code>
          );
        }
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}
