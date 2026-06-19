import { NextResponse } from "next/server";
import {
  getDeliveryFallbackConfig,
  updateDeliveryFallbackConfig,
} from "@/lib/db/operations/delivery-fallback-config";

export async function GET() {
  try {
    const config = await getDeliveryFallbackConfig();
    return NextResponse.json({ ok: true, config });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load delivery fallback config";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as {
      fallbackBaseInr?: unknown;
      fallbackPerKmInr?: unknown;
      minFeeInr?: unknown;
    };

    const patch: {
      fallbackBaseInr?: number;
      fallbackPerKmInr?: number;
      minFeeInr?: number;
    } = {};

    if (body.fallbackBaseInr != null) {
      const n = Number(body.fallbackBaseInr);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ ok: false, message: "Invalid base fee" }, { status: 400 });
      }
      patch.fallbackBaseInr = n;
    }
    if (body.fallbackPerKmInr != null) {
      const n = Number(body.fallbackPerKmInr);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ ok: false, message: "Invalid per-km fee" }, { status: 400 });
      }
      patch.fallbackPerKmInr = n;
    }
    if (body.minFeeInr != null) {
      const n = Number(body.minFeeInr);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ ok: false, message: "Invalid minimum fee" }, { status: 400 });
      }
      patch.minFeeInr = n;
    }

    const config = await updateDeliveryFallbackConfig(patch);
    return NextResponse.json({ ok: true, config });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save delivery fallback config";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
