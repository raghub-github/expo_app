"use client";

import { useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { SearchForm } from "@/components/search/SearchForm";

export default function Home() {
  useEffect(() => {
    console.log("GatiMitra Dark Premium Dashboard Loaded");
  }, []);

  return (
    <>
      <Header />

      <div
        style={{
          background: "linear-gradient(135deg, #f5f7fa 0%, #e8ecf1 100%)",
          minHeight: "calc(100vh - 60px)",
          padding: "60px 20px",
        }}
      >
        <div
          style={{
            maxWidth: "900px",
            margin: "0 auto",
          }}
        >
          {/* Hero Section */}
          <div style={{ textAlign: "center", marginBottom: 60 }}>
            <h1
              style={{
                fontSize: 42,
                fontWeight: 800,
                color: "#0f1419",
                marginBottom: 12,
                letterSpacing: "-0.5px",
              }}
            >
              Customer Dashboard
            </h1>

            <p
              style={{
                fontSize: 18,
                color: "#708090",
                fontWeight: 500,
                marginBottom: 8,
              }}
            >
              Search and manage all GatiMitra users from one unified platform
            </p>

            <p
              style={{
                fontSize: 14,
                color: "#2563eb",
                fontWeight: 600,
              }}
            >
              Powered by GatiMitra
            </p>
          </div>

          {/* Search Card */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: 20,
              padding: "48px",
              boxShadow: "0 10px 40px rgba(0,0,0,0.08)",
              border: "1px solid #e1e8ed",
            }}
          >
            <h2
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: "#0f1419",
                marginBottom: 32,
              }}
            >
              🔍 Search Customer
            </h2>

            <SearchForm />
          </div>
        </div>
      </div>
    </>
  );
}
