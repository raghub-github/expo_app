"use client";

import React, { useEffect, useState } from "react";
import { R2Image } from "@/components/ui/R2Image";

type StoreHoursDay = {
  closed: boolean;
  slot1_open: string;
  slot1_close: string;
  slot2_open: string;
  slot2_close: string;
};

export type StoreSetupData = {
  banner_preview: string;
  gallery_previews: string[];
  cuisine_types: string[];
  avg_preparation_time_minutes: number;
  min_order_amount: number;
  delivery_radius_km: number;
  is_pure_veg: boolean;
  accepts_online_payment: boolean;
  accepts_cash: boolean;
  store_hours: {
    monday: StoreHoursDay;
    tuesday: StoreHoursDay;
    wednesday: StoreHoursDay;
    thursday: StoreHoursDay;
    friday: StoreHoursDay;
    saturday: StoreHoursDay;
    sunday: StoreHoursDay;
  };
};

const defaultDay: StoreHoursDay = {
  closed: false,
  slot1_open: "09:00",
  slot1_close: "22:00",
  slot2_open: "",
  slot2_close: "",
};

const defaultStoreSetup: StoreSetupData = {
  banner_preview: "",
  gallery_previews: [],
  cuisine_types: [],
  avg_preparation_time_minutes: 30,
  min_order_amount: 0,
  delivery_radius_km: 5,
  is_pure_veg: false,
  accepts_online_payment: true,
  accepts_cash: false,
  store_hours: {
    monday: { ...defaultDay },
    tuesday: { ...defaultDay },
    wednesday: { ...defaultDay },
    thursday: { ...defaultDay },
    friday: { ...defaultDay },
    saturday: { ...defaultDay, slot1_open: "10:00", slot1_close: "23:00" },
    sunday: { ...defaultDay, slot1_open: "10:00", slot1_close: "22:00" },
  },
};

export interface Step5StoreSetupProps {
  initialStoreSetup?: Partial<StoreSetupData> | null;
  onChange?: (value: StoreSetupData) => void;
  onDeleteBanner?: (currentBannerUrl: string) => void | Promise<void>;
  onDeleteGalleryImage?: (index: number, url: string) => void | Promise<void>;
  storeInternalId?: number | null;
  onMediaUploadingChange?: (uploading: boolean) => void;
}

const MAX_GALLERY_IMAGES = 5;

// Keep in sync with partner site cuisine list so filters line up.
const ALL_CUISINES: string[] = [
  "North Indian",
  "Chinese",
  "Fast Food",
  "South Indian",
  "Biryani",
  "Pizza",
  "Bakery",
  "Street Food",
  "Burger",
  "Mughlai",
  "Momos",
  "Sandwich",
  "Mithai",
  "Rolls",
  "Beverages",
  "Desserts",
  "Cafe",
  "Healthy Food",
  "Maharashtrian",
  "Tea",
  "Bengali",
  "Ice Cream",
  "Juices",
  "Shake",
  "Shawarma",
  "Gujarati",
  "Italian",
  "Continental",
  "Lebanese",
  "Salad",
  "Andhra",
  "Waffle",
  "Coffee",
  "Kebab",
  "Arabian",
  "Kerala",
  "Asian",
  "Seafood",
  "Pasta",
  "Bbq",
  "Rajasthani",
  "Wraps",
  "Paan",
  "Hyderabadi",
  "Mexican",
  "Bihari",
  "Goan",
  "Assamese",
  "American",
  "Mandi",
  "Chettinad",
  "Mishti",
  "Bar Food",
  "Malwani",
  "Odia",
  "Roast Chicken",
  "Tamil",
  "Japanese",
  "Finger Food",
  "Korean",
  "North Eastern",
  "Thai",
  "Kathiyawadi",
  "Bubble Tea",
  "Mangalorean",
  "Burmese",
  "Sushi",
  "Lucknowi",
  "Modern Indian",
  "Tibetan",
  "Afghan",
  "Oriental",
  "Pancake",
  "Kashmiri",
  "Middle Eastern",
  "Grocery",
  "Konkan",
  "European",
  "Awadhi",
  "Hot Dogs",
  "Sindhi",
  "Turkish",
  "Naga",
  "Mediterranean",
  "Nepalese",
  "Cuisine Varies",
  "Saoji",
  "Charcoal Chicken",
  "Steak",
  "Frozen Yogurt",
  "Panini",
  "Parsi",
  "Sichuan",
  "Iranian",
  "Grilled Chicken",
  "French",
  "Raw Meats",
  "Drinks Only",
  "Vietnamese",
  "Liquor",
  "Greek",
  "Himachali",
  "Bohri",
  "Garhwali",
  "Cantonese",
  "Malaysian",
  "Belgian",
  "British",
  "African",
  "Spanish",
  "Manipuri",
  "Egyptian",
  "Sri Lankan",
  "Relief Fund",
  "Bangladeshi",
  "Indonesian",
  "Tex-mex",
  "Irish",
  "Singaporean",
  "South American",
  "Mongolian",
  "German",
  "Russian",
  "Brazilian",
  "Pakistani",
  "Australian",
  "Moroccan",
  "Filipino",
  "Hot Pot",
  "Retail Products",
  "Mizo",
  "Portuguese",
  "Indian",
  "Tripuri",
  "Delight Goodies",
  "Meghalayan",
  "Sikkimese",
  "Armenian",
  "Afghani",
];

export default function Step5StoreSetup(props: Step5StoreSetupProps) {
  const {
    initialStoreSetup,
    onChange,
    onDeleteBanner,
    onDeleteGalleryImage,
    storeInternalId,
    onMediaUploadingChange,
  } = props;

  const [storeSetup, setStoreSetup] = useState<StoreSetupData>(() => ({
    ...defaultStoreSetup,
    ...(initialStoreSetup || {}),
    store_hours: {
      ...defaultStoreSetup.store_hours,
      ...(initialStoreSetup?.store_hours || {}),
    },
  }));

  const [mediaUploading, setMediaUploading] = useState(false);

  useEffect(() => {
    onMediaUploadingChange?.(mediaUploading);
  }, [mediaUploading, onMediaUploadingChange]);

  const [cuisineSearch, setCuisineSearch] = useState("");
  const [presetToggles, setPresetToggles] = useState({
    sameAsMonday: false,
    weekdayWeekend: false,
    lunchDinner: false,
    is24Hours: false,
  });

  // Keep preset toggles in sync with the actual store_hours pattern so
  // they reflect loaded values and manual edits, not just clicks.
  useEffect(() => {
    const hours = storeSetup.store_hours;
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

    const is24Hours = days.every((day) => {
      const h = hours[day];
      return (
        !h.closed &&
        h.slot1_open === "00:00" &&
        h.slot1_close === "23:59" &&
        !h.slot2_open &&
        !h.slot2_close
      );
    });

    // same as Monday: all days identical to Monday
    const sameAsMonday = days.every((day) => {
      const dayHours = hours[day];
      const monday = hours.monday;
      return (
        dayHours.closed === monday.closed &&
        dayHours.slot1_open === monday.slot1_open &&
        dayHours.slot1_close === monday.slot1_close &&
        dayHours.slot2_open === monday.slot2_open &&
        dayHours.slot2_close === monday.slot2_close
      );
    });

    // Weekday + Weekend pattern: Mon–Fri same, Sat–Sun same, and weekday != weekend
    const weekdayDays = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
    const weekendDays = ["saturday", "sunday"] as const;
    const weekdayHours = weekdayDays.map((day) => hours[day]);
    const weekendHours = weekendDays.map((day) => hours[day]);

    const weekdaySame = weekdayDays.every((day) => {
      const dayHours = hours[day];
      const firstWeekday = hours.monday;
      return (
        dayHours.closed === firstWeekday.closed &&
        dayHours.slot1_open === firstWeekday.slot1_open &&
        dayHours.slot1_close === firstWeekday.slot1_close &&
        dayHours.slot2_open === firstWeekday.slot2_open &&
        dayHours.slot2_close === firstWeekday.slot2_close
      );
    });

    const weekendSame = weekendDays.every((day) => {
      const dayHours = hours[day];
      const firstWeekend = hours.saturday;
      return (
        dayHours.closed === firstWeekend.closed &&
        dayHours.slot1_open === firstWeekend.slot1_open &&
        dayHours.slot1_close === firstWeekend.slot1_close &&
        dayHours.slot2_open === firstWeekend.slot2_open &&
        dayHours.slot2_close === firstWeekend.slot2_close
      );
    });

    const weekdayWeekend =
      weekdaySame &&
      weekendSame &&
      JSON.stringify(weekdayHours[0]) !== JSON.stringify(weekendHours[0]);

    // Lunch + Dinner: all days have both slots filled (pattern-only check like partnersite)
    const lunchDinner = Object.values(hours).every((day) => {
      return (
        !day.closed &&
        !!day.slot1_open &&
        !!day.slot1_close &&
        !!day.slot2_open &&
        !!day.slot2_close
      );
    });

    setPresetToggles({
      sameAsMonday: sameAsMonday && !is24Hours,
      weekdayWeekend: weekdayWeekend && !is24Hours && !sameAsMonday,
      lunchDinner: lunchDinner && !is24Hours,
      is24Hours,
    });
  }, [storeSetup.store_hours]);

  const normalizeMediaSrc = (value: string | null | undefined): string | undefined => {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith("/api/attachments/proxy")) return trimmed;
    if (
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://") ||
      trimmed.startsWith("data:") ||
      trimmed.startsWith("blob:")
    ) {
      return trimmed;
    }
    // Treat as raw R2 key ("docs/merchants/...") and wrap in proxy URL
    return `/api/attachments/proxy?key=${encodeURIComponent(trimmed.replace(/^\/+/, ""))}`;
  };

  const uploadProfileMedia = async (
    file: File,
    type: "banner" | "gallery",
    index: number = 0
  ): Promise<string | null> => {
    if (storeInternalId == null || !Number.isFinite(storeInternalId)) return null;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", type);
    formData.append("index", String(index));

    const res = await fetch(`/api/merchant/stores/${storeInternalId}/profile-media`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    const json = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      throw new Error(json?.error ?? "Failed to upload media");
    }
    const key = json?.key;
    if (!key || typeof key !== "string") return null;
    return `/api/attachments/proxy?key=${encodeURIComponent(key)}`;
  };

  useEffect(() => {
    onChange?.(storeSetup);
  }, [storeSetup, onChange]);

  const handleSimpleFieldChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setStoreSetup((prev) => ({
      ...prev,
      [name]:
        name === "delivery_radius_km" ||
        name === "avg_preparation_time_minutes" ||
        name === "min_order_amount"
          ? Number(value || 0)
          : value,
    }));
  };

  const handleToggleFeature = (key: "is_pure_veg" | "accepts_online_payment" | "accepts_cash") => {
    setStoreSetup((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const toggleCuisine = (cuisine: string) => {
    setStoreSetup((prev) => {
      const exists = prev.cuisine_types.includes(cuisine);
      if (exists) {
        return {
          ...prev,
          cuisine_types: prev.cuisine_types.filter((c) => c !== cuisine),
        };
      }
      if (prev.cuisine_types.length >= 10) return prev;
      return {
        ...prev,
        cuisine_types: [...prev.cuisine_types, cuisine],
      };
    });
  };

  const handleStoreHoursChange = (
    day: keyof StoreSetupData["store_hours"],
    field: keyof StoreHoursDay,
    value: string | boolean
  ) => {
    setStoreSetup((prev) => ({
      ...prev,
      store_hours: {
        ...prev.store_hours,
        [day]: {
          ...prev.store_hours[day],
          [field]: value,
        },
      },
    }));
  };

  const toggleDayOpen = (day: keyof StoreSetupData["store_hours"]) => {
    setStoreSetup((prev) => {
      const current = prev.store_hours[day];
      return {
        ...prev,
        store_hours: {
          ...prev.store_hours,
          [day]: {
            ...current,
            closed: !current.closed,
          },
        },
      };
    });
  };

  const addSlot = (day: keyof StoreSetupData["store_hours"]) => {
    setStoreSetup((prev) => {
      const current = prev.store_hours[day];
      return {
        ...prev,
        store_hours: {
          ...prev.store_hours,
          [day]: {
            ...current,
            slot2_open: current.slot2_open || "13:00",
            slot2_close: current.slot2_close || "16:00",
          },
        },
      };
    });
  };

  const removeSlot2 = (day: keyof StoreSetupData["store_hours"]) => {
    setStoreSetup((prev) => {
      const current = prev.store_hours[day];
      return {
        ...prev,
        store_hours: {
          ...prev.store_hours,
          [day]: {
            ...current,
            slot2_open: "",
            slot2_close: "",
          },
        },
      };
    });
  };

  const applyHoursPreset = (preset: "same_as_monday" | "weekday_weekend" | "lunch_dinner" | "full_day") => {
    setStoreSetup((prev) => {
      const next = { ...prev, store_hours: { ...prev.store_hours } };
      const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

      if (preset === "full_day") {
        days.forEach((day) => {
          next.store_hours[day] = {
            closed: false,
            slot1_open: "00:00",
            slot1_close: "23:59",
            slot2_open: "",
            slot2_close: "",
          };
        });
      } else if (preset === "same_as_monday") {
        const ref = next.store_hours.monday;
        days.forEach((day) => {
          if (day === "monday") return;
          next.store_hours[day] = { ...ref };
        });
      } else if (preset === "weekday_weekend") {
        const weekday = next.store_hours.monday;
        const weekend = next.store_hours.saturday;
        ["tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
          next.store_hours[day as keyof StoreSetupData["store_hours"]] = { ...weekday };
        });
        next.store_hours.saturday = { ...weekend };
        next.store_hours.sunday = { ...weekend };
      } else if (preset === "lunch_dinner") {
        days.forEach((day) => {
          next.store_hours[day] = {
            closed: false,
            slot1_open: "12:00",
            slot1_close: "15:30",
            slot2_open: "19:00",
            slot2_close: "23:00",
          };
        });
      }

      return next;
    });

    setPresetToggles((prev) => ({
      sameAsMonday: preset === "same_as_monday",
      weekdayWeekend: preset === "weekday_weekend",
      lunchDinner: preset === "lunch_dinner",
      is24Hours: preset === "full_day",
    }));
  };

  const filteredCuisines = ALL_CUISINES.filter((c) =>
    c.toLowerCase().includes(cuisineSearch.toLowerCase())
  );

  return (
    <div className="h-full flex items-start justify-center">
      <div className="w-full max-w-6xl h-full overflow-y-auto rounded-2xl bg-white shadow-sm border border-slate-200 p-3 sm:p-6 hide-scrollbar">
        <div className="mb-4 sm:mb-5">
          <h2 className="text-base sm:text-xl font-bold text-slate-800">
            Store Configuration
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Configure your store settings and preferences.
          </p>
        </div>

        <div className="space-y-4 sm:space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            <div className="border border-slate-200 rounded-lg p-3 sm:p-4 bg-slate-50">
              <h3 className="text-xs sm:text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-indigo-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Store Features <span className="text-red-500">*</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <FeatureToggleCard
                  title="Pure Vegetarian"
                  subtitle="Serves only veg food"
                  checked={storeSetup.is_pure_veg}
                  onClick={() => handleToggleFeature("is_pure_veg")}
                />
                <FeatureToggleCard
                  title="Online Payment"
                  subtitle="Accept digital payments"
                  checked={storeSetup.accepts_online_payment}
                  onClick={() => handleToggleFeature("accepts_online_payment")}
                />
                <FeatureToggleCard
                  title="Cash on Delivery"
                  subtitle="Accept cash payments"
                  checked={storeSetup.accepts_cash}
                  onClick={() => handleToggleFeature("accepts_cash")}
                />
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg p-3 sm:p-4 bg-white shadow-sm">
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                Delivery Radius (km)
              </label>
              <input
                name="delivery_radius_km"
                type="number"
                value={
                  typeof storeSetup.delivery_radius_km === "number" &&
                  !Number.isNaN(storeSetup.delivery_radius_km)
                    ? storeSetup.delivery_radius_km
                    : 5
                }
                onChange={handleSimpleFieldChange}
                className="w-full px-3 py-2.5 sm:py-3 text-sm border border-slate-300 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                min={1}
                max={50}
              />
              <p className="text-xs text-gray-500 mt-1.5">
                Max delivery distance.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
            <div className="space-y-4 sm:space-y-5">
              <div className="border border-slate-200 rounded-lg p-3 sm:p-4 bg-white shadow-sm">
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                  Store Banner
                </label>
                <input
                  type="file"
                  accept="image/*"
                  className="w-full px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm border border-slate-300 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white file:mr-2 file:py-1 file:px-2 file:text-xs file:rounded file:border-0 file:bg-indigo-50 file:text-indigo-700"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    if (!file) return;
                    const prevBannerPreview = storeSetup.banner_preview;
                    void (async () => {
                      setMediaUploading(true);
                      try {
                        const dataUrl = await new Promise<string>((resolve, reject) => {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            const result = reader.result;
                            if (typeof result === "string" && result) return resolve(result);
                            reject(new Error("Failed to read banner as data URL."));
                          };
                          reader.onerror = () => reject(new Error("Failed to read banner file."));
                          reader.readAsDataURL(file);
                        });

                        // Optimistic preview (we will replace with a proxy URL after upload)
                        setStoreSetup((prev) => ({ ...prev, banner_preview: dataUrl }));

                        const proxyUrl = await uploadProfileMedia(file, "banner");
                        setStoreSetup((prev) => ({
                          ...prev,
                          banner_preview: proxyUrl ?? prevBannerPreview,
                        }));
                      } catch {
                        setStoreSetup((prev) => ({ ...prev, banner_preview: prevBannerPreview }));
                      } finally {
                        setMediaUploading(false);
                      }
                    })();
                  }}
                />
                {storeSetup.banner_preview && (
                  <div className="mt-1.5 space-y-2 relative">
                    <R2Image
                      src={normalizeMediaSrc(storeSetup.banner_preview)}
                      alt="Banner"
                      className="h-14 sm:h-20 w-full object-cover rounded shadow border"
                    />
                    <button
                      type="button"
                      className="absolute top-1.5 right-1.5 bg-white/90 rounded-full p-1 shadow text-xs text-rose-600 hover:text-rose-700"
                      onClick={() => {
                        const current = storeSetup.banner_preview;
                        setStoreSetup((prev) => ({
                          ...prev,
                          banner_preview: "",
                        }));
                        onDeleteBanner?.(current);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-1">JPG, PNG</p>
              </div>

              <div className="border border-slate-200 rounded-lg p-3 sm:p-4 bg-white shadow-sm">
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                  Gallery Images
                </label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="w-full px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm border border-slate-300 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-indigo-500 bg-white file:mr-2 file:py-1 file:px-2 file:text-xs file:rounded file:border-0 file:bg-indigo-50 file:text-indigo-700"
                  onChange={(e) => {
                    const files = e.target.files ? Array.from(e.target.files) : [];
                    if (files.length === 0) return;
                    const limited = files.slice(0, MAX_GALLERY_IMAGES);

                    const prevGalleryPreviews = storeSetup.gallery_previews;
                    void (async () => {
                      setMediaUploading(true);
                      try {
                        // Optimistic preview while we upload in the background.
                        // After upload completes, we replace with stable proxy URLs.
                        const previews = await Promise.all(
                          limited.map(
                            (file) =>
                              new Promise<string>((resolve, reject) => {
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  const result = reader.result;
                                  if (typeof result === "string" && result) return resolve(result);
                                  reject(new Error("Failed to read image as data URL."));
                                };
                                reader.onerror = () => reject(new Error("Failed to read image."));
                                reader.readAsDataURL(file);
                              })
                          )
                        );

                        setStoreSetup((prev) => ({ ...prev, gallery_previews: previews }));

                        const proxyUrls: string[] = [];
                        for (let i = 0; i < limited.length; i++) {
                          const file = limited[i];
                          const proxyUrl = await uploadProfileMedia(file, "gallery", i);
                          if (!proxyUrl) throw new Error("Failed to upload gallery image.");
                          proxyUrls.push(proxyUrl);
                        }

                        setStoreSetup((prev) => ({ ...prev, gallery_previews: proxyUrls }));
                      } catch {
                        setStoreSetup((prev) => ({ ...prev, gallery_previews: prevGalleryPreviews }));
                      } finally {
                        setMediaUploading(false);
                      }
                    })();
                  }}
                />
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {storeSetup.gallery_previews &&
                    storeSetup.gallery_previews
                      .filter((src) => typeof src === "string" && src.trim())
                      .slice(0, MAX_GALLERY_IMAGES)
                      .map((src, idx) => (
                        <div key={idx} className="relative group">
                          <R2Image
                            src={normalizeMediaSrc(src)}
                            alt={`Gallery ${idx + 1}`}
                            className="h-12 w-12 sm:h-14 sm:w-14 object-cover rounded border"
                          />
                          <button
                            type="button"
                            className="absolute -top-1 -right-1 bg-white/90 rounded-full p-0.5 shadow text-[10px] text-rose-600 hover:text-rose-700"
                            onClick={() => {
                              const url = src;
                              setStoreSetup((prev) => ({
                                ...prev,
                                gallery_previews: prev.gallery_previews.filter(
                                  (_, i) => i !== idx
                                ),
                              }));
                              onDeleteGalleryImage?.(idx, url);
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Multiple images (JPG, PNG) · Max {MAX_GALLERY_IMAGES}
                </p>
              </div>

              <div className="rounded-lg sm:rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                  <div>
                    <h3 className="text-xs sm:text-sm font-semibold text-slate-800 flex items-center gap-2">
                      <svg
                        className="w-4 h-4 text-indigo-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                        />
                      </svg>
                      Cuisine Selection <span className="text-red-500">*</span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Pick cuisines your store serves (max 10).
                    </p>
                  </div>
                  <div className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 w-fit font-medium">
                    Selected: {storeSetup.cuisine_types.length}
                  </div>
                </div>
                <input
                  type="text"
                  value={cuisineSearch}
                  onChange={(e) => setCuisineSearch(e.target.value)}
                  placeholder="Search cuisines..."
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-indigo-500 bg-white mb-2"
                />
                {storeSetup.cuisine_types.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {storeSetup.cuisine_types.map((cuisine) => (
                      <button
                        key={`selected-${cuisine}`}
                        type="button"
                        onClick={() => toggleCuisine(cuisine)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                      >
                        {cuisine}
                        <span className="text-indigo-500">x</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="max-h-44 sm:max-h-52 overflow-y-auto rounded-lg border border-slate-200 p-2.5 sm:p-3 bg-slate-50/70">
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {filteredCuisines.map((cuisine) => {
                      const selected = storeSetup.cuisine_types.includes(cuisine);
                      return (
                        <button
                          key={cuisine}
                          type="button"
                          onClick={() => toggleCuisine(cuisine)}
                          className={`px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm rounded-full border transition ${
                            selected
                              ? "bg-slate-900 text-white border-slate-900"
                              : "bg-white text-slate-700 border-slate-300 hover:border-indigo-400 hover:text-indigo-700"
                          }`}
                        >
                          {cuisine}
                        </button>
                      );
                    })}
                  </div>
                  {filteredCuisines.length === 0 && (
                    <p className="text-xs text-slate-500 py-1.5">
                      No cuisine found.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg p-3 sm:p-4 bg-white shadow-sm">
              <h3 className="text-xs sm:text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-indigo-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Store Hours (Two Slots Per Day){" "}
                <span className="text-red-500">*</span>
              </h3>

              <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <PresetToggle
                  label="Same as Mon"
                  checked={presetToggles.sameAsMonday}
                  onClick={() =>
                    presetToggles.sameAsMonday
                      ? setPresetToggles((prev) => ({
                          ...prev,
                          sameAsMonday: false,
                        }))
                      : applyHoursPreset("same_as_monday")
                  }
                />
                <PresetToggle
                  label="Weekday + Weekend"
                  checked={presetToggles.weekdayWeekend}
                  onClick={() =>
                    presetToggles.weekdayWeekend
                      ? setPresetToggles((prev) => ({
                          ...prev,
                          weekdayWeekend: false,
                        }))
                      : applyHoursPreset("weekday_weekend")
                  }
                />
                <PresetToggle
                  label="Lunch + Dinner"
                  checked={presetToggles.lunchDinner}
                  onClick={() =>
                    presetToggles.lunchDinner
                      ? setPresetToggles((prev) => ({
                          ...prev,
                          lunchDinner: false,
                        }))
                      : applyHoursPreset("lunch_dinner")
                  }
                />
                <PresetToggle
                  label="24x7"
                  checked={presetToggles.is24Hours}
                  onClick={() =>
                    presetToggles.is24Hours
                      ? setPresetToggles((prev) => ({
                          ...prev,
                          is24Hours: false,
                        }))
                      : applyHoursPreset("full_day")
                  }
                />
              </div>

              <div className="mb-4">
                <h4 className="text-xs font-semibold text-gray-800 mb-1.5">
                  Mark open days
                </h4>
                <p className="text-xs text-gray-500 mb-2">
                  Do not forget to uncheck your off-day.
                </p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      "monday",
                      "tuesday",
                      "wednesday",
                      "thursday",
                      "friday",
                      "saturday",
                      "sunday",
                    ] as const
                  ).map((day) => {
                    const isOpen = !storeSetup.store_hours[day].closed;
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDayOpen(day)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition ${
                          isOpen
                            ? "bg-indigo-50 border-indigo-500 text-indigo-700"
                            : "bg-white border-slate-300 text-slate-600 hover:border-slate-400"
                        }`}
                      >
                        {isOpen && (
                          <svg
                            className="w-4 h-4 text-indigo-600"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                        <span className="text-xs font-medium capitalize">
                          {day}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                {(
                  [
                    "monday",
                    "tuesday",
                    "wednesday",
                    "thursday",
                    "friday",
                    "saturday",
                    "sunday",
                  ] as const
                ).map((day) => {
                  const hours = storeSetup.store_hours[day];
                  const isOpen = !hours.closed;
                  const hasSlot1 = !!(hours.slot1_open && hours.slot1_close);
                  const hasSlot2 = !!(hours.slot2_open && hours.slot2_close);

                  if (!isOpen) return null;

                  return (
                    <div
                      key={day}
                      className="border border-slate-200 rounded-lg p-2 bg-slate-50/50"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-gray-700 capitalize">
                          {day}
                        </span>
                        {hasSlot1 && !hasSlot2 && (
                          <button
                            type="button"
                            onClick={() => addSlot(day)}
                            className="text-xs px-2 py-0.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition"
                          >
                            + Add Slot
                          </button>
                        )}
                      </div>

                      {hasSlot1 ? (
                        <div className="mb-1.5">
                          <div className="text-xs text-slate-500 mb-0.5">
                            Slot 1
                          </div>
                          <div className="grid grid-cols-2 gap-1">
                            <input
                              type="time"
                              value={hours.slot1_open || ""}
                              onChange={(e) =>
                                handleStoreHoursChange(
                                  day,
                                  "slot1_open",
                                  e.target.value
                                )
                              }
                              className="w-full px-1.5 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 bg-white"
                            />
                            <input
                              type="time"
                              value={hours.slot1_close || ""}
                              onChange={(e) =>
                                handleStoreHoursChange(
                                  day,
                                  "slot1_close",
                                  e.target.value
                                )
                              }
                              className="w-full px-1.5 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 bg-white"
                            />
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            handleStoreHoursChange(day, "slot1_open", "09:00");
                            handleStoreHoursChange(day, "slot1_close", "22:00");
                          }}
                          className="w-full text-xs px-2 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition mb-1.5"
                        >
                          + Add Slot 1
                        </button>
                      )}

                      {hasSlot2 && (
                        <div>
                          <div className="flex items-center justify-between mb-0.5">
                            <div className="text-xs text-slate-500">
                              Slot 2
                            </div>
                            <button
                              type="button"
                              onClick={() => removeSlot2(day)}
                              className="text-xs text-red-600 hover:text-red-700"
                            >
                              Remove
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-1">
                            <input
                              type="time"
                              value={hours.slot2_open || ""}
                              onChange={(e) =>
                                handleStoreHoursChange(
                                  day,
                                  "slot2_open",
                                  e.target.value
                                )
                              }
                              className="w-full px-1.5 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 bg-white"
                            />
                            <input
                              type="time"
                              value={hours.slot2_close || ""}
                              onChange={(e) =>
                                handleStoreHoursChange(
                                  day,
                                  "slot2_close",
                                  e.target.value
                                )
                              }
                              className="w-full px-1.5 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 bg-white"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface FeatureToggleCardProps {
  title: string;
  subtitle: string;
  checked: boolean;
  onClick: () => void;
}

const FeatureToggleCard: React.FC<FeatureToggleCardProps> = ({
  title,
  subtitle,
  checked,
  onClick,
}) => {
  return (
    <div className="flex items-center justify-between gap-2 sm:gap-3 p-2 sm:p-2.5 border border-slate-200 rounded-lg bg-white">
      <div>
        <div className="text-xs sm:text-sm font-medium text-gray-700">
          {title}
        </div>
        <div className="text-xs text-gray-500">{subtitle}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onClick}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${
          checked ? "bg-indigo-600" : "bg-slate-200"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 shrink-0 transform rounded-full bg-white shadow ring-0 transition ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
};

interface PresetToggleProps {
  label: string;
  checked: boolean;
  onClick: () => void;
}

const PresetToggle: React.FC<PresetToggleProps> = ({
  label,
  checked,
  onClick,
}) => {
  return (
    <div className="flex items-center justify-between gap-2 p-2 border border-slate-200 rounded-lg bg-slate-50">
      <span className="text-xs font-medium text-gray-700">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onClick}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
          checked ? "bg-indigo-600" : "bg-slate-300"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 shrink-0 transform rounded-full bg-white shadow ring-0 transition ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
};

