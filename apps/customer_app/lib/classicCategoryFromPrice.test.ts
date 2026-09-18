import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCategoryFromPriceMap,
  itemMatchesCategoryLabel,
  minPriceForCategory,
  pickLowestItemPerCategory,
} from "./classicCategoryFromPrice";
import type { FoodItemUnderPrice } from "@/services/foodHomeItemsUnderPrice.service";

const items: FoodItemUnderPrice[] = [
  {
    itemId: "1",
    menuItemPk: 1,
    name: "Chicken Biryani",
    imageUrl: null,
    price: 149,
    basePrice: 199,
    storePublicId: "s1",
    storeName: "A",
    isVeg: false,
    itemTags: ["biryani"],
  },
  {
    itemId: "2",
    menuItemPk: 2,
    name: "Veg Biryani Bowl",
    imageUrl: null,
    price: 99,
    basePrice: null,
    storePublicId: "s1",
    storeName: "A",
    isVeg: true,
    itemTags: [],
  },
  {
    itemId: "3",
    menuItemPk: 3,
    name: "Margherita Pizza",
    imageUrl: null,
    price: 179,
    basePrice: null,
    storePublicId: "s2",
    storeName: "B",
    isVeg: true,
    itemTags: ["pizza"],
  },
];

describe("classicCategoryFromPrice", () => {
  it("matches by name / tags", () => {
    assert.equal(itemMatchesCategoryLabel(items[0]!, "Biryani"), true);
    assert.equal(itemMatchesCategoryLabel(items[2]!, "Biryani"), false);
    assert.equal(itemMatchesCategoryLabel(items[2]!, "Pizza"), true);
  });

  it("returns the lowest matching price per category", () => {
    assert.equal(minPriceForCategory(items, "Biryani"), 99);
    assert.equal(minPriceForCategory(items, "Pizza"), 179);
    assert.equal(minPriceForCategory(items, "Momos"), null);
  });

  it("does not match short labels as substrings (tea vs steamed)", () => {
    assert.equal(
      itemMatchesCategoryLabel(
        {
          itemId: "x",
          menuItemPk: 1,
          name: "Steamed Veg Momos",
          imageUrl: null,
          price: 99,
          basePrice: null,
          storePublicId: "s",
          storeName: "A",
          isVeg: true,
        } as unknown as FoodItemUnderPrice,
        "Tea"
      ),
      false
    );
  });

  it("builds a sparse id→price map (no fake shared price)", () => {
    const map = buildCategoryFromPriceMap(
      [
        { id: "1", name: "Biryani", slug: "biryani" },
        { id: "2", name: "Pizza", slug: "pizza" },
        { id: "3", name: "Momos", slug: "momos" },
      ],
      items
    );
    assert.equal(map["1"], 99);
    assert.equal(map["2"], 179);
    assert.equal(map["3"], undefined);
  });

  it("picks one lowest imaged item per category (no same-category dump)", () => {
    const storeItems: FoodItemUnderPrice[] = [
      {
        itemId: "a",
        menuItemPk: 1,
        name: "Plain Chapati",
        imageUrl: "https://x/a.jpg",
        price: 18,
        basePrice: null,
        storePublicId: "s1",
        storeName: "A",
        isVeg: true,
        itemTags: ["roti"],
      },
      {
        itemId: "b",
        menuItemPk: 2,
        name: "Butter Roti",
        imageUrl: "https://x/b.jpg",
        price: 25,
        basePrice: null,
        storePublicId: "s1",
        storeName: "A",
        isVeg: true,
        itemTags: ["roti"],
      },
      {
        itemId: "c",
        menuItemPk: 3,
        name: "Veg Burger",
        imageUrl: "https://x/c.jpg",
        price: 49,
        basePrice: null,
        storePublicId: "s1",
        storeName: "A",
        isVeg: true,
        itemTags: ["burger"],
      },
      {
        itemId: "d",
        menuItemPk: 4,
        name: "Cheese Burger",
        imageUrl: "https://x/d.jpg",
        price: 79,
        basePrice: null,
        storePublicId: "s1",
        storeName: "A",
        isVeg: true,
        itemTags: ["burger"],
      },
      {
        itemId: "e",
        menuItemPk: 5,
        name: "Veg Sandwich",
        imageUrl: "https://x/e.jpg",
        price: 55,
        basePrice: null,
        storePublicId: "s1",
        storeName: "A",
        isVeg: true,
        itemTags: ["sandwich"],
      },
    ];
    const picks = pickLowestItemPerCategory(
      storeItems,
      [
        { id: "1", name: "Burger", slug: "burger" },
        { id: "2", name: "Sandwich", slug: "sandwich" },
        { id: "3", name: "Roti", slug: "roti" },
        { id: "4", name: "Momos", slug: "momos" },
      ],
      12
    );
    assert.deepEqual(
      picks.map((p) => p.itemId),
      ["a", "c", "e"]
    );
  });
});
