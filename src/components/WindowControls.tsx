import { useState, useEffect } from "react";
import { Minus, Square, X, Copy } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const appWindow = getCurrentWindow();

export function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const updateState = async () => {
      const maximized = await appWindow.isMaximized();
      setIsMaximized(maximized);
    };

    // Initial check
    updateState();

    // Listen for resize events to update maximized state
    const unlisten = appWindow.onResized(() => {
      updateState();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleMinimize = () => appWindow.minimize();
  
  const handleToggleMaximize = async () => {
    await appWindow.toggleMaximize();
    // State will be updated by the listener
  };

  const handleClose = () => appWindow.close();

  return (
    <div className="flex items-center h-full" data-tauri-no-drag>
      <button
        onClick={handleMinimize}
        className="h-12 w-10 flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        title="Minimize"
      >
        <Minus size={16} />
      </button>

      <button
        onClick={handleToggleMaximize}
        className="h-12 w-10 flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        title={isMaximized ? "Restore" : "Maximize"}
      >
        {isMaximized ? <Copy size={12} className="rotate-90" /> : <Square size={12} />}
      </button>

      <button
        onClick={handleClose}
        className="h-12 w-12 flex items-center justify-center text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors"
        title="Close"
      >
        <X size={18} />
      </button>
    </div>
  );
}
