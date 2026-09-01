import { NextRequest, NextResponse } from 'next/server'
import { DEFAULT_SERVICE_RADIUS_KM } from '@/lib/server/merchantStoreGeo'
import { fetchGroceryProducts } from '@/lib/server/fetchGroceryProducts'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const latParam = searchParams.get('lat')
    const lonParam = searchParams.get('lon') ?? searchParams.get('lng')
    const userLat = latParam != null ? parseFloat(latParam) : NaN
    const userLon = lonParam != null ? parseFloat(lonParam) : NaN
    const hasCoords =
      Number.isFinite(userLat) &&
      Number.isFinite(userLon) &&
      userLat >= -90 &&
      userLat <= 90 &&
      userLon >= -180 &&
      userLon <= 180

    const radiusKm = Math.min(
      50,
      Math.max(
        1,
        parseInt(searchParams.get('radius_km') ?? String(DEFAULT_SERVICE_RADIUS_KM), 10) ||
          DEFAULT_SERVICE_RADIUS_KM
      )
    )
    const storeSlug = searchParams.get('store')?.trim()
    const limit = Math.min(
      120,
      Math.max(1, parseInt(searchParams.get('limit') ?? '24', 10) || 24)
    )

    const { products, total, storeName } = await fetchGroceryProducts({
      userLat: hasCoords && !storeSlug ? userLat : undefined,
      userLon: hasCoords && !storeSlug ? userLon : undefined,
      radiusKm,
      limit,
      storeSlug: storeSlug || undefined,
    })

    return NextResponse.json(
      {
        title: storeSlug ? (storeName ?? 'Store products') : 'Trending Near You',
        showing: products.length,
        total,
        products,
        storeName: storeName ?? null,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' } }
    )
  } catch (err) {
    console.error('[GET /api/grocery/products]', err)
    return NextResponse.json(
      { title: 'Trending Near You', showing: 0, total: 0, products: [] },
      { status: 200 }
    )
  }
}
