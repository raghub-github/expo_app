"use client";

import React, { useState, useEffect } from 'react';
import { X, AlertCircle, CheckCircle, Info } from 'lucide-react';

export const useToast = () => {
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'info', duration = 4000) => {
    const id = Date.now();
    const newToast = { id, message, type };
    
    setToasts(prev => [...prev, newToast]);
    
    if (duration) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
    
    return id;
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const success = (message, duration = 4000) => addToast(message, 'success', duration);
  const error = (message, duration = 5000) => addToast(message, 'error', duration);
  const info = (message, duration = 4000) => addToast(message, 'info', duration);
  const warning = (message, duration = 4000) => addToast(message, 'warning', duration);

  return { toasts, addToast, removeToast, success, error, info, warning };
};

export const ToastContainer = ({ toasts, removeToast }) => {
  const handleRemove = (id) => {
    removeToast(id);
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9999] space-y-3 max-w-sm">
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          toast={toast}
          onClose={() => handleRemove(toast.id)}
        />
      ))}
    </div>
  );
};

const Toast = ({ toast, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 4000);
    
    return () => clearTimeout(timer);
  }, [onClose]);

  const getStyles = () => {
    switch (toast.type) {
      case 'success':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          icon: <CheckCircle className="w-5 h-5 text-green-600" />,
          textColor: 'text-green-800',
          iconBg: 'bg-green-100'
        };
      case 'error':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          icon: <AlertCircle className="w-5 h-5 text-red-600" />,
          textColor: 'text-red-800',
          iconBg: 'bg-red-100'
        };
      case 'warning':
        return {
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          icon: <AlertCircle className="w-5 h-5 text-yellow-600" />,
          textColor: 'text-yellow-800',
          iconBg: 'bg-yellow-100'
        };
      default:
        return {
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          icon: <Info className="w-5 h-5 text-blue-600" />,
          textColor: 'text-blue-800',
          iconBg: 'bg-blue-100'
        };
    }
  };

  const styles = getStyles();

  return (
    <div
      className={`${styles.bg} border ${styles.border} rounded-lg p-4 shadow-lg animate-in slide-in-from-right duration-300 flex items-start gap-3`}
      role="alert"
    >
      <div className={`${styles.iconBg} rounded-full p-2 flex-shrink-0 mt-0.5`}>
        {styles.icon}
      </div>
      <div className="flex-1">
        <p className={`font-medium ${styles.textColor}`}>{toast.message}</p>
      </div>
      <button
        onClick={onClose}
        className={`flex-shrink-0 p-1 rounded hover:bg-white/50 transition-colors`}
      >
        <X className="w-4 h-4 text-gray-500" />
      </button>
    </div>
  );
};

export default Toast;
