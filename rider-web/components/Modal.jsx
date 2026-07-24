// Modal.jsx
'use client';

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export default function Modal({ onClose, children, position = 'center' }) {
  const isBottomRight = position === 'bottom-right';

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={`fixed inset-0 z-50 flex bg-black/80 backdrop-blur-sm ${isBottomRight ? 'items-end justify-end p-4 pb-24 pr-2 sm:pr-3 xl:pr-6' : 'items-center justify-center p-4'}`}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className={`relative ${isBottomRight ? 'max-w-sm w-full' : ''}`}
        >
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={onClose}
            aria-label="Close modal"
            className={`absolute p-2 text-white hover:bg-white/20 rounded-full transition-colors z-50 ${isBottomRight ? '-top-2 -right-2 bg-slate-800' : '-top-12 right-0'}`}
          >
            <X size={24} />
          </motion.button>
          {children}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}