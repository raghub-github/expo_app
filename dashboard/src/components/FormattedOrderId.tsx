'use client';

export function FormattedOrderId({
  formattedOrderId,
  fallbackOrderId,
  size = 'base',
}: {
  formattedOrderId?: string | null;
  fallbackOrderId: number;
  size?: 'sm' | 'base' | 'lg';
}) {
  const sizeClasses = {
    sm: { base: 'text-xs', sizes: ['0.625rem', '0.7rem', '0.775rem', '0.85rem'] },
    base: { base: 'text-base', sizes: ['0.875rem', '1rem', '1.125rem', '1.25rem'] },
    lg: { base: 'text-lg', sizes: ['1rem', '1.125rem', '1.25rem', '1.375rem'] },
  };
  const classes = sizeClasses[size];

  if (formattedOrderId) {
    const prefix = formattedOrderId.slice(0, -4);
    const lastFour = formattedOrderId.slice(-4);
    return (
      <span className="inline-flex items-baseline gap-0.5">
        <span className={`font-bold text-gray-900 ${classes.base}`}>{prefix}</span>
        {lastFour.split('').map((digit, idx) => (
          <span
            key={idx}
            className="font-bold text-orange-600"
            style={{ fontSize: classes.sizes[idx] }}
          >
            {digit}
          </span>
        ))}
      </span>
    );
  }

  return <span className={`font-bold text-gray-900 ${classes.base}`}>#{fallbackOrderId}</span>;
}
