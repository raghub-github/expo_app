/** Shared partner shell header copy — keep titles/subtitles consistent across routes. */
export const PARTNER_PAGE_HEADERS = {
  dashboard: {
    title: 'Dashboard',
    subtitle: 'Track performance and daily store operations',
  },
  orders: {
    title: 'Orders',
    subtitle: 'Manage live orders and kitchen pipeline',
  },
  menu: {
    title: 'Menu Management',
    subtitle: 'Update items, prices, and availability',
  },
  orderHistory: {
    title: 'Order History',
    subtitle: 'Browse past orders and delivery records',
  },
  offers: {
    title: 'Offers',
    subtitle: 'Create and manage store promotions',
  },
  payments: {
    title: 'Payments',
    subtitle: 'Wallet balance, payouts, and ledger',
  },
  userInsights: {
    title: 'User Insights',
    subtitle: 'Customer reviews and feedback',
  },
  supportInbox: {
    title: 'Support Inbox',
    subtitle: 'View and reply to support tickets',
  },
  storeSettings: {
    title: 'Store Settings',
    subtitle: 'Manage store configuration and preferences',
  },
  profile: {
    title: 'Merchant Profile',
    subtitle: 'Manage your restaurant details',
  },
} as const;
