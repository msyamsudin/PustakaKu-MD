export type LogLevel = "info" | "warn" | "error" | "success" | "debug";

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
  details?: any;
}

type LogListener = (entry: LogEntry) => void;

class Logger {
  private listeners: LogListener[] = [];
  private logs: LogEntry[] = [];
  private maxLogs = 500;

  subscribe(listener: LogListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private addLog(level: LogLevel, message: string, details?: any) {
    const entry: LogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date(),
      level,
      message,
      details,
    };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    this.listeners.forEach((l) => l(entry));
    
    // Also log to console for debugging
    const colors = {
      info: '#3b82f6',
      warn: '#f59e0b',
      error: '#ef4444',
      success: '#10b981',
      debug: '#6b7280'
    };
    console.log(`%c[${level.toUpperCase()}] ${message}`, `color: ${colors[level]}; font-weight: bold;`, details || '');
  }

  info(message: string, details?: any) { this.addLog("info", message, details); }
  warn(message: string, details?: any) { this.addLog("warn", message, details); }
  error(message: string, details?: any) { this.addLog("error", message, details); }
  success(message: string, details?: any) { this.addLog("success", message, details); }
  debug(message: string, details?: any) { this.addLog("debug", message, details); }

  getLogs() { return [...this.logs]; }
  clear() { 
    this.logs = []; 
    // Usually we'd want to notify listeners that logs were cleared
    // but for now we just clear the internal array.
  }
}

export const logger = new Logger();
