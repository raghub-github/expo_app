/** User Insights review row — same shape as partnersite /api/merchant/reviews */
export type UserInsightReview = {
  id: number;
  customerId: number;
  customerName: string;
  customerEmail: string | null;
  customerMobile: string | null;
  orderId: number | null;
  orderPublicId: string | null;
  orderSummary: string | null;
  date: string;
  type: "Review" | "Complaint";
  message: string;
  response: string;
  respondedAt: string | null;
  userType: "new" | "repeated" | "fraud";
  rating: number;
  foodQualityRating: number | null;
  deliveryRating: number | null;
  packagingRating: number | null;
  reviewImages: string[];
  reviewTags: string[];
  orderCount: number;
  isVerified: boolean;
  isFlagged: boolean;
  flagReason: string | null;
};

export type UserInsightReviewStats = {
  total: number;
  reviews: number;
  complaints: number;
  repeatedUsers: number;
  newUsers: number;
  fraudUsers: number;
};
