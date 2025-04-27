import React, { useEffect } from 'react';
import { useNotification } from '../contexts/NotificationContext';

const Notification: React.FC = () => {
  const { notifications, removeNotification } = useNotification();
  
  useEffect(() => {
    // 通知の自動削除処理
    const cleanup = notifications.map(notification => {
      if (notification.duration) {
        const timer = setTimeout(() => {
          removeNotification(notification.id);
        }, notification.duration);
        return () => clearTimeout(timer);
      }
      return () => {};
    });
    
    return () => {
      cleanup.forEach(fn => fn());
    };
  }, [notifications, removeNotification]);
  
  if (notifications.length === 0) return null;
  
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {notifications.map(notification => (
        <div 
          key={notification.id}
          className={`notification notification-${notification.type} flex items-center`}
        >
          <span className="mr-3">{notification.message}</span>
          <button 
            onClick={() => removeNotification(notification.id)}
            className="text-white hover:text-gray-200 focus:outline-none"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};

export default Notification;