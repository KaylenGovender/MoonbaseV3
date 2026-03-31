import { useEffect, useRef, useState, useCallback } from 'react';

const MAP_SIZE = 200; // km

function kmToCanvas(km, canvasSize) {
  return ((km + 100) / MAP_SIZE) * canvasSize;
}

export default function CanvasMap({ bases, attacks, tradePods, playerBases, visRadius, onBaseClick }) {
  const canvasRef = useRef(null);
  const stateRef  = useRef({
    offsetX: 0, offsetY: 0, scale: 1,
    dragging: false, lastX: 0, lastY: 0,
    pinchDist: null,
  });
  const [hoveredBase, setHoveredBase] = useState(null);
  const frameRef = useRef(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx    = canvas.getContext('2d');
    const W      = canvas.width;
    const H      = canvas.height;
    const { offsetX, offsetY, scale } = stateRef.current;

    ctx.clearRect(0, 0, W, H);

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    const cs = Math.min(W, H);

    // Background
    ctx.fillStyle = '#050f1e';
    ctx.fillRect(0, 0, cs, cs);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth   = 0.5 / scale;
    for (let i = 0; i <= 10; i++) {
      const p = (i / 10) * cs;
      ctx.beginPath(); ctx.moveTo(p, 0);  ctx.lineTo(p, cs);  ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p);  ctx.lineTo(cs, p);  ctx.stroke();
    }

    // Center crosshair
    const cx = kmToCanvas(0, cs);
    const cy = kmToCanvas(0, cs);
    ctx.strokeStyle = 'rgba(56,189,248,0.3)';
    ctx.lineWidth   = 0.5 / scale;
    ctx.beginPath(); ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8); ctx.stroke();

    // Radar circles around player bases
    if (visRadius && playerBases) {
      for (const pb of playerBases) {
        const px = kmToCanvas(pb.x, cs);
        const py = kmToCanvas(pb.y, cs);
        const pr = (visRadius / MAP_SIZE) * cs;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(56,189,248,0.15)';
        ctx.lineWidth   = 1 / scale;
        ctx.stroke();
        ctx.fillStyle = 'rgba(56,189,248,0.03)';
        ctx.fill();
      }
    }

    // Attack lines
    const now = Date.now();
    for (const attack of (attacks ?? [])) {
      const ax = kmToCanvas(attack.attackerBase.x, cs);
      const ay = kmToCanvas(attack.attackerBase.y, cs);
      const dx = kmToCanvas(attack.defenderBase.x, cs);
      const dy = kmToCanvas(attack.defenderBase.y, cs);

      const launch  = new Date(attack.launchTime).getTime();
      const arrival = new Date(attack.arrivalTime).getTime();
      const progress = Math.min((now - launch) / (arrival - launch), 1);

      const cx2 = ax + (dx - ax) * progress;
      const cy2 = ay + (dy - ay) * progress;

      // Dashed line
      ctx.setLineDash([4 / scale, 4 / scale]);
      ctx.lineWidth = 1.5 / scale;

      const isOwn = playerBases?.some((pb) => pb.id === attack.attackerBaseId);
      ctx.strokeStyle = isOwn ? 'rgba(74,222,128,0.7)' : 'rgba(239,68,68,0.7)';

      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(cx2, cy2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Moving dot
      ctx.beginPath();
      ctx.arc(cx2, cy2, 3 / scale, 0, 2 * Math.PI);
      ctx.fillStyle = isOwn ? '#4ade80' : '#ef4444';
      ctx.fill();
    }

    // Trade pod lines
    for (const pod of (tradePods ?? [])) {
      const fx = kmToCanvas(pod.fromBase.x, cs);
      const fy = kmToCanvas(pod.fromBase.y, cs);
      const tx = kmToCanvas(pod.toBase.x, cs);
      const ty = kmToCanvas(pod.toBase.y, cs);

      const launch  = new Date(pod.launchTime).getTime();
      const arrival = new Date(pod.arrivalTime).getTime();
      const progress = Math.min((now - launch) / (arrival - launch), 1);
      const px = fx + (tx - fx) * progress;
      const py = fy + (ty - fy) * progress;

      ctx.setLineDash([3 / scale, 6 / scale]);
      ctx.strokeStyle = 'rgba(167,139,250,0.6)';
      ctx.lineWidth = 1 / scale;
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(px, py); ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(px, py, 3 / scale, 0, 2 * Math.PI);
      ctx.fillStyle = '#a78bfa';
      ctx.fill();
    }

    // Base dots
    for (const base of (bases ?? [])) {
      const bx = kmToCanvas(base.x, cs);
      const by = kmToCanvas(base.y, cs);
      const r  = base.isAdmin ? 8 / scale : 6 / scale;

      // Glow for own bases
      if (base.isOwn) {
        ctx.beginPath();
        ctx.arc(bx, by, (r + 4) / scale, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(56,189,248,0.15)';
        ctx.fill();
      }

      // Dot
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, 2 * Math.PI);
      ctx.fillStyle = base.isAdmin ? '#facc15'
                    : base.isOwn   ? '#38bdf8'
                    : '#94a3b8';
      ctx.fill();

      // Initials
      const fs = Math.max(5, 7 / scale);
      ctx.font        = `bold ${fs}px Inter, sans-serif`;
      ctx.fillStyle   = '#0a1628';
      ctx.textAlign   = 'center';
      ctx.textBaseline= 'middle';
      ctx.fillText(base.initials, bx, by);

      // Name label (only at higher zoom)
      if (scale > 1.5) {
        ctx.font      = `${Math.max(4, 6 / scale)}px Inter, sans-serif`;
        ctx.fillStyle = base.isOwn ? '#7dd3fc' : '#64748b';
        ctx.fillText(base.name, bx, by + r + 6 / scale);
      }
    }

    ctx.restore();
    frameRef.current = requestAnimationFrame(draw);
  }, [bases, attacks, tradePods, playerBases, visRadius]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      // Center map on first load
      const cs = Math.min(canvas.width, canvas.height);
      stateRef.current.offsetX = (canvas.width  - cs) / 2;
      stateRef.current.offsetY = (canvas.height - cs) / 2;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  useEffect(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(draw);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [draw]);

  // ── Pointer events ─────────────────────────────────────────────────────────
  function getCanvasPos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (e.clientX ?? e.touches?.[0]?.clientX) - rect.left,
      y: (e.clientY ?? e.touches?.[0]?.clientY) - rect.top,
    };
  }

  function worldToKm(px, py) {
    const canvas = canvasRef.current;
    const cs     = Math.min(canvas.width, canvas.height);
    const { offsetX, offsetY, scale } = stateRef.current;
    const wx = (px - offsetX) / scale;
    const wy = (py - offsetY) / scale;
    return {
      km_x: (wx / cs) * MAP_SIZE - 100,
      km_y: (wy / cs) * MAP_SIZE - 100,
    };
  }

  function findBaseAt(px, py) {
    const { km_x, km_y } = worldToKm(px, py);
    return (bases ?? []).find((b) => {
      const dx = b.x - km_x;
      const dy = b.y - km_y;
      return Math.sqrt(dx * dx + dy * dy) < 3;
    });
  }

  // Mouse
  function onMouseDown(e) {
    stateRef.current.dragging = true;
    stateRef.current.lastX    = e.clientX;
    stateRef.current.lastY    = e.clientY;
  }
  function onMouseMove(e) {
    if (!stateRef.current.dragging) return;
    stateRef.current.offsetX += e.clientX - stateRef.current.lastX;
    stateRef.current.offsetY += e.clientY - stateRef.current.lastY;
    stateRef.current.lastX = e.clientX;
    stateRef.current.lastY = e.clientY;
  }
  function onMouseUp(e) {
    if (!stateRef.current.dragging) return;
    stateRef.current.dragging = false;
    const dx = Math.abs(e.clientX - stateRef.current.lastX);
    const dy = Math.abs(e.clientY - stateRef.current.lastY);
    if (dx < 5 && dy < 5) {
      const { x, y } = getCanvasPos(e);
      const base     = findBaseAt(x, y);
      if (base) onBaseClick?.(base);
    }
  }
  function onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const { x, y } = getCanvasPos(e);
    const { offsetX, offsetY, scale } = stateRef.current;
    const newScale = Math.max(0.5, Math.min(8, scale * delta));
    stateRef.current.offsetX = x - (x - offsetX) * (newScale / scale);
    stateRef.current.offsetY = y - (y - offsetY) * (newScale / scale);
    stateRef.current.scale   = newScale;
  }

  // Touch
  function getTouchDist(e) {
    const t0 = e.touches[0];
    const t1 = e.touches[1];
    const dx = t0.clientX - t1.clientX;
    const dy = t0.clientY - t1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function onTouchStart(e) {
    if (e.touches.length === 2) {
      stateRef.current.pinchDist = getTouchDist(e);
    } else {
      stateRef.current.dragging = true;
      stateRef.current.lastX    = e.touches[0].clientX;
      stateRef.current.lastY    = e.touches[0].clientY;
    }
  }
  function onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 2 && stateRef.current.pinchDist) {
      const dist  = getTouchDist(e);
      const delta = dist / stateRef.current.pinchDist;
      const midX  = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY  = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const { offsetX, offsetY, scale } = stateRef.current;
      const newScale = Math.max(0.5, Math.min(8, scale * delta));
      stateRef.current.offsetX = midX - (midX - offsetX) * (newScale / scale);
      stateRef.current.offsetY = midY - (midY - offsetY) * (newScale / scale);
      stateRef.current.scale   = newScale;
      stateRef.current.pinchDist = dist;
    } else if (stateRef.current.dragging && e.touches.length === 1) {
      stateRef.current.offsetX += e.touches[0].clientX - stateRef.current.lastX;
      stateRef.current.offsetY += e.touches[0].clientY - stateRef.current.lastY;
      stateRef.current.lastX = e.touches[0].clientX;
      stateRef.current.lastY = e.touches[0].clientY;
    }
  }
  function onTouchEnd(e) {
    if (e.changedTouches.length === 1 && e.touches.length === 0) {
      const t = e.changedTouches[0];
      const { x, y } = { x: t.clientX, y: t.clientY };
      const rect = canvasRef.current.getBoundingClientRect();
      const base = findBaseAt(x - rect.left, y - rect.top);
      if (base) onBaseClick?.(base);
    }
    stateRef.current.dragging  = false;
    stateRef.current.pinchDist = null;
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full cursor-crosshair touch-none"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={() => { stateRef.current.dragging = false; }}
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    />
  );
}
