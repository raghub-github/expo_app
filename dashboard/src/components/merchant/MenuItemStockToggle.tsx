"use client";

type MenuItemStockToggleProps = {
  inStock: boolean;
  disabled?: boolean;
  onToggle: () => void;
};

/** Toggle switch for menu stock — button-based to avoid accidental form submit / page navigation. */
export function MenuItemStockToggle({ inStock, disabled, onToggle }: MenuItemStockToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={inStock}
      aria-label={inStock ? "Mark out of stock" : "Mark in stock"}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (disabled) return;
        onToggle();
      }}
      className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
        inStock ? "border-green-600 bg-green-500" : "border-gray-300 bg-gray-200"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
          inStock ? "translate-x-3" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
