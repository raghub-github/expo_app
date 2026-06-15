import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', params.id)
      .single();

    if (order) {
      return NextResponse.json({ order });
    }

    // Fallback: return mock order if not found in DB
    const mockOrders = [
      {
        id: 'GM1011',
        orderId: 'GM1011',
        action: 'Verify Payment',
        routedTo: 'raghubhunia@gatimitra.in',
        orderTime: '18:12:25 11:30 AM',
        updatedTime: '18:12:25 11:35 AM',
        customerName: 'Rahul Sharma',
        customerMobile: '9876543210',
        merchantId: '8899002',
        merchantMobile: '91998877664',
        merchantLocality: 'South Delhi',
        deliveryProvider: 'GATIMITRA_DIRECT',
        status: 'PAYMENT DONE',
        category: 'Food',
        deliveryType: 'Merchant',
        userType: 'Very Good',
        department: 'food',
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'GM1021',
        orderId: 'GM1021',
        action: 'Prepare Order',
        routedTo: 'davidwilson@gatimitra.in',
        orderTime: '18:12:25 03:45 PM',
        updatedTime: '18:12:25 03:50 PM',
        customerName: 'Priya Patel',
        customerMobile: '8765432109',
        merchantId: '3344557',
        merchantMobile: '91988776654',
        merchantLocality: 'West Mumbai',
        deliveryProvider: 'DELHIVERY',
        status: 'DESPATCH READY',
        category: 'Food',
        deliveryType: 'GatiMitra',
        userType: 'Good',
        department: 'food',
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'GM1031',
        orderId: 'GM1031',
        action: 'Dispatch Order',
        routedTo: 'roberttaylor@gatimitra.in',
        orderTime: '18:12:25 05:20 PM',
        updatedTime: '18:12:25 05:25 PM',
        customerName: 'Ankit Verma',
        customerMobile: '7654321098',
        merchantId: '4455668',
        merchantMobile: '91977665543',
        merchantLocality: 'East Bangalore',
        deliveryProvider: 'BLUEDART',
        status: 'DESPATCHED',
        category: 'Food',
        deliveryType: 'Merchant',
        userType: 'Bad',
        department: 'food',
        createdAt: '',
        updatedAt: '',
      },
    ];
    const mockOrder = mockOrders.find(o => o.id === params.id);
    if (mockOrder) {
      return NextResponse.json({ order: mockOrder });
    }

    return NextResponse.json(
      { error: 'Order not found' },
      { status: 404 }
    );
  } catch (error) {
    console.error('Order fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const body = await request.json();
    const { status, ...otherFields } = body;

    const updateData: any = {
      updatedAt: new Date().toISOString(),
    };

    if (status) {
      updateData.status = status;
    }

    Object.assign(updateData, otherFields);

    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      console.error('Order update error:', error);
      return NextResponse.json(
        { error: 'Failed to update order' },
        { status: 500 }
      );
    }

    return NextResponse.json({ order });
  } catch (error) {
    console.error('Order update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

