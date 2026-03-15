import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * GET /api/merchant/reviews?storeId=GMMC1001
 * Returns customer reviews/feedback for a merchant store
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');

    if (!storeId) {
      return NextResponse.json(
        { success: false, error: "Store ID is required." },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Please log in to view reviews." },
        { status: 401 }
      );
    }

    let merchant_parent_id: number | null = null;
    try {
      const validation = await validateMerchantFromSession({ 
        id: user.id, 
        email: user.email ?? null, 
        phone: user.phone ?? null 
      });
      if (validation.merchantParentId != null) {
        merchant_parent_id = validation.merchantParentId;
      }
    } catch {
      return NextResponse.json(
        { success: false, error: "Merchant account not found." },
        { status: 403 }
      );
    }

    const db = getSupabaseAdmin();
    
    // Resolve store ID to internal ID
    const { data: storeData } = await db
      .from("merchant_stores")
      .select("id")
      .or(`store_id.eq.${storeId},id.eq.${storeId}`)
      .eq("merchant_parent_id", merchant_parent_id)
      .maybeSingle();

    if (!storeData) {
      return NextResponse.json(
        { success: false, error: "Store not found or access denied." },
        { status: 404 }
      );
    }

    const storeInternalId = storeData.id;

    // Fetch customer reviews for this store
    const { data: reviews, error: reviewsError } = await db
      .from("customer_ratings_given")
      .select(`
        id,
        customer_id,
        order_id,
        overall_rating,
        food_quality_rating,
        delivery_rating,
        packaging_rating,
        review_title,
        review_text,
        review_images,
        review_tags,
        merchant_response,
        merchant_responded_at,
        is_verified,
        is_flagged,
        flag_reason,
        created_at,
        updated_at,
        customers:customer_id (
          id,
          name,
          mobile,
          email
        )
      `)
      .eq("target_type", "MERCHANT")
      .eq("target_id", storeInternalId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (reviewsError) {
      console.error("[merchant/reviews] fetch error:", reviewsError);
      return NextResponse.json(
        { success: false, error: "Failed to fetch reviews." },
        { status: 500 }
      );
    }

    // Get order counts for each customer
    const customerIds = [...new Set(reviews?.map((r: any) => r.customer_id).filter(Boolean) || [])];
    const orderCounts: Record<number, number> = {};
    
    if (customerIds.length > 0) {
      const { data: orderData } = await db
        .from("orders_food")
        .select("customer_id")
        .in("customer_id", customerIds)
        .eq("merchant_store_id", storeInternalId);
      
      orderData?.forEach((order: any) => {
        if (order.customer_id) {
          orderCounts[order.customer_id] = (orderCounts[order.customer_id] || 0) + 1;
        }
      });
    }

    // Format reviews
    const formattedReviews = (reviews || []).map((review: any) => {
      const customer = review.customers;
      const orderCount = orderCounts[review.customer_id] || 0;
      
      // Determine user type based on order count
      let userType = 'new';
      if (orderCount >= 10) {
        userType = 'repeated';
      } else if (orderCount >= 5) {
        userType = 'repeated';
      }

      // Determine if it's a review or complaint based on rating
      const type = review.overall_rating >= 4 ? 'Review' : 'Complaint';

      return {
        id: review.id,
        customerId: review.customer_id,
        customerName: customer?.name || 'Anonymous',
        customerEmail: customer?.email || null,
        customerMobile: customer?.mobile || null,
        orderId: review.order_id,
        date: review.created_at,
        type,
        message: review.review_text || review.review_title || '',
        response: review.merchant_response || '',
        respondedAt: review.merchant_responded_at,
        userType,
        rating: review.overall_rating,
        foodQualityRating: review.food_quality_rating,
        deliveryRating: review.delivery_rating,
        packagingRating: review.packaging_rating,
        reviewImages: review.review_images || [],
        reviewTags: review.review_tags || [],
        orderCount,
        isVerified: review.is_verified || false,
        isFlagged: review.is_flagged || false,
        flagReason: review.flag_reason || null,
      };
    });

    // Calculate stats
    const stats = {
      total: formattedReviews.length,
      reviews: formattedReviews.filter((r: any) => r.type === 'Review').length,
      complaints: formattedReviews.filter((r: any) => r.type === 'Complaint').length,
      repeatedUsers: formattedReviews.filter((r: any) => r.userType === 'repeated').length,
      newUsers: formattedReviews.filter((r: any) => r.userType === 'new').length,
      fraudUsers: formattedReviews.filter((r: any) => r.isFlagged).length,
    };

    return NextResponse.json({
      success: true,
      reviews: formattedReviews,
      stats,
    });
  } catch (e) {
    console.error("[merchant/reviews] Error:", e);
    return NextResponse.json(
      { success: false, error: "An error occurred. Please try again." },
      { status: 500 }
    );
  }
}
