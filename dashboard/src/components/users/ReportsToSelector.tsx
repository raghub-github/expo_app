"use client";

import { useState, useEffect, useRef } from "react";
import { Search, X, Loader2 } from "lucide-react";

interface UserOption {
  id: number;
  systemUserId: string;
  fullName: string;
  email: string;
  primaryRole: string;
  subrole: string | null;
  subroleOther: string | null;
  displayLabel: string;
}

interface ReportsToSelectorProps {
  value: number | null;
  onChange: (userId: number | null) => void;
  disabled?: boolean;
  excludeUserId?: number | null;
  placeholder?: string;
}

export function ReportsToSelector({
  value,
  onChange,
  disabled = false,
  excludeUserId = null,
  placeholder = "Search by name, ID, email, or role...",
}: ReportsToSelectorProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch selected user details when value changes
  useEffect(() => {
    if (value) {
      // Only fetch if we don't have a selected user or if the ID changed
      if (!selectedUser || selectedUser.id !== value) {
        fetchUserById(value);
      }
    } else {
      setSelectedUser(null);
    }
  }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchUserById = async (userId: number) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/users/${userId}`);
      const result = await response.json();
      
      if (result.success && result.data) {
        const user = result.data;
        const option: UserOption = {
          id: user.id,
          systemUserId: user.systemUserId,
          fullName: user.fullName,
          email: user.email,
          primaryRole: user.primaryRole,
          subrole: user.subrole,
          subroleOther: user.subroleOther,
          displayLabel: `${user.systemUserId} - ${user.fullName} (${user.primaryRole}${user.subrole ? ` - ${user.subrole}` : ""})`,
        };
        setSelectedUser(option);
      }
    } catch (error) {
      console.error("Error fetching user:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async (search: string) => {
    const trimmedSearch = search.trim();
    if (!trimmedSearch || trimmedSearch.length < 1) {
      setUsers([]);
      return;
    }

    try {
      setLoading(true);
      const params = new URLSearchParams({
        search: trimmedSearch,
        limit: "30", // Increased limit for better results
      });
      
      // Don't filter by status - allow searching all active users
      // Remove status: "ACTIVE" to search all non-deleted users
      
      if (excludeUserId) {
        params.append("excludeUserId", excludeUserId.toString());
      }

      const response = await fetch(`/api/users/list-for-selector?${params}`);
      const result = await response.json();

      if (result.success) {
        setUsers(result.data || []);
      } else {
        setUsers([]);
        console.error("Failed to fetch users:", result.error);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value.trim();
    setSearchTerm(term);
    setIsOpen(true);
    
    // Clear selected user when user starts typing
    if (selectedUser && term.length > 0) {
      setSelectedUser(null);
      onChange(null);
    }

    // Debounce search - search immediately if term is cleared
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (term.length === 0) {
      setUsers([]);
      return;
    }

    // Search with shorter debounce for better responsiveness
    searchTimeoutRef.current = setTimeout(() => {
      fetchUsers(term);
    }, 200);
  };

  const handleSelectUser = (user: UserOption) => {
    setSelectedUser(user);
    onChange(user.id);
    setSearchTerm("");
    setUsers([]);
    setIsOpen(false);
  };

  const handleClear = () => {
    setSelectedUser(null);
    onChange(null);
    setSearchTerm("");
    setUsers([]);
    setIsOpen(true); // Keep dropdown open to allow immediate search
  };

  const handleEdit = () => {
    // Switch from selected view to search view
    setSelectedUser(null);
    setSearchTerm("");
    setUsers([]);
    setIsOpen(true);
  };

  const displayValue = selectedUser
    ? `${selectedUser.systemUserId} - ${selectedUser.fullName} (${selectedUser.primaryRole}${selectedUser.subrole ? ` - ${selectedUser.subrole}` : ""})`
    : "";

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Reports To
      </label>
      
      {selectedUser && searchTerm.length === 0 && !isOpen ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-900">
            {displayValue}
          </div>
          {!disabled && (
            <>
              <button
                type="button"
                onClick={handleEdit}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                title="Change selection"
              >
                <Search className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                title="Clear selection"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={handleSearchChange}
              onFocus={() => {
                setIsOpen(true);
                if (searchTerm && searchTerm.length >= 1) {
                  fetchUsers(searchTerm);
                }
              }}
              onKeyDown={(e) => {
                // Allow Escape to close dropdown
                if (e.key === "Escape") {
                  setIsOpen(false);
                }
                // Allow Enter to select first result if available
                if (e.key === "Enter" && users.length > 0 && !loading) {
                  e.preventDefault();
                  handleSelectUser(users[0]);
                }
              }}
              disabled={disabled}
              placeholder={placeholder}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400 disabled:bg-gray-100"
            />
            {loading && (
              <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />
            )}
          </div>

          {isOpen && (users.length > 0 || (searchTerm.trim().length >= 1 && !loading) || loading) && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
              {loading ? (
                <div className="p-4 text-center text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                  Searching...
                </div>
              ) : users.length > 0 ? (
                <ul className="py-1">
                  {users.map((user) => (
                    <li
                      key={user.id}
                      onClick={() => handleSelectUser(user)}
                      className="px-4 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors"
                    >
                      <div className="font-medium text-gray-900">{user.displayLabel}</div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                      {user.subrole && (
                        <div className="text-xs text-gray-400 mt-0.5">Subrole: {user.subrole}</div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : searchTerm.trim().length >= 1 ? (
                <div className="p-4 text-center text-gray-500">
                  <div className="mb-1">No users found matching "{searchTerm}"</div>
                  <div className="text-xs text-gray-400">Try searching by name, email, ID, or role</div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {selectedUser && (
        <p className="mt-1 text-xs text-gray-500">
          Selected: {selectedUser.fullName} ({selectedUser.email})
        </p>
      )}
    </div>
  );
}
