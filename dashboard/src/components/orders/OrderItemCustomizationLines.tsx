'use client';

type Props = {
  customizations?: string[] | null;
  className?: string;
};

/** Linked customization / add-on lines shown under a parent order item. */
export function OrderItemCustomizationLines({ customizations, className = '' }: Props) {
  if (!customizations?.length) return null;
  return (
    <ul
      className={`mt-1 ml-5 space-y-0.5 border-l-2 border-teal-300/80 pl-2.5 ${className}`}
      aria-label="Customizations for this item"
    >
      {customizations.map((line, i) => (
        <li key={i} className="text-[11px] leading-snug text-gray-600">
          <span className="mr-1 font-medium text-teal-700" aria-hidden>
            ↳
          </span>
          {line}
        </li>
      ))}
    </ul>
  );
}
