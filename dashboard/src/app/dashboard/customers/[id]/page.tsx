"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, User, Mail, Phone, Shield, Calendar, CheckCircle, XCircle, Wallet, AlertCircle } from "lucide-react";
import Link from "next/link";

interface Customer {
  id: number;
  customerId: string;
  fullName: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  primaryMobile: string;
  accountStatus: string;
  riskFlag?: string | null;
  trustScore?: number | null;
  walletBalance?: number | null;
  createdAt: Date | string;
  lastOrderAt?: Date | string | null;
}

export default function CustomerDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id as string;
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (customerId) {
      fetchCustomer();
    } else {
      setError("Invalid customer ID");
      setLoading(false);
    }
  }, [customerId]);

  const fetchCustomer = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/customers/${customerId}`);

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = "Failed to fetch customer";
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        setError(errorMessage);
        setLoading(false);
        return;
      }

      const result = await response.json();

      if (result.success) {
        setCustomer(result.data);
      } else {
        setError(result.error || "Failed to fetch customer");
      }
    } catch (err) {
      console.error("Error fetching customer:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      ACTIVE: "bg-green-100 text-green-800",
      INACTIVE: "bg-gray-100 text-gray-800",
      SUSPENDED: "bg-yellow-100 text-yellow-800",
      BLOCKED: "bg-red-100 text-red-800",
      DELETED: "bg-red-100 text-red-800",
    };

    return (
      <span
        className={`px-3 py-1 text-sm font-medium rounded-full ${
          statusColors[status] || statusColors.INACTIVE
        }`}
      >
        {status}
      </span>
    );
  };

  const getRiskBadge = (riskFlag?: string | null) => {
    if (!riskFlag) return null;
    
    const riskColors: Record<string, string> = {
      LOW: "bg-green-100 text-green-800",
      MEDIUM: "bg-yellow-100 text-yellow-800",
      HIGH: "bg-orange-100 text-orange-800",
      CRITICAL: "bg-red-100 text-red-800",
    };

    return (
      <span
        className={`px-3 py-1 text-sm font-medium rounded-full ${
          riskColors[riskFlag] || riskColors.LOW
        }`}
      >
        {riskFlag}
      </span>
    );
  };

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "Never";
    const d = new Date(date);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return "₹0.00";
    return `₹${Number(amount).toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="space-y-6 w-full max-w-full overflow-x-hidden">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-500">Loading customer details...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="space-y-6 w-full max-w-full overflow-x-hidden">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
          <div className="flex items-center gap-2 text-red-800">
            <AlertCircle className="h-5 w-5" />
            <p className="font-medium">Error: {error || "Customer not found"}</p>
          </div>
          <div className="mt-4">
            <Link
              href="/dashboard/customers/all"
              className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Customers
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/customers/all"
            className="text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Customer Details</h1>
            <p className="text-sm text-gray-500 mt-1">Customer ID: {customer.customerId}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {getStatusBadge(customer.accountStatus)}
          <Link
            href={`/dashboard/customers/${customerId}/edit`}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            Edit Customer
          </Link>
        </div>
      </div>

      {/* Customer Information */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Information */}
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Full Name</label>
                <div className="mt-1 flex items-center gap-2">
                  <User className="h-4 w-4 text-gray-400" />
                  <p className="text-sm text-gray-900">{customer.fullName}</p>
                </div>
              </div>
              {customer.email && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Email</label>
                  <div className="mt-1 flex items-center gap-2">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <p className="text-sm text-gray-900">{customer.email}</p>
                  </div>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-500">Mobile</label>
                <div className="mt-1 flex items-center gap-2">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <p className="text-sm text-gray-900">{customer.primaryMobile}</p>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Account Status</label>
                <div className="mt-1">{getStatusBadge(customer.accountStatus)}</div>
              </div>
            </div>
          </div>

          {/* Risk & Trust */}
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Risk & Trust</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {customer.riskFlag && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Risk Flag</label>
                  <div className="mt-1">{getRiskBadge(customer.riskFlag)}</div>
                </div>
              )}
              {customer.trustScore !== null && customer.trustScore !== undefined && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Trust Score</label>
                  <div className="mt-1 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-gray-400" />
                    <p className="text-sm text-gray-900">{customer.trustScore}/100</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Wallet */}
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Wallet</h2>
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-2xl font-semibold text-gray-900">
                  {formatCurrency(customer.walletBalance)}
                </p>
                <p className="text-sm text-gray-500">Available Balance</p>
              </div>
            </div>
          </div>

          {/* Activity */}
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Activity</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-500">Created At</label>
                <div className="mt-1 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <p className="text-sm text-gray-900">{formatDate(customer.createdAt)}</p>
                </div>
              </div>
              {customer.lastOrderAt && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Last Order</label>
                  <div className="mt-1 flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <p className="text-sm text-gray-900">{formatDate(customer.lastOrderAt)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
