// App Update Dialog — displays a modal when an app-level update is available (P3-C)
import React, { useState } from 'react';
import { checkForAppUpdates, appVersion as currentVersion } from '../engine/manager';

interface AppUpdateDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AppUpdateDialog({ isOpen, onClose }: AppUpdateDialogProps) {
  const [updateInfo, setUpdateInfo] = useState<{ available: boolean; version: string; notes?: string } | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  // Check for updates when the dialog opens
  React.useEffect(() => {
    if (isOpen) {
      checkForUpdates();
    }
  }, [isOpen]);

  async function checkForUpdates(): Promise<void> {
    setIsChecking(true);
    try {
      const result = await checkForAppUpdates();
      setUpdateInfo(result);
    } catch {
      // Check failed — don't show anything
      setUpdateInfo(null);
    } finally {
      setIsChecking(false);
    }
  }

  if (!isOpen) return null;

  const hasUpdate = updateInfo?.available === true;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={onClose}>
      <div 
        className="w-[480px] rounded-lg border border-[#45475a] shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#1e1e2e] px-6 py-4 border-b border-[#45475a] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#cdd6f4]">
            {hasUpdate ? '🚀 Update Available' : 'App Updates'}
          </h3>
          <button onClick={onClose} className="px-2 py-1 rounded hover:bg-[#313244] transition">✕</button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {isChecking ? (
            <div className="flex items-center gap-2 text-sm text-[#a6adc8] opacity-70">
              <span className="animate-pulse-slow">●</span>
              Checking for updates...
            </div>
          ) : hasUpdate ? (
            <>
              {/* Update available */}
              <div className="p-3 rounded bg-green-900/20 border border-green-700/40 text-sm text-green-300">
                New version {updateInfo?.version} is available!
              </div>

              {/* Version comparison */}
              <div className="text-xs text-[#a6adc8] space-y-1">
                <p>Current: v{currentVersion}</p>
                <p>New:     v{updateInfo?.version}</p>
              </div>

              {/* Release notes (truncated) */}
              {updateInfo?.notes && (
                <details className="text-xs text-[#a6adc8]">
                  <summary className="cursor-pointer hover:text-white transition">View release notes</summary>
                  <pre className="mt-2 bg-[#181825] border border-[#45475a] rounded px-3 py-2 whitespace-pre-wrap max-h-40 overflow-y-auto">{updateInfo.notes}</pre>
                </details>
              )}

              {/* Install button */}
              <p className="text-xs text-[#f9e2af]">
                Download the update installer from GitHub. Run it after closing OpenLLMCode.
              </p>
            </>
          ) : (
            <>
              {/* Already up to date or check failed */}
              <div className="text-sm text-[#a6adc8] opacity-70">
                {updateInfo === null 
                  ? 'Unable to check for updates right now. Try again later.'
                  : 'You are running the latest version of OpenLLMCode.'
                }
              </div>

              {/* Manual check button */}
              <button 
                onClick={checkForUpdates}
                className="px-3 py-1.5 rounded text-xs bg-[#cba6f7] hover:bg-[#b4befe] text-black font-semibold transition"
              >
                Check Again
              </button>
            </>
          )}

          {/* Current version */}
          <p className="text-xs text-[#a6adc8] opacity-50">
            OpenLLMCode v{currentVersion}
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#181825]/60 border-t border-[#45475a] flex justify-end gap-2">
          <button 
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs hover:bg-[#313244] transition"
          >
            Close
          </button>
        </div>

        {/* Inline styles for custom animations */}
        <style>{`
          @keyframes pulse-slow {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
          }
          .animate-pulse-slow { animation: pulse-slow 2s ease-in-out infinite; }
        `}</style>
      </div>
    </div>
  );
}

/** Hook to auto-check for updates periodically and notify when available */
export function useAutoAppUpdateCheck(): void {
  // Check every hour — same interval as manager.ts APP_UPDATE_CHECK_INTERVAL_MS
  React.useEffect(() => {
    const checkInterval = setInterval(async () => {
      try {
        const result = await checkForAppUpdates();
        
        if (result?.available) {
          // Show notification about available update via the global notification store
          try {
            const notificationStore = await import('../store/notificationStore');
            notificationStore.addEngineUpdateAvailable(result.version);
          } catch {}
        }
      } catch {
        // Silently ignore — will check again in next interval
      }
    }, 3600 * 1000); // Check every hour
    
    return () => clearInterval(checkInterval);
  }, []);
}