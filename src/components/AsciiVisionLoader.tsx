import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

const mdSymbols = [
  "#", "##", "**", "> ", "- ", "```", "[ ]", "---", "1.", "||", "~~", "MD"
];

const statuses = [
  "Opening document…",
  "Reading pages…",
  "Extracting content…",
  "Formatting markdown…",
];

export function AsciiVisionLoader() {
  const [phase, setPhase] = useState(0);

  // Cycle phases every 2400ms: 0 -> 1 -> 2 -> 3 -> 0 ...
  useEffect(() => {
    const t = setInterval(() => {
      setPhase((p) => (p + 1) % 4);
    }, 2400);
    return () => clearInterval(t);
  }, []);

  // Generate dynamic float particles
  const particles = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => ({
      id: i,
      char: mdSymbols[i % mdSymbols.length],
      left: 10 + (i * 7) % 80, // Distribute horizontally
      delay: i * 0.15,
      duration: 1.8 + (i * 0.1) % 1.2,
      size: 9 + (i % 5),
      isRuby: i % 4 === 0, // A few ruby-colored accent particles
    }));
  }, []);

  // Spring transition config for satisfying paper-like feels
  const springTransition = {
    type: "spring" as const,
    stiffness: 70,
    damping: 15,
    mass: 1.2
  };

  return (
    <div className="loader-root">
      {/* ── 3D Origami Stage ── */}
      <div className="origami-container">
        {/* Dynamic Glow Underneath */}
        <motion.div 
          className="origami-glow animate-pulse-glow"
          animate={{
            background: phase === 2 
              ? "hsl(var(--accent) / 0.25)" 
              : "hsl(var(--primary) / 0.15)",
          }}
          transition={{ duration: 0.8 }}
        />

        {/* 3D Isometric Viewport */}
        <motion.div 
          className="origami-stage"
          animate={{
            scale: phase === 0 ? 0.85 : phase === 1 ? 1.05 : phase === 2 ? 1.0 : 0.95,
            rotateX: 35,
            rotateZ: phase === 2 ? -28 : -22,
          }}
          transition={springTransition}
        >
          {/* Base Sheet (Middle Panel) */}
          <motion.div 
            className="origami-base"
            animate={{
              borderColor: phase === 2 ? "hsl(var(--accent) / 0.4)" : "hsl(var(--primary) / 0.4)",
            }}
            transition={{ duration: 0.5 }}
          >
            {/* Base lines representing structured text */}
            <div className="origami-lines">
              <div className="origami-line origami-line--heading" />
              <div className="origami-line w-[85%]" />
              <div className="origami-line w-[70%]" />
              <div className="origami-line origami-line--accent w-[40%]" />
              <div className="origami-line w-[60%]" />
              <div className="origami-line w-[80%]" />
            </div>

            {/* Scanning Laser Line (only sweeping during phase 2) */}
            <AnimatePresence>
              {phase === 2 && (
                <motion.div 
                  className="origami-scanline"
                  initial={{ top: "-10%", opacity: 0 }}
                  animate={{ 
                    top: ["0%", "100%", "0%"], 
                    opacity: [0.8, 1, 0.8] 
                  }}
                  exit={{ opacity: 0 }}
                  transition={{ 
                    duration: 2.2, 
                    ease: "easeInOut",
                    repeat: Infinity 
                  }}
                />
              )}
            </AnimatePresence>
          </motion.div>

          {/* Left Folding Flap */}
          <motion.div
            className="origami-flap origami-flap--left"
            style={{ originX: 1 }}
            animate={{
              rotateY: phase === 0 ? 175 : phase === 3 ? 35 : 0,
              opacity: phase === 0 ? 0.15 : 1,
            }}
            transition={springTransition}
          >
            <div className="origami-lines">
              {/* Monospace ASCII style layout lines */}
              <div className="origami-line origami-line--heading w-[50%]" />
              <div className="origami-line w-[80%] opacity-70" />
              <div className="origami-line w-[65%] opacity-70" />
              <div className="origami-line w-[75%] opacity-70" />
              <div className="origami-line origami-line--accent w-[30%]" />
            </div>
          </motion.div>

          {/* Right Folding Flap */}
          <motion.div
            className="origami-flap origami-flap--right"
            style={{ originX: 0 }}
            animate={{
              rotateY: phase === 0 ? -175 : phase === 3 ? -35 : 0,
              opacity: phase === 0 ? 0.15 : 1,
            }}
            transition={springTransition}
          >
            <div className="origami-lines">
              <div className="origami-line w-[75%] opacity-70" />
              <div className="origami-line origami-line--heading w-[40%]" />
              <div className="origami-line w-[85%] opacity-70" />
              <div className="origami-line w-[60%] opacity-70" />
              <div className="origami-line origami-line--accent w-[50%]" />
            </div>
          </motion.div>
        </motion.div>

        {/* Floating ASCII / Markdown Particles */}
        <AnimatePresence>
          {phase === 2 && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
              {particles.map((p) => (
                <motion.span
                  key={p.id}
                  className={`origami-particle ${p.isRuby ? "origami-particle--ruby" : ""}`}
                  style={{
                    left: `${p.left}%`,
                    fontSize: `${p.size}px`,
                  }}
                  initial={{ y: 120, x: 0, opacity: 0, scale: 0.6 }}
                  animate={{
                    y: [120, -40],
                    x: [0, (p.id % 2 === 0 ? 25 : -25) * Math.sin(p.id)],
                    opacity: [0, 0.9, 0.4, 0],
                    scale: [0.6, 1.1, 0.8],
                  }}
                  transition={{
                    duration: p.duration,
                    delay: p.delay,
                    ease: "easeOut",
                    repeat: Infinity,
                  }}
                >
                  {p.char}
                </motion.span>
              ))}
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Status Text Panel ── */}
      <div className="loader-status">
        <span className="loader-title">AI Vision Scanning</span>
        
        {/* Soft fading typewriter feel for subtitles */}
        <AnimatePresence mode="wait">
          <motion.span 
            key={phase}
            className="loader-subtitle"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.25 }}
          >
            {statuses[phase]}
          </motion.span>
        </AnimatePresence>

        {/* Bouncing Dots indicator */}
        <div className="loader-dots">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="loader-dot"
              animate={{
                y: [0, -6, 0],
                backgroundColor: phase === 2 
                  ? "hsl(var(--accent))" 
                  : "hsl(var(--primary))",
              }}
              transition={{
                duration: 1.0,
                repeat: Infinity,
                delay: i * 0.15,
                ease: "easeInOut"
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
