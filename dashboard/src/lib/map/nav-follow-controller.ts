/**
 * Imperative navigation follow controller — marker + heading + camera in one rAF loop.
 * No React state on animation frames. Consumes real GPS updates only.
 *
 * Camera: smooth easeTo with heading-up auto-rotate (2D navigation style).
 */

import {
  type LngLat,
  bearingDegrees,
  haversineMeters,
  lerpBearing,
  offsetLngLatMeters,
  pointAlongRoute,
  resolveVisualRiderLocation,
  shortestBearingDelta,
  snapToRoute,
  totalRouteLengthM,
} from "./nav-geometry";

export type NavGpsSample = {
  lngLat: LngLat;
  headingDeg?: number | null;
  /** Epoch ms of the GPS sample. */
  timestampMs: number;
  speedMps?: number | null;
};

type MarkerLike = {
  setLngLat: (ll: LngLat | { lng: number; lat: number }) => void;
  getLngLat?: () => { lng: number; lat: number };
  getElement?: () => HTMLElement;
};

type MapLike = {
  easeTo?: (opts: Record<string, unknown>) => void;
  jumpTo?: (opts: Record<string, unknown>) => void;
  stop?: () => void;
  getPitch?: () => number;
  getZoom?: () => number;
  getBearing?: () => number;
  getCenter?: () => { lng: number; lat: number };
};

export type NavigationFollowOptions = {
  pitch?: number;
  /** Meters ahead of rider for camera look-ahead. */
  lookAheadM?: number;
  /** Max map-match snap distance. */
  maxSnapM?: number;
  /** Reject GPS jumps faster than this (m/s) as outliers. */
  maxImpliedSpeedMps?: number;
  /** GPS older than this stops continued interpolation. */
  staleAfterMs?: number;
  /** Camera ease duration for smooth heading-up follow (ms). */
  cameraSmoothMs?: number;
};

const DEFAULTS: Required<NavigationFollowOptions> = {
  pitch: 0,
  lookAheadM: 70,
  maxSnapM: 80,
  maxImpliedSpeedMps: 45, // ~162 km/h — reject teleport outliers
  staleAfterMs: 12_000,
  cameraSmoothMs: 420,
};

/** Near-linear cruise with soft settle — closer to Google Maps nav feel. */
function easeNav(t: number): number {
  // 70% linear + 30% ease-out so speed doesn't die mid-leg between GPS pings.
  const linear = t;
  const easeOut = 1 - (1 - t) * (1 - t);
  return linear * 0.7 + easeOut * 0.3;
}

function setBikeHeading(marker: MarkerLike, headingDeg: number) {
  const img = marker.getElement?.()?.querySelector(".gm-location-marker__bike") as
    | HTMLElement
    | null;
  if (img) img.style.transform = `rotate(${headingDeg}deg)`;
}

function readMarkerLngLat(marker: MarkerLike): LngLat | null {
  try {
    const ll = marker.getLngLat?.();
    if (!ll || !Number.isFinite(ll.lng) || !Number.isFinite(ll.lat)) return null;
    return [ll.lng, ll.lat];
  } catch {
    return null;
  }
}

export class NavigationFollowController {
  private map: MapLike | null = null;
  private marker: MarkerLike | null = null;
  private route: LngLat[] | null = null;
  private followEnabled = true;
  private opts: Required<NavigationFollowOptions>;

  private rendered: LngLat | null = null;
  private renderedHeading = 0;
  private target: LngLat | null = null;
  private targetHeading = 0;
  private animFrom: LngLat | null = null;
  private animFromHeading = 0;
  private animAlongFrom = 0;
  private animAlongTo = 0;
  private useAlongRoute = false;
  private animStartMs = 0;
  private animDurationMs = 0;
  private rafId: number | null = null;
  private lastGpsMs = 0;
  private lastRaw: LngLat | null = null;
  private lastAppliedGpsMs = 0;
  private lastCameraAt = 0;
  private lastCameraBearing = 0;

  private onFollowChange: ((following: boolean) => void) | null = null;
  private onRouteProgress: ((remaining: LngLat[], alongM: number) => void) | null = null;

  constructor(opts?: NavigationFollowOptions) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  attach(map: MapLike, marker: MarkerLike) {
    this.map = map;
    this.marker = marker;
    const ll = readMarkerLngLat(marker);
    if (ll) {
      this.rendered = ll;
      this.target = ll;
    }
  }

  setRoute(route: LngLat[] | null) {
    this.route = route && route.length >= 2 ? route : null;
  }

  setOnFollowChange(cb: ((following: boolean) => void) | null) {
    this.onFollowChange = cb;
  }

  setOnRouteProgress(cb: ((remaining: LngLat[], alongM: number) => void) | null) {
    this.onRouteProgress = cb;
  }

  isFollowing(): boolean {
    return this.followEnabled;
  }

  pauseFollow() {
    if (!this.followEnabled) return;
    this.followEnabled = false;
    this.onFollowChange?.(false);
  }

  resumeFollow() {
    if (this.followEnabled) return;
    this.followEnabled = true;
    this.onFollowChange?.(true);
    // Smooth re-entry toward current target.
    if (this.rendered && this.target) {
      this.startAnim(this.rendered, this.renderedHeading, this.target, this.targetHeading, 900);
    }
  }

  /** User pan/zoom/rotate — stop fighting their gesture. */
  notifyUserGesture() {
    this.pauseFollow();
  }

  destroy() {
    this.cancelRaf();
    this.map = null;
    this.marker = null;
    this.route = null;
  }

  /**
   * Push a validated GPS sample. Interpolates from CURRENT rendered position
   * to the new (map-matched) target — never restarts from an old GPS coord.
   */
  pushGps(sample: NavGpsSample): void {
    const raw = sample.lngLat;

    // Outlier / teleport protection.
    if (this.lastRaw && this.lastGpsMs > 0) {
      const dtSec = Math.max(0.05, (sample.timestampMs - this.lastGpsMs) / 1000);
      const dist = haversineMeters(this.lastRaw, raw);
      const implied = dist / dtSec;
      if (implied > this.opts.maxImpliedSpeedMps && dist > 120) {
        // Hold — wait for next reliable update.
        return;
      }
    }

    const { visual, matched, snap } = resolveVisualRiderLocation(
      raw,
      this.route,
      this.opts.maxSnapM
    );

    let heading =
      sample.headingDeg != null && Number.isFinite(sample.headingDeg)
        ? sample.headingDeg
        : null;
    if (heading == null && matched && snap) {
      heading = snap.segmentBearing;
    }
    if (heading == null && this.rendered) {
      const d = haversineMeters(this.rendered, visual);
      if (d > 1.5) heading = bearingDegrees(this.rendered, visual);
    }
    if (heading == null) heading = this.renderedHeading;

    // Low-speed / noisy heading rejection.
    const speed = sample.speedMps ?? null;
    if (speed != null && speed < 0.8 && this.rendered) {
      const move = haversineMeters(this.rendered, visual);
      if (move < 3) {
        heading = this.renderedHeading;
      }
    }

    this.lastRaw = raw;
    this.lastGpsMs = sample.timestampMs;
    this.target = visual;
    this.targetHeading = heading;

    const from = this.rendered ?? readMarkerLngLat(this.marker!) ?? visual;
    const fromHeading = this.renderedHeading;

    // Span nearly the full GPS interval so motion stays continuous (Google-nav style).
    const intervalMs =
      this.lastAppliedGpsMs > 0
        ? Math.max(400, sample.timestampMs - this.lastAppliedGpsMs)
        : 1400;
    this.lastAppliedGpsMs = sample.timestampMs;
    const dist = haversineMeters(from, visual);
    const bySpeed =
      sample.speedMps != null && sample.speedMps > 0.5
        ? Math.min(5000, Math.max(500, (dist / sample.speedMps) * 1000))
        : null;
    const duration = Math.min(
      5200,
      Math.max(450, bySpeed ?? Math.min(intervalMs * 1.12, 900 + dist * 40))
    );

    this.startAnim(from, fromHeading, visual, heading, duration);
  }

  private startAnim(
    from: LngLat,
    fromHeading: number,
    to: LngLat,
    toHeading: number,
    durationMs: number
  ) {
    this.animFrom = from;
    this.animFromHeading = fromHeading;
    this.target = to;
    this.targetHeading = toHeading;
    this.animStartMs = performance.now();
    this.animDurationMs = durationMs;

    // Prefer along-route interpolation when both ends map-match.
    this.useAlongRoute = false;
    this.animAlongFrom = 0;
    this.animAlongTo = 0;
    if (this.route && this.route.length >= 2) {
      const a = snapToRoute(this.route, from);
      const b = snapToRoute(this.route, to);
      if (a.offRouteM <= this.opts.maxSnapM && b.offRouteM <= this.opts.maxSnapM) {
        // Only along-route if we're progressing forward (or small reverse noise).
        if (b.distanceAlongM + 15 >= a.distanceAlongM) {
          this.useAlongRoute = true;
          this.animAlongFrom = a.distanceAlongM;
          this.animAlongTo = b.distanceAlongM;
        }
      }
    }

    this.ensureRaf();
  }

  private ensureRaf() {
    if (this.rafId != null) return;
    const tick = (now: number) => {
      this.rafId = null;
      this.step(now);
      if (this.needsTick()) {
        this.rafId = requestAnimationFrame(tick);
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private needsTick(): boolean {
    if (!this.animFrom || !this.target) return false;
    const elapsed = performance.now() - this.animStartMs;
    return elapsed < this.animDurationMs;
  }

  private cancelRaf() {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private step(now: number) {
    if (!this.marker || !this.animFrom || !this.target) return;

    // Stale GPS — freeze at last rendered (no fake continued motion).
    if (
      this.lastGpsMs > 0 &&
      Date.now() - this.lastGpsMs > this.opts.staleAfterMs
    ) {
      return;
    }

    const tRaw = Math.min(1, (now - this.animStartMs) / Math.max(1, this.animDurationMs));
    const t = easeNav(tRaw);

    let pos: LngLat;
    let heading: number;

    if (this.useAlongRoute && this.route) {
      const along =
        this.animAlongFrom + (this.animAlongTo - this.animAlongFrom) * t;
      const alongPt = pointAlongRoute(this.route, along);
      pos = alongPt.point;
      heading = lerpBearing(this.animFromHeading, this.targetHeading, t);
      // Prefer segment bearing when traveling along route.
      if (Math.abs(shortestBearingDelta(heading, alongPt.bearing)) < 90) {
        heading = lerpBearing(this.animFromHeading, alongPt.bearing, t);
      }
      this.onRouteProgress?.([], along);
    } else {
      pos = [
        this.animFrom[0] + (this.target[0] - this.animFrom[0]) * t,
        this.animFrom[1] + (this.target[1] - this.animFrom[1]) * t,
      ];
      heading = lerpBearing(this.animFromHeading, this.targetHeading, t);
      // Still trim remaining line from map-matched progress when possible.
      if (this.route && this.onRouteProgress) {
        const snap = snapToRoute(this.route, pos);
        if (snap.offRouteM <= this.opts.maxSnapM) {
          this.onRouteProgress([], snap.distanceAlongM);
        }
      }
    }

    this.rendered = pos;
    this.renderedHeading = heading;
    this.marker.setLngLat(pos);
    setBikeHeading(this.marker, heading);

    if (this.followEnabled && this.map) {
      this.applyCamera(pos, heading, now);
    }
  }

  private applyCamera(rider: LngLat, heading: number, now = performance.now()) {
    if (!this.map) return;
    const center = offsetLngLatMeters(rider, heading, this.opts.lookAheadM);
    const zoom = this.map.getZoom?.() ?? 16;
    const clampedZoom = Math.min(17.2, Math.max(15, zoom));

    // Throttle camera updates slightly so easeTo can blend (smooth auto-rotate).
    const bearingDelta = Math.abs(shortestBearingDelta(this.lastCameraBearing, heading));
    const elapsed = now - this.lastCameraAt;
    if (elapsed < 80 && bearingDelta < 1.5) return;
    this.lastCameraAt = now;
    this.lastCameraBearing = heading;

    const cameraOpts = {
      center,
      bearing: heading,
      pitch: this.opts.pitch,
      zoom: clampedZoom,
      duration: this.opts.cameraSmoothMs,
      easing: (t: number) => t * (2 - t),
      essential: true,
    };

    try {
      if (this.map.easeTo) {
        this.map.easeTo(cameraOpts);
      } else {
        this.map.jumpTo?.(cameraOpts);
      }
    } catch {
      /* ignore */
    }
  }

  /** Seed initial position without animation (first fix / reconnect). */
  seed(sample: NavGpsSample) {
    const { visual, snap } = resolveVisualRiderLocation(
      sample.lngLat,
      this.route,
      this.opts.maxSnapM
    );
    let heading =
      sample.headingDeg != null && Number.isFinite(sample.headingDeg)
        ? sample.headingDeg
        : snap?.segmentBearing ?? this.renderedHeading;
    this.rendered = visual;
    this.target = visual;
    this.renderedHeading = heading;
    this.targetHeading = heading;
    this.lastRaw = sample.lngLat;
    this.lastGpsMs = sample.timestampMs;
    this.lastAppliedGpsMs = sample.timestampMs;
    if (this.marker) {
      this.marker.setLngLat(visual);
      setBikeHeading(this.marker, heading);
    }
    if (this.followEnabled && this.map) {
      // Instant seed — then smooth follow takes over on next GPS.
      try {
        const center = offsetLngLatMeters(visual, heading, this.opts.lookAheadM);
        this.map.jumpTo?.({
          center,
          bearing: heading,
          pitch: this.opts.pitch,
          zoom: Math.min(17.2, Math.max(15, this.map.getZoom?.() ?? 16)),
        });
        this.lastCameraBearing = heading;
        this.lastCameraAt = performance.now();
      } catch {
        /* ignore */
      }
    }
  }

  getRendered(): LngLat | null {
    return this.rendered;
  }

  getRouteLengthM(): number {
    return this.route ? totalRouteLengthM(this.route) : 0;
  }
}
