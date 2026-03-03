/**
 * Search screen – category grid and mock data for search results.
 * Category images match home/public/img; slug used for navigation.
 */

export const SEARCH_CATEGORY_IMAGES: Record<string, ReturnType<typeof require>> = {
  biryani: require("../public/img/biryani.png"),
  chicken: require("../public/img/vegbiryani.png"),
  pizza: require("../public/img/pizza.png"),
  "north-indian": require("../public/img/Paratha.png"),
  paneer: require("../public/img/vegbiryani.png"),
  chinese: require("../public/img/Noodles.png"),
  cake: require("../public/img/Cake.png"),
  "veg-meal": require("../public/img/thali.png"),
  sweets: require("../public/img/gulabjamun.png"),
  thali: require("../public/img/thali.png"),
  burger: require("../public/img/burger.png"),
  rolls: require("../public/img/Paratha.png"),
  noodles: require("../public/img/Noodles.png"),
  dosa: require("../public/img/Dosa.png"),
  momos: require("../public/img/ndf.png"),
  "fried-rice": require("../public/img/Noodles.png"),
  "chilli-chicken": require("../public/img/ndf.png"),
  "pav-bhaji": require("../public/img/Pav Bhaji.png"),
  default: require("../public/img/ndf.png"),
};

export type SearchCategory = { id: string; name: string; slug: string };

export const SEARCH_CATEGORIES: SearchCategory[] = [
  { id: "1", name: "Biryani", slug: "biryani" },
  { id: "2", name: "Chicken", slug: "chicken" },
  { id: "3", name: "Pizza", slug: "pizza" },
  { id: "4", name: "North Indian", slug: "north-indian" },
  { id: "5", name: "Paneer", slug: "paneer" },
  { id: "6", name: "Chinese", slug: "chinese" },
  { id: "7", name: "Cake", slug: "cake" },
  { id: "8", name: "Veg Meal", slug: "veg-meal" },
  { id: "9", name: "Sweets", slug: "sweets" },
  { id: "10", name: "Thali", slug: "thali" },
  { id: "11", name: "Burger", slug: "burger" },
  { id: "12", name: "Rolls", slug: "rolls" },
  { id: "13", name: "Noodles", slug: "noodles" },
  { id: "14", name: "Chicken Biryani", slug: "biryani" },
  { id: "15", name: "Dosa", slug: "dosa" },
  { id: "16", name: "Fried Rice", slug: "fried-rice" },
  { id: "17", name: "Chilli Chicken", slug: "chilli-chicken" },
  { id: "18", name: "Momos", slug: "momos" },
];

/** Dish result from search (merchant_menu_items); storeId links to merchant. */
export type SearchDish = { id: string; name: string; imageKey: string; restaurantName?: string; storeId?: string };

export const MOCK_DISHES: SearchDish[] = [
  { id: "d1", name: "Hyderabadi Biryani", imageKey: "biryani", restaurantName: "Biryani House" },
  { id: "d2", name: "Veg Biryani", imageKey: "biryani", restaurantName: "Spice Kitchen" },
  { id: "d3", name: "Chicken Biryani", imageKey: "chicken", restaurantName: "Taste of India" },
  { id: "d4", name: "Paneer Biryani", imageKey: "paneer", restaurantName: "Pure Veg" },
  { id: "d5", name: "Margherita Pizza", imageKey: "pizza", restaurantName: "Pizza Corner" },
  { id: "d6", name: "Veg Thali", imageKey: "veg-meal", restaurantName: "Thali House" },
  { id: "d7", name: "Gulab Jamun", imageKey: "sweets", restaurantName: "Sweet Spot" },
  { id: "d8", name: "Masala Dosa", imageKey: "dosa", restaurantName: "South Bite" },
  { id: "d9", name: "Veg Momos", imageKey: "momos", restaurantName: "Momos Point" },
  { id: "d10", name: "Fried Rice", imageKey: "fried-rice", restaurantName: "Wok & Roll" },
];
