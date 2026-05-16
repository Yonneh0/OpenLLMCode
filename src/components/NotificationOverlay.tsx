// Notification Overlay — displays toast notifications at bottom-right of screen
import React from 'react';
import { useNotificationStore, type Notification } from '../store/notificationStore';

const NOTIFICATION_STYLES: Record<Notification['type'], { bg: string; border: string; icon: string }> = {
  success: { bg: 'bg-green-900/30', border: 'border-green-700/40', icon: '✅' },
  error: { bg: 'bg-red-900/30', border: 'border-red-700/40', icon: '❌' },
  warning: { bg: 'bg-yellow-900/30', border: 'border-yellow-700/40', icon: '⚠️' },
  info: { bg: 'bg-blue-900/30', border: 'border-blue-700/40', icon: 'ℹ️' },
};

export function NotificationOverlay() {
  const notifications = useNotificationStore((s) => s.notifications);
  const removeNotification = useNotificationStore((s) => s.removeNotification);
  
  if (notifications.length === 0) return null;
  
  // Show only the last 3 notifications to avoid cluttering the UI
  const visibleNotifications = notifications.slice(-3);
  
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {visibleNotifications.map((notif) => (
        <NotificationItem key={notif.id} notification={notif} onDismiss={() => removeNotification(notif.id)} />
      ))}
    </div>
  );
}

function NotificationItem({ notification, onDismiss }: { notification: Notification; onDismiss: () => void }) {
  const styles = NOTIFICATION_STYLES[notification.type];
  
  // Calculate remaining time for auto-dismiss
  const elapsed = Date.now() - notification.timestamp;
  const duration = notification.autoDismiss !== false ? 5000 : Infinity;
  const remainingMs = Math.max(0, duration - elapsed);
  
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-xl backdrop-blur-sm ${styles.bg} ${styles.border}`}>
      {/* Icon */}
      <span className="text-base flex-shrink-0">{styles.icon}</span>
      
      {/* Message — truncated to one line */}
      <p className="flex-1 text-xs truncate">{notification.message}</p>
      
      {/* Dismiss button (only for non-auto-dismiss notifications) */}
      {notification.autoDismiss !== false && remainingMs > 0 && (
        <button 
          onClick={onDismiss}
          className="text-[#a6adc8] hover:text-white transition text-xs flex-shrink-0"
        >
          ✕
        </button>
      )}
      
      {/* Progress bar for auto-dismiss */}
      {notification.autoDismiss !== false && (
        <div className="absolute bottom-0 left-0 h-[2px] bg-white/30 rounded-b-lg" style={{ width: `${(remainingMs / duration) * 100}%` }} />
      )}
    </div>
  );
}