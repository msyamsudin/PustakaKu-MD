import { useState, useEffect } from "react";
import { Settings as SettingsIcon, LayoutDashboard, BarChart3, BookOpenCheck, FlaskConical } from "lucide-react";
import { Settings } from "./components/Settings";
import { Extractor } from "./components/extractor/Extractor";
import { Statistics } from "./components/Statistics";
import { Benchmark } from "./components/Benchmark";
import { WindowControls } from "./components/WindowControls";
import { LogViewer } from "./components/extractor/LogViewer";

const NAV_ITEMS = [
  { key: "extract", label: "Extract", icon: LayoutDashboard },
  { key: "statistics", label: "Statistics", icon: BarChart3 },
  { key: "benchmark", label: "Benchmark", icon: FlaskConical },
  { key: "settings", label: "Settings", icon: SettingsIcon },
] as const;

function App() {
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem("pustakaku-active-tab") || "extract";
  });

  useEffect(() => {
    localStorage.setItem("pustakaku-active-tab", activeTab);
  }, [activeTab]);

  return (
    <div className="flex flex-col h-screen w-full bg-background text-foreground overflow-hidden font-sans">
      {/* Top Bar */}
      <header
        className="shrink-0 h-14 bg-card border-b border-border flex items-stretch"
        data-tauri-drag-region
      >
        {/* Logo Section */}
        <div className="flex items-center px-5 border-r border-border shrink-0 gap-3 group">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/15 text-primary transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
            <BookOpenCheck size={18} strokeWidth={2.5} />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-tight leading-none text-foreground">
              PustakaKu
            </span>
            <span className="text-[9px] font-bold text-muted-foreground tracking-widest uppercase mt-1">
              MD Focus
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex items-stretch flex-1 px-1" data-tauri-drag-region="false">
          {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`
                  relative flex items-center gap-2 px-4 text-sm font-medium
                  transition-colors duration-150 border-b-2
                  ${isActive
                    ? "text-primary border-primary bg-primary/5"
                    : "text-muted-foreground border-transparent hover:text-foreground hover:bg-secondary/60"
                  }
                `}
              >
                <Icon size={15} className="shrink-0" />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Window Controls */}
        <div className="flex items-center shrink-0 pl-2">
          <WindowControls />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-5 bg-background">
        {activeTab === "extract" && <Extractor />}
        {activeTab === "statistics" && <Statistics />}
        {activeTab === "benchmark" && <Benchmark />}
        {activeTab === "settings" && <Settings />}
      </main>

      {/* Global Log Viewer */}
      <LogViewer />
    </div>
  );
}

export default App;
