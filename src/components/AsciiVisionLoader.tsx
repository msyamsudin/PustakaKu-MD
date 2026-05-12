import { useState, useEffect, useMemo } from "react";

const mdSymbols = [
  "#", "##", "**", "> ", "- ", "```", "[ ]", "---", "1.", "***", "||", "~~",
];

export function AsciiVisionLoader() {
  const [flipPhase, setFlipPhase] = useState(0);
  const [statusIdx, setStatusIdx] = useState(0);

  const statuses = [
    "Opening document…",
    "Reading pages…",
    "Extracting content…",
    "Formatting markdown…",
  ];

  // Floating markdown character particles
  const particles = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        char: mdSymbols[i % mdSymbols.length],
        left: 12 + Math.random() * 76,
        delay: (i * 0.35) % 3.5,
        duration: 2.2 + Math.random() * 1.4,
        size: 9 + Math.floor(Math.random() * 4),
      })),
    [],
  );

  // Cycle page flip phase: 0 → 1 → 2 → 3 → 0 …
  useEffect(() => {
    const t = setInterval(() => setFlipPhase((p) => (p + 1) % 4), 1100);
    return () => clearInterval(t);
  }, []);

  // Cycle status text
  useEffect(() => {
    const t = setInterval(
      () => setStatusIdx((p) => (p + 1) % statuses.length),
      2500,
    );
    return () => clearInterval(t);
  }, []);

  return (
    <div className="loader-root">
      {/* ── Book + floating chars ── */}
      <div className="loader-scene">
        {/* Floating markdown characters */}
        {particles.map((p) => (
          <span
            key={p.id}
            className="loader-particle"
            style={{
              left: `${p.left}%`,
              fontSize: `${p.size}px`,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
            }}
          >
            {p.char}
          </span>
        ))}

        {/* Book wrapper (3‑D perspective) */}
        <div className="loader-book-anchor">
          <div className="loader-book">
            {/* Back cover */}
            <div className="loader-cover loader-cover--back" />

            {/* Flipping pages */}
            {[0, 1, 2].map((i) => {
              const isFlipped = flipPhase > i;
              return (
                <div
                  key={i}
                  className="loader-page"
                  style={{
                    transform: `rotateY(${isFlipped ? -155 : 0}deg)`,
                    transitionDelay: `${i * 0.07}s`,
                    zIndex: isFlipped ? 10 + i : 5 - i,
                    boxShadow: isFlipped
                      ? "-2px 1px 6px rgba(0,0,0,0.12)"
                      : "1px 1px 3px rgba(0,0,0,0.06)",
                  }}
                >
                  {/* Fake text lines inside page */}
                  <div className="loader-page-lines">
                    {Array.from({ length: 7 }, (_, j) => (
                      <div
                        key={j}
                        className={`loader-line ${j === 0 ? "loader-line--heading" : ""}`}
                        style={{
                          width: `${j === 0 ? 42 : 52 + ((j * 19) % 42)}%`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Front cover */}
            <div className="loader-cover loader-cover--front">
              <span className="loader-cover-icon">📖</span>
              <span className="loader-cover-label">MD</span>
            </div>

            {/* Spine */}
            <div className="loader-spine" />

            {/* Glow underneath */}
            <div className="loader-glow" />
          </div>
        </div>
      </div>

      {/* ── Status text ── */}
      <div className="loader-status">
        <span className="loader-title">AI Vision Scanning</span>
        <span key={statusIdx} className="loader-subtitle">
          {statuses[statusIdx]}
        </span>
        <div className="loader-dots">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="loader-dot"
              style={{ animationDelay: `${-0.3 + i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
