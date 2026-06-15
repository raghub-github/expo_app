// Mock function to fetch pending approval users. Replace with real API call in production.
export async function fetchPendingApprovalUsers() {
  // Example: Fetch from /api/users?isApproved=false
  return [
    { id: '1', email: 'pending1@example.com' },
    { id: '2', email: 'pending2@example.com' },
    { id: '3', email: 'pending3@example.com' },
  ];
}
