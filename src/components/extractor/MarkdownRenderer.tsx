import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { CodeBlock } from "./CodeBlock";

interface Props {
  markdown: string;
}

export function MarkdownRenderer({ markdown }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      urlTransform={(value) => {
        if (value.startsWith('data:image/')) return value;
        if (value.startsWith('blob:')) return value;
        const isSafe = /^(https?|mailto|tel):/i.test(value) || value.startsWith('#') || value.startsWith('/');
        return isSafe ? value : '';
      }}
      components={{
        img: ({ src, alt }) => {
          return (
            <span className="block my-6">
              <img 
                src={src} 
                alt={alt} 
                className="w-full h-auto max-h-[600px] object-contain rounded-lg border border-border shadow-sm" 
              />
              {alt && (
                <span className="mt-2 text-xs text-center text-muted-foreground block italic">
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
