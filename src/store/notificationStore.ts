// Notification Store — manages toast notifications across the app
import { create } from 'zustand';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  timestamp: number;
  autoDismiss?: boolean; // if true, dismiss after timeout (default: true)
}

interface NotificationState {
  notifications: Notification[];
  
  // Actions
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  dismissAll: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  
  addNotification: (notification) => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    set((s) => ({ 
      notifications: [...s.notifications, { ...notification, id, timestamp: Date.now() }]
    }));
    
    // Auto-dismiss after 5 seconds if autoDismiss is true (or undefined = default)
    if (notification.autoDismiss !== false) {
      setTimeout(() => {
        get().removeNotification(id);
      }, 5000);
    }
  },
  
  removeNotification: (id) => {
    set((s) => ({ 
      notifications: s.notifications.filter(n => n.id !== id)
    }));
  },
  
  dismissAll: () => {
    set({ notifications: [] });
  },
}));

// ─── Convenience functions for common notification types ──────────────

export function addMCPReconnectSuccess(serverName: string): void {
  useNotificationStore.getState().addNotification({
    type: 'success',
    message: `MCP server "${serverName}" reconnected`,
    autoDismiss: true,
  });
}

export function addMCPReconnectError(serverName: string): void {
  useNotificationStore.getState().addNotification({
    type: 'error',
    message: `Failed to reconnect MCP server "${serverName}"`,
    autoDismiss: false, // Don't auto-dismiss errors — user should see them
  });
}

export function addContextCompressionSuccess(count: number): void {
  useNotificationStore.getState().addNotification({
    type: 'info',
    message: `Context compressed: ${count} summary(s) created`,
    autoDismiss: true,
  });
}

export function addModelLoadSuccess(modelName: string): void {
  useNotificationStore.getState().addNotification({
    type: 'success',
    message: `"${modelName}" loaded successfully`,
    autoDismiss: true,
  });
}

export function addEngineUpdateAvailable(version: string): void {
  useNotificationStore.getState().addNotification({
    type: 'info',
    message: `New engine version ${version} available`,
    autoDismiss: false, // User should see this and act on it
  });
}