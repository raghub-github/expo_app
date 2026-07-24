'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Modal from './Modal';

export default function BookingModal({ isOpen, onClose }) {
  const [formData, setFormData] = useState({
    pickupLocation: '',
    dropoffLocation: '',
    serviceType: 'food',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Booking submitted:', formData);
    alert('Booking request submitted! Our riders will connect with you shortly.');
    setFormData({ pickupLocation: '', dropoffLocation: '', serviceType: 'food' });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <Modal onClose={onClose}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 md:p-8 max-w-md w-full">
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
              Book Your Delivery
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Service Type */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Service Type
                </label>
                <select
                  value={formData.serviceType}
                  onChange={(e) =>
                    setFormData({ ...formData, serviceType: e.target.value })
                  }
                  className="input-floating"
                >
                  <option value="food">Food Delivery</option>
                  <option value="parcel">Parcel Delivery</option>
                  <option value="ride">Person / Ride</option>
                </select>
              </div>

              {/* Pickup Location */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Pickup Location
                </label>
                <input
                  type="text"
                  placeholder="Enter pickup address"
                  value={formData.pickupLocation}
                  onChange={(e) =>
                    setFormData({ ...formData, pickupLocation: e.target.value })
                  }
                  className="input-floating"
                  required
                />
              </div>

              {/* Dropoff Location */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Drop-off Location
                </label>
                <input
                  type="text"
                  placeholder="Enter delivery address"
                  value={formData.dropoffLocation}
                  onChange={(e) =>
                    setFormData({ ...formData, dropoffLocation: e.target.value })
                  }
                  className="input-floating"
                  required
                />
              </div>

              {/* Submit Button */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                className="w-full btn-primary mt-6"
              >
                Confirm Booking
              </motion.button>
            </form>

            <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-4">
              Our riders will be assigned within 2 minutes
            </p>
          </div>
        </Modal>
      )}
    </AnimatePresence>
  );
}
