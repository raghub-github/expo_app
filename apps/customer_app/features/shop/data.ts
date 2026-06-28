/**
 * Shop / Marketplace – categories, products, promo slides.
 * Product images from CMS app assets (CX.shop.product keys).
 */

import type { ImageSourcePropType } from "react-native";
import { CX } from "@/lib/appAssetKeys";
import { getAppAssetUrl } from "@/store/appAssetsStore";

function shopProductSource(n: number): ImageSourcePropType | null {
  const url = getAppAssetUrl(CX.shop.product(n));
  return url ? { uri: url } : null;
}

export function getShopProductImage(key: string): ImageSourcePropType | null {
  const n = Number(String(key).replace(/^p/, ""));
  if (!Number.isFinite(n) || n < 1) return shopProductSource(1);
  return shopProductSource(n);
}

export type ProductCategoryId =
  | "all"
  | "groceries"
  | "electronics"
  | "accessories"
  | "daily"
  | "fashion"
  | "home";

export const SHOP_CATEGORIES: Array<{
  id: ProductCategoryId;
  name: string;
  icon: string;
}> = [
  { id: "all", name: "All", icon: "apps" },
  { id: "groceries", name: "Groceries", icon: "basket" },
  { id: "electronics", name: "Electronics", icon: "phone-portrait" },
  { id: "accessories", name: "Accessories", icon: "watch" },
  { id: "daily", name: "Daily Essentials", icon: "sunny" },
  { id: "fashion", name: "Fashion", icon: "shirt" },
  { id: "home", name: "Home Items", icon: "home" },
];

export type ShopProduct = {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  imageKey: string;
  categoryId: ProductCategoryId;
  rating?: number;
  cod: boolean;
  popular?: boolean;
};

export const SHOP_PRODUCTS: ShopProduct[] = [
  { id: "p1", name: "Organic Rice 1kg", price: 89, originalPrice: 120, imageKey: "p1", categoryId: "groceries", rating: 4.5, cod: true, popular: true },
  { id: "p2", name: "Premium Basmati 2kg", price: 249, originalPrice: 299, imageKey: "p2", categoryId: "groceries", rating: 4.8, cod: true },
  { id: "p3", name: "Wireless Earbuds", price: 1299, originalPrice: 1999, imageKey: "p3", categoryId: "electronics", rating: 4.2, cod: true, popular: true },
  { id: "p4", name: "Smart Band", price: 899, imageKey: "p4", categoryId: "electronics", rating: 4.0, cod: true },
  { id: "p5", name: "Stainless Lunch Box", price: 349, originalPrice: 449, imageKey: "p5", categoryId: "daily", rating: 4.6, cod: true },
  { id: "p6", name: "Desk Organizer Set", price: 199, imageKey: "p6", categoryId: "home", rating: 4.3, cod: true, popular: true },
  { id: "p7", name: "Cotton T-Shirt", price: 499, originalPrice: 699, imageKey: "p7", categoryId: "fashion", rating: 4.4, cod: true },
  { id: "p8", name: "Leather Wallet", price: 599, imageKey: "p8", categoryId: "accessories", rating: 4.7, cod: true },
  { id: "p9", name: "Hand Towel Set", price: 279, imageKey: "p9", categoryId: "home", rating: 4.1, cod: true },
  { id: "p10", name: "Breakfast Cereal 500g", price: 159, originalPrice: 199, imageKey: "p10", categoryId: "groceries", rating: 4.5, cod: true },
  { id: "p11", name: "USB-C Cable Pack", price: 299, imageKey: "p11", categoryId: "electronics", rating: 4.0, cod: true },
  { id: "p12", name: "Scented Candle", price: 189, imageKey: "p12", categoryId: "home", rating: 4.6, cod: true, popular: true },
];

export const PROMO_SLIDES = [
  { id: "s1", title: "Upto 40% OFF", sub: "On groceries & daily essentials", cta: "Shop Now" },
  { id: "s2", title: "Free Delivery", sub: "On orders above ₹299", cta: "Shop Now" },
  { id: "s3", title: "New Arrivals", sub: "Electronics & accessories", cta: "Shop Now" },
];
