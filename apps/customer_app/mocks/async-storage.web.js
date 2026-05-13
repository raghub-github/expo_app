'use strict';

const AsyncStorage = {
  getItem: (key) => Promise.resolve(localStorage.getItem(key)),
  setItem: (key, value) => { localStorage.setItem(key, String(value)); return Promise.resolve(null); },
  removeItem: (key) => { localStorage.removeItem(key); return Promise.resolve(null); },
  clear: () => { localStorage.clear(); return Promise.resolve(null); },
  getAllKeys: () => Promise.resolve(Object.keys(localStorage)),
  multiGet: (keys) => Promise.resolve(keys.map((k) => [k, localStorage.getItem(k)])),
  multiSet: (pairs) => { pairs.forEach(([k, v]) => localStorage.setItem(k, String(v))); return Promise.resolve(null); },
  multiRemove: (keys) => { keys.forEach((k) => localStorage.removeItem(k)); return Promise.resolve(null); },
  mergeItem: (key, value) => {
    const existing = localStorage.getItem(key);
    const next = existing
      ? JSON.stringify(Object.assign({}, JSON.parse(existing), JSON.parse(value)))
      : value;
    localStorage.setItem(key, next);
    return Promise.resolve(null);
  },
  flushGetRequests: () => {},
};

module.exports = AsyncStorage;
module.exports.default = AsyncStorage;
