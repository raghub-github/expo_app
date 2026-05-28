'use client';

import { useState, useEffect, useRef } from 'react';
import { usePermission } from '@/hooks/usePermission';
import { usePathname } from 'next/navigation';
import { getDashboardTypeFromPath } from '@/lib/permissions/path-mapping';
import type { DashboardType } from '@/lib/db/schema';
import { Package, X, Image, Truck, RotateCcw, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';

import { DELIVERY_FEE_ITEM_ID } from '@/lib/foodOrderItems';
import {
  parseOrderItemsApiResponse,
  preloadOrderItemImages,
  type OrderItemApiRow,
  type OrderItemLineAmounts,
  type OrderItemsPayload,
  type OrderItemsPricing,
  type OrderPricingLine,
} from '@/lib/orderItemsPayload';
import {
  formatCustomisationLine,
  type OrderItemCustomisationDetail,
} from '@/lib/order-item-customisation';
import { useCancellationReasonCatalog } from '@/hooks/useCancellationReasonCatalog';
import {
  catalogReasonOptionValue,
  findCatalogReasonBySelectValue,
  normalizeCatalogReasonId,
  reasonsForAttribute,
} from '@/lib/orders/orderRejectionOptions';

interface ItemsRefundModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast?: (message: string) => void;
  /** Order id (orders_core.id / orders.id) for creating refund record. */
  orderId?: number | null;
  /** Preloaded on order page — modal shows items immediately without spinner. */
  prefetchedOrderItems?: OrderItemsPayload | null;
  /** Dashboard context for permission checks (e.g. ORDER_FOOD). Defaults from path or ORDER_FOOD. */
  dashboardType?: DashboardType;
  /** Called after a refund is successfully created so parent can refetch refund list. */
  onRefundCreated?: () => void;
}

function discountTagLabel(tag?: OrderPricingLine['discountTag']): string | null {
  if (tag === 'platform') return 'Platform discount';
  if (tag === 'store') return 'Store discount';
  if (tag === 'mixed') return 'Platform + Store';
  return null;
}

function DiscountTagBadge({ tag }: { tag?: OrderPricingLine['discountTag'] }) {
  const label = discountTagLabel(tag);
  if (!label) return null;
  const styles =
    tag === 'store'
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : tag === 'mixed'
        ? 'bg-violet-50 text-violet-800 border-violet-200'
        : 'bg-sky-50 text-sky-800 border-sky-200';
  return (
    <span className={`ml-1.5 inline-flex rounded px-1.5 py-0.5 text-[9px] font-semibold border ${styles}`}>
      {label}
    </span>
  );
}

function PricingBreakdownPanel({
  title,
  subtitle,
  lines,
  totalLabel,
  totalAmount,
  accent = 'emerald',
}: {
  title: string;
  subtitle?: string;
  lines: OrderPricingLine[];
  totalLabel: string;
  totalAmount: number;
  accent?: 'emerald' | 'blue';
}) {
  const totalClass = accent === 'blue' ? 'text-blue-600' : 'text-emerald-600';
  const borderClass = accent === 'blue' ? 'border-blue-100' : 'border-slate-200';
  const bgClass = accent === 'blue' ? 'bg-blue-50/60' : 'bg-slate-50';

  return (
    <div className={`rounded-md border ${borderClass} ${bgClass} p-3`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">{title}</p>
      {subtitle ? <p className="mt-0.5 text-[10px] text-slate-500">{subtitle}</p> : null}
      <div className="mt-2 space-y-1">
        {lines.map((line, idx) => (
          <div
            key={`${line.key}-${idx}`}
            className="flex justify-between items-start gap-2 py-0.5 text-[11px] border-b border-slate-200/80 last:border-0"
          >
            <span className="text-slate-600 min-w-0">
              {line.label}
              {line.kind === 'discount' ? <DiscountTagBadge tag={line.discountTag} /> : null}
            </span>
            <span
              className={`font-medium tabular-nums shrink-0 ${
                line.kind === 'discount' ? 'text-red-600' : 'text-slate-800'
              }`}
            >
              {line.kind === 'discount' ? '−' : ''}
              {line.amount.toFixed(2)}
            </span>
          </div>
        ))}
        <div className="flex justify-between items-center pt-1.5 mt-1 border-t border-slate-200 font-semibold text-slate-800 text-xs">
          <span>{totalLabel}</span>
          <span className={`tabular-nums ${totalClass}`}>₹{totalAmount.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

function lineAmountsForView(
  row: OrderItemApiRow,
  view: 'customer' | 'merchant'
): OrderItemLineAmounts {
  if (view === 'customer' && row.customer) return row.customer;
  return {
    amountPerQuantity: row.amountPerQuantity,
    taxPerQuantity: row.taxPerQuantity,
    chargesPerQuantity: row.chargesPerQuantity,
    totalPerQuantity: row.totalPerQuantity,
  };
}

function mapApiItemToRefundItemForView(
  row: OrderItemApiRow,
  view: 'customer' | 'merchant'
): RefundItem {
  const amounts = lineAmountsForView(row, view);
  const delivery = row.id === DELIVERY_FEE_ITEM_ID;
  return {
    id: row.id,
    name: row.name,
    customisation: row.customisation,
    customisationDetail: row.customisationDetail ?? null,
    quantity: row.quantity,
    amountPerQuantity: amounts.amountPerQuantity,
    taxPerQuantity: amounts.taxPerQuantity,
    chargesPerQuantity: amounts.chargesPerQuantity,
    totalPerQuantity: amounts.totalPerQuantity,
    refundType: 'NONE',
    selectedQuantity: 0,
    remark: '',
    showDropdown: false,
    customAmount: amounts.amountPerQuantity,
    isSelected: false,
    hasImage: row.hasImage && Boolean(row.imageUrl),
    imageUrl: row.imageUrl ?? undefined,
    refundPercentage: 0,
    isDeliveryFee: delivery,
  };
}

function syncRefundItemAmounts(
  items: RefundItem[],
  source: OrderItemApiRow[],
  view: 'customer' | 'merchant'
): RefundItem[] {
  const byId = new Map(source.map((r) => [r.id, r]));
  return items.map((item) => {
    const row = byId.get(item.id);
    if (!row) return item;
    const amounts = lineAmountsForView(row, view);
    return {
      ...item,
      amountPerQuantity: amounts.amountPerQuantity,
      taxPerQuantity: amounts.taxPerQuantity,
      chargesPerQuantity: amounts.chargesPerQuantity,
      totalPerQuantity: amounts.totalPerQuantity,
      customAmount: amounts.amountPerQuantity,
    };
  });
}

function BillBreakdownSwitcher({
  pricing,
  billView,
  onBillViewChange,
}: {
  pricing: OrderItemsPricing;
  billView: 'customer' | 'merchant';
  onBillViewChange: (view: 'customer' | 'merchant') => void;
}) {
  const hasMerchantBill = Boolean(pricing.customer);
  const customerBill = pricing.customer ?? pricing;
  const merchantBill = pricing;

  const active =
    billView === 'merchant' && hasMerchantBill
      ? {
          title: 'Merchant bill',
          subtitle: 'Amount payable to merchant (CTM)',
          lines: merchantBill.lines,
          totalLabel: 'Merchant amount (CTM)',
          totalAmount: merchantBill.totalOrderAmount,
          accent: 'emerald' as const,
        }
      : {
          title: 'Customer bill',
          subtitle: 'Full amount paid by customer (CTC)',
          lines: customerBill.lines,
          totalLabel: 'Total amount (CTC)',
          totalAmount: customerBill.totalOrderAmount,
          accent: 'blue' as const,
        };

  return (
    <div className="mt-3 max-w-md ml-auto">
      <div className="mb-2 flex items-center justify-end gap-2">
        <label htmlFor="bill-view-select" className="text-[11px] font-medium text-slate-600">
          Bill view
        </label>
        <select
          id="bill-view-select"
          value={billView}
          onChange={(e) => onBillViewChange(e.target.value as 'customer' | 'merchant')}
          className="h-8 min-w-[150px] rounded border border-slate-200 bg-white px-2 text-[11px] text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
        >
          <option value="customer">Customer bill</option>
          {hasMerchantBill ? <option value="merchant">Merchant bill</option> : null}
        </select>
      </div>
      <PricingBreakdownPanel
        key={billView}
        title={active.title}
        subtitle={active.subtitle}
        lines={active.lines?.length ? active.lines : []}
        totalLabel={active.totalLabel}
        totalAmount={active.totalAmount}
        accent={active.accent}
      />
    </div>
  );
}

function CustomisationCell({
  detail,
  fallback,
  compact = false,
}: {
  detail?: OrderItemCustomisationDetail | null;
  fallback: string;
  compact?: boolean;
}) {
  const lines = detail?.lines?.length ? detail.lines : [];

  if (lines.length === 0) {
    const text = fallback?.trim();
    if (!text || text === '-') {
      return <span className="text-slate-400">—</span>;
    }
    return (
      <span
        className={`text-left whitespace-normal break-words text-slate-800 ${compact ? 'text-[10px]' : 'text-[11px]'}`}
      >
        {text}
      </span>
    );
  }

  return (
    <div
      className={`text-left align-top space-y-1 min-w-[200px] max-w-[340px] whitespace-normal break-words text-slate-800 leading-snug ${compact ? 'text-[10px]' : 'text-[11px]'}`}
    >
      {lines.map((line, i) => (
        <p key={i}>{formatCustomisationLine(line)}</p>
      ))}
    </div>
  );
}

interface RefundItem {
  id: number;
  name: string;
  customisation: string;
  customisationDetail?: OrderItemCustomisationDetail | null;
  quantity: number;
  amountPerQuantity: number;
  taxPerQuantity: number;
  chargesPerQuantity: number;
  totalPerQuantity: number;
  refundType: 'NONE' | 'FULL' | 'PARTIAL';
  selectedQuantity: number;
  remark: string;
  showDropdown: boolean;
  customAmount: number;
  isSelected: boolean;
  hasImage: boolean;
  imageUrl?: string;
  refundPercentage: number;
  isDeliveryFee: boolean;
}

function payloadToRefundState(
  payload: OrderItemsPayload,
  view: 'customer' | 'merchant'
): {
  items: RefundItem[];
  pricing: OrderItemsPricing;
} {
  return {
    items: payload.items.map((row) => mapApiItemToRefundItemForView(row, view)),
    pricing: payload.pricing,
  };
}

function isDeliveryFeeRow(item: { id: number; isDeliveryFee?: boolean }): boolean {
  return item.isDeliveryFee === true || item.id === DELIVERY_FEE_ITEM_ID;
}

export default function ItemsRefundModal({
  isOpen,
  onClose,
  onToast,
  orderId: orderIdProp,
  prefetchedOrderItems,
  dashboardType: dashboardTypeProp,
  onRefundCreated,
}: ItemsRefundModalProps) {
  const pathname = usePathname();
  const resolvedDashboard = dashboardTypeProp ?? getDashboardTypeFromPath(pathname ?? '') ?? 'ORDER_FOOD';
  const { canPerformAction, isSuperAdmin } = usePermission();

  const hasRefundPermission = isSuperAdmin || (resolvedDashboard && canPerformAction(resolvedDashboard, 'REFUND', { access_point_group: 'ORDER_REFUND' }));
  const hasCancellationPermission = isSuperAdmin || (resolvedDashboard && canPerformAction(resolvedDashboard, 'CANCEL', { access_point_group: 'ORDER_CANCEL' }));
  const canCreateRefund = hasRefundPermission && hasCancellationPermission;

  const shouldModalBeOpen = () => {
    if (isOpen) return true;
    if (typeof window === 'undefined') return false;
    const savedModalState = localStorage.getItem('refundModalOpen');
    return savedModalState === 'true';
  };

  const [modalOpen, setModalOpen] = useState(shouldModalBeOpen);

  const {
    attributes: catalogAttributes,
    grouped: catalogGrouped,
    loading: catalogLoading,
    error: catalogError,
  } = useCancellationReasonCatalog({ enabled: modalOpen });

  const [refundAttribute, setRefundAttribute] = useState('');
  const [catalogReasonId, setCatalogReasonId] = useState<number | null>(null);
  const [refundRejection, setRefundRejection] = useState('');
  const [refundType, setRefundType] = useState('');
  const [fault, setFault] = useState('');
  const [merchantDebit, setMerchantDebit] = useState('');
  const [showRefundType, setShowRefundType] = useState(false);
  const [showFault, setShowFault] = useState(false);
  const [showMerchantDebit, setShowMerchantDebit] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [isRefundCompleted, setIsRefundCompleted] = useState(false);
  const [refundActionMessage, setRefundActionMessage] = useState('');
  const [selectAll, setSelectAll] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedItemImage, setSelectedItemImage] = useState<{ id: number; name: string; imageUrl: string } | null>(null);
  const [loadedImageUrls, setLoadedImageUrls] = useState<Set<string>>(() => new Set());
  const [imagePanelLoading, setImagePanelLoading] = useState(false);

  const refundTypeRef = useRef<HTMLDivElement>(null);
  const faultRef = useRef<HTMLDivElement>(null);
  const merchantDebitRef = useRef<HTMLDivElement>(null);
  const refundItemsRef = useRef<HTMLDivElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const imageModalRef = useRef<HTMLDivElement>(null);
  const itemsSourceRef = useRef<OrderItemApiRow[]>([]);
  const [billView, setBillView] = useState<'customer' | 'merchant'>('customer');

  const initialFromPrefetch = prefetchedOrderItems?.items?.length
    ? payloadToRefundState(prefetchedOrderItems, 'customer')
    : null;

  const handleBillViewChange = (view: 'customer' | 'merchant') => {
    setBillView(view);
    if (itemsSourceRef.current.length > 0) {
      setRefundItems((prev) => syncRefundItemAmounts(prev, itemsSourceRef.current, view));
    }
  };

  const [refundItems, setRefundItems] = useState<RefundItem[]>(
    () => initialFromPrefetch?.items ?? []
  );
  const [itemsLoading, setItemsLoading] = useState(
    () => !(initialFromPrefetch?.items?.length)
  );
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [pricing, setPricing] = useState<OrderItemsPricing | null>(
    () => initialFromPrefetch?.pricing ?? null
  );

  useEffect(() => {
    if (isOpen) setModalOpen(true);
  }, [isOpen]);

  useEffect(() => {
    if (modalOpen && typeof window !== 'undefined') {
      localStorage.setItem('refundModalOpen', 'true');
    } else if (typeof window !== 'undefined') {
      localStorage.removeItem('refundModalOpen');
    }
  }, [modalOpen]);

  useEffect(() => {
    if (modalOpen && typeof window !== 'undefined') {
      const formState = {
        refundAttribute,
        catalogReasonId,
        refundRejection,
        refundType,
        fault,
        merchantDebit,
        showRefundType,
        showFault,
        showMerchantDebit,
        showSubmit,
        refundItems,
        selectAll
      };
      localStorage.setItem('refundFormState', JSON.stringify(formState));
    }
  }, [
    modalOpen, refundAttribute, catalogReasonId, refundRejection, refundType, fault, merchantDebit,
    showRefundType, showFault, showMerchantDebit, showSubmit, refundItems, selectAll
  ]);

  useEffect(() => {
    if (modalOpen && typeof window !== 'undefined') {
      const savedFormState = localStorage.getItem('refundFormState');
      if (savedFormState) {
        try {
          const parsedState = JSON.parse(savedFormState);
          setRefundAttribute(parsedState.refundAttribute || '');
          setCatalogReasonId(
            typeof parsedState.catalogReasonId === 'number' ? parsedState.catalogReasonId : null
          );
          setRefundRejection(parsedState.refundRejection || '');
          setRefundType(parsedState.refundType || '');
          setFault(parsedState.fault || '');
          setMerchantDebit(parsedState.merchantDebit || '');
          setShowRefundType(parsedState.showRefundType || false);
          setShowFault(parsedState.showFault || false);
          setShowMerchantDebit(parsedState.showMerchantDebit || false);
          setShowSubmit(parsedState.showSubmit || false);
          if (parsedState.selectAll !== undefined) setSelectAll(parsedState.selectAll);
        } catch {
          localStorage.removeItem('refundFormState');
        }
      }
    }
  }, [modalOpen]);

  useEffect(() => {
    if (prefetchedOrderItems?.items?.length) {
      itemsSourceRef.current = prefetchedOrderItems.items;
      const next = payloadToRefundState(prefetchedOrderItems, billView);
      setRefundItems(next.items);
      setPricing(next.pricing);
      setItemsError(null);
      setItemsLoading(false);
    }
  }, [prefetchedOrderItems]);

  useEffect(() => {
    const urls = refundItems
      .filter((i) => i.hasImage && i.imageUrl)
      .map((i) => i.imageUrl as string);
    preloadOrderItemImages(urls);
    urls.forEach((url) => {
      if (loadedImageUrls.has(url)) return;
      const img = new window.Image();
      img.decoding = 'async';
      img.onload = () => {
        setLoadedImageUrls((prev) => {
          if (prev.has(url)) return prev;
          const next = new Set(prev);
          next.add(url);
          return next;
        });
      };
      img.src = url;
    });
  }, [refundItems]);

  useEffect(() => {
    if (!modalOpen || orderIdProp == null) return;

    if (prefetchedOrderItems?.items?.length) {
      itemsSourceRef.current = prefetchedOrderItems.items;
      const next = payloadToRefundState(prefetchedOrderItems, billView);
      setRefundItems(next.items);
      setPricing(next.pricing);
      setItemsError(null);
      setItemsLoading(false);
      return;
    }

    if (refundItems.length > 0) {
      setItemsLoading(false);
      return;
    }

    let cancelled = false;
    setItemsLoading(true);
    setItemsError(null);
    void (async () => {
      try {
        const res = await fetch(`/api/orders/${orderIdProp}/items`, { credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data.success) {
          setItemsError(data?.error ?? 'Failed to load order items');
          setRefundItems([]);
          setPricing(null);
          return;
        }
        const rows = (Array.isArray(data.items) ? data.items : []) as OrderItemApiRow[];
        itemsSourceRef.current = rows;
        setRefundItems(rows.map((row) => mapApiItemToRefundItemForView(row, billView)));
        if (data.pricing && typeof data.pricing === 'object') {
          const parsed = parseOrderItemsApiResponse({ success: true, items: rows, pricing: data.pricing });
          setPricing(parsed?.pricing ?? null);
        } else {
          setPricing(null);
        }
      } catch (e) {
        if (!cancelled) {
          setItemsError(e instanceof Error ? e.message : 'Failed to load order items');
          setRefundItems([]);
          setPricing(null);
        }
      } finally {
        if (!cancelled) setItemsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modalOpen, orderIdProp, prefetchedOrderItems]);

  useEffect(() => {
    const allItemsSelected = refundItems.every(item => item.isSelected);
    setSelectAll(allItemsSelected);
  }, [refundItems]);

  useEffect(() => {
    if (!modalOpen) return;
    const scrollToSection = () => {
      if (showSubmit && submitButtonRef.current) {
        setTimeout(() => {
          submitButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      } else {
        const targetRef = showMerchantDebit ? merchantDebitRef.current : showFault ? faultRef.current : showRefundType ? refundTypeRef.current : refundType === 'refund_without_cancellation' ? refundItemsRef.current : null;
        if (targetRef) {
          setTimeout(() => targetRef?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
        }
      }
    };
    scrollToSection();
  }, [showRefundType, showFault, showMerchantDebit, showSubmit, refundType, modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    if (fault && showFault && !showMerchantDebit) {
      const timer = setTimeout(() => setShowMerchantDebit(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [fault, showFault, showMerchantDebit, modalOpen]);

  const checkItemSelectionForCancellation = () => {
    return refundItems.some(item => item.isSelected);
  };

  const attributeRejectionOptions = reasonsForAttribute(catalogGrouped, refundAttribute);

  const handleAttributeChange = (value: string) => {
    if (refundAttribute === value) {
      setRefundAttribute('');
      setCatalogReasonId(null);
      setRefundRejection('');
      setShowRefundType(false);
      setFault('');
      return;
    }
    setRefundAttribute(value);
    setCatalogReasonId(null);
    setRefundRejection('');
    setShowRefundType(false);
    const attrRow = catalogAttributes.find((a) => a.code === value);
    setFault(attrRow?.defaultFault ?? '');
  };

  const handleRejectionChange = (value: string) => {
    const id = Number(value);
    const row = attributeRejectionOptions.find((r) => r.id === id);
    if (!row) {
      setCatalogReasonId(null);
      setRefundRejection('');
      setShowRefundType(false);
      return;
    }
    if (catalogReasonId === row.id) {
      setCatalogReasonId(null);
      setRefundRejection('');
      setShowRefundType(false);
      return;
    }
    setCatalogReasonId(row.id);
    setRefundRejection(row.label);
    setShowRefundType(true);
  };

  const handleRefundTypeChange = (value: string) => {
    if (refundType === value) {
      setRefundType('');
      setShowFault(false);
      return;
    }
    setRefundType(value);
    setShowFault(true);
    if (value === 'refund_without_cancellation') {
      setRefundItems(prev => prev.map(item => ({
        ...item,
        selectedQuantity: !isDeliveryFeeRow(item) ? 1 : 0
      })));
    }
  };

  const handleFaultChange = (value: string) => {
    if (fault === value) {
      setFault('');
      setShowMerchantDebit(false);
      return;
    }
    setFault(value);
    setTimeout(() => setShowMerchantDebit(true), 1000);
  };

  const handleMerchantDebitChange = (value: string) => {
    if (merchantDebit === value) {
      setMerchantDebit('');
      setShowSubmit(false);
      return;
    }
    setMerchantDebit(value);
    setShowSubmit(true);
  };

  const toggleItemSelection = (itemId: number) => {
    setRefundItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, isSelected: !item.isSelected } : item
    ));
  };

  const handleSelectAll = () => {
    const newSelectAllState = !selectAll;
    setSelectAll(newSelectAllState);
    setRefundItems(prev => prev.map(item => ({ ...item, isSelected: newSelectAllState })));
  };

  const handleRefundItemTypeChange = (itemId: number, type: 'NONE' | 'FULL' | 'PARTIAL') => {
    setRefundItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const updatedItem = { ...item, refundType: type, showDropdown: false };
      if (type === 'NONE') {
        updatedItem.selectedQuantity = 0;
        updatedItem.customAmount = item.amountPerQuantity;
      } else if (type === 'FULL') {
        updatedItem.selectedQuantity = item.quantity;
        updatedItem.customAmount = item.amountPerQuantity;
      } else if (type === 'PARTIAL' && item.selectedQuantity === 0) {
        updatedItem.selectedQuantity = 1;
      }
      return updatedItem;
    }));
  };

  const handleQuantityChange = (itemId: number, quantity: number) => {
    setRefundItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const newQuantity = Math.min(Math.max(0, quantity), item.quantity);
      const updatedItem = { ...item, selectedQuantity: newQuantity };
      if (newQuantity === 0) {
        updatedItem.refundType = 'NONE';
        updatedItem.customAmount = item.amountPerQuantity;
      } else if (newQuantity === item.quantity) {
        updatedItem.refundType = 'FULL';
        updatedItem.customAmount = item.amountPerQuantity;
      } else {
        updatedItem.refundType = 'PARTIAL';
      }
      return updatedItem;
    }));
  };

  const handleCustomAmountChange = (itemId: number, amount: number) => {
    setRefundItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, customAmount: Math.max(0, amount) } : item
    ));
  };

  const handleRemarkChange = (itemId: number, remark: string) => {
    setRefundItems(prev => prev.map(item => item.id === itemId ? { ...item, remark } : item));
  };

  const handlePercentageChange = (itemId: number, percentage: number) => {
    setRefundItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const currentQuantity = item.selectedQuantity > 0 ? item.selectedQuantity : 1;
      return {
        ...item,
        refundPercentage: percentage,
        customAmount: (item.amountPerQuantity * percentage * currentQuantity) / 100,
        refundType: percentage > 0 ? 'PARTIAL' : 'NONE',
        selectedQuantity: percentage > 0 ? Math.max(1, item.selectedQuantity) : 0
      };
    }));
  };

  const generatePercentageOptions = () => {
    const options = [0];
    for (let i = 10; i <= 100; i += 10) options.push(i);
    return options;
  };

  const calculatePercentageRefundAmount = (item: RefundItem) => {
    if (item.refundPercentage === 0) return 0;
    const qty = item.selectedQuantity > 0 ? item.selectedQuantity : 1;
    return (item.amountPerQuantity * item.refundPercentage * qty) / 100;
  };

  const calculateTotalPercentageRefundAmount = () => {
    return refundItems
      .filter(item => !isDeliveryFeeRow(item))
      .reduce((total, item) => {
        if (item.refundPercentage === 0) return total;
        const qty = item.selectedQuantity > 0 ? item.selectedQuantity : 1;
        return total + (item.amountPerQuantity * item.refundPercentage * qty) / 100;
      }, 0);
  };

  const handleImageClick = (item: RefundItem) => {
    if (!item.hasImage || !item.imageUrl) return;
    const url = item.imageUrl;
    setSelectedItemImage({ id: item.id, name: item.name, imageUrl: url });
    setImagePanelLoading(!loadedImageUrls.has(url));
    setShowImageModal(true);
  };

  const handleImageHover = (item: RefundItem) => {
    if (!item.imageUrl) return;
    preloadOrderItemImages([item.imageUrl]);
  };

  const closeImageModal = () => {
    setShowImageModal(false);
    setSelectedItemImage(null);
  };

  const generateQuantityOptionsFrom1 = (maxQuantity: number) => {
    const options = [];
    for (let i = 1; i <= maxQuantity; i++) options.push(i);
    return options;
  };

  const handleRefundQuantityChange = (itemId: number, quantity: number) => {
    setRefundItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const updatedItem = { ...item, selectedQuantity: quantity };
      if (item.refundPercentage > 0) {
        updatedItem.customAmount = (item.amountPerQuantity * item.refundPercentage * quantity) / 100;
      }
      return updatedItem;
    }));
  };

  const calculateTotalRefundAmount = () => {
    return refundItems.reduce((total, item) => {
      if (item.refundType !== 'NONE') {
        if (refundType === 'refund_without_cancellation' && item.refundPercentage > 0) {
          return total + calculatePercentageRefundAmount(item);
        }
        const amount = item.refundType === 'PARTIAL' ? item.customAmount : item.amountPerQuantity;
        return total + (item.selectedQuantity * amount);
      }
      return total;
    }, 0);
  };

  const handleSubmit = () => {
    if (!refundAttribute || !catalogReasonId || !refundRejection || !refundType || !fault || !merchantDebit) {
      onToast?.('Please complete all refund options');
      return;
    }
    if (refundType === 'refund_without_cancellation') {
      const hasRefundItems = refundItems.some(item => item.refundType !== 'NONE');
      if (!hasRefundItems) {
        onToast?.('Please select at least one item for refund in the refund form');
        return;
      }
    } else {
      if (!checkItemSelectionForCancellation()) {
        onToast?.('Please select at least one item (including delivery fee if applicable)');
        return;
      }
    }
    const actionMessages: Record<string, string> = {
      cancel_without_refund: 'Order cancelled without refund',
      refund_with_cancellation: 'Order cancelled with refund',
      refund_without_cancellation: 'Partial refund processed',
    };
    setRefundActionMessage(actionMessages[refundType] ?? '');
    setShowWarning(true);
  };

  const resetFormAndClose = () => {
    setIsRefundCompleted(false);
    setRefundAttribute('');
    setCatalogReasonId(null);
    setRefundRejection('');
    setRefundType('');
    setFault('');
    setMerchantDebit('');
    setShowRefundType(false);
    setShowFault(false);
    setShowMerchantDebit(false);
    setShowSubmit(false);
    setShowWarning(false);
    setSelectAll(false);
    setRefundItems(prev => prev.map(item => ({
      ...item,
      refundType: 'NONE',
      selectedQuantity: 0,
      remark: '',
      showDropdown: false,
      customAmount: item.amountPerQuantity,
      isSelected: false,
      refundPercentage: 0
    })));
    if (typeof window !== 'undefined') {
      localStorage.removeItem('refundModalOpen');
      localStorage.removeItem('refundFormState');
    }
    setModalOpen(false);
    onClose?.();
  };

  const confirmRefund = async () => {
    const orderId = orderIdProp ?? null;
    const totalAmount = calculateTotalRefundAmount();
    const notificationMessages: Record<string, string> = {
      cancel_without_refund: 'Order has been cancelled successfully without refund.',
      refund_with_cancellation: 'Order has been cancelled and refund processed successfully.',
      refund_without_cancellation: `Refund of ₹${totalAmount.toFixed(2)} has been processed successfully.`,
    };

    if (refundType === 'cancel_without_refund') {
      if (orderId != null) {
        try {
          setIsSubmitting(true);
          const res = await fetch(`/api/orders/${orderId}/refunds`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              refundType: 'cancel_without_refund',
              refundReason: `${refundAttribute} - ${refundRejection}`,
              refundDescription: `Fault: ${fault}, Merchant debit: ${merchantDebit}`,
              attribute: refundAttribute,
              rejection: refundRejection,
              catalogReasonId,
              fault,
              merchantDebit,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            onToast?.(data?.error ?? 'Failed to record cancellation');
            return;
          }
        } catch (e) {
          onToast?.(e instanceof Error ? e.message : 'Failed to submit');
          return;
        } finally {
          setIsSubmitting(false);
        }
      }
      onToast?.(notificationMessages.cancel_without_refund);
      onRefundCreated?.();
      setIsRefundCompleted(true);
      setTimeout(resetFormAndClose, 3000);
      return;
    }

    if (orderId == null) {
      onToast?.('Order id is required to create a refund.');
      return;
    }
    if (refundType === 'refund_without_cancellation' && totalAmount <= 0) {
      onToast?.('Refund amount must be greater than 0.');
      return;
    }
    const fullOrderAmount = refundItems.reduce(
      (sum, i) => sum + (i.amountPerQuantity * (isDeliveryFeeRow(i) ? 1 : i.quantity)),
      0
    );
    const refundAmount = refundType === 'refund_with_cancellation' ? fullOrderAmount : totalAmount;
    const amountToSend = Math.max(0.01, refundAmount);

    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/orders/${orderId}/refunds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refundType,
          refundReason: `${refundAttribute} - ${refundRejection}`,
          refundDescription: `Fault: ${fault}, Merchant debit: ${merchantDebit}`,
          refundAmount: amountToSend,
          mxDebitAmount: 0,
          mxDebitReason: merchantDebit,
          attribute: refundAttribute,
          rejection: refundRejection,
          catalogReasonId,
          fault,
          merchantDebit,
          refundMetadata: refundType === 'refund_without_cancellation'
            ? { refundItems: refundItems.filter(i => i.refundType !== 'NONE').map(i => ({ id: i.id, name: i.name, refundPercentage: i.refundPercentage, amount: calculatePercentageRefundAmount(i) })) }
            : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onToast?.(data?.error ?? 'Failed to create refund');
        return;
      }
      onToast?.(notificationMessages[refundType] ?? 'Refund created.');
      onRefundCreated?.();
      setIsRefundCompleted(true);
      setTimeout(resetFormAndClose, 3000);
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Failed to submit refund');
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancelRefund = () => {
    setShowWarning(false);
    onToast?.('Refund creation cancelled');
  };

  const handleModalClose = () => {
    setModalOpen(false);
    if (typeof window !== 'undefined') localStorage.removeItem('refundModalOpen');
    onClose?.();
  };

  if (!modalOpen) return null;

  return (
    <>
      {isRefundCompleted && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10001] p-5">
          <div className="bg-white rounded-lg w-full max-w-[400px] shadow-[0_20px_40px_rgba(0,0,0,0.3)] animate-[fadeIn_0.3s_ease]">
            <div className="p-6">
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">{refundActionMessage}</h3>
                <p className="text-slate-600 text-sm mb-6">The action has been completed successfully.</p>
                <div className="w-12 h-1 bg-emerald-500 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      )}

      {showWarning && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-5">
          <div className="bg-white rounded-lg w-full max-w-[500px] shadow-[0_20px_40px_rgba(0,0,0,0.3)] animate-[fadeIn_0.3s_ease]">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0" /> Confirm Refund
              </h3>
            </div>
            <div className="p-6">
              <p className="text-slate-700 mb-6">
                You are about to create a refund. Once submitted, this action cannot be undone. You will be responsible for this refund.
              </p>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={cancelRefund} className="px-6 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 border-none rounded-sm font-medium cursor-pointer transition-all text-sm">
                  Cancel
                </button>
                <button type="button" onClick={confirmRefund} disabled={isSubmitting} className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white border-none rounded-sm font-medium cursor-pointer transition-all text-sm disabled:opacity-60 disabled:cursor-not-allowed">
                  {isSubmitting ? 'Submitting…' : 'Confirm Refund'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showImageModal && selectedItemImage && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[10002] p-5" onClick={closeImageModal}>
          <div ref={imageModalRef} className="bg-white rounded-xl w-full max-w-[500px] shadow-[0_20px_60px_rgba(0,0,0,0.4)] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-blue-50 to-white px-5 py-4 border-b border-gray-200 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Image className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-800">Item Image</h3>
                  <p className="text-xs text-gray-500 mt-0.5">ID: {selectedItemImage.id}</p>
                </div>
              </div>
              <button type="button" onClick={closeImageModal} className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <h4 className="text-lg font-semibold text-gray-800 text-center mb-4">{selectedItemImage.name}</h4>
              <div className="rounded-xl overflow-hidden border border-gray-200 shadow-lg min-h-[200px] flex items-center justify-center bg-gray-50 relative">
                {imagePanelLoading ? (
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-600 absolute" aria-hidden />
                ) : null}
                <img
                  src={selectedItemImage.imageUrl}
                  alt={selectedItemImage.name}
                  loading="eager"
                  decoding="sync"
                  className={`w-full h-auto object-cover max-h-[400px] transition-opacity duration-150 ${imagePanelLoading ? 'opacity-0' : 'opacity-100'}`}
                  onLoad={() => {
                    setLoadedImageUrls((prev) => new Set(prev).add(selectedItemImage.imageUrl));
                    setImagePanelLoading(false);
                  }}
                  onError={(e) => {
                    setImagePanelLoading(false);
                    (e.target as HTMLImageElement).src = 'https://via.placeholder.com/400x300?text=Image+Not+Available';
                  }}
                />
              </div>
            </div>
            <div className="px-5 py-4 bg-gray-50 border-t border-gray-200">
              <button type="button" onClick={closeImageModal} className="w-full py-2.5 bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium rounded-lg transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-5"
        onClick={(e) => { if (e.target === e.currentTarget) handleModalClose(); }}
      >
        <div className="bg-white rounded-lg w-full max-w-[min(1100px,96vw)] max-h-[85vh] overflow-y-auto shadow-[0_20px_40px_rgba(0,0,0,0.2)] animate-[fadeIn_0.3s_ease]" onClick={(e) => e.stopPropagation()}>
          <div className="bg-emerald-50 px-4 py-2.5 border-b border-slate-200 flex justify-between items-center rounded-t-lg sticky top-0 z-10">
            <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2 m-0">
              <span className="flex items-center justify-center w-8 h-8 rounded-md bg-emerald-100 text-emerald-600 shrink-0" aria-hidden>
                <Package className="w-5 h-5" strokeWidth={2} />
              </span>
              <span className="truncate">Items details</span>
            </h3>
            <button type="button" onClick={handleModalClose} className="p-1 text-slate-500 hover:text-slate-800 hover:bg-white rounded-full transition-colors cursor-pointer" aria-label="Close"><X className="w-5 h-5" /></button>
          </div>

          <div className="p-4">
            <div className="mb-3 px-3 py-2 bg-emerald-50/80 border border-slate-200 rounded-md flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={handleSelectAll}
                  className="checkbox-circle text-emerald-600 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-0"
                />
                <span className="text-sm font-medium text-slate-800 group-hover:text-emerald-600">Select All Items</span>
              </label>
              <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded border border-slate-200">
                <div className={`w-2 h-2 rounded-full ${selectAll ? 'bg-green-500' : 'bg-emerald-500'}`} />
                <span className="text-xs font-medium text-slate-700">
                  <span className="font-semibold text-emerald-600">{refundItems.filter(item => item.isSelected).length}</span>
                  <span className="text-slate-500 mx-0.5">/</span>
                  <span className="font-semibold text-slate-800">{refundItems.length}</span>
                  <span className="text-slate-500 ml-0.5">selected</span>
                </span>
              </div>
              <div className="w-full min-w-[120px] max-w-[180px] h-1 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${refundItems.length > 0 ? (refundItems.filter(item => item.isSelected).length / refundItems.length) * 100 : 0}%` }} />
              </div>
            </div>

            {itemsLoading && refundItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-500 gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                <p className="text-sm">Loading order items…</p>
              </div>
            ) : itemsError && refundItems.length === 0 ? (
              <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                {itemsError}
              </div>
            ) : refundItems.length === 0 ? (
              <div className="mb-3 px-3 py-4 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-md">
                No items found for this order.
              </div>
            ) : null}

            {refundItems.length > 0 ? (
            <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[960px] border-collapse text-xs mb-3">
              <thead>
                <tr>
                  <th className="px-2 py-1.5 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Select</th>
                  <th className="px-2 py-1.5 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Id</th>
                  <th className="px-2 py-1.5 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Status</th>
                  <th className="px-2 py-1.5 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Name</th>
                  <th className="px-2 py-1.5 border border-slate-200 text-left bg-emerald-50 font-semibold text-slate-800 min-w-[200px]">Customisation</th>
                  <th className="px-2 py-1.5 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Qty</th>
                  <th className="px-2 py-1.5 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Amount</th>
                  <th className="px-2 py-1.5 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Tax</th>
                  <th className="px-2 py-1.5 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Charges</th>
                  <th className="px-2 py-1.5 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Total</th>
                </tr>
              </thead>
              <tbody>
                {refundItems.map((item) => (
                  <tr key={item.id} className={item.isSelected ? 'bg-emerald-50/50' : ''}>
                    <td className="px-2 py-1.5 border border-slate-200 text-center">
                      <input type="checkbox" checked={item.isSelected} onChange={() => toggleItemSelection(item.id)} className="checkbox-circle text-emerald-600 focus:ring-emerald-500 focus:ring-offset-0" />
                    </td>
                    <td className="px-2 py-1.5 border border-slate-200 text-center">
                      <div className="font-mono text-[11px] font-medium">
                        {item.hasImage && !isDeliveryFeeRow(item) && (
                          <span
                            onClick={() => handleImageClick(item)}
                            onMouseEnter={() => handleImageHover(item)}
                            className="text-emerald-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 inline-flex items-center gap-1 cursor-pointer hover:bg-blue-100"
                            title="View image"
                          >
                            <Image className="w-3 h-3 text-blue-500 shrink-0" /> {item.id}
                          </span>
                        )}
                        {!item.hasImage && !isDeliveryFeeRow(item) && (
                          <span className="text-green-600 bg-green-50 px-1.5 py-0.5 rounded border border-green-100 inline-block">{item.id}</span>
                        )}
                        {isDeliveryFeeRow(item) && (
                          <span className="text-slate-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 inline-block">
                            DEL-FEE <span className="text-gray-400 inline-flex"><Truck className="w-3 h-3" /></span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 border border-slate-200 text-center text-slate-600">{isDeliveryFeeRow(item) ? 'FIXED' : 'AVAILABLE'}</td>
                    <td className="px-2 py-1.5 border border-slate-200 text-center text-slate-600">{item.name}</td>
                    <td className="px-2 py-1.5 border border-slate-200 text-left align-top text-slate-600 min-w-[200px]">
                      <CustomisationCell
                        detail={item.customisationDetail}
                        fallback={item.customisation}
                      />
                    </td>
                    <td className="px-2 py-1.5 border border-slate-200 text-center text-slate-600">{isDeliveryFeeRow(item) ? '-' : item.quantity}</td>
                    <td className="px-2 py-1.5 border border-slate-200 text-center text-slate-600 tabular-nums">{isDeliveryFeeRow(item) ? item.amountPerQuantity.toFixed(2) : item.amountPerQuantity}</td>
                    <td className="px-2 py-1.5 border border-slate-200 text-center text-slate-600 tabular-nums">{item.taxPerQuantity.toFixed(2)}</td>
                    <td className="px-2 py-1.5 border border-slate-200 text-center text-slate-600 tabular-nums">{item.chargesPerQuantity.toFixed(2)}</td>
                    <td className="px-2 py-1.5 border border-slate-200 text-center text-slate-600 tabular-nums">{item.totalPerQuantity.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            ) : null}

            {pricing ? (
              <BillBreakdownSwitcher
                pricing={pricing}
                billView={billView}
                onBillViewChange={handleBillViewChange}
              />
            ) : null}

            {canCreateRefund && (
              <>
                <h4 className="mt-4 mb-2 text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                  <RotateCcw className="w-4 h-4 text-emerald-600 shrink-0" /> Create refund
                </h4>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <label className="text-xs font-medium text-slate-600 whitespace-nowrap">Refund reason</label>
                  <select value={refundAttribute} onChange={(e) => handleAttributeChange(e.target.value)} disabled={catalogLoading} className="h-8 px-2 border border-slate-200 rounded text-xs text-slate-800 bg-white min-w-[140px] focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer disabled:opacity-60">
                    <option value="">Select Attribute</option>
                    {catalogAttributes.map((attr) => (
                      <option key={attr.code} value={attr.code}>
                        {attr.displayLabel || attr.code}
                      </option>
                    ))}
                  </select>
                  <select
                    value={catalogReasonId != null ? String(catalogReasonId) : ''}
                    onChange={(e) => handleRejectionChange(e.target.value)}
                    disabled={
                      !refundAttribute ||
                      (catalogLoading && attributeRejectionOptions.length === 0)
                    }
                    className={`h-8 px-2 border rounded text-xs bg-white min-w-[160px] focus:outline-none focus:ring-1 focus:ring-emerald-500 ${refundAttribute ? 'border-emerald-500 text-slate-800 cursor-pointer' : 'border-slate-200 text-slate-400 cursor-not-allowed bg-slate-50'}`}
                  >
                    <option value="">Rejection option</option>
                    {attributeRejectionOptions.map((row) => (
                      <option key={catalogReasonOptionValue(row)} value={catalogReasonOptionValue(row)}>
                        {row.label}
                      </option>
                    ))}
                  </select>
                  {catalogError ? (
                    <span className="text-[11px] text-red-600">{catalogError}</span>
                  ) : null}
                </div>

                {showRefundType && (
                  <div ref={refundTypeRef} className="mb-3">
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Refund type</label>
                    <div className="flex gap-2 flex-wrap">
                      <label className={`flex items-center gap-1.5 border px-2 py-1.5 rounded cursor-pointer bg-white min-w-[140px] hover:bg-emerald-50 text-[11px] ${refundType === 'cancel_without_refund' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                        <input type="radio" name="refundType" value="cancel_without_refund" checked={refundType === 'cancel_without_refund'} onChange={(e) => handleRefundTypeChange(e.target.value)} className="w-3 h-3 text-emerald-600 cursor-pointer" />
                        Cancel without refund
                      </label>
                      <label className={`flex items-center gap-1.5 border px-2 py-1.5 rounded cursor-pointer bg-white min-w-[140px] hover:bg-emerald-50 text-[11px] ${refundType === 'refund_with_cancellation' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                        <input type="radio" name="refundType" value="refund_with_cancellation" checked={refundType === 'refund_with_cancellation'} onChange={(e) => handleRefundTypeChange(e.target.value)} className="w-3 h-3 text-emerald-600 cursor-pointer" />
                        Refund with cancellation
                      </label>
                      <label className={`flex items-center gap-1.5 border px-2 py-1.5 rounded cursor-pointer bg-white min-w-[140px] hover:bg-emerald-50 text-[11px] ${refundType === 'refund_without_cancellation' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                        <input type="radio" name="refundType" value="refund_without_cancellation" checked={refundType === 'refund_without_cancellation'} onChange={(e) => handleRefundTypeChange(e.target.value)} className="w-3 h-3 text-emerald-600 cursor-pointer" />
                        Refund without cancellation
                      </label>
                    </div>

                    {refundType === 'refund_without_cancellation' && (
                      <div ref={refundItemsRef} className="mt-3 p-3 border border-slate-200 rounded-md bg-white">
                        <h5 className="text-xs font-medium text-slate-700 mb-2">Refund debit</h5>
                        <table className="w-full border-collapse text-[11px]">
                          <thead>
                            <tr>
                              <th className="px-1.5 py-1 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Name</th>
                              <th className="px-1.5 py-1 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Cust.</th>
                              <th className="px-1.5 py-1 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Remark</th>
                              <th className="px-1.5 py-1 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Qty</th>
                              <th className="px-1.5 py-1 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Amt</th>
                              <th className="px-1.5 py-1 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Refund %</th>
                              <th className="px-1.5 py-1 border border-slate-200 text-center bg-emerald-50 font-semibold text-slate-800">Refund ₹</th>
                            </tr>
                          </thead>
                          <tbody>
                            {refundItems.filter(item => !isDeliveryFeeRow(item)).map((item) => (
                              <tr key={item.id} className={item.refundPercentage > 0 ? 'bg-green-50/50' : ''}>
                                <td className="px-1.5 py-1 border border-slate-200 text-slate-600">({item.id}) {item.name}</td>
                                <td className="px-1.5 py-1 border border-slate-200 text-left align-top text-slate-600 min-w-[120px]">
                                  <CustomisationCell
                                    detail={item.customisationDetail}
                                    fallback={item.customisation}
                                    compact
                                  />
                                </td>
                                <td className="px-1.5 py-1 border border-slate-200">
                                  <input type="text" value={item.remark} onChange={(e) => handleRemarkChange(item.id, e.target.value)} placeholder="Remark" className="w-full h-6 px-1.5 border border-slate-200 rounded text-[10px] bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                                </td>
                                <td className="px-1.5 py-1 border border-slate-200 text-center">
                                  <select value={item.selectedQuantity || 1} onChange={(e) => handleRefundQuantityChange(item.id, parseInt(e.target.value, 10))} className="w-full h-6 px-1 border border-slate-200 rounded text-[10px] bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 appearance-none cursor-pointer">
                                    {generateQuantityOptionsFrom1(item.quantity).map((qty) => <option key={qty} value={qty}>{qty}</option>)}
                                  </select>
                                </td>
                                <td className="px-1.5 py-1 border border-slate-200 text-center text-slate-600">{item.amountPerQuantity}</td>
                                <td className="px-1.5 py-1 border border-slate-200 text-center">
                                  <select value={item.refundPercentage} onChange={(e) => handlePercentageChange(item.id, parseInt(e.target.value, 10))} className="w-full h-6 px-1 border border-slate-200 rounded text-[10px] bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 appearance-none cursor-pointer">
                                    {generatePercentageOptions().map((pct) => <option key={pct} value={pct}>{pct}%</option>)}
                                  </select>
                                </td>
                                <td className="px-1.5 py-1 border border-slate-200 text-center">
                                  <span className={item.refundPercentage > 0 ? 'font-semibold text-green-600' : 'text-slate-400'}>
                                    {item.refundPercentage > 0 ? `₹${calculatePercentageRefundAmount(item).toFixed(2)}` : '0'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="mt-2 flex justify-end">
                          <div className={`px-3 py-1.5 rounded border text-xs ${calculateTotalPercentageRefundAmount() > 0 ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
                            <span className="font-medium text-slate-700">Total: </span>
                            <span className={calculateTotalPercentageRefundAmount() > 0 ? 'font-bold text-green-600' : 'text-slate-400'}>₹{calculateTotalPercentageRefundAmount().toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {showFault && (
                  <div ref={faultRef} className="mb-3">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Fault</label>
                    <div className="flex gap-2 flex-wrap">
                      {['merchant_fault', '3pl_fault', 'customer_fault', 'exceptional'].map((f) => (
                        <label key={f} className={`flex items-center gap-1.5 border px-2 py-1.5 rounded cursor-pointer bg-white text-[11px] hover:bg-emerald-50 ${fault === f ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                          <input type="radio" name="fault" value={f} checked={fault === f} onChange={(e) => handleFaultChange(e.target.value)} className="w-3 h-3 text-emerald-600 cursor-pointer" />
                          {f === 'merchant_fault' && 'Merchant'}
                          {f === '3pl_fault' && '3PL'}
                          {f === 'customer_fault' && 'Customer'}
                          {f === 'exceptional' && 'Exceptional'}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {showMerchantDebit && (
                  <div ref={merchantDebitRef} className="mb-4">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Merchant debit</label>
                    <div className="flex gap-2 flex-wrap">
                      {['full_debit', 'partial_debit', 'no_debit'].map((d) => (
                        <label key={d} className={`flex items-center gap-1.5 border px-2 py-1.5 rounded cursor-pointer bg-white text-[11px] hover:bg-emerald-50 ${merchantDebit === d ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                          <input type="radio" name="merchantDebit" value={d} checked={merchantDebit === d} onChange={(e) => handleMerchantDebitChange(e.target.value)} className="w-3 h-3 text-emerald-600 cursor-pointer" />
                          {d === 'full_debit' && 'Full'}
                          {d === 'partial_debit' && 'Partial'}
                          {d === 'no_debit' && 'No debit'}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-200">
              <button type="button" onClick={handleModalClose} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 border-none rounded font-medium text-xs flex items-center gap-1.5 cursor-pointer">
                <X className="w-4 h-4" /> Close
              </button>
              {canCreateRefund && showSubmit && (
                <button type="button" ref={submitButtonRef} onClick={handleSubmit} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white border-none rounded font-semibold text-xs flex items-center gap-1.5 cursor-pointer">
                  <CheckCircle className="w-4 h-4" /> Submit Refund
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
