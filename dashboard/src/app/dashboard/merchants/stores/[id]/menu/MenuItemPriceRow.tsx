import {
  menuItemBasePrice,
  menuItemDiscountPercent,
  menuItemSellingPrice,
  menuItemShowStrikePrice,
  type MenuItemPriceFields,
} from "./menu-types";

type Props = {
  item: MenuItemPriceFields;
  className?: string;
  showBadge?: boolean;
};

/** Menu card/list price — base MRP strike-through when higher than selling price. */
export function MenuItemPriceRow({ item, className = "", showBadge = true }: Props) {
  const base = menuItemBasePrice(item);
  const selling = menuItemSellingPrice(item);
  const showStrike = menuItemShowStrikePrice(item);
  const discount = menuItemDiscountPercent(item);

  if (!showStrike) {
    return (
      <span className={`text-sm font-bold text-orange-600 ${className}`.trim()}>
        ₹{selling}
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-1 flex-wrap ${className}`.trim()}>
      <span className="text-xs font-medium text-gray-500 line-through">₹{base}</span>
      <span className="text-sm font-bold text-orange-600">₹{selling}</span>
      {showBadge && discount > 0 ? (
        <span className="px-1 py-0.5 rounded bg-green-100 text-green-700 text-[10px] font-bold">
          {discount}% OFF
        </span>
      ) : null}
    </div>
  );
}
