import { useEffect, useRef } from "react";

type Beat = {
  pAmp: number;
  rAmp: number;
  sAmp: number;
  tAmp: number;
  cycle: number;
  gap: number;
};

type Pt = { x: number; y: number; brk?: boolean };

type Lane = {
  y: number;
  speed: number;
  x: number;
  phase: number;
  amp: number;
  beat: Beat;
  trail: Pt[];
  alpha: number;
  flash: number;
};

const BG = "rgb(10,13,20)";

function mkBeat(): Beat {
  return {
    pAmp: 0.18 + Math.random() * 0.22,
    rAmp: 0.7 + Math.random() * 0.45,
    sAmp: 0.08 + Math.random() * 0.14,
    tAmp: 0.1 + Math.random() * 0.2,
    cycle: 90 + Math.floor(Math.random() * 20),
    gap: 82 + Math.floor(Math.random() * 28),
  };
}

function ecg(t: number, b: Beat): number {
  return (
    b.pAmp * Math.exp(-((t - 0.12) ** 2) / 0.002) -
    0.12 * Math.exp(-((t - 0.28) ** 2) / 0.00025) +
    b.rAmp * Math.exp(-((t - 0.32) ** 2) / 0.0005) -
    b.sAmp * Math.exp(-((t - 0.36) ** 2) / 0.00035) +
    b.tAmp * Math.exp(-((t - 0.56) ** 2) / 0.004)
  );
}

export function HeartbeatBg() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cvs = ref.current;
    if (!cvs) return;
    const maybeCtx = cvs.getContext("2d", { alpha: false });
    if (!maybeCtx) return;
    const ctx = maybeCtx;

    let raf = 0;
    let lanes: Lane[] = [];
    let W = 0;
    let H = 0;
    let prev = 0;

    function resize() {
      W = window.innerWidth;
      H = window.innerHeight;
      cvs!.width = W;
      cvs!.height = H;

      const n = Math.max(3, Math.min(5, Math.floor(H / 200)));
      lanes = Array.from({ length: n }, (_, i) => ({
        y: ((i + 1) / (n + 1)) * H,
        speed: 58 + i * 11 + Math.random() * 14,
        x: Math.random() * W,
        phase: Math.floor(Math.random() * 90),
        amp: 22 + Math.random() * 14,
        beat: mkBeat(),
        trail: [],
        alpha: 0.28 + i * 0.06 + Math.random() * 0.08,
        flash: 0,
      }));
      prev = 0;
    }

    function step(lane: Lane, dt: number) {
      const px = lane.speed * dt;
      const steps = Math.max(1, Math.round(px));
      const dx = px / steps;
      const maxTrail = Math.floor(W * 0.62);

      for (let s = 0; s < steps; s++) {
        const total = lane.beat.cycle + lane.beat.gap;
        let yOff = 0;
        if (lane.phase < lane.beat.cycle) {
          const t = lane.phase / lane.beat.cycle;
          const v = ecg(t, lane.beat);
          yOff = v * lane.amp;
          if (t > 0.29 && t < 0.34 && v > 0.45) lane.flash = 1;
        }

        const nx = (lane.x + dx) % W;
        const py = lane.y - yOff;

        if (nx < lane.x - 1 && lane.trail.length > 0) {
          lane.trail.push({ x: W, y: py, brk: true });
        }

        lane.trail.push({ x: nx, y: py });
        lane.x = nx;
        lane.phase = (lane.phase + 1) % total;
        if (lane.phase === 0) lane.beat = mkBeat();
      }

      lane.flash *= 0.92;

      if (lane.trail.length > maxTrail) {
        lane.trail.splice(0, lane.trail.length - maxTrail);
      }
    }

    function render(lane: Lane) {
      const len = lane.trail.length;
      if (len < 2) return;

      const BANDS = 6;
      const bandSz = Math.ceil(len / BANDS);

      for (let b = 0; b < BANDS; b++) {
        const i0 = b * bandSz;
        const i1 = Math.min(i0 + bandSz + 1, len);
        const t = (b + 1) / BANDS;
        const a = t * t * lane.alpha;
        const isFront = b >= BANDS - 2;

        ctx.save();
        ctx.strokeStyle = isFront
          ? `rgba(190,210,255,${(a * 1.4).toFixed(3)})`
          : `rgba(140,175,255,${a.toFixed(3)})`;
        ctx.lineWidth = 1 + t * 0.5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        if (isFront) {
          const glowStr = 0.35 + lane.flash * 0.5;
          ctx.shadowColor = `rgba(140,180,255,${glowStr.toFixed(2)})`;
          ctx.shadowBlur = 8 + lane.flash * 18;
        }

        ctx.beginPath();
        let down = false;

        for (let i = i0; i < i1; i++) {
          const p = lane.trail[i];
          if (p.brk) {
            if (down) ctx.lineTo(p.x, p.y);
            down = false;
            continue;
          }
          if (!down) {
            ctx.moveTo(p.x, p.y);
            down = true;
          } else {
            ctx.lineTo(p.x, p.y);
          }
        }

        ctx.stroke();
        ctx.restore();
      }

      const tip = lane.trail[len - 1];
      if (!tip || tip.brk) return;

      if (lane.flash > 0.08) {
        ctx.save();
        const r = 35 + lane.flash * 50;
        const g = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, r);
        g.addColorStop(0, `rgba(170,200,255,${(lane.flash * 0.35).toFixed(3)})`);
        g.addColorStop(0.4, `rgba(130,170,255,${(lane.flash * 0.15).toFixed(3)})`);
        g.addColorStop(1, "rgba(100,140,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      const dotR = 2 + lane.flash * 3;
      const dotAlpha = Math.min(lane.alpha * 2.5 + lane.flash * 0.5, 1);
      ctx.fillStyle = `rgba(220,235,255,${dotAlpha.toFixed(2)})`;
      ctx.shadowColor = `rgba(150,190,255,${(0.7 + lane.flash * 0.3).toFixed(2)})`;
      ctx.shadowBlur = 14 + lane.flash * 22;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, dotR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function frame(ts: number) {
      if (!prev) prev = ts;
      const dt = Math.min((ts - prev) / 1000, 0.05);
      prev = ts;

      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);

      for (const l of lanes) {
        step(l, dt);
        render(l);
      }

      raf = requestAnimationFrame(frame);
    }

    resize();
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
