"use client";

import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vr: number;
  color: string;
  life: number;
  shape: "rect" | "ribbon";
};

const COLORS = ["#00A88F", "#F4C430", "#FF4D6D", "#3B82F6", "#FFFFFF", "#FB923C", "#A78BFA"];

function burst(originX: number, originY: number, count: number, into: Particle[]) {
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
    const speed = 7 + Math.random() * 14;
    into.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: 5 + Math.random() * 7,
      h: 8 + Math.random() * 12,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.45,
      color: COLORS[i % COLORS.length]!,
      life: 1,
      shape: Math.random() > 0.35 ? "rect" : "ribbon",
    });
  }
}

/** Full-viewport cracker / confetti burst for a successful parent registration. */
export function CelebrationCrackers({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const particles: Particle[] = [];
    const w = () => canvas.width;
    const h = () => canvas.height;
    burst(w() * 0.5, h() * 0.42, 90, particles);
    burst(w() * 0.18, h() * 0.22, 55, particles);
    burst(w() * 0.82, h() * 0.22, 55, particles);
    burst(w() * 0.5, h() * 0.08, 40, particles);

    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame += 1;
      ctx.clearRect(0, 0, w(), h());
      if (frame === 10) burst(w() * 0.3, h() * 0.18, 35, particles);
      if (frame === 18) burst(w() * 0.7, h() * 0.18, 35, particles);

      for (const p of particles) {
        p.vy += 0.18;
        p.vx *= 0.995;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life -= 0.0075;
        if (p.life <= 0) continue;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === "ribbon") {
          ctx.fillRect(-p.w / 2, -1.5, p.h * 1.4, 3);
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      }

      if (frame < 220) {
        raf = window.requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, w(), h());
      }
    };
    raf = window.requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[80]"
    />
  );
}
