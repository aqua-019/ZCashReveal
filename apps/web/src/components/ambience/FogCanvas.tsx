"use client";

import { useEffect, useRef } from "react";

import { countRaf, noteConstructed, noteRefused } from "@/lib/diagnostics";
import { seededRng } from "@/lib/seed";

/**
 * The privacy veil: a seeded particle field where a few motes lift out of the
 * fog and glow gold.
 *
 * The semantics are the point (DGIGA GPAIR-17). What stays in the fog is what
 * the proof hides; what lifts is what the chain publishes anyway. The mix is
 * not decorative - roughly seven per cent of the field lifts, which is the
 * proportion the surface is arguing about.
 *
 * Three properties this component must hold:
 *
 *   1. DETERMINISM. Every particle comes from seededRng(seed, "fog"). The same
 *      block hash yields the same field for every visitor, forever. The
 *      platform's non-deterministic generator is banned by eslint
 *      (no-restricted-properties) and is not reachable from this file.
 *
 *   2. REDUCED MOTION IS ARCHITECTURAL. When the user asks for reduced motion
 *      the animation system is never *constructed*: no rAF is scheduled, no
 *      IntersectionObserver is created, no interval exists. A single static
 *      frame is painted so the surface still has texture. Damping the amplitude
 *      to zero would be a different, worse thing - the machinery would still be
 *      running. Assertion A5 reads window.__zr.rafCalls to prove the
 *      difference.
 *
 *   3. IDLE-GATED. Off-screen or backgrounded, the loop stops scheduling
 *      entirely rather than looping over a no-op. A forensic page left open in
 *      a tab must not cost anything.
 */

const PARTICLE_COUNT = 420;
const LIFT_FRACTION = 0.07;

interface Particle {
  x: number;
  y: number;
  r: number;
  a: number;
  vx: number;
  vy: number;
  lift: boolean;
  ph: number;
}

export function FogCanvas({ seed, className }: { readonly seed: string; readonly className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let particles: Particle[] = [];

    function size(): void {
      const el = ref.current;
      if (el === null) return;
      const host = el.parentElement;
      const rect = host === null ? el.getBoundingClientRect() : host.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect.width * dpr));
      h = Math.max(1, Math.floor(rect.height * dpr));
      el.width = w;
      el.height = h;
    }

    function build(): void {
      const rnd = seededRng(seed, "fog");
      const next: Particle[] = [];
      for (let i = 0; i < PARTICLE_COUNT; i += 1) {
        next.push({
          x: rnd() * w,
          y: rnd() * h,
          r: (2 + rnd() * 9) * dpr,
          a: 0.02 + rnd() * 0.06,
          vx: (rnd() - 0.5) * 0.12 * dpr,
          vy: (rnd() - 0.5) * 0.08 * dpr,
          lift: rnd() < LIFT_FRACTION,
          ph: rnd() * 6.28,
        });
      }
      particles = next;
    }

    function draw(t: number): void {
      if (ctx === null) return;
      ctx.clearRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w * 0.62, h * 0.35, 0, w * 0.62, h * 0.35, w * 0.7);
      g.addColorStop(0, "rgba(244,183,40,.05)");
      g.addColorStop(1, "rgba(12,11,10,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      for (const p of particles) {
        ctx.beginPath();
        if (p.lift) {
          const k = 0.5 + 0.5 * Math.sin(t * 0.0012 + p.ph);
          ctx.fillStyle = `rgba(244,183,40,${0.25 + 0.45 * k})`;
          ctx.arc(p.x, p.y, 1.4 * dpr + k * 1.2, 0, 6.28);
          ctx.fill();
          ctx.strokeStyle = `rgba(244,183,40,${0.08 * k})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 2.2, 0, 6.28);
          ctx.stroke();
        } else {
          ctx.fillStyle = `rgba(237,230,216,${p.a})`;
          ctx.arc(p.x, p.y, p.r, 0, 6.28);
          ctx.fill();
        }
      }
    }

    size();
    build();
    draw(0);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      // Construction stops here. One static frame is already painted above; no
      // rAF, no observer, no resize rebuild loop. This early return is the
      // whole of the reduced-motion contract for this component.
      noteRefused("FogCanvas", "prefers-reduced-motion: reduce");
      return;
    }

    noteConstructed("FogCanvas");

    let raf = 0;
    let last = 0;
    let visible = true;

    const io = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? false;
    });
    io.observe(canvas);

    function schedule(): void {
      countRaf();
      raf = requestAnimationFrame(loop);
    }

    function loop(t: number): void {
      if (visible && !document.hidden) {
        const dt = Math.min(40, t - last);
        last = t;
        for (const p of particles) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.x < -20) p.x = w + 20;
          if (p.x > w + 20) p.x = -20;
          if (p.y < -20) p.y = h + 20;
          if (p.y > h + 20) p.y = -20;
        }
        draw(t);
      }
      schedule();
    }

    function onResize(): void {
      size();
      build();
      draw(0);
    }

    window.addEventListener("resize", onResize);
    schedule();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [seed]);

  return <canvas ref={ref} aria-hidden="true" data-primitive="FogCanvas" data-ui="fog" {...(className === undefined ? {} : { className })} />;
}
