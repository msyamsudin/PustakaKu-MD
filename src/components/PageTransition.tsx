import React, { useEffect, useState } from "react";

interface PageTransitionProps {
  children: React.ReactNode;
  isTransitioning: boolean;
}

export function PageTransition({ children, isTransitioning }: PageTransitionProps) {
  const [displayChildren, setDisplayChildren] = useState(children);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isTransitioning) {
      setIsAnimating(true);
    } else {
      // Small delay after transitioning stops to ensure smooth fade in
      const timer = setTimeout(() => {
        setIsAnimating(false);
        setDisplayChildren(children);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isTransitioning, children]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Top Loading Bar */}
      <div 
        className={`
          absolute top-0 left-0 h-0.5 bg-primary z-50 transition-all duration-500 ease-out
          ${isTransitioning ? "w-full opacity-100" : "w-0 opacity-0"}
        `}
      />

      {/* Main Content Area */}
      <div 
        className={`
          w-full h-full transition-all duration-300 ease-in-out
          ${isAnimating ? "opacity-40 scale-[0.99] blur-[2px]" : "opacity-100 scale-100 blur-0"}
        `}
      >
        {isTransitioning ? displayChildren : children}
      </div>

      {/* Center Spinner/Logo Overlay */}
      {isTransitioning && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/20 backdrop-blur-[1px] z-40 animate-in fade-in duration-300">
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 border-2 border-primary/20 rounded-full"></div>
              <div className="absolute inset-0 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
            <span className="text-xs font-medium tracking-[0.2em] text-primary uppercase animate-pulse">
              Loading
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
