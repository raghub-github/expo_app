import React from "react";

export default function SearchBar({
  value,
  onChange,
  onKeyDown,
  onSubmit,
  loading,
  compact = false
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSubmit: (e?: React.FormEvent) => void;
  loading: boolean;
  compact?: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className={`flex gap-2 mx-auto w-full ${compact ? 'max-w-md' : 'max-w-lg'}`}>
      <input
        type="text"
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder="Search by Rider ID or Phone..."
        className={`flex-1 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${compact ? 'px-3 py-1 text-sm' : 'px-4 py-2'}`}
        style={compact ? {height: '36px', minWidth: '180px', maxWidth: '320px'} : {}}
      />
      <button
        type="submit"
        disabled={loading}
        className={`rounded-lg font-medium ${compact ? 'px-3 py-1 text-sm' : 'px-4 py-2'} bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50`}
        style={compact ? {height: '36px'} : {}}
      >
        {loading ? 'Searching...' : 'Search'}
      </button>
    </form>
  );
}
