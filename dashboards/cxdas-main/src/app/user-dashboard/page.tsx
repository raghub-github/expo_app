import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card } from "@/components/layout/Card";
import { UserDashboardView, type UserRecord } from "@/components/dashboard/UserDashboardView";
import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  getColumnForSearchBy,
  getTableForCategory,
  type SearchBy,
  type SearchCategory,
} from "@/lib/searchMappings";

interface UserDashboardPageProps {
  searchParams: Promise<{
    category?: string;
    searchBy?: string;
    q?: string;
  }>;
}

async function fetchUser(
  category: SearchCategory,
  searchBy: SearchBy,
  value: string
): Promise<UserRecord | null> {
  const supabase = getSupabaseClient();

  const table = getTableForCategory(category);
  const column = getColumnForSearchBy(searchBy);

  // Use partial, case-insensitive match for customer name; exact match for others.
  const query = supabase.from(table).select("*");
  if (searchBy === "Customer Name") {
    query.ilike(column, `%${value}%`).limit(1);
  } else {
    query.eq(column, value).limit(1);
  }

  const { data, error } = await query.single();

  if (error) {
    console.error("Supabase fetch error", error);
    return null;
  }

  return data as UserRecord | null;
}

export default async function UserDashboardPage({
  searchParams,
}: UserDashboardPageProps) {
  const resolvedSearchParams = await searchParams;

  const category = resolvedSearchParams.category as
    | SearchCategory
    | undefined;
  const searchBy = resolvedSearchParams.searchBy as SearchBy | undefined;
  const q =
    typeof resolvedSearchParams.q === "string"
      ? resolvedSearchParams.q.trim()
      : "";

  let user: UserRecord | null = null;

  if (category && searchBy && q) {
    try {
      user = await fetchUser(category, searchBy, q);
    } catch (error) {
      console.error("Failed to fetch user", error);
    }
  }

  return <UserDashboardView user={user} />;
}
