import { useEffect, useRef, useCallback } from 'react';

const MAP_KM = 200;

function kmToWorld(km, cs) {
  return ((km + 100) / MAP_KM) * cs;
}

export default function CanvasMap({ bases, attacks, tradePods, playerBases, visRadius, onBaseClick, allianceBaseIds, activeBaseId, availablePlots = [], onPlotClick, disableFog = false }) {
  const canvasRef = useRef(null);
  const fogRef    = useRef(null); // offscreen canvas for fog, reused across frames
  const stateRef  = useRef({
    offsetX: 0, offsetY: 0, scale: 1,
    dragging: false,
    lastX: 0, lastY: 0,
    downX: 0, downY: 0,
    pinchDist: null,
    initialized: false,
  });
  const frameRef = useRef(null);

  // Convert screen coords → world canvas coords (undoes translate+scale)
  function screenToWorld(sx, sy) {
    const { offsetX, offsetY, scale } = stateRef.current;
    return { wx: (sx - offsetX) / scale, wy: (sy - offsetY) / scale };
  }

  // Find nearest base within 30 screen-pixel radius
  function findBaseAt(screenX, screenY, hitPx = 30) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const cs   = Math.min(canvas.width, canvas.height);
    const { scale } = stateRef.current;
    const { wx, wy } = screenToWorld(screenX, screenY);
    const hitWorld = hitPx / scale;
    let closest = null, closestDist = hitWorld;
    for (const b of (bases ?? [])) {
      const bx = kmToWorld(b.x, cs);
      const by = kmToWorld(b.y, cs);
      const d  = Math.sqrt((bx - wx) ** 2 + (by - wy) ** 2);
      if (d < closestDist) { closestDist = d; closest = b; }
    }
    return closest;
  }

  // Find nearest available plot within touch radius (screen coords)
  function findPlotAt(screenX, screenY) {
    if (!availablePlots?.length || !onPlotClick) return null;
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const cs = Math.min(canvas.width, canvas.height);
    const { offsetX, offsetY, scale } = stateRef.current;
    for (const plot of availablePlots) {
      const wx = kmToWorld(plot.x, cs);
      const wy = kmToWorld(plot.y, cs);
      const sx = wx * scale + offsetX;
      const sy = wy * scale + offsetY;
      if (Math.sqrt((screenX - sx) ** 2 + (screenY - sy) ** 2) < 44) return plot;
    }
    return null;
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W   = canvas.width;
    const H   = canvas.height;
    const { offsetX, offsetY, scale } = stateRef.current;
    const cs  = Math.min(W, H);

    // Full canvas background
    ctx.fillStyle = '#050f1e';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Grid lines — draw across entire visible area to avoid hard world-boundary edge
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    const gridStep = cs / 10;
    const wLeft   = -offsetX / scale;
    const wTop    = -offsetY / scale;
    const wRight  = (W - offsetX) / scale;
    const wBottom = (H - offsetY) / scale;
    const gx0 = Math.floor(wLeft  / gridStep) * gridStep;
    const gy0 = Math.floor(wTop   / gridStep) * gridStep;
    for (let gx = gx0; gx <= wRight + gridStep; gx += gridStep) {
      ctx.beginPath(); ctx.moveTo(gx, wTop  - gridStep); ctx.lineTo(gx, wBottom + gridStep); ctx.stroke();
    }
    for (let gy = gy0; gy <= wBottom + gridStep; gy += gridStep) {
      ctx.beginPath(); ctx.moveTo(wLeft - gridStep, gy); ctx.lineTo(wRight + gridStep, gy); ctx.stroke();
    }

    // Center crosshair
    const cxp = kmToWorld(0, cs);
    const cyp = kmToWorld(0, cs);
    ctx.strokeStyle = 'rgba(56,189,248,0.4)';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(cxp - 10, cyp); ctx.lineTo(cxp + 10, cyp); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cxp, cyp - 10); ctx.lineTo(cxp, cyp + 10); ctx.stroke();

    // Radar circles — drawn as part of fog of war overlay below
    const now = Date.now();

    // Attack lines — solid, with parallel offset for mutual attacks
    const attacksList = attacks ?? [];
    for (const attack of attacksList) {
      const ax = kmToWorld(attack.attackerBase.x, cs);
      const ay = kmToWorld(attack.attackerBase.y, cs);
      const dx = kmToWorld(attack.defenderBase.x, cs);
      const dy = kmToWorld(attack.defenderBase.y, cs);
      const isOwn = playerBases?.some((pb) => pb.id === attack.attackerBaseId);

      // Check for parallel attack (mutual attack in opposite direction)
      const hasMutual = attacksList.some(
        (a) => a.id !== attack.id &&
               a.attackerBaseId === attack.defenderBaseId &&
               a.defenderBaseId === attack.attackerBaseId &&
               a.status !== 'COMPLETED',
      );
      // Perpendicular offset — fixed 5 screen pixels regardless of zoom
      let ox = 0, oy = 0;
      if (hasMutual) {
        const len = Math.sqrt((dx - ax) ** 2 + (dy - ay) ** 2) || 1;
        const worldOffset = 5 / scale; // convert 5 screen px → world units
        ox = (-(dy - ay) / len) * worldOffset;
        oy = ((dx - ax) / len) * worldOffset;
      }

      ctx.setLineDash([]);
      ctx.lineWidth = 1.5;

      if (attack.status === 'RETURNING' && attack.returnTime) {
        const arrival  = new Date(attack.arrivalTime).getTime();
        const ret      = new Date(attack.returnTime).getTime();
        const progress = ret > arrival ? Math.min((now - arrival) / (ret - arrival), 1) : 1;
        const rx = dx + (ax - dx) * progress + ox;
        const ry = dy + (ay - dy) * progress + oy;
        const won = attack.attackerWon;
        ctx.strokeStyle = won ? 'rgba(74,222,128,0.7)' : 'rgba(239,68,68,0.7)';
        ctx.beginPath(); ctx.moveTo(dx + ox, dy + oy); ctx.lineTo(rx, ry); ctx.stroke();
        ctx.beginPath();
        ctx.arc(rx, ry, 2 / scale, 0, 2 * Math.PI);
        ctx.fillStyle = won ? '#4ade80' : '#ef4444';
        ctx.fill();
      } else {
        const launch   = new Date(attack.launchTime).getTime();
        const arrival  = new Date(attack.arrivalTime).getTime();
        const progress = Math.min((now - launch) / (arrival - launch), 1);
        const mx = ax + (dx - ax) * progress + ox;
        const my = ay + (dy - ay) * progress + oy;
        ctx.strokeStyle = isOwn ? 'rgba(74,222,128,0.8)' : 'rgba(239,68,68,0.8)';
        ctx.beginPath(); ctx.moveTo(ax + ox, ay + oy); ctx.lineTo(mx, my); ctx.stroke();
        ctx.beginPath();
        ctx.arc(mx, my, 2 / scale, 0, 2 * Math.PI);
        ctx.fillStyle = isOwn ? '#4ade80' : '#ef4444';
        ctx.fill();
      }
    }

    // Trade pod lines
    for (const pod of (tradePods ?? [])) {
      const fx = kmToWorld(pod.fromBase.x, cs);
      const fy = kmToWorld(pod.fromBase.y, cs);
      const tx = kmToWorld(pod.toBase.x, cs);
      const ty = kmToWorld(pod.toBase.y, cs);
      const launch   = new Date(pod.launchTime).getTime();
      const arrival  = new Date(pod.arrivalTime).getTime();
      const progress = Math.min((now - launch) / (arrival - launch), 1);
      const px = fx + (tx - fx) * progress;
      const py = fy + (ty - fy) * progress;
      ctx.setLineDash([3, 6]);
      ctx.strokeStyle = 'rgba(167,139,250,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(px, py); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(px, py, 2 / scale, 0, 2 * Math.PI);
      ctx.fillStyle = '#a78bfa';
      ctx.fill();
    }

    // Base dots — fixed world-space size (scales proportionally with zoom)
    for (const base of (bases ?? [])) {
      const bx = kmToWorld(base.x, cs);
      const by = kmToWorld(base.y, cs);
      const r  = 5; // uniform size — no special admin treatment
      const isAlly = (allianceBaseIds ?? []).includes(base.id) || base.isAlly;

      // Glow ring for own bases
      if (base.isOwn) {
        ctx.beginPath();
        ctx.arc(bx, by, r + 5, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(56,189,248,0.15)';
        ctx.fill();
      }
      // Glow ring for ally bases
      if (isAlly) {
        ctx.beginPath();
        ctx.arc(bx, by, r + 5, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(74,222,128,0.15)';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(bx, by, r, 0, 2 * Math.PI);
      ctx.fillStyle = base.isOwn ? '#38bdf8'
        : isAlly     ? '#4ade80'
        : '#94a3b8';   // admin bases look identical to enemy bases
      ctx.fill();

      ctx.font         = 'bold 6px Inter,sans-serif';
      ctx.fillStyle    = '#0a1628';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(base.initials, bx, by);
    }

    ctx.restore();

    // Fog of war — use offscreen canvas so overlapping base visibility circles
    // don't cancel each other out (evenodd issue)
    if (!disableFog && playerBases && playerBases.length > 0 && visRadius) {
      const circles = playerBases.map((pb) => ({
        x: kmToWorld(pb.x, cs) * scale + offsetX,
        y: kmToWorld(pb.y, cs) * scale + offsetY,
        r: (visRadius / MAP_KM) * cs * scale,
      }));

      if (!fogRef.current) fogRef.current = document.createElement('canvas');
      const fog = fogRef.current;
      fog.width  = W;
      fog.height = H;
      const fctx = fog.getContext('2d');

      fctx.fillStyle = 'rgba(2, 6, 18, 0.88)';
      fctx.fillRect(0, 0, W, H);

      fctx.globalCompositeOperation = 'destination-out';
      for (const c of circles) {
        const grad = fctx.createRadialGradient(c.x, c.y, c.r * 0.8, c.x, c.y, c.r);
        grad.addColorStop(0, 'rgba(0,0,0,1)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        fctx.beginPath();
        fctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        fctx.fillStyle = grad;
        fctx.fill();
      }

      ctx.drawImage(fog, 0, 0);
    }

    // Available plot dots (drawn on top of everything, always visible)
    if (availablePlots.length > 0) {
      availablePlots.forEach((plot, i) => {
        const wx = kmToWorld(plot.x, cs);
        const wy = kmToWorld(plot.y, cs);
        const sx = wx * scale + offsetX;
        const sy = wy * scale + offsetY;
        if (sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60) return;

        const r = Math.max(7, Math.min(14, 10));
        // Glow
        const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3);
        grd.addColorStop(0, 'rgba(250,204,21,0.5)');
        grd.addColorStop(1, 'rgba(250,204,21,0)');
        ctx.beginPath();
        ctx.arc(sx, sy, r * 3, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();
        // Dot
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = '#facc15';
        ctx.fill();
        // Number label
        ctx.fillStyle = '#020617';
        ctx.font = `bold ${r - 1}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), sx, sy);
      });
    }

    frameRef.current = requestAnimationFrame(draw);
  }, [bases, attacks, tradePods, playerBases, visRadius, allianceBaseIds, availablePlots, disableFog]);

  // Center map on active base (or first player base) when data first loads
  const centeredRef = useRef(false);
  useEffect(() => {
    if (centeredRef.current) return;
    if (!playerBases || playerBases.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W  = canvas.width;
    const H  = canvas.height;
    if (!W || !H) return;
    const cs = Math.min(W, H);
    // Prefer the active base, fall back to first
    const pb = (activeBaseId && playerBases.find((b) => b.id === activeBaseId)) ?? playerBases[0];
    const wx = kmToWorld(pb.x, cs);
    const wy = kmToWorld(pb.y, cs);
    const s  = stateRef.current.scale;
    stateRef.current.offsetX = W / 2 - wx * s;
    stateRef.current.offsetY = H / 2 - wy * s;
    centeredRef.current = true;
  }, [playerBases, activeBaseId]);

  // Re-center when user switches active base
  const prevActiveRef = useRef(null);
  useEffect(() => {
    if (!activeBaseId || activeBaseId === prevActiveRef.current) return;
    if (!playerBases || playerBases.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas || !canvas.width || !canvas.height) return;
    const W  = canvas.width;
    const H  = canvas.height;
    const cs = Math.min(W, H);
    const pb = playerBases.find((b) => b.id === activeBaseId);
    if (!pb) return;
    const s = stateRef.current.scale;
    stateRef.current.offsetX = W / 2 - kmToWorld(pb.x, cs) * s;
    stateRef.current.offsetY = H / 2 - kmToWorld(pb.y, cs) * s;
    prevActiveRef.current = activeBaseId;
  }, [activeBaseId, playerBases]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const setSize = () => {
      const newW = canvas.offsetWidth;
      const newH = canvas.offsetHeight;
      if (newW === canvas.width && newH === canvas.height) return;
      canvas.width  = newW;
      canvas.height = newH;
      if (!stateRef.current.initialized) {
        const cs = Math.min(newW, newH);
        stateRef.current.offsetX     = (newW - cs) / 2;
        stateRef.current.offsetY     = (newH - cs) / 2;
        stateRef.current.initialized = true;
      }
    };
    setSize();
    const ro = new ResizeObserver(setSize);
    ro.observe(canvas);
    return () => {
      ro.disconnect();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  useEffect(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(draw);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [draw]);

  // ── Pointer helpers ──────────────────────────────────────────────────────────
  function canvasXY(clientX, clientY) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  // Mouse
  function onMouseDown(e) {
    stateRef.current.dragging = true;
    stateRef.current.lastX = stateRef.current.downX = e.clientX;
    stateRef.current.lastY = stateRef.current.downY = e.clientY;
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
    if (Math.abs(e.clientX - stateRef.current.downX) < 8 &&
        Math.abs(e.clientY - stateRef.current.downY) < 8) {
      const { x, y } = canvasXY(e.clientX, e.clientY);
      const plot = findPlotAt(x, y);
      if (plot) { onPlotClick?.(plot); return; }
      const base = findBaseAt(x, y);
      if (base) onBaseClick?.(base);
    }
  }
  function onWheel(e) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.85 : 1.15;
    const { x, y }  = canvasXY(e.clientX, e.clientY);
    const { offsetX, offsetY, scale } = stateRef.current;
    const newScale = Math.max(0.3, Math.min(10, scale * factor));
    stateRef.current.offsetX = x - (x - offsetX) * (newScale / scale);
    stateRef.current.offsetY = y - (y - offsetY) * (newScale / scale);
    stateRef.current.scale   = newScale;
  }

  // Touch
  function touchDist(e) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function onTouchStart(e) {
    e.preventDefault();
    if (e.touches.length === 2) {
      stateRef.current.pinchDist = touchDist(e);
      stateRef.current.dragging  = false;
    } else {
      const t = e.touches[0];
      stateRef.current.dragging = true;
      stateRef.current.lastX = stateRef.current.downX = t.clientX;
      stateRef.current.lastY = stateRef.current.downY = t.clientY;
    }
  }
  function onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 2 && stateRef.current.pinchDist) {
      const d    = touchDist(e);
      const factor = d / stateRef.current.pinchDist;
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const { offsetX, offsetY, scale } = stateRef.current;
      const newScale = Math.max(0.3, Math.min(10, scale * factor));
      stateRef.current.offsetX = midX - (midX - offsetX) * (newScale / scale);
      stateRef.current.offsetY = midY - (midY - offsetY) * (newScale / scale);
      stateRef.current.scale   = newScale;
      stateRef.current.pinchDist = d;
    } else if (stateRef.current.dragging && e.touches.length === 1) {
      const t = e.touches[0];
      stateRef.current.offsetX += t.clientX - stateRef.current.lastX;
      stateRef.current.offsetY += t.clientY - stateRef.current.lastY;
      stateRef.current.lastX = t.clientX;
      stateRef.current.lastY = t.clientY;
    }
  }
  function onTouchEnd(e) {
    if (e.changedTouches.length === 1 && e.touches.length === 0) {
      const t = e.changedTouches[0];
      if (Math.abs(t.clientX - stateRef.current.downX) < 12 &&
          Math.abs(t.clientY - stateRef.current.downY) < 12) {
        const { x, y } = canvasXY(t.clientX, t.clientY);
        const plot = findPlotAt(x, y);
        if (plot) { onPlotClick?.(plot); stateRef.current.dragging = false; stateRef.current.pinchDist = null; return; }
        const base = findBaseAt(x, y, 40);
        if (base) onBaseClick?.(base);
      }
    }
    stateRef.current.dragging  = false;
    stateRef.current.pinchDist = null;
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full touch-none"
      style={{ cursor: 'crosshair', display: 'block' }}
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

