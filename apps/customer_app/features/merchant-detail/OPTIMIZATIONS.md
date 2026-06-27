# Store Details Page — Performance Architecture

Ultra-smooth scrolling for the GatiMitra merchant (store) details screen.

## Scrolling engine

- **FlashList** (`@shopify/flash-list`) replaces `SectionList` / `ScrollView` for the full page.
- Menu rows are **fully virtualized** — only visible cells mount.
- Flat list model: hero → info → filters → categories → smart sections → category headers → menu items → footer.
- `getItemType` + `overrideItemLayout` + fixed `ESTIMATED_ITEM_SIZES` per row type.

## UI-thread animations (Reanimated v3)

- `useAnimatedScrollHandler` drives scroll — **no React state in `onScroll`**.
- Hero banner collapses via **`translateY` + `scale` only** (no height animation).
- Restaurant info fades via **opacity** only.
- Sticky chrome (search → categories → filters) uses **opacity + translateY** with in-list placeholders to prevent layout jumps.
- Floating Menu FAB uses Reanimated **opacity + translateY**.

## Sticky chrome order

1. Search (locks when hero scrolls past threshold)
2. Category chips (locks below search)
3. Diet / filter bar (locks below categories)

In-list copies of category + filter rows remain in the scroll content; sticky overlays cross-fade in without reflow.

## Memoization

- `React.memo`: `MerchantDetailFlashList`, `MerchantStickyChrome`, `MerchantCategoryRow`, `MerchantFloatingFab`, `StoreMenuItemRow`, `StoreFilterBar`.
- Stable `useCallback` handlers passed to list rows — no inline lambdas in hot paths.
- `extraData` on FlashList limited to filter/highlight/category state.

## Images

- Menu card images use **`expo-image`** with `memory-disk` cache, `recyclingKey`, and fade transition.
- Banner carousel unchanged but hero uses transform-only collapse so images are not remounted on scroll.

## Search

- Menu filter uses **`useDebouncedValue` (200ms)** — filtering runs on debounced query, not every keystroke.

## Network

- Existing prefetch paths retained: `prefetchMerchantDetail`, `prefetchMenuItemFullConfigsForMenu`, placeholder data from list cache.
- No new fetches during scroll.

## FlashList tuning (`constants/layout.ts`)

FlashList **v2** auto-measures row heights. We still use:

| Prop | Value |
|------|-------|
| `drawDistance` | 280 |
| `getItemType` | per row type (hero, menu_item, …) |
| `removeClippedSubviews` | true |
| `ESTIMATED_ITEM_SIZES` | documentation / future `overrideItemLayout` span hints |

## Folder layout

```
features/merchant-detail/
  constants/layout.ts
  types.ts
  lib/
    buildFlashListData.ts
    flashListScroll.ts
    menuSections.ts
  hooks/
    useMerchantScrollAnimation.ts
  components/
    MerchantDetailFlashList.tsx
    MerchantStickyChrome.tsx
    MerchantCategoryRow.tsx
    MerchantFloatingFab.tsx
```

## Profiling checklist

- React DevTools Profiler: menu row render count while fling-scrolling
- RN Performance Monitor: JS + UI FPS ≈ 60
- FlashList: blank gaps → adjust `ESTIMATED_ITEM_SIZES`
- Hermes enabled (Expo default)
