"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { User, Search, Filter, Plus, Edit, Trash2, CheckCircle, XCircle, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import Link from "next/link";
import { usePermissions } from "@/hooks/queries/usePermissionsQuery";
import { useUsersQuery, useUpdateUser } from "@/hooks/queries/useUsersQuery";

interface SystemUser {
  id: number;
  systemUserId: string;
  fullName: string;
  email: string;
  mobile: string;
  primaryRole: string;
  status: string;
  department?: string;
  createdAt: string;
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

export function UserList({ onUserSelect, showActions = true }: UserListProps) {
  const { isSuperAdmin, systemUserId, loading: permissionsLoading } = usePermissions();
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
  
  // Use React Query mutation for updates
  const updateUser = useUpdateUser();
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Use React Query for data fetching
  const { data, isLoading, error } = useUsersQuery({
    page: pagination.page,
    limit: pagination.limit,
    search: debouncedSearch || undefined,
    role: filters.role || undefined,
    status: filters.status || undefined,
    department: filters.department || undefined,
  });

  const users = data?.users || [];
  const paginationData = data?.pagination || {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  };

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

  const handleStatusChange = async (userId: number, newStatus: string) => {
    // Prevent super admin from changing their own status
    if (systemUserId && userId === systemUserId) {
      alert("You cannot change your own status. Contact another super admin if needed.");
      setOpenDropdownId(null);
      return;
    }

    const statusOption = STATUS_OPTIONS.find(s => s.value === newStatus);
    const statusLabel = statusOption?.label || newStatus;

    if (!confirm(`Are you sure you want to change this user's status to "${statusLabel}"?`)) {
      return;
    }

    try {
      await updateUser.mutateAsync({
        id: userId,
        status: newStatus,
      });
      
      setOpenDropdownId(null);
      // React Query will automatically refetch the users list due to invalidation
    } catch (err) {
      console.error("Error updating user status:", err);
      alert(err instanceof Error ? err.message : "Error updating user status");
    }
  };

  const toggleStatusDropdown = useCallback((userId: number) => {
    setOpenDropdownId(prevId => prevId === userId ? null : userId);
  }, []);

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, { bg: string; text: string; label: string }> = {
      ACTIVE: { bg: "bg-green-100", text: "text-green-800", label: "Active" },
      SUSPENDED: { bg: "bg-yellow-100", text: "text-yellow-800", label: "Suspend" },
      DISABLED: { bg: "bg-red-100", text: "text-red-800", label: "Disabled" },
      PENDING_ACTIVATION: { bg: "bg-gray-100", text: "text-gray-800", label: "Pending" },
      LOCKED: { bg: "bg-orange-100", text: "text-orange-800", label: "Locked" },
    };

    const statusConfig = statusColors[status] || statusColors.PENDING_ACTIVATION;

    return (
      <span
        className={`px-2 sm:px-3 py-0.5 sm:py-1 text-xs font-semibold rounded-full ${statusConfig.bg} ${statusConfig.text}`}
      >
        {statusConfig.label}
      </span>
    );
  };

  const getStatusButtonColor = (status: string) => {
    const colors: Record<string, string> = {
      ACTIVE: "bg-green-50 text-green-700 hover:bg-green-100 border-green-200",
      PENDING_ACTIVATION: "bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-200",
      SUSPENDED: "bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border-yellow-200",
      DISABLED: "bg-red-50 text-red-700 hover:bg-red-100 border-red-200",
      LOCKED: "bg-orange-50 text-orange-700 hover:bg-orange-100 border-orange-200",
    };
    return colors[status] || colors.PENDING_ACTIVATION;
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

  if (isLoading && users.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" text="Loading users..." />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 px-2 sm:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Users</h2>
        {showActions && (
          <Link
            href="/dashboard/users/new"
            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm hover:shadow-md w-full sm:w-auto text-sm sm:text-base"
          >
            <Plus className="h-4 w-4" />
            <span>Add User</span>
          </Link>
        )}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-3 sm:gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400 shadow-sm text-sm sm:text-base"
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={filters.status}
            onChange={(e) => {
              setFilters({ ...filters, status: e.target.value });
              setPagination(prev => ({ ...prev, page: 1 }));
            }}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white shadow-sm text-sm sm:text-base"
          >
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="DISABLED">Disabled</option>
            <option value="PENDING_ACTIVATION">Pending</option>
            <option value="LOCKED">Locked</option>
          </select>
          <select
            value={filters.role}
            onChange={(e) => {
              setFilters({ ...filters, role: e.target.value });
              setPagination(prev => ({ ...prev, page: 1 }));
            }}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white shadow-sm text-sm sm:text-base"
          >
            <option value="">All Roles</option>
            <option value="SUPER_ADMIN">Super Admin</option>
            <option value="ADMIN">Admin</option>
            <option value="AGENT">Agent</option>
            <option value="SUPPORT_L1">Support L1</option>
            <option value="SUPPORT_L2">Support L2</option>
            <option value="SUPPORT_L3">Support L3</option>
          </select>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          {error instanceof Error ? error.message : "Failed to load users"}
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">
                    User
                  </th>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">
                    Email
                  </th>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">
                    Role
                  </th>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">
                    Status
                  </th>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap hidden md:table-cell">
                    Department
                  </th>
                  {showActions && (
                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={showActions ? 6 : 5} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <User className="h-12 w-12 text-gray-300" />
                      <p className="text-sm font-medium">No users found</p>
                      <p className="text-xs text-gray-400">Try adjusting your search or filters</p>
                    </div>
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const isEditingSelf = systemUserId && user.id === systemUserId;
                  const canEdit = isSuperAdmin && !isEditingSelf;
                  const canChangeStatus = isSuperAdmin && !isEditingSelf;
                  const isDropdownOpen = openDropdownId === user.id;

                  return (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-sm">
                            <User className="h-4 w-4 sm:h-6 sm:w-6 text-white" />
                          </div>
                          <div className="ml-2 sm:ml-4 min-w-0">
                            <div className="text-xs sm:text-sm font-semibold text-gray-900 truncate">{user.fullName}</div>
                            <div className="text-xs sm:text-sm text-gray-500 font-mono truncate">{user.systemUserId}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                        <div className="text-xs sm:text-sm text-gray-900 truncate max-w-[200px] sm:max-w-none">{user.email}</div>
                        <div className="text-xs sm:text-sm text-gray-500">{user.mobile}</div>
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700">
                          {user.primaryRole.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                        {getStatusBadge(user.status)}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-500 hidden md:table-cell">
                        {user.department || "-"}
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
                                  : !isSuperAdmin 
                                  ? "Super admin only" 
                                  : "Edit User"
                              }
                              onClick={(e) => {
                                if (permissionsLoading || !canEdit) {
                                  e.preventDefault();
                                  if (isEditingSelf && !permissionsLoading) {
                                    alert("You cannot edit your own profile. Contact another super admin if needed.");
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
                                  }
                                }}
                                disabled={permissionsLoading || !canChangeStatus}
                                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs font-semibold transition-all border ${getStatusButtonColor(user.status)} ${
                                  permissionsLoading || !canChangeStatus 
                                    ? "opacity-50 cursor-not-allowed" 
                                    : ""
                                } ${isDropdownOpen ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}
                                title={
                                  permissionsLoading 
                                    ? "Loading permissions..." 
                                    : isEditingSelf 
                                    ? "Cannot change your own status" 
                                    : !isSuperAdmin 
                                    ? "Super admin only" 
                                    : "Change Status"
                                }
                              >
                                <span className="capitalize hidden sm:inline">
                                  {STATUS_OPTIONS.find(s => s.value === user.status)?.label || user.status.replace(/_/g, " ").toLowerCase()}
                                </span>
                                <span className="capitalize sm:hidden text-[10px]">
                                  {STATUS_OPTIONS.find(s => s.value === user.status)?.label.substring(0, 4) || user.status.substring(0, 4)}
                                </span>
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
                                      const isCurrentStatus = user.status === status.value;
                                      const isUpdating = updateUser.isPending && updateUser.variables?.id === user.id && updateUser.variables?.status === status.value;
                                      return (
                                        <button
                                          key={status.value}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleStatusChange(user.id, status.value);
                                          }}
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
        </div>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white px-4 sm:px-6 py-4 rounded-lg border border-gray-200 shadow-sm">
          <div className="text-xs sm:text-sm text-gray-700 text-center sm:text-left">
            Showing <span className="font-semibold text-gray-900">{((pagination.page - 1) * pagination.limit) + 1}</span> to{" "}
            <span className="font-semibold text-gray-900">{Math.min(pagination.page * pagination.limit, pagination.total)}</span> of{" "}
            <span className="font-semibold text-gray-900">{pagination.total}</span> users
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-center">
            <button
              onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
              disabled={pagination.page === 1}
              className="px-3 py-2 bg-white border-2 border-gray-300 text-gray-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 hover:border-gray-400 active:bg-gray-100 transition-all flex items-center gap-1.5 text-sm font-medium shadow-sm"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Previous</span>
            </button>
            <div className="flex items-center gap-1">
              {generatePageNumbers().map((page, index) => {
                if (page === "...") {
                  return (
                    <span key={`ellipsis-${index}`} className="px-2 text-gray-500 font-medium">
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
                    className={`px-3 py-2 min-w-[40px] text-sm font-semibold rounded-lg transition-all ${
                      isActive
                        ? "bg-blue-600 text-white shadow-md ring-2 ring-blue-200"
                        : "bg-white border-2 border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 active:bg-gray-100 shadow-sm"
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
              className="px-3 py-2 bg-white border-2 border-gray-300 text-gray-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 hover:border-gray-400 active:bg-gray-100 transition-all flex items-center gap-1.5 text-sm font-medium shadow-sm"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
