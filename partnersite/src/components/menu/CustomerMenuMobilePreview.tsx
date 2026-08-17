'use client';

import React, { useMemo, useState } from 'react';
import { ImageIcon, Search, X, Flame } from 'lucide-react';
import { R2Image } from '@/components/R2Image';

/** Match Customer App StoreTheme */
const CX_BG = '#FFFFFF';
const CX_SELECTED_BG = '#ECFDF5';
const CX_LIST_BG = '#FAFAFA';
const CX_DIVIDER = '#F3F4F6';
/** Customer App ADD outline */
const ADD_GREEN = '#137243';

const ITEM_PLACEHOLDER_SVG =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect width="64" height="64" fill="#f3f4f6"/><path d="M32 18c-5 0-9 4-9 9s4 9 9 9 9-4 9-9-4-9-9-9zm0 14c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5z" fill="#d1d5db"/><path d="M20 38l4 12h16l4-12H20z" fill="#9ca3af"/><ellipse cx="32" cy="44" rx="12" ry="3" fill="#e5e7eb"/></svg>'
  );

export type CustomerMenuPreviewItem = {
  id?: number;
  item_id: string;
  item_name: string;
  item_description?: string | null;
  item_image_url?: string | null;
  food_type?: string | null;
  base_price?: number | string | null;
  selling_price?: number | string | null;
  discount_percentage?: number | string | null;
  is_popular?: boolean | null;
  is_recommended?: boolean | null;
  category_id?: number | null;
  is_deleted?: boolean | null;
  is_active?: boolean | null;
  rating_avg?: number | null;
  rating_count?: number | null;
  average_rating?: number | null;
  ratings_count?: number | null;
};

type LiveDraft = {
  item_name?: string;
  item_description?: string;
  item_image_url?: string;
  food_type?: string;
  base_price?: string | number;
  selling_price?: string | number;
  discount_percentage?: string | number;
  is_popular?: boolean;
  is_recommended?: boolean;
  category_id?: number | null;
};

type FilterChip = 'all' | 'veg' | 'non_veg' | 'best';

function isVeg(foodType?: string | null): boolean {
  const u = String(foodType ?? '').trim().toUpperCase();
  return u === 'VEG' || u === 'VEGAN' || u === 'VEGETARIAN';
}

function isNonVeg(foodType?: string | null): boolean {
  const u = String(foodType ?? '').trim().toUpperCase();
  return u === 'NON_VEG' || u === 'NON-VEG' || u === 'EGG' || u.includes('NON');
}

function formatRupee(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `₹${Math.round(n)}`;
}

function matchesSelectedId(item: CustomerMenuPreviewItem, selectedId: string | null | undefined): boolean {
  const sel = String(selectedId ?? '').trim();
  if (!sel) return false;
  if (String(item.item_id ?? '').trim() === sel) return true;
  if (item.id != null && String(item.id) === sel) return true;
  return false;
}

function DietMark({ foodType }: { foodType?: string | null }) {
  const veg = isVeg(foodType);
  const nonVeg = isNonVeg(foodType);
  if (!veg && !nonVeg) return null;
  return (
    <span
      className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[2px] border ${
        veg ? 'border-emerald-600' : 'border-red-600'
      }`}
      aria-hidden
    >
      {veg ? (
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
      ) : (
        <span
          className="h-0 w-0 border-l-[3.5px] border-r-[3.5px] border-b-[6px] border-l-transparent border-r-transparent border-b-red-600"
          style={{ marginTop: 1 }}
        />
      )}
    </span>
  );
}

function StarRow({ avg, count }: { avg: number | null; count: number | null }) {
  if (avg == null || !Number.isFinite(avg) || avg <= 0) return null;
  const filled = Math.max(0, Math.min(5, Math.round(avg)));
  return (
    <div className="mt-0.5 flex items-center gap-1">
      <div className="flex items-center gap-px" aria-label={`${avg.toFixed(1)} stars`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className={`text-[9px] leading-none ${i < filled ? 'text-amber-400' : 'text-gray-300'}`}>
            ★
          </span>
        ))}
      </div>
      {count != null && count > 0 ? (
        <span className="text-[9px] text-gray-500">{count} ratings</span>
      ) : null}
    </div>
  );
}

function PreviewCard({
  item,
  selected,
  dimmed,
  imageOverride,
  empty,
}: {
  item: CustomerMenuPreviewItem;
  selected: boolean;
  dimmed: boolean;
  imageOverride?: string | null;
  empty?: boolean;
}) {
  if (empty) {
    return (
      <div
        className="h-full min-h-0 overflow-hidden"
        style={{ backgroundColor: CX_LIST_BG, borderBottom: `1px solid ${CX_DIVIDER}` }}
        aria-hidden
      />
    );
  }

  const selling = Number(item.selling_price);
  const base = Number(item.base_price);
  const discountPct = Number(item.discount_percentage);
  const showStrike =
    Number.isFinite(base) && Number.isFinite(selling) && base > selling + 0.001;
  const showPct = Number.isFinite(discountPct) && discountPct > 0 && discountPct <= 100;
  const imageSrc = (imageOverride && imageOverride.trim()) || item.item_image_url || '';
  const desc = String(item.item_description ?? '').replace(/\s+/g, ' ').trim();
  const ratingAvg =
    item.rating_avg != null
      ? Number(item.rating_avg)
      : item.average_rating != null
        ? Number(item.average_rating)
        : null;
  const ratingCount =
    item.rating_count != null
      ? Number(item.rating_count)
      : item.ratings_count != null
        ? Number(item.ratings_count)
        : null;

  return (
    <div
      className={`box-border flex h-full min-h-0 flex-col justify-center overflow-hidden px-2 py-1.5 transition-[opacity,box-shadow,background-color] ${
        dimmed ? 'opacity-40' : 'opacity-100'
      }`}
      style={{
        backgroundColor: selected ? CX_SELECTED_BG : CX_BG,
        boxShadow: selected ? '0 4px 16px rgba(19, 114, 67, 0.12)' : undefined,
        borderBottom: `1px solid ${CX_DIVIDER}`,
      }}
    >
      <div className="flex min-h-0 items-center gap-2">
        <div className="min-w-0 flex-1 overflow-hidden pr-1">
          <div className="flex items-start gap-1">
            <DietMark foodType={item.food_type} />
            <p className="min-w-0 flex-1 text-[11px] font-bold leading-snug text-gray-900 line-clamp-1">
              {item.item_name?.trim() || 'Item name'}
            </p>
          </div>
          {desc ? (
            <p className="mt-0.5 text-[9px] leading-snug text-gray-500 line-clamp-1">
              {desc.length > 56 ? `${desc.slice(0, 56).trimEnd()}…` : desc}
            </p>
          ) : null}
          <StarRow
            avg={ratingAvg != null && Number.isFinite(ratingAvg) ? ratingAvg : null}
            count={ratingCount != null && Number.isFinite(ratingCount) ? ratingCount : null}
          />
          <div className="mt-0.5 flex flex-wrap items-baseline gap-1">
            <span className="text-[11px] font-bold text-gray-900">
              {formatRupee(Number.isFinite(selling) && selling > 0 ? selling : base)}
            </span>
            {showStrike ? (
              <span className="text-[9px] text-gray-400 line-through">{formatRupee(base)}</span>
            ) : null}
            {showPct ? (
              <span className="text-[8px] font-semibold text-sky-600">{Math.round(discountPct)}% OFF</span>
            ) : null}
          </div>
          {selected ? (
            <span className="mt-1 inline-flex rounded bg-emerald-700/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-emerald-800">
              Editing
            </span>
          ) : null}
        </div>

        <div className="relative h-[52px] w-[52px] shrink-0">
          <div className="h-full w-full overflow-hidden rounded-lg bg-gray-100">
            {imageSrc ? (
              imageSrc.startsWith('blob:') || imageSrc.startsWith('data:') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageSrc} alt="" className="h-full w-full object-cover" />
              ) : (
                <R2Image
                  src={imageSrc}
                  alt=""
                  className="h-full w-full object-cover"
                  fallbackSrc={ITEM_PLACEHOLDER_SVG}
                  lazy={false}
                />
              )
            ) : (
              <div className="flex h-full w-full items-center justify-center text-gray-300">
                <ImageIcon size={16} />
              </div>
            )}
          </div>
          <button
            type="button"
            tabIndex={-1}
            className="absolute -bottom-1.5 left-1/2 flex h-[18px] w-[48px] -translate-x-1/2 items-center justify-center rounded border bg-white text-[9px] font-bold uppercase tracking-wide shadow-sm"
            style={{ borderColor: ADD_GREEN, color: ADD_GREEN }}
            aria-hidden
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

export type CustomerMenuMobilePreviewProps = {
  /** Already-loaded Partner Site menu rows — no network fetch. */
  menuItems: CustomerMenuPreviewItem[];
  selectedItemId?: string | null;
  /** Live editor fields for the selected item. */
  draft: LiveDraft;
  /** Local image preview (blob/data/proxy) for the selected item. */
  imagePreview?: string;
  storeName?: string | null;
};

/**
 * Customer App–style menu list preview for the Partner Site item editor.
 * Always shows exactly 3 rows (above / selected / below) fitting the phone
 * viewport — no scroll, no empty bottom gap.
 */
export function CustomerMenuMobilePreview({
  menuItems,
  selectedItemId,
  draft,
  imagePreview,
  storeName,
}: CustomerMenuMobilePreviewProps) {
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState<FilterChip>('all');

  /** Full loaded menu — never collapse to a single-category list. */
  const baseList = useMemo(() => {
    return (menuItems ?? []).filter((m) => m && m.is_deleted !== true);
  }, [menuItems]);

  const listWithDraft = useMemo(() => {
    const id = selectedItemId?.trim() || '__draft__';
    let found = false;
    const mapped = baseList.map((item) => {
      if (!matchesSelectedId(item, id)) return item;
      found = true;
      return {
        ...item,
        item_name: draft.item_name?.trim() ? draft.item_name : item.item_name,
        item_description:
          draft.item_description !== undefined ? draft.item_description : item.item_description,
        food_type: draft.food_type || item.food_type,
        base_price:
          draft.base_price !== undefined && String(draft.base_price).trim() !== ''
            ? Number(draft.base_price)
            : item.base_price,
        selling_price:
          draft.selling_price !== undefined && String(draft.selling_price).trim() !== ''
            ? Number(draft.selling_price)
            : item.selling_price,
        discount_percentage:
          draft.discount_percentage !== undefined && String(draft.discount_percentage).trim() !== ''
            ? Number(draft.discount_percentage)
            : item.discount_percentage,
        is_popular: draft.is_popular ?? item.is_popular,
        is_recommended: draft.is_recommended ?? item.is_recommended,
        item_image_url: imagePreview?.trim() || item.item_image_url,
      };
    });
    if (!found) {
      const insertAt = Math.min(mapped.length, Math.max(0, Math.floor(mapped.length / 2)));
      mapped.splice(insertAt, 0, {
        item_id: id,
        item_name: draft.item_name?.trim() || 'Item name',
        item_description: draft.item_description || '',
        food_type: draft.food_type || 'VEG',
        base_price: Number(draft.base_price) || 0,
        selling_price: Number(draft.selling_price) || Number(draft.base_price) || 0,
        discount_percentage: Number(draft.discount_percentage) || 0,
        item_image_url: imagePreview || '',
        is_popular: draft.is_popular,
        is_recommended: draft.is_recommended,
        category_id: draft.category_id ?? null,
      });
    }
    return mapped;
  }, [baseList, selectedItemId, draft, imagePreview]);

  const filteredList = useMemo(() => {
    let rows = listWithDraft;
    if (chip === 'veg') rows = rows.filter((m) => isVeg(m.food_type));
    else if (chip === 'non_veg') rows = rows.filter((m) => isNonVeg(m.food_type));
    else if (chip === 'best') {
      rows = rows.filter((m) => m.is_popular === true || m.is_recommended === true);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (m) =>
          m.item_name?.toLowerCase().includes(q) ||
          String(m.item_description ?? '')
            .toLowerCase()
            .includes(q)
      );
    }
    const sel = selectedItemId?.trim();
    if (sel && !rows.some((m) => matchesSelectedId(m, sel))) {
      const selected = listWithDraft.find((m) => matchesSelectedId(m, sel));
      if (selected) rows = [selected, ...rows];
    }
    return rows;
  }, [listWithDraft, chip, query, selectedItemId]);

  const centerKey = selectedItemId?.trim() || '__draft__';

  /**
   * Exactly 3 slots — selected item is ALWAYS the middle row.
   * Neighbors wrap around the catalog so the top/bottom slots are never blank
   * when the menu has 2+ items (first → last above; last → first below).
   */
  const triple = useMemo(() => {
    const draftItem = (): CustomerMenuPreviewItem => ({
      item_id: centerKey,
      item_name: draft.item_name?.trim() || 'Item name',
      item_description: draft.item_description || '',
      food_type: draft.food_type || 'VEG',
      base_price: Number(draft.base_price) || 0,
      selling_price: Number(draft.selling_price) || Number(draft.base_price) || 0,
      discount_percentage: Number(draft.discount_percentage) || 0,
      item_image_url: imagePreview || '',
    });

    const empty = (key: string) => ({
      item: { item_id: `__empty_${key}`, item_name: '' } as CustomerMenuPreviewItem,
      empty: true,
      selected: false,
    });

    const asSlot = (item: CustomerMenuPreviewItem, selected: boolean) => ({
      item,
      empty: false,
      selected,
    });

    if (filteredList.length === 0) {
      return [empty('a'), asSlot(draftItem(), true), empty('b')];
    }

    let idx = filteredList.findIndex((m) => matchesSelectedId(m, centerKey));
    if (idx < 0) idx = 0;

    const n = filteredList.length;
    const center = filteredList[idx]!;

    if (n === 1) {
      return [empty('a'), asSlot(center, true), empty('b')];
    }

    // Circular neighbors — never leave top/bottom blank when 2+ items exist.
    const above = filteredList[(idx - 1 + n) % n]!;
    const below = filteredList[(idx + 1) % n]!;

    return [asSlot(above, false), asSlot(center, true), asSlot(below, false)].slice(0, 3);
  }, [filteredList, centerKey, draft, imagePreview]);

  const searchLabel = storeName?.trim() ? `Search in ${storeName}` : 'Search in menu';

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden rounded-[1.9rem] border border-black/10"
      style={{ backgroundColor: CX_LIST_BG }}
    >
      <div className="shrink-0 border-b border-gray-100 bg-white px-2 pt-2 pb-1">
        <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1">
          <Search size={11} className="shrink-0 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchLabel}
            className="min-w-0 flex-1 bg-transparent text-[10px] text-gray-800 outline-none placeholder:text-gray-400"
            aria-label="Search menu preview"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="rounded p-0.5 text-gray-400 hover:text-gray-600"
              aria-label="Clear search"
            >
              <X size={11} />
            </button>
          ) : null}
        </div>
        <div className="mt-1 flex gap-1 overflow-hidden pb-0.5">
          {(
            [
              { id: 'veg' as const, label: 'Veg', tone: 'veg' },
              { id: 'non_veg' as const, label: 'Non Veg', tone: 'non' },
              { id: 'best' as const, label: 'Best Sellers', tone: 'best' },
            ] as const
          ).map((f) => {
            const active = chip === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setChip(active ? 'all' : f.id)}
                className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8px] font-semibold ${
                  active
                    ? 'border-gray-800 bg-gray-900 text-white'
                    : 'border-gray-200 bg-white text-gray-700'
                }`}
              >
                {f.tone === 'veg' ? (
                  <span className="inline-flex h-2.5 w-2.5 items-center justify-center rounded-[1px] border border-emerald-600">
                    <span className="h-1 w-1 rounded-full bg-emerald-600" />
                  </span>
                ) : f.tone === 'non' ? (
                  <span className="inline-flex h-2.5 w-2.5 items-center justify-center rounded-[1px] border border-red-600">
                    <span className="h-0 w-0 border-l-[2.5px] border-r-[2.5px] border-b-[4px] border-l-transparent border-r-transparent border-b-red-600" />
                  </span>
                ) : (
                  <Flame size={8} className={active ? 'text-orange-300' : 'text-orange-500'} />
                )}
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Strict 3 equal rows — never scroll, never show a 4th card */}
      <div
        className="grid min-h-0 flex-1 grid-rows-3 overflow-hidden overscroll-none"
        style={{ backgroundColor: CX_LIST_BG, touchAction: 'none' }}
        onWheel={(e) => e.preventDefault()}
        onTouchMove={(e) => e.preventDefault()}
      >
        {triple.slice(0, 3).map((slot, i) => (
          <div key={`slot-${i}-${slot.item.item_id || slot.item.id || 'x'}`} className="min-h-0 overflow-hidden">
            <PreviewCard
              item={slot.item}
              selected={slot.selected}
              dimmed={!slot.selected && !slot.empty}
              imageOverride={slot.selected ? imagePreview : undefined}
              empty={slot.empty}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
