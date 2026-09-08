"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { formatOrderOrdinalSuffix } from "@/lib/orders/customer-order-stats";

const TAB_H = 26;
const SCOOP = 10;
const BOTTOM = 11;
const PAD_X = 20;
const STROKE = 1.25;

/**
 * Full-width mint rail with a hanging tab. The rail stops at the tab
 * (no line across the top of the pill) and resumes on the other side.
 */
export default function OrderNthUserBanner({
  ordinal,
  customerName,
}: {
  ordinal: number | null;
  customerName?: string | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [hostW, setHostW] = useState(960);
  const [tabW, setTabW] = useState(200);

  const n = ordinal != null && ordinal >= 1 ? formatOrderOrdinalSuffix(ordinal) : "";
  const name = customerName?.trim() || "User";
  const label = n ? `${n} Order By ${name}` : "";

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      setHostW(host.clientWidth);
      setTabW(Math.max(160, (textRef.current?.offsetWidth ?? 140) + PAD_X * 2));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    if (textRef.current) ro.observe(textRef.current);
    return () => ro.disconnect();
  }, [label]);

  if (ordinal == null || ordinal < 1) return null;

  const T = tabW;
  const W = Math.max(hostW, T + 48);
  const y0 = STROKE / 2;
  const yB = TAB_H - BOTTOM;
  const svgH = TAB_H + STROKE;
  // Exact horizontal center: equal rail on left and right.
  const x0 = Math.max(8, (W - T) / 2);
  const x1 = x0 + T;

  const fillD = [
    `M ${x0},${y0}`,
    `A ${SCOOP},${SCOOP} 0 0 0 ${x0 + SCOOP},${y0 + SCOOP}`,
    `L ${x0 + SCOOP},${yB}`,
    `A ${BOTTOM},${BOTTOM} 0 0 0 ${x0 + SCOOP + BOTTOM},${TAB_H}`,
    `L ${x1 - SCOOP - BOTTOM},${TAB_H}`,
    `A ${BOTTOM},${BOTTOM} 0 0 0 ${x1 - SCOOP},${yB}`,
    `L ${x1 - SCOOP},${y0 + SCOOP}`,
    `A ${SCOOP},${SCOOP} 0 0 0 ${x1},${y0}`,
    "Z",
  ].join(" ");

  // One stroke: left rail → around the tab → right rail. No top edge on the pill.
  const strokeD = [
    `M 0,${y0}`,
    `L ${x0},${y0}`,
    `A ${SCOOP},${SCOOP} 0 0 0 ${x0 + SCOOP},${y0 + SCOOP}`,
    `L ${x0 + SCOOP},${yB}`,
    `A ${BOTTOM},${BOTTOM} 0 0 0 ${x0 + SCOOP + BOTTOM},${TAB_H}`,
    `L ${x1 - SCOOP - BOTTOM},${TAB_H}`,
    `A ${BOTTOM},${BOTTOM} 0 0 0 ${x1 - SCOOP},${yB}`,
    `L ${x1 - SCOOP},${y0 + SCOOP}`,
    `A ${SCOOP},${SCOOP} 0 0 0 ${x1},${y0}`,
    `L ${W},${y0}`,
  ].join(" ");

  const tabMid = x0 + T / 2;

  return (
    <div className="nth-hang" ref={hostRef} role="status" aria-label={label}>
      {W > 0 ? (
        <svg
          className="nth-hang__svg"
          width={W}
          height={svgH}
          viewBox={`0 0 ${W} ${svgH}`}
          overflow="visible"
          aria-hidden
        >
          <path d={fillD} fill="#fff" stroke="none" />
          <path
            d={strokeD}
            fill="none"
            stroke="#8ecdbb"
            strokeWidth={STROKE}
            strokeLinejoin="round"
            strokeLinecap="butt"
          />
        </svg>
      ) : null}
      <span
        ref={textRef}
        className="nth-hang__text"
        style={{ left: tabMid }}
      >
        <span className="nth-hang__ordinal">{n}</span>
        {" Order By "}
        <span className="nth-hang__name">{name}</span>
      </span>
    </div>
  );
}
