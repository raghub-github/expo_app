'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, MapPin, X, ExternalLink } from 'lucide-react';

const WHATSAPP_CHANNEL_URL = 'https://whatsapp.com/channel/0029VbBydzu3mFY8rdcgfc1U';
const TELEGRAM_URL = 'https://t.me/gatimitra';

export default function FloatingActions({ onTrackClick }) {
  const [isGroupsOpen, setIsGroupsOpen] = useState(false);

  return (
    <>
      <div className="flex fixed bottom-4 right-2 sm:right-3 xl:right-6 z-40 flex-col gap-2">
        {/* Join Groups / WhatsApp & Telegram Button → opens Join Our Groups modal */}
        <motion.button
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsGroupsOpen(true)}
          className="relative group"
          aria-label="Join WhatsApp & Telegram"
          title="Join Our Groups"
        >
          <motion.div
            animate={{ scale: [1, 1.12, 1] }}
            transition={{ duration: 2.5, repeat: Infinity }}
            className="absolute inset-0 bg-green-500 rounded-full opacity-40 blur-lg"
          />
          <div className="relative w-9 h-9 rounded-full bg-gradient-to-br from-green-600 to-emerald-500 shadow-md shadow-green-500/40 flex items-center justify-center text-white transition-all group-hover:shadow-lg">
            <MessageSquare className="w-4 h-4" />
          </div>
          <span className="absolute right-full mr-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">Join Our Groups</span>
        </motion.button>

        {/* Track Order Button → opens Track Order modal */}
        <motion.button
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={onTrackClick}
          className="relative group"
          aria-label="Track order"
          title="Track Your Order"
        >
          <motion.div
            animate={{ scale: [1, 1.12, 1] }}
            transition={{ duration: 2.5, repeat: Infinity }}
            className="absolute inset-0 bg-blue-500 rounded-full opacity-40 blur-lg"
          />
          <div className="relative w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 shadow-md shadow-blue-500/40 flex items-center justify-center text-white transition-all group-hover:shadow-lg">
            <MapPin className="w-4 h-4" />
          </div>
          <span className="absolute right-full mr-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">Track Order</span>
        </motion.button>

        {/* Tooltip */}
        <motion.div
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="text-[10px] text-slate-400 text-right pr-1 pointer-events-none font-medium leading-3"
        >
          <p>Quick</p>
          <p>Actions</p>
        </motion.div>
      </div>

      {/* Join Our Groups Popup - beside floating buttons (bottom-right) */}
      <AnimatePresence>
        {isGroupsOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsGroupsOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
            />
            <div className="fixed bottom-20 right-2 sm:right-3 xl:right-6 z-[61] w-full max-w-sm pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 8 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto"
              >
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-green-500/30 to-emerald-500/30 border border-green-500/50 flex items-center justify-center">
                      <MessageSquare className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">Join Our Groups</h3>
                      <p className="text-[10px] text-slate-500">from WhatsApp & Telegram button</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsGroupsOpen(false)}
                    className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-sm text-slate-400 mb-5">
                  Stay updated with offers, service updates, rider opportunities & exclusive deals. Join our community!
                </p>

                <div className="space-y-3">
                  <a
                    href={WHATSAPP_CHANNEL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-4 p-4 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-green-500/50 transition-all group"
                  >
                    <div className="w-12 h-12 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                      <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white">WhatsApp Channel</p>
                      <p className="text-xs text-slate-400">Official updates from GatiMitra On-Demand Services Pvt. Ltd. 🚀</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  </a>

                  <a
                    href={TELEGRAM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-4 p-4 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-blue-500/50 transition-all group"
                  >
                    <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                      <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white">Telegram</p>
                      <p className="text-xs text-slate-400">Real-time offers, service updates & community</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  </a>
                </div>

                <p className="text-xs text-slate-500 mt-4 text-center">
                  Join any or all to stay connected!
                </p>
              </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
