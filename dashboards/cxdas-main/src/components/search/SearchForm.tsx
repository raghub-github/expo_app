"use client";

import { FormEvent, useCallback, useState } from "react";
import type { SearchBy, SearchCategory } from "@/lib/searchMappings";

export function SearchForm() {
  const [category, setCategory] = useState<SearchCategory | "">("Food");
  const [searchBy, setSearchBy] = useState<SearchBy | "">("User ID");
  const [searchValue, setSearchValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();

      if (!category || !searchBy || !searchValue.trim()) {
        return;
      }

      setIsLoading(true);
      const params = new URLSearchParams();
      params.set("category", category);
      params.set("searchBy", searchBy);
      params.set("q", searchValue.trim());

      const url = `/user-dashboard?${params.toString()}`;
      window.open(url, "_blank");
      setIsLoading(false);
    },
    [category, searchBy, searchValue]
  );

  return (
    <form onSubmit={handleSubmit}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#0f1419",
            }}
          >
            Search Category
          </label>
          <select
            value={category}
            onChange={(e) =>
              setCategory((e.target.value || "") as SearchCategory | "")
            }
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: "2px solid #e1e8ed",
              fontSize: 14,
              fontWeight: 500,
              color: "#0f1419",
              backgroundColor: "#ffffff",
              cursor: "pointer",
              transition: "all 0.25s ease",
            }}
            onFocus={(e) => {
              (e.target as HTMLSelectElement).style.borderColor = "#2ec4b6";
              (e.target as HTMLSelectElement).style.boxShadow =
                "0 0 0 3px rgba(46, 196, 182, 0.1)";
            }}
            onBlur={(e) => {
              (e.target as HTMLSelectElement).style.borderColor = "#e1e8ed";
              (e.target as HTMLSelectElement).style.boxShadow = "none";
            }}
          >
            <option value="Food">🍕 Food</option>
            <option value="Parcel">📦 Parcel</option>
            <option value="Person">👤 Person</option>
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#0f1419",
            }}
          >
            Search By
          </label>
          <select
            value={searchBy}
            onChange={(e) =>
              setSearchBy((e.target.value || "") as SearchBy | "")
            }
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: "2px solid #e1e8ed",
              fontSize: 14,
              fontWeight: 500,
              color: "#0f1419",
              backgroundColor: "#ffffff",
              cursor: "pointer",
              transition: "all 0.25s ease",
            }}
            onFocus={(e) => {
              (e.target as HTMLSelectElement).style.borderColor = "#2ec4b6";
              (e.target as HTMLSelectElement).style.boxShadow =
                "0 0 0 3px rgba(46, 196, 182, 0.1)";
            }}
            onBlur={(e) => {
              (e.target as HTMLSelectElement).style.borderColor = "#e1e8ed";
              (e.target as HTMLSelectElement).style.boxShadow = "none";
            }}
          >
            <option value="User ID">👤 User ID</option>
            <option value="Mobile No">📱 Mobile No</option>
            <option value="Email ID">📧 Email ID</option>
            <option value="Customer Name">🧑 Customer Name</option>
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#0f1419",
            }}
          >
            Search Value
          </label>
          <input
            type="text"
            placeholder="Enter search value"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: "2px solid #e1e8ed",
              fontSize: 14,
              fontWeight: 500,
              color: "#0f1419",
              backgroundColor: "#ffffff",
              transition: "all 0.25s ease",
            }}
            onFocus={(e) => {
              (e.target as HTMLInputElement).style.borderColor = "#2ec4b6";
              (e.target as HTMLInputElement).style.boxShadow =
                "0 0 0 3px rgba(46, 196, 182, 0.1)";
            }}
            onBlur={(e) => {
              (e.target as HTMLInputElement).style.borderColor = "#e1e8ed";
              (e.target as HTMLInputElement).style.boxShadow = "none";
            }}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={!category || !searchBy || !searchValue.trim() || isLoading}
        style={{
          width: "100%",
          padding: "14px 24px",
          background:
            !category || !searchBy || !searchValue.trim() || isLoading
              ? "#ccc"
              : "linear-gradient(135deg, #2ec4b6, #1b9c85)",
          color: "#ffffff",
          border: "none",
          borderRadius: 12,
          fontSize: 15,
          fontWeight: 700,
          cursor:
            !category || !searchBy || !searchValue.trim() || isLoading
              ? "not-allowed"
              : "pointer",
          transition: "all 0.3s ease",
          letterSpacing: "0.5px",
        }}
        onMouseEnter={(e) => {
          if (!(!category || !searchBy || !searchValue.trim())) {
            (e.currentTarget as HTMLButtonElement).style.transform =
              "translateY(-2px)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              "0 12px 28px rgba(46, 196, 182, 0.35)";
          }
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = "none";
          (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
        }}
      >
        {isLoading ? "Searching..." : "🔍 Search Customer"}
      </button>
    </form>
  );
}
