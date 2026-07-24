'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Modal from './Modal';

export default function TrackingModal({ isOpen, onClose }) {
  const [orderId, setOrderId] = useState('');
  const [trackingData, setTrackingData] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    // Simulate tracking data
    setTrackingData({
      orderId,
      status: 'On the way',
      riderName: 'Rahul Kumar',
      riderRating: 4.8,
      eta: '8 minutes',
      location: 'Approaching your location',
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <Modal onClose={onClose} position="bottom-right">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 md:p-8 max-w-md w-full">
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
              Track Your Order
            </h3>

            {!trackingData ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Order ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., GM-123456"
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value)}
                    className="input-floating"
                    required
                  />
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  className="w-full btn-primary mt-6"
                >
                  Track Order
                </motion.button>
              </form>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                {/* Order Status */}
                <div className="bg-gradient-brand-reverse bg-opacity-10 rounded-xl p-4">
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Order Status</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {trackingData.status}
                  </p>
                </div>

                {/* Rider Info */}
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Your Rider
                  </p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">
                        {trackingData.riderName}
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        ⭐ {trackingData.riderRating}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-red-600 dark:text-orange-400 text-lg">
                        {trackingData.eta}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">ETA</p>
                    </div>
                  </div>
                </div>

                {/* Location */}
                <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-4">
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Current Location</p>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {trackingData.location}
                  </p>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setTrackingData(null);
                    setOrderId('');
                  }}
                  className="w-full btn-secondary mt-4 text-sm"
                >
                  Track Another Order
                </motion.button>
              </motion.div>
            )}
          </div>
        </Modal>
      )}
    </AnimatePresence>
  );
}
