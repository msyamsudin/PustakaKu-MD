import { useState, memo } from "react";
import { Copy, Check } from "lucide-react";

export const CodeBlock = memo(function CodeBlock({
  children, className
}: {
  children: any,
  className?: string
}) {
  const [copied, setCopied] = useState(false);
  const code = String(children).replace(/\n$/, '');
  const language = className ? className.replace(/language-/, '') : '';

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code", err);
    }
  };

  return (
    <div className="relative group/code-block">
      <div className="absolute top-3 right-3 flex items-center gap-2 opacity-0 group-hover/code-block:opacity-100 transition-opacity z-10">
        {language && (
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 bg-secondary/50 px-2 py-0.5 rounded border border-border">
            {language}
          </span>
        )}
        <button
          onClick={onCopy}
          className="p-1.5 bg-secondary/80 hover:bg-primary/20 text-muted-foreground hover:text-primary rounded border border-border transition-all shadow-sm"
          title="Copy Code"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <pre className={className}>
        <code className={className}>
          {children}
        </code>
      </pre>
    </div>
  );
});
