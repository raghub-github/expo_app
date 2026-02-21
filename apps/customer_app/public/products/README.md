# Product images

Add product images here for the Shop / Marketplace. The app will use them when you map image keys in `features/shop/data.ts` (e.g. `product1.png` → key `p1`).

**Example:**
- `product1.png`
- `product2.png`

Use optimized sizes (e.g. 400×400 px) for fast loading. In `data.ts`, extend `PRODUCT_IMAGES`:

```ts
export const PRODUCT_IMAGES: Record<string, ImageSourcePropType> = {
  p1: require("../../public/products/product1.png"),
  p2: require("../../public/products/product2.png"),
  // ...
};
```

Until then, the app uses placeholders from `public/img/`.
