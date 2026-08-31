import { NextRequest, NextResponse } from 'next/server'
import { fetchGroceryProductDetail } from '@/lib/server/fetchGroceryProducts'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { itemId: string } }
) {
  try {
    const rawItemId = params.itemId
    const storeSlug = new URL(request.url).searchParams.get('store')?.trim()
    const itemId = decodeURIComponent(rawItemId)

    const product = await fetchGroceryProductDetail({
      itemId,
      storeSlug: storeSlug || undefined,
    })

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    return NextResponse.json(
      { product },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' } }
    )
  } catch (err) {
    console.error('[GET /api/grocery/products/[itemId]]', err)
    return NextResponse.json({ error: 'Failed to load product' }, { status: 500 })
  }
}
