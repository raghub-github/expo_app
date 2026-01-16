"use client";

import { useState } from "react";
import { Plus, X, Loader2 } from "lucide-react";

interface ServicePointFormProps {
  onSuccess?: () => void;
}

export function ServicePointForm({ onSuccess }: ServicePointFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    city: "",
    latitude: "",
    longitude: "",
    address: "",
  });

  const [useCity, setUseCity] = useState(true);

  const handleGeocode = async () => {
    if (!formData.city.trim()) {
      setError("Please enter a city name");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/service-points/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: formData.city }),
      });

      const result = await response.json();

      if (result.success) {
        setFormData((prev) => ({
          ...prev,
          latitude: result.data.latitude.toString(),
          longitude: result.data.longitude.toString(),
        }));
        setError(null);
      } else {
        setError(result.error || "Failed to geocode city");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to geocode city");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      // If using city, geocode first
      if (useCity && formData.city && (!formData.latitude || !formData.longitude)) {
        await handleGeocode();
        // Wait a bit for state to update
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (!formData.name || !formData.latitude || !formData.longitude) {
        setError("Name, latitude, and longitude are required");
        setLoading(false);
        return;
      }

      const payload = {
        name: formData.name,
        city: formData.city || "Unknown",
        latitude: parseFloat(formData.latitude),
        longitude: parseFloat(formData.longitude),
        address: formData.address || null,
      };

      const response = await fetch("/api/service-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        setSuccess(true);
        setFormData({
          name: "",
          city: "",
          latitude: "",
          longitude: "",
          address: "",
        });
        setTimeout(() => {
          setIsOpen(false);
          setSuccess(false);
          if (onSuccess) onSuccess();
        }, 1500);
      } else {
        setError(result.error || "Failed to create service point");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create service point");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        title="Add Service Point"
      >
        <Plus className="h-5 w-5" />
        <span className="hidden sm:inline">Add Service Point</span>
      </button>
    );
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 md:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setIsOpen(false);
          setError(null);
          setSuccess(false);
        }
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[95vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-5 sm:px-6 py-4 sm:py-5 flex items-center justify-between">
          <h2 className="text-xl sm:text-2xl font-bold text-white">Add Service Point</h2>
          <button
            onClick={() => {
              setIsOpen(false);
              setError(null);
              setSuccess(false);
            }}
            className="text-white/90 hover:text-white hover:bg-white/20 rounded-lg p-1.5 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 sm:space-y-6">
          {/* Alert Messages */}
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 text-red-700 px-4 py-3 rounded-r-lg text-sm flex items-start gap-2 animate-in slide-in-from-top-2">
              <div className="flex-1">
                <strong className="font-semibold">Error:</strong> {error}
              </div>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border-l-4 border-green-500 text-green-700 px-4 py-3 rounded-r-lg text-sm flex items-start gap-2 animate-in slide-in-from-top-2">
              <div className="flex-1">
                <strong className="font-semibold">Success!</strong> Service point created successfully!
              </div>
            </div>
          )}

          {/* Service Point Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Service Point Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm sm:text-base text-gray-900 bg-white placeholder:text-gray-400"
              required
              placeholder="e.g., Mumbai Central Hub"
            />
          </div>

          {/* Input Method */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              Input Method
            </label>
            <div className="flex gap-4 sm:gap-6">
              <label className="flex items-center cursor-pointer group">
                <input
                  type="radio"
                  checked={useCity}
                  onChange={() => setUseCity(true)}
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                />
                <span className="ml-2.5 text-sm sm:text-base text-gray-700 group-hover:text-gray-900 font-medium">
                  City Name
                </span>
              </label>
              <label className="flex items-center cursor-pointer group">
                <input
                  type="radio"
                  checked={!useCity}
                  onChange={() => setUseCity(false)}
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                />
                <span className="ml-2.5 text-sm sm:text-base text-gray-700 group-hover:text-gray-900 font-medium">
                  Coordinates
                </span>
              </label>
            </div>
          </div>

          {/* Conditional Fields */}
          {useCity ? (
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                City Name <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2 sm:gap-3">
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm sm:text-base text-gray-900 bg-white placeholder:text-gray-400"
                  placeholder="e.g., Mumbai"
                />
                <button
                  type="button"
                  onClick={handleGeocode}
                  disabled={loading || !formData.city.trim()}
                  className="px-5 sm:px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm sm:text-base whitespace-nowrap shadow-sm hover:shadow"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                  ) : (
                    "Find"
                  )}
                </button>
              </div>
              {formData.latitude && formData.longitude && (
                <p className="mt-2.5 text-xs sm:text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg">
                  <span className="font-medium">Coordinates found:</span> {formData.latitude}, {formData.longitude}
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Latitude <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  value={formData.latitude}
                  onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm sm:text-base text-gray-900 bg-white placeholder:text-gray-400"
                  required
                  placeholder="e.g., 19.0760"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Longitude <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  value={formData.longitude}
                  onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm sm:text-base text-gray-900 bg-white placeholder:text-gray-400"
                  required
                  placeholder="e.g., 72.8777"
                />
              </div>
            </div>
          )}

          {/* Address */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Address <span className="text-gray-500 text-xs font-normal">(Optional)</span>
            </label>
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none text-sm sm:text-base text-gray-900 bg-white placeholder:text-gray-400"
              rows={3}
              placeholder="Full address of the service point"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-gray-200">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setError(null);
                setSuccess(false);
              }}
              className="flex-1 px-5 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all font-medium text-sm sm:text-base"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all font-medium text-sm sm:text-base shadow-sm hover:shadow"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                "Create Service Point"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
