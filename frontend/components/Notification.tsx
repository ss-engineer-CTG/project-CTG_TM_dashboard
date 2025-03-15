'use client';

import React, { useEffect, useState } from 'react';
import { FiCheckCircle, FiAlertCircle } from 'react-icons/fi';

interface NotificationProps {
  message: string;
  type: 'success' | 'error';
}

export default function Notification({ message, type }: NotificationProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // 通知が表示されたら、3秒後に非表示にする
    const timer = setTimeout(() => {
      setIsVisible(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  if (!isVisible) return null;

  return (
    <div
      className={`notification ${
        type === 'success' ? 'notification-success' : 'notification-error'
      }`}
      style={{ opacity: isVisible ? 1 : 0 }}
    >
      <div className="flex items-center">
        {type === 'success' ? (
          <FiCheckCircle className="mr-2" />
        ) : (
          <FiAlertCircle className="mr-2" />
        )}
        {message}
      </div>
    </div>
  );
}