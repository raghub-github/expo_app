// useDashboardStats: Fetch dashboard stats and recent activities from API
import { useEffect, useState } from 'react';

export default function useDashboardStats() {
  const [stats, setStats] = useState({ total: 0, submitted: 0, under_verification: 0, approved: 0, rejected: 0 });
  const [recentActivities, setRecentActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      try {
        const res = await fetch('/api/admin/stores/stats');
        const data = await res.json();
        setStats({
          total: data.total || 0,
          submitted: data.submitted || 0,
          under_verification: data.under_verification || 0,
          approved: data.approved || 0,
          rejected: data.rejected || 0,
        });
        setRecentActivities(data.recentActivities || []);
      } catch (err) {
        setStats({ total: 0, submitted: 0, under_verification: 0, approved: 0, rejected: 0 });
        setRecentActivities([]);
      }
      setLoading(false);
    }
    fetchStats();
  }, []);

  return { stats, recentActivities, loading };
}
