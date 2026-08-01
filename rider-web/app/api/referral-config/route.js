/**
 * Live rider referral config, proxied from the backend's public endpoint.
 *
 * Everything the marketing site advertises (welcome bonus, milestone count,
 * reward amounts) is owned by Super Admin. Proxying server-side keeps the
 * backend URL out of the browser bundle and lets us fail soft: if the API is
 * unreachable the site keeps its last-known copy instead of showing an error.
 */

export const revalidate = 0;
export const dynamic = 'force-dynamic';

function backendBaseUrl() {
  const raw =
    process.env.BACKEND_API_URL ||
    process.env.API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    'https://api.gatimitra.com';
  return raw.replace(/\/+$/, '');
}

const NO_STORE = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, max-age=0, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

export async function GET() {
  const url = `${backendBaseUrl()}/v1/referral/config?userType=rider`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: `backend_${res.status}` }),
        { status: 200, headers: NO_STORE }
      );
    }

    const body = await res.json();
    const milestones = Array.isArray(body.milestones)
      ? body.milestones
          .map((m) => ({
            name: m.name ?? null,
            milestoneOrders: Number(m.milestoneOrders) || 0,
            rewardAmount: Number(m.rewardAmount) || 0,
            requireKyc: Boolean(m.requireKyc),
          }))
          .filter((m) => m.rewardAmount > 0)
          .sort((a, b) => a.milestoneOrders - b.milestoneOrders)
      : [];

    return new Response(
      JSON.stringify({
        ok: true,
        configVersion: Number(body.configVersion) || 0,
        referralEnabled: Boolean(body.referralEnabled),
        rewardEnabled: Boolean(body.rewardEnabled),
        requireKyc: Boolean(body.requireKyc),
        currency: body.currency || 'INR',
        rewardSummary: body.rewardSummary ?? null,
        milestones,
      }),
      { status: 200, headers: NO_STORE }
    );
  } catch (error) {
    console.error('[referral-config] backend unreachable:', error.message);
    return new Response(
      JSON.stringify({ ok: false, error: 'backend_unreachable' }),
      { status: 200, headers: NO_STORE }
    );
  }
}
