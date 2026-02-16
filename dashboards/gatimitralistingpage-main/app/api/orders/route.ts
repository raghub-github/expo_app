import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const category = searchParams.get('category');
    const deliveryType = searchParams.get('deliveryType');
    const userType = searchParams.get('userType');
    const department = searchParams.get('department');
    const searchType = searchParams.get('searchType');
    const searchValue = searchParams.get('searchValue');

    let query = supabaseAdmin.from('orders').select('*');

    if (status) {
      query = query.eq('status', status);
    }

    if (category) {
      query = query.eq('category', category);
    }

    if (deliveryType) {
      query = query.eq('deliveryType', deliveryType);
    }

    if (userType) {
      query = query.eq('userType', userType);
    }

    if (department) {
      query = query.eq('department', department);
    }

    if (searchValue && searchType) {
      switch (searchType) {
        case 'order_id':
          query = query.ilike('"orderId"', `%${searchValue}%`);
          break;
        case 'merchant_id':
          query = query.ilike('"merchantId"', `%${searchValue}%`);
          break;
        case 'user_no':
          query = query.ilike('"customerMobile"', `%${searchValue}%`);
          break;
        case 'third_party_id':
          query = query.ilike('"orderId"', `%${searchValue}%`);
          break;
      }
    }

    const { data, error } = await query.order('createdAt', { ascending: false });

    if (error) {
      console.error('Orders fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch orders' },
        { status: 500 }
      );
    }

    return NextResponse.json({ orders: data || [] });
  } catch (error) {
    console.error('Orders API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

