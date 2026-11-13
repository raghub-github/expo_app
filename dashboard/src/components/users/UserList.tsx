"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { User, Search, Filter, Plus, Edit, CheckCircle, ChevronDown, ChevronLeft, ChevronRight, Clock, ShieldPlus } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import Link from "next/link";
import { usePermissions } from "@/hooks/queries/usePermissionsQuery";
import { useUsersQuery, useUpdateUser, type SystemUser } from "@/hooks/queries/useUsersQuery";
import { StatusChangeModal } from "./StatusChangeModal";
import { SystemRolesListPanel } from "./SystemRolesListPanel";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { DashboardErrorBanner } from "@/components/ui/DashboardErrorBanner";
import {
  generateInitialsAvatarDataUrl,
  getGravatarUrl,
  getUserInitials,
} from "@/lib/user-avatar";

const rowBorder = "border-b-[0.5px] border-[#121212]/10";
const outerBorder = "rounded-md border-[0.5px] border-[#121212]/40";

function UserProfileAvatar({
  email,
  fullName,
  size = 36,
}: {
  email: string;
  fullName: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const initials = getUserInitials(fullName, email);
  const fallback = generateInitialsAvatarDataUrl(email || fullName, initials, size);
  // Gravatar is keyed by email (works for many Gmail accounts with a linked profile photo).
  const src = failed || !email ? fallback : getGravatarUrl(email, size * 2);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-[#121212]/10"
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
    />
  );
}

interface UserListProps {
  onUserSelect?: (user: SystemUser) => void;
  showActions?: boolean;
}

const STATUS_OPTIONS = [
  { value: "PENDING_ACTIVATION", label: "Pending", color: "bg-gray-100 text-gray-800" },
  { value: "ACTIVE", label: "Active", color: "bg-green-100 text-green-800" },
  { value: "SUSPENDED", label: "Suspend", color: "bg-yellow-100 text-yellow-800" },
  { value: "DISABLED", label: "Disabled", color: "bg-red-100 text-red-800" },
  { value: "LOCKED", label: "Locked", color: "bg-orange-100 text-orange-800" },
];

type ManagementListTab = "users" | "roles";

export function UserList({ onUserSelect, showActions = true }: UserListProps) {
  const { isSuperAdmin, systemUserId, loading: permissionsLoading } = usePermissions();
  const [listTab, setListTab] = useState<ManagementListTab>("users");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState({
    role: "",
    status: "",
    department: "",
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null);
  const dropdownRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [statusChangeModal, setStatusChangeModal] = useState<{
    isOpen: boolean;
    userId: number | null;
    currentStatus: string;
    newStatus: string;
    userName: string;
  }>({
    isOpen: false,
    userId: null,
    currentStatus: "",
    newStatus: "",
    userName: "",
  });
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Use React Query mutation for updates
  const updateUser = useUpdateUser();
  const queryClient = useQueryClient();
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch unique roles using React Query
  const { data: rolesData, isLoading: rolesLoading, error: rolesError } = useQuery({
    queryKey: ["users", "roles"],
    enabled: listTab === "users",
    queryFn: async () => {
      try {
        const response = await fetch("/api/users/roles");
        if (!response.ok) {
          throw new Error(`Failed to fetch roles: ${response.statusText}`);
        }
        const result = await response.json();
        if (!result.success) {
          throw new Error(result.error || "Failed to fetch roles");
        }
        return result.data as string[];
      } catch (error) {
        console.error("[UserList] Error fetching roles:", error);
        // Return empty array on error to prevent component crash
        return [];
      }
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 2,
    retryOnMount: false, // Don't retry on mount if it failed
    refetchOnWindowFocus: false, // Don't refetch on window focus
  });

  // Safely get available roles with fallback - ensure it's always an array
  const availableRoles = useMemo(() => {
    try {
      if (rolesError) {
        console.warn("[UserList] Error loading roles, using empty array:", rolesError);
        return [];
      }
      if (Array.isArray(rolesData)) {
        return rolesData;
      }
      return [];
    } catch (error) {
      console.error("[UserList] Error processing roles data:", error);
      return [];
    }
  }, [rolesData, rolesError]);

  // Format role name for display (e.g., "SUPER_ADMIN" -> "Super Admin")
  const formatRoleName = useCallback((role: string): string => {
    return role
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }, []);

  // Use React Query for data fetching
  const { data, isLoading, error } = useUsersQuery({
    page: pagination.page,
    limit: pagination.limit,
    search: debouncedSearch || undefined,
    role: filters.role || undefined,
    status: filters.status || undefined,
    department: filters.department || undefined,
    enabled: listTab === "users",
  });

  // Memoize users and pagination data to prevent unnecessary re-renders
  const users = useMemo(() => data?.users || [], [data?.users]);

  const effectiveUserStatus = (u: SystemUser) =>
    u.status ?? (u.isActive ? "ACTIVE" : "PENDING_ACTIVATION");
  const paginationData = useMemo(() => data?.pagination || {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  }, [data?.pagination]);

  // Update current time and check for expired suspensions
  useEffect(() => {
    const checkAndReactivate = async () => {
      const now = new Date();
      // Check if any users have expired suspensions
      const hasExpiredSuspensions = users.some(
        (user) =>
          effectiveUserStatus(user) === "SUSPENDED" &&
          user.suspensionExpiresAt &&
          new Date(user.suspensionExpiresAt) <= now
      );

      if (hasExpiredSuspensions) {
        try {
          // Call auto-reactivate endpoint
          const response = await fetch("/api/users/auto-reactivate");
          const result = await response.json();

          if (result.success && result.reactivated > 0) {
            // Refetch users list to update UI immediately
            queryClient.invalidateQueries({
              queryKey: queryKeys.users.lists(),
            });
          }
        } catch (error) {
          console.error("Error auto-reactivating users:", error);
        }
      }
    };

    // Update time every 10 seconds for responsive countdown
    // Check for expired suspensions more frequently when close to expiry
    const interval = setInterval(() => {
      setCurrentTime(new Date());
      checkAndReactivate();
    }, 10000); // Check every 10 seconds

    // Also check immediately on mount
    checkAndReactivate();

    return () => clearInterval(interval);
  }, [users, queryClient]); // Now properly include users in dependencies

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPagination(prev => ({ ...prev, page: 1 }));
    }, 500);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [search]);

  // Update local pagination state when query data changes
  useEffect(() => {
    if (data?.pagination) {
      setPagination(prev => ({
        ...prev,
        ...data.pagination,
      }));
    }
  }, [data?.pagination]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openDropdownId !== null) {
        const dropdownElement = dropdownRefs.current[openDropdownId];
        if (dropdownElement && !dropdownElement.contains(event.target as Node)) {
          setOpenDropdownId(null);
        }
      }
    };

    if (openDropdownId !== null) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [openDropdownId]);

  const handleStatusChangeClick = (userId: number, newStatus: string, currentStatus: string, userName: string) => {
    // Prevent super admin from changing their own status
    if (systemUserId && userId === systemUserId) {
      alert("You cannot change your own status. Contact another super admin if needed.");
      setOpenDropdownId(null);
      return;
    }

    // If status isn't actually changing, do nothing
    if (newStatus === currentStatus) {
      setOpenDropdownId(null);
      return;
    }

    // Open the modal
    setStatusChangeModal({
      isOpen: true,
      userId,
      currentStatus,
      newStatus,
      userName,
    });
    setOpenDropdownId(null);
  };

  const handleStatusChangeConfirm = async (data: {
    reason: string;
    isTemporary?: boolean;
    expiresAt?: Date;
  }) => {
    if (!statusChangeModal.userId) return;

    try {
      await updateUser.mutateAsync({
        id: statusChangeModal.userId,
        status: statusChangeModal.newStatus,
        status_reason: data.reason || null,
        suspension_expires_at: data.isTemporary && data.expiresAt ? data.expiresAt.toISOString() : null,
      });
      
      setStatusChangeModal({ isOpen: false, userId: null, currentStatus: "", newStatus: "", userName: "" });
      // React Query will automatically refetch the users list due to invalidation
    } catch (err) {
      console.error("Error updating user status:", err);
      alert(err instanceof Error ? err.message : "Error updating user status");
    }
  };

  const toggleStatusDropdown = useCallback((userId: number) => {
    setOpenDropdownId(prevId => prevId === userId ? null : userId);
  }, []);

  const formatTimeRemaining = (expiresAt: string | null | undefined): string | null => {
    if (!expiresAt) return null;
    
    const expiry = new Date(expiresAt);
    const diff = expiry.getTime() - currentTime.getTime();
    
    if (diff <= 0) {
      // Expired - trigger immediate reactivation check
      setTimeout(async () => {
        try {
          await fetch("/api/users/auto-reactivate");
          await queryClient.invalidateQueries({
            queryKey: queryKeys.users.lists(),
          });
        } catch (error) {
          console.error("Error auto-reactivating expired user:", error);
        }
      }, 100);
      return "0m"; // Show 0m while reactivating
    }
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    // Show seconds when less than 1 minute remaining for more accurate countdown
    if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
  };

  const getStatusBadge = (status: string | undefined, suspensionExpiresAt?: string | null) => {
    const statusColors: Record<string, { bg: string; text: string; label: string }> = {
      ACTIVE: { bg: "bg-green-100", text: "text-green-800", label: "Active" },
      SUSPENDED: { bg: "bg-yellow-100", text: "text-yellow-800", label: "Suspend" },
      DISABLED: { bg: "bg-red-100", text: "text-red-800", label: "Disabled" },
      PENDING_ACTIVATION: { bg: "bg-gray-100", text: "text-gray-800", label: "Pending" },
      LOCKED: { bg: "bg-orange-100", text: "text-orange-800", label: "Locked" },
    };

    const s = status ?? "PENDING_ACTIVATION";
    const statusConfig = statusColors[s] || statusColors.PENDING_ACTIVATION;
    const timeRemaining = s === "SUSPENDED" ? formatTimeRemaining(suspensionExpiresAt) : null;

    return (
      <div className="flex items-center gap-2">
        <span
          className={`px-2 sm:px-3 py-0.5 sm:py-1 text-xs font-semibold rounded-full ${statusConfig.bg} ${statusConfig.text}`}
        >
          {statusConfig.label}
        </span>
        {timeRemaining && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-md border border-blue-200 whitespace-nowrap">
            <Clock className="h-3 w-3" />
            {timeRemaining}
          </span>
        )}
      </div>
    );
  };

  const getStatusButtonColor = (status: string | undefined) => {
    const colors: Record<string, string> = {
      ACTIVE: "bg-green-50 text-green-700 hover:bg-green-100 border-green-200",
      PENDING_ACTIVATION: "bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-200",
      SUSPENDED: "bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border-yellow-200",
      DISABLED: "bg-red-50 text-red-700 hover:bg-red-100 border-red-200",
      LOCKED: "bg-orange-50 text-orange-700 hover:bg-orange-100 border-orange-200",
    };
    const s = status ?? "PENDING_ACTIVATION";
    return colors[s] || colors.PENDING_ACTIVATION;
  };

  const generatePageNumbers = () => {
    const pages: (number | string)[] = [];
    const totalPages = pagination.totalPages;
    const currentPage = pagination.page;

    if (totalPages <= 7) {
      // Show all pages if 7 or fewer
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (currentPage > 3) {
        pages.push("...");
      }

      // Show pages around current page
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push("...");
      }

      // Always show last page
      pages.push(totalPages);
    }

    return pages;
  };

  const usersRolesTabToggle = isSuperAdmin ? (
    <div
      className="inline-flex shrink-0 rounded-lg border border-[#121212]/12 bg-[#F4F4F4] p-0.5"
      role="tablist"
      aria-label="Users or roles list"
    >
      <button
        type="button"
        role="tab"
        aria-selected={listTab === "users"}
        onClick={() => setListTab("users")}
        className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors sm:px-3.5 ${
          listTab === "users"
            ? "bg-[#121212] text-white"
            : "text-[#121212]/65 hover:bg-white hover:text-[#121212]"
        }`}
      >
        Users
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={listTab === "roles"}
        onClick={() => setListTab("roles")}
        className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors sm:px-3.5 ${
          listTab === "roles"
            ? "bg-[#121212] text-white"
            : "text-[#121212]/65 hover:bg-white hover:text-[#121212]"
        }`}
      >
        Roles
      </button>
    </div>
  ) : null;

  const stickyFilterRow = (
    <div className="sticky top-0 z-30 shrink-0 border-b-[0.5px] border-[#121212]/10 bg-white py-2">
      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto rounded-md border-[0.5px] border-[#121212]/15 bg-white px-2.5 py-2 [scrollbar-width:thin]">
        {listTab === "users" ? (
          <>
            <div className="relative w-[10rem] shrink-0 sm:w-52 md:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#121212]/35" />
              <input
                type="text"
                placeholder="Search users..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full rounded-md border border-[#121212]/12 bg-white py-1.5 pl-8 pr-2 text-xs text-[#121212] placeholder:text-[#121212]/40 focus:border-[#121212]/35 focus:outline-none"
              />
            </div>

            <div className="relative w-[7.5rem] shrink-0 sm:w-36">
              <Filter className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-[#121212]/35" />
              <select
                value={filters.status}
                onChange={(e) => {
                  setFilters({ ...filters, status: e.target.value });
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
                className="h-9 w-full cursor-pointer appearance-none rounded-md border border-[#121212]/12 bg-white py-1.5 pl-8 pr-7 text-xs text-[#121212] focus:border-[#121212]/35 focus:outline-none"
              >
                <option value="">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="DISABLED">Disabled</option>
                <option value="PENDING_ACTIVATION">Pending</option>
                <option value="LOCKED">Locked</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#121212]/35" />
            </div>

            <div className="relative w-[7.5rem] shrink-0 sm:w-40">
              <User className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-[#121212]/35" />
              <select
                value={filters.role}
                onChange={(e) => {
                  setFilters({ ...filters, role: e.target.value });
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
                disabled={rolesLoading}
                className="h-9 w-full cursor-pointer appearance-none rounded-md border border-[#121212]/12 bg-white py-1.5 pl-8 pr-7 text-xs text-[#121212] focus:border-[#121212]/35 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">All Roles</option>
                {Array.isArray(availableRoles) && availableRoles.length > 0
                  ? availableRoles.map((role) => (
                      <option key={role} value={role}>
                        {formatRoleName(role)}
                      </option>
                    ))
                  : null}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#121212]/35" />
            </div>
          </>
        ) : (
          <p className="shrink-0 text-xs font-medium text-[#121212]/55">System roles</p>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2 pl-1">
          {usersRolesTabToggle}
          {showActions ? (
            <>
              {isSuperAdmin ? (
                <Link
                  href="/dashboard/users/roles/new"
                  prefetch
                  className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-[#121212]/12 bg-white px-3 text-xs font-semibold text-[#121212] hover:bg-[#F7F7F7]"
                >
                  <ShieldPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>Add Role</span>
                </Link>
              ) : null}
              <Link
                href="/dashboard/users/new"
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-[#121212] px-3 text-xs font-semibold text-white hover:bg-black"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>Add User</span>
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-0 overflow-hidden px-0">
      {stickyFilterRow}

      {listTab === "roles" && isSuperAdmin && (
        <div className="min-h-0 flex-1 overflow-auto pt-3">
          <SystemRolesListPanel enabled toolbarTrailing={null} />
        </div>
      )}

      {listTab === "users" ? (
        <DashboardErrorBanner
          error={
            error
              ? error instanceof Error
                ? error.message
                : "Failed to load users"
              : null
          }
        />
      ) : null}

      {listTab === "users" && (
      <div className={`mt-3 min-h-0 flex-1 overflow-auto bg-white ${outerBorder}`}>
        {isLoading && users.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-[#121212]/50">
            <LoadingSpinner size="lg" text="Loading users..." />
          </div>
        ) : (
        <table className="w-full min-w-[860px] border-collapse text-left text-sm">
              <thead className="text-[10px] font-semibold uppercase tracking-wide text-[#121212]/45">
                <tr>
                  <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>
                    User
                  </th>
                  <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>
                    Email
                  </th>
                  <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>
                    Role
                  </th>
                  <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>
                    Status
                  </th>
                  <th className={`sticky top-0 z-20 hidden bg-[#F7F7F7] px-3 py-2.5 md:table-cell ${rowBorder}`}>
                    Department
                  </th>
                  {showActions && (
                    <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 text-right ${rowBorder}`}>
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={showActions ? 6 : 5} className={`px-3 py-14 text-center text-[#121212]/50 ${rowBorder}`}>
                    <div className="flex flex-col items-center gap-2">
                      <User className="h-10 w-10 text-[#121212]/20" />
                      <p className="text-sm font-medium text-[#121212]">No users found</p>
                      <p className="text-xs text-[#121212]/40">Try adjusting your search or filters</p>
                    </div>
                  </td>
                </tr>
              ) : (
              users.map((user) => {
                const st = effectiveUserStatus(user);
                const isEditingSelf = systemUserId && user.id === systemUserId;
                const isSuperAdminUser = user.primaryRole === "SUPER_ADMIN";
                const canEdit = isSuperAdmin && !isEditingSelf && !isSuperAdminUser;
                const canChangeStatus = isSuperAdmin && !isEditingSelf && !isSuperAdminUser;
                const userStatus = user.status ?? "PENDING_ACTIVATION";
                const isDropdownOpen = openDropdownId === user.id;

                  return (
                    <tr key={user.id} className="bg-white hover:bg-[#FAFAFA]">
                      <td className={`px-3 py-2.5 align-middle ${rowBorder}`}>
                        <div className="flex min-w-0 items-center gap-2.5">
                          <UserProfileAvatar email={user.email} fullName={user.fullName} />
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-medium text-[#121212]">{user.fullName}</div>
                            <div className="truncate font-mono text-[10px] uppercase text-[#121212]/40">{user.systemUserId}</div>
                          </div>
                        </div>
                      </td>
                      <td className={`px-3 py-2.5 align-middle ${rowBorder}`}>
                        <div className="max-w-[220px] truncate text-[12px] text-[#121212]" title={user.email}>{user.email}</div>
                        <div className="text-[11px] text-[#121212]/45">{user.mobile}</div>
                      </td>
                      <td className={`px-3 py-2.5 align-middle ${rowBorder}`}>
                        <span className="inline-flex rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                          {user.primaryRole.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className={`px-3 py-2.5 align-middle ${rowBorder}`}>
                        {getStatusBadge(st, user.suspensionExpiresAt)}
                      </td>
                      <td className={`hidden px-3 py-2.5 align-middle text-[12px] text-[#121212]/55 md:table-cell ${rowBorder}`}>
                        {user.department || "—"}
                      </td>
                      {showActions && (
                        <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right text-xs sm:text-sm font-medium">
                          <div className="flex items-center justify-end gap-1.5 sm:gap-2">
                            <Link
                              href={`/dashboard/users/${user.id}`}
                              className={`text-blue-600 hover:text-blue-900 p-1.5 sm:p-2 rounded-md hover:bg-blue-50 transition-colors flex-shrink-0 ${
                                permissionsLoading || !canEdit ? "opacity-50 cursor-not-allowed pointer-events-none" : ""
                              }`}
                              title={
                                permissionsLoading 
                                  ? "Loading..." 
                                  : isEditingSelf 
                                  ? "Cannot edit your own profile" 
                                  : isSuperAdminUser
                                  ? "Super admin accounts cannot be edited from the dashboard"
                                  : !isSuperAdmin 
                                  ? "Super admin only" 
                                  : "Edit User"
                              }
                              onClick={(e) => {
                                if (permissionsLoading || !canEdit) {
                                  e.preventDefault();
                                  if (isEditingSelf && !permissionsLoading) {
                                    alert("You cannot edit your own profile. Contact another super admin if needed.");
                                  } else if (isSuperAdminUser && !permissionsLoading) {
                                    alert("Super admin accounts cannot be edited directly from the dashboard. Contact the platform owner or backend team for changes.");
                                  }
                                }
                              }}
                            >
                              <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            </Link>
                            <div 
                              ref={(el) => {
                                dropdownRefs.current[user.id] = el;
                              }}
                              className="relative"
                            >
                              <button
                                onClick={() => {
                                  if (!permissionsLoading && canChangeStatus) {
                                    toggleStatusDropdown(user.id);
                                  } else if (isEditingSelf) {
                                    alert("You cannot change your own status. Contact another super admin if needed.");
                                  } else if (isSuperAdminUser && !permissionsLoading) {
                                    alert("Super admin account status cannot be changed directly from the dashboard. Contact the platform owner or backend team for changes.");
                                  }
                                }}
                                disabled={permissionsLoading || !canChangeStatus}
                                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs font-semibold transition-all border ${getStatusButtonColor(userStatus)} ${                                  permissionsLoading || !canChangeStatus 
                                    ? "opacity-50 cursor-not-allowed" 
                                    : ""
                                } ${isDropdownOpen ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}
                                title={
                                  permissionsLoading 
                                    ? "Loading permissions..." 
                                    : isEditingSelf 
                                    ? "Cannot change your own status" 
                                    : isSuperAdminUser
                                    ? "Super admin account status is locked and cannot be changed here"
                                    : !isSuperAdmin 
                                    ? "Super admin only" 
                                    : "Change Status"
                                }
                              >
                                <span className="capitalize hidden sm:inline">
                                  {STATUS_OPTIONS.find((s) => s.value === userStatus)?.label ||
                                    userStatus.replace(/_/g, " ").toLowerCase()}
                                </span>
                                <span className="capitalize sm:hidden text-[10px]">
                                  {(STATUS_OPTIONS.find((s) => s.value === userStatus)?.label ?? userStatus).substring(0, 4)}                                </span>
                                <ChevronDown 
                                  className={`h-3 w-3 sm:h-3.5 sm:w-3.5 transition-transform duration-200 flex-shrink-0 ${
                                    isDropdownOpen ? 'rotate-180' : ''
                                  }`} 
                                />
                              </button>
                              {isDropdownOpen && canChangeStatus && !permissionsLoading && (
                                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                  <div className="py-1">
                                    {STATUS_OPTIONS.map((status) => {
                                      const isCurrentStatus = userStatus === status.value;                                      const isUpdating = updateUser.isPending && updateUser.variables?.id === user.id && updateUser.variables?.status === status.value;
                                      return (
                                        <button
                                          key={status.value}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleStatusChangeClick(user.id, status.value, userStatus, user.fullName);                                          }}
                                          disabled={isCurrentStatus || isUpdating}
                                          className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between ${
                                            isCurrentStatus
                                              ? "bg-blue-50 text-gray-500 cursor-not-allowed"
                                              : isUpdating
                                              ? "bg-gray-50 text-gray-500 cursor-wait"
                                              : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                                          }`}
                                        >
                                          <div className="flex items-center gap-3">
                                            {isUpdating && (
                                              <LoadingSpinner variant="button" size="sm" />
                                            )}
                                            <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${status.color}`}>
                                              {status.label}
                                            </span>
                                          </div>
                                          {isCurrentStatus && !isUpdating && (
                                            <CheckCircle className="h-4 w-4 text-blue-600" />
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
      )}

      {listTab === "roles" && !isSuperAdmin && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-600">
          You do not have access to manage system roles.
        </div>
      )}

      {/* Pagination + page size — pinned to bottom under the table scroll area */}
      {listTab === "users" && pagination.total > 0 && (
        <div className="sticky bottom-0 z-30 mt-1 shrink-0 border-t-[0.5px] border-[#121212]/10 bg-white px-3 py-1 sm:px-4">
          <div className="flex flex-col items-center justify-between gap-1.5 sm:flex-row sm:gap-3">
            <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:gap-2.5">
              <div className="text-center text-[11px] leading-none text-[#121212]/70 sm:text-left">
                Showing{" "}
                <span className="font-semibold text-[#121212]">
                  {((pagination.page - 1) * pagination.limit) + 1}
                </span>{" "}
                to{" "}
                <span className="font-semibold text-[#121212]">
                  {Math.min(pagination.page * pagination.limit, pagination.total)}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-[#121212]">{pagination.total}</span>{" "}
                users
              </div>
              <label className="inline-flex items-center gap-1.5 text-[11px] leading-none text-[#121212]/70">
                <span className="whitespace-nowrap">Rows per page</span>
                <select
                  value={pagination.limit}
                  onChange={(e) => {
                    const limit = Number(e.target.value) || 20;
                    setPagination((prev) => ({ ...prev, limit, page: 1 }));
                  }}
                  className="h-7 rounded-md border-[0.5px] border-[#121212]/20 bg-white px-1.5 text-[11px] font-medium text-[#121212] focus:border-[#121212]/40 focus:outline-none"
                  aria-label="Rows per page"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1">
              <button
                onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
                disabled={pagination.page === 1}
                className="flex h-7 items-center gap-1 rounded-md border-[0.5px] border-[#121212]/20 bg-white px-2 text-[11px] font-medium text-[#121212] transition-colors hover:bg-[#F7F7F7] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Previous</span>
              </button>
              <div className="flex items-center gap-0.5">
                {generatePageNumbers().map((page, index) => {
                  if (page === "...") {
                    return (
                      <span key={`ellipsis-${index}`} className="px-1.5 text-[11px] font-medium text-[#121212]/40">
                        ...
                      </span>
                    );
                  }
                  const pageNum = page as number;
                  const isActive = pageNum === pagination.page;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPagination({ ...pagination, page: pageNum })}
                      className={`flex h-7 min-w-[28px] items-center justify-center rounded-md px-1.5 text-[11px] font-semibold transition-colors ${
                        isActive
                          ? "bg-[#121212] text-white"
                          : "border-[0.5px] border-[#121212]/20 bg-white text-[#121212] hover:bg-[#F7F7F7]"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
                disabled={pagination.page >= pagination.totalPages}
                className="flex h-7 items-center gap-1 rounded-md border-[0.5px] border-[#121212]/20 bg-white px-2 text-[11px] font-medium text-[#121212] transition-colors hover:bg-[#F7F7F7] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Change Modal */}
      <StatusChangeModal
        isOpen={statusChangeModal.isOpen}
        onClose={() => setStatusChangeModal({ isOpen: false, userId: null, currentStatus: "", newStatus: "", userName: "" })}
        onConfirm={handleStatusChangeConfirm}
        currentStatus={statusChangeModal.currentStatus}
        newStatus={statusChangeModal.newStatus}
        userName={statusChangeModal.userName}
        isLoading={updateUser.isPending}
      />
    </div>
  );
}
