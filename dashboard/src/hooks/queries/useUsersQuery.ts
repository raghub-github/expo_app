"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { getCacheConfig, CacheTier } from "@/lib/cache-strategies";

export interface SystemUser {
  id: number;
  systemUserId: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  email: string;
  mobile: string;
  alternateMobile?: string;
  primaryRole: string;
  subrole?: string;
  subroleOther?: string;
  roleDisplayName?: string;
  department?: string;
  team?: string;
  reportsToId?: number;
  managerName?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  suspensionExpiresAt?: string | null;
}

interface UsersResponse {
  success: boolean;
  data?: SystemUser[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  error?: string;
}

interface UsersQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: string;
  department?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

async function fetchUsers(params: UsersQueryParams = {}): Promise<{
  users: SystemUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {
  const searchParams = new URLSearchParams();
  
  if (params.page) searchParams.set("page", params.page.toString());
  if (params.limit) searchParams.set("limit", params.limit.toString());
  if (params.search) searchParams.set("search", params.search);
  if (params.role) searchParams.set("role", params.role);
  if (params.status) searchParams.set("status", params.status);
  if (params.department) searchParams.set("department", params.department);
  if (params.sortBy) searchParams.set("sortBy", params.sortBy);
  if (params.sortOrder) searchParams.set("sortOrder", params.sortOrder);

  const response = await fetch(`/api/users?${searchParams.toString()}`);
  const result: UsersResponse = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch users");
  }

  return {
    users: result.data,
    pagination: result.pagination || {
      page: params.page || 1,
      limit: params.limit || 20,
      total: 0,
      totalPages: 0,
    },
  };
}

/**
 * Hook to fetch users with filters and pagination
 * Uses React Query for automatic caching and refetching
 */
export function useUsersQuery(params: UsersQueryParams = {}) {
  return useQuery({
    queryKey: queryKeys.users.list(params as Record<string, unknown>),
    queryFn: () => fetchUsers(params),
    ...getCacheConfig(CacheTier.MEDIUM), // Users list is medium frequency
  });
}

interface CreateUserInput {
  system_user_id?: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  email: string;
  mobile: string;
  alternate_mobile?: string;
  primary_role: string;
  subrole?: string;
  subrole_other?: string;
  role_display_name?: string;
  department?: string;
  team?: string;
  reports_to_id?: number;
  manager_name?: string;
  dashboardAccess?: Array<{
    dashboardType: string;
    accessLevel: string;
    orderType?: string;
  }>;
  accessPoints?: Array<{
    dashboardType: string;
    accessPointGroup: string;
    orderType?: string;
    context?: Record<string, any>;
  }>;
}

async function createUser(input: CreateUserInput): Promise<SystemUser> {
  const response = await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const result: UsersResponse = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to create user");
  }

  return Array.isArray(result.data) ? result.data[0] : result.data as any;
}

/**
 * Hook to create a new user
 * Automatically invalidates and refetches the users list
 */
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      // Invalidate and refetch users list
      queryClient.invalidateQueries({ queryKey: queryKeys.users.lists() });
    },
  });
}

interface UpdateUserInput {
  id: number;
  status?: string;
  status_reason?: string | null;
  suspension_expires_at?: string | null;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  mobile?: string;
  alternate_mobile?: string;
  primary_role?: string;
  subrole?: string;
  subrole_other?: string;
  role_display_name?: string;
  department?: string;
  team?: string;
  reports_to_id?: number;
  manager_name?: string;
  dashboardAccess?: Array<{
    dashboardType: string;
    accessLevel: string;
    orderType?: string;
  }>;
  accessPoints?: Array<{
    dashboardType: string;
    accessPointGroup: string;
    orderType?: string;
    context?: Record<string, any>;
  }>;
}

async function updateUser(input: UpdateUserInput): Promise<SystemUser> {
  const { id, ...updateData } = input;
  const response = await fetch(`/api/users/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updateData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = "Failed to update user";
    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.error || errorMessage;
    } catch {
      errorMessage = errorText || errorMessage;
    }
    throw new Error(errorMessage);
  }

  const result: { success: boolean; data?: SystemUser; error?: string } = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to update user");
  }

  // API returns a single user object, not an array
  return result.data;
}

/**
 * Hook to update a user
 * Automatically invalidates and refetches the users list
 */
export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateUser,
    onSuccess: () => {
      // Invalidate all user list queries to trigger refetch
      // This will refetch all user queries regardless of filters
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.users.lists(),
        refetchType: 'active', // Only refetch active queries (visible on screen)
      });
    },
  });
}
