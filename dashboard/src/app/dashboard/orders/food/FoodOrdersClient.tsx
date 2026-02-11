"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { X, RefreshCw, Filter, CheckCircle2, ChevronDown } from "lucide-react";

// Exact color codes from reference image
const MINT_GREEN = "#4EE5C1"; // Active buttons and elements
const PAGE_BG = "#F4F6F9"; // Page background
const CONTENT_BG = "#FFFFFF"; // White content background
const INACTIVE_BG = "#F0F2F5"; // Inactive button background
const INACTIVE_TEXT = "#1E3A8A"; // Dark blue text color
const BORDER_COLOR = "#D5DBDE"; // Border color
const DARK_TEXT = "#000000"; // Black text for headers
const TABLE_TEXT = "#000000"; // Black table data text
const CHECKMARK_COLOR = "#2F8F6F"; // Checkmark icon color
const ORDER_TAG_BG = "#ECF8F3"; // Order ID tag background
const ORDER_TAG_TEXT = "#2F8F6F"; // Order ID tag text

interface FilterState {
  delivery: string[]; // Array for multiple selections: "GatiMitra" | "Merchant"
  pickUp: boolean;
  food: boolean;
  fashion: boolean;
  grocery: boolean;
  pharma: boolean;
  overview: boolean;
  userType: string[]; // Array for multiple selections: "Premium" | "Very Good" | "Good" | "Bad"
}

export default function FoodOrdersClient() {
  const [filters, setFilters] = useState<FilterState>({
    delivery: [],
    pickUp: false,
    food: false,
    fashion: false,
    grocery: false,
    pharma: false,
    overview: false,
    userType: [],
  });

  const [selectedStatus, setSelectedStatus] = useState<string | null>(null); // No button active by default
  const [showDeliveryDropdown, setShowDeliveryDropdown] = useState(false);
  const [showUserTypeDropdown, setShowUserTypeDropdown] = useState(false);
  const deliveryRef = useRef<HTMLDivElement>(null);
  const userTypeRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (deliveryRef.current && !deliveryRef.current.contains(event.target as Node)) {
        setShowDeliveryDropdown(false);
      }
      if (userTypeRef.current && !userTypeRef.current.contains(event.target as Node)) {
        setShowUserTypeDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCategoryToggle = (category: keyof FilterState) => {
    if (category === "delivery" || category === "userType") return;
    setFilters((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const handleDeliveryToggle = (value: string) => {
    setFilters((prev) => ({
      ...prev,
      delivery: prev.delivery.includes(value)
        ? prev.delivery.filter((v) => v !== value)
        : [...prev.delivery, value],
    }));
  };

  const handleUserTypeToggle = (value: string) => {
    setFilters((prev) => ({
      ...prev,
      userType: prev.userType.includes(value)
        ? prev.userType.filter((v) => v !== value)
        : [...prev.userType, value],
    }));
  };

  // Build filter chips from applied filters
  const filterChips = useMemo(() => {
    const chips: Array<{ id: string; label: string }> = [];
    filters.delivery.forEach((d) => chips.push({ id: `delivery-${d}`, label: d }));
    if (filters.pickUp) chips.push({ id: "pickUp", label: "Pickup" });
    if (filters.food) chips.push({ id: "food", label: "Food" });
    if (filters.fashion) chips.push({ id: "fashion", label: "Fashion" });
    if (filters.grocery) chips.push({ id: "grocery", label: "Grocery" });
    if (filters.pharma) chips.push({ id: "pharma", label: "Pharma" });
    if (filters.overview) chips.push({ id: "overview", label: "Overview" });
    filters.userType.forEach((ut) => chips.push({ id: `userType-${ut}`, label: ut }));
    return chips;
  }, [filters]);

  const removeFilter = useCallback((id: string) => {
    if (id === "pickUp") {
      setFilters((prev) => ({ ...prev, pickUp: false }));
    } else if (id === "food") {
      setFilters((prev) => ({ ...prev, food: false }));
    } else if (id === "fashion") {
      setFilters((prev) => ({ ...prev, fashion: false }));
    } else if (id === "grocery") {
      setFilters((prev) => ({ ...prev, grocery: false }));
    } else if (id === "pharma") {
      setFilters((prev) => ({ ...prev, pharma: false }));
    } else if (id === "overview") {
      setFilters((prev) => ({ ...prev, overview: false }));
    } else if (id.startsWith("delivery-")) {
      const value = id.replace("delivery-", "");
      setFilters((prev) => ({
        ...prev,
        delivery: prev.delivery.filter((d) => d !== value),
      }));
    } else if (id.startsWith("userType-")) {
      const value = id.replace("userType-", "");
      setFilters((prev) => ({
        ...prev,
        userType: prev.userType.filter((ut) => ut !== value),
      }));
    }
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters({
      delivery: [],
      pickUp: false,
      food: false,
      fashion: false,
      grocery: false,
      pharma: false,
      overview: false,
      userType: [],
    });
    // Don't reset status - keep it active
  }, []);

  const orderCount = 0; // Will be populated from API

  // Helper function to get button styles - prevents hydration mismatch
  const getButtonStyles = (isActive: boolean) => {
    if (isActive) {
      return {
        backgroundColor: MINT_GREEN,
        color: DARK_TEXT,
        borderColor: BORDER_COLOR,
      };
    }
    return {
      backgroundColor: INACTIVE_BG,
      color: INACTIVE_TEXT,
      borderColor: BORDER_COLOR,
    };
  };

  const getDropdownButtonStyles = (isActive: boolean) => {
    if (isActive) {
      return {
        backgroundColor: MINT_GREEN,
        color: DARK_TEXT,
        borderColor: BORDER_COLOR,
      };
    }
    return {
      backgroundColor: CONTENT_BG,
      color: INACTIVE_TEXT,
      borderColor: BORDER_COLOR,
    };
  };

  return (
    <div className="space-y-2 w-full max-w-full overflow-x-hidden" style={{ backgroundColor: PAGE_BG }}>
      {/* Filter Section - No border */}
      <div className="p-2" style={{ backgroundColor: CONTENT_BG }}>
        <div className="flex flex-wrap items-center gap-2">
          {/* Delivery Dropdown */}
          <div ref={deliveryRef} className="relative">
            <button
              onClick={() => setShowDeliveryDropdown(!showDeliveryDropdown)}
              className="px-3 py-1.5 rounded-md text-xs font-medium border transition-colors hover:bg-gray-50 cursor-pointer"
              style={getDropdownButtonStyles(filters.delivery.length > 0)}
            >
              Delivery
              <ChevronDown className="inline-block ml-1 h-3 w-3" />
            </button>
            {showDeliveryDropdown && (
              <div
                className="absolute top-full left-0 mt-1 w-48 border rounded-lg shadow-lg z-50"
                style={{ backgroundColor: CONTENT_BG, borderColor: BORDER_COLOR }}
              >
                <label className="flex items-center px-4 py-2 hover:bg-gray-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.delivery.includes("GatiMitra")}
                    onChange={() => handleDeliveryToggle("GatiMitra")}
                    className="mr-2"
                  />
                  <span className="text-sm" style={{ color: DARK_TEXT }}>GatiMitra</span>
                </label>
                <label className="flex items-center px-4 py-2 hover:bg-gray-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.delivery.includes("Merchant")}
                    onChange={() => handleDeliveryToggle("Merchant")}
                    className="mr-2"
                  />
                  <span className="text-sm" style={{ color: DARK_TEXT }}>Merchant</span>
                </label>
              </div>
            )}
          </div>

          {/* Category Buttons */}
          <button
            onClick={() => handleCategoryToggle("pickUp")}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors border cursor-pointer"
            style={getButtonStyles(filters.pickUp)}
          >
            Pickup
          </button>
          <button
            onClick={() => handleCategoryToggle("food")}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors border cursor-pointer"
            style={getButtonStyles(filters.food)}
          >
            Food
          </button>
          <button
            onClick={() => handleCategoryToggle("fashion")}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors border cursor-pointer"
            style={getButtonStyles(filters.fashion)}
          >
            Fashion
          </button>
          <button
            onClick={() => handleCategoryToggle("grocery")}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors border cursor-pointer"
            style={getButtonStyles(filters.grocery)}
          >
            Grocery
          </button>
          <button
            onClick={() => handleCategoryToggle("pharma")}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors border cursor-pointer"
            style={getButtonStyles(filters.pharma)}
          >
            Pharma
          </button>
          <button
            onClick={() => handleCategoryToggle("overview")}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors border cursor-pointer"
            style={getButtonStyles(filters.overview)}
          >
            Overview
          </button>

          {/* User-Type Dropdown */}
          <div ref={userTypeRef} className="relative">
            <button
              onClick={() => setShowUserTypeDropdown(!showUserTypeDropdown)}
              className="px-3 py-1.5 rounded-md text-xs font-medium border transition-colors hover:bg-gray-50 cursor-pointer"
              style={getDropdownButtonStyles(filters.userType.length > 0)}
            >
              User-Type
              <ChevronDown className="inline-block ml-1 h-3 w-3" />
            </button>
            {showUserTypeDropdown && (
              <div
                className="absolute top-full left-0 mt-1 w-48 border rounded-lg shadow-lg z-50"
                style={{ backgroundColor: CONTENT_BG, borderColor: BORDER_COLOR }}
              >
                <label className="flex items-center px-4 py-2 hover:bg-gray-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.userType.includes("Premium")}
                    onChange={() => handleUserTypeToggle("Premium")}
                    className="mr-2"
                  />
                  <span className="text-sm" style={{ color: DARK_TEXT }}>Premium</span>
                </label>
                <label className="flex items-center px-4 py-2 hover:bg-gray-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.userType.includes("Very Good")}
                    onChange={() => handleUserTypeToggle("Very Good")}
                    className="mr-2"
                  />
                  <span className="text-sm" style={{ color: DARK_TEXT }}>Very Good</span>
                </label>
                <label className="flex items-center px-4 py-2 hover:bg-gray-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.userType.includes("Good")}
                    onChange={() => handleUserTypeToggle("Good")}
                    className="mr-2"
                  />
                  <span className="text-sm" style={{ color: DARK_TEXT }}>Good</span>
                </label>
                <label className="flex items-center px-4 py-2 hover:bg-gray-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.userType.includes("Bad")}
                    onChange={() => handleUserTypeToggle("Bad")}
                    className="mr-2"
                  />
                  <span className="text-sm" style={{ color: DARK_TEXT }}>Bad</span>
                </label>
              </div>
            )}
          </div>

          {/* Apply Filter Button */}
          <button
            className="ml-auto px-3 py-1.5 rounded-md text-xs font-medium uppercase border cursor-pointer"
            style={{ backgroundColor: MINT_GREEN, color: DARK_TEXT, borderColor: BORDER_COLOR }}
          >
            Apply Filter
          </button>

          {/* Applied Filters Chips - In same section */}
          {filterChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 w-full mt-2">
              {filterChips.map((chip) => (
                <span
                  key={chip.id}
                  className="inline-flex items-center gap-1 pl-2 pr-1.5 py-0.5 rounded-full text-xs font-medium border"
                  style={{ backgroundColor: CONTENT_BG, borderColor: BORDER_COLOR, color: DARK_TEXT }}
                >
                  <span>{chip.label}</span>
                  <button
                    type="button"
                    onClick={() => removeFilter(chip.id)}
                    className="flex-shrink-0 p-0.5 rounded hover:bg-gray-100 focus:outline-none cursor-pointer"
                    aria-label={`Remove ${chip.label}`}
                  >
                    <X className="h-3 w-3" style={{ color: INACTIVE_TEXT }} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Status Buttons Section - No border, full width */}
      <div className="p-2 mt-3" style={{ backgroundColor: CONTENT_BG }}>
        <div className="flex items-center gap-2 w-full">
          <button
            onClick={() => {
              if (selectedStatus !== "PAYMENT DONE") {
                setSelectedStatus("PAYMENT DONE");
              }
            }}
            className={`flex-1 px-3 py-2 rounded-md text-xs transition-colors border cursor-pointer ${
              selectedStatus === "PAYMENT DONE" ? "font-bold" : "font-medium"
            }`}
            style={getButtonStyles(selectedStatus === "PAYMENT DONE")}
          >
            PAYMENT DONE
          </button>
          <button
            onClick={() => {
              if (selectedStatus !== "ACCEPTED") {
                setSelectedStatus("ACCEPTED");
              }
            }}
            className={`flex-1 px-3 py-2 rounded-md text-xs transition-colors border cursor-pointer ${
              selectedStatus === "ACCEPTED" ? "font-bold" : "font-medium"
            }`}
            style={getButtonStyles(selectedStatus === "ACCEPTED")}
          >
            ACCEPTED
          </button>
          <button
            onClick={() => {
              if (selectedStatus !== "DESPATCH READY") {
                setSelectedStatus("DESPATCH READY");
              }
            }}
            className={`flex-1 px-3 py-2 rounded-md text-xs transition-colors border cursor-pointer ${
              selectedStatus === "DESPATCH READY" ? "font-bold" : "font-medium"
            }`}
            style={getButtonStyles(selectedStatus === "DESPATCH READY")}
          >
            DESPATCH READY
          </button>
          <button
            onClick={() => {
              if (selectedStatus !== "DESPATCHED") {
                setSelectedStatus("DESPATCHED");
              }
            }}
            className={`flex-1 px-3 py-2 rounded-md text-xs transition-colors border cursor-pointer ${
              selectedStatus === "DESPATCHED" ? "font-bold" : "font-medium"
            }`}
            style={getButtonStyles(selectedStatus === "DESPATCHED")}
          >
            DESPATCHED
          </button>
          <button
            onClick={() => {
              if (selectedStatus !== "BULK") {
                setSelectedStatus("BULK");
              }
            }}
            className={`flex-1 px-3 py-2 rounded-md text-xs transition-colors border cursor-pointer ${
              selectedStatus === "BULK" ? "font-bold" : "font-medium"
            }`}
            style={getButtonStyles(selectedStatus === "BULK")}
          >
            BULK
          </button>
        </div>
      </div>

      {/* Summary and Action Bar - No border */}
      <div className="flex items-center justify-between p-2" style={{ backgroundColor: CONTENT_BG }}>
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4" style={{ color: CHECKMARK_COLOR }} />
          <span className="text-xs font-medium" style={{ color: DARK_TEXT }}>
            {selectedStatus ? selectedStatus.substring(0, 3).toUpperCase() : "---"} - {orderCount} / Out Of {orderCount}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border cursor-pointer"
            style={{ backgroundColor: MINT_GREEN, color: DARK_TEXT, borderColor: BORDER_COLOR }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh Data
          </button>
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border cursor-pointer"
            style={{ backgroundColor: CONTENT_BG, borderColor: BORDER_COLOR, color: INACTIVE_TEXT }}
          >
            <Filter className="h-3.5 w-3.5" />
            Clear All Filters
          </button>
        </div>
      </div>

      {/* Orders Table - No border */}
      <div className="overflow-x-auto" style={{ backgroundColor: CONTENT_BG }}>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-2 py-2 text-left text-xs font-medium uppercase" style={{ color: DARK_TEXT }}>
                ORDER...
              </th>
              <th className="px-2 py-2 text-left text-xs font-medium uppercase" style={{ color: DARK_TEXT }}>
                ACTION
              </th>
              <th className="px-2 py-2 text-left text-xs font-medium uppercase" style={{ color: DARK_TEXT }}>
                ROUTED TO
              </th>
              <th className="px-2 py-2 text-left text-xs font-medium uppercase" style={{ color: DARK_TEXT }}>
                ORDER TIME
              </th>
              <th className="px-2 py-2 text-left text-xs font-medium uppercase" style={{ color: DARK_TEXT }}>
                USER NAME
              </th>
              <th className="px-2 py-2 text-left text-xs font-medium uppercase" style={{ color: DARK_TEXT }}>
                UPDATED TIME
              </th>
              <th className="px-2 py-2 text-left text-xs font-medium uppercase" style={{ color: DARK_TEXT }}>
                USER MO...
              </th>
              <th className="px-2 py-2 text-left text-xs font-medium uppercase" style={{ color: DARK_TEXT }}>
                MERCH...
              </th>
              <th className="px-2 py-2 text-left text-xs font-medium uppercase" style={{ color: DARK_TEXT }}>
                MERCHAN...
              </th>
              <th className="px-2 py-2 text-left text-xs font-medium uppercase" style={{ color: DARK_TEXT }}>
                MERCHANT L...
              </th>
              <th className="px-2 py-2 text-left text-xs font-medium uppercase" style={{ color: DARK_TEXT }}>
                DELIVER
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200" style={{ backgroundColor: CONTENT_BG }}>
            {/* No dummy data - table will be populated from API */}
            {/* Note: Order ID cells (first column) should have cursor-pointer class */}
            {orderCount === 0 && (
              <tr>
                <td colSpan={11} className="px-2 py-4 text-center text-xs" style={{ color: TABLE_TEXT }}>
                  No orders found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
