import { useEffect, useRef, useCallback } from 'react';

const MAP_KM = 200;

function kmToWorld(km, cs) {
  return ((km + 100) / MAP_KM) * cs;
}

export default function CanvasMap({ bases, attacks, tradePods, playerBases, visRadius, onBaseClick }) {
  const canvasRef = useRef(null);
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

  // Find nearest base within 20 screen-pixel radius
  function findBaseAt(screenX, screenY) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const cs   = Math.min(canvas.width, canvas.height);
    const { scale } = stateRef.current;
    const { wx, wy } = screenToWorld(screenX, screenY);
    const hitWorld = 20 / scale; // 20px in screen → world units
    let closest = null, closestDist = hitWorld;
    for (const b of (bases ?? [])) {
      const bx = kmToWorld(b.x, cs);
      const by = kmToWorld(b.y, cs);
      const d  = Math.sqrt((bx - wx) ** 2 + (by - wy) ** 2);
      if (d < closestDist) { closestDist = d; closest = b; }
    }
    return closest;
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

    // Map area border
    ctx.strokeStyle = 'rgba(56,189,248,0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, cs, cs);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 10; i++) {
      const p = (i / 10) * cs;
      ctx.beginPath(); ctx.moveTo(p, 0);  ctx.lineTo(p, cs);  ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p);  ctx.lineTo(cs, p);  ctx.stroke();
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

    // Attack lines (IN_FLIGHT = moving toward defender; RETURNING = moving back)
    for (const attack of (attacks ?? [])) {
      const ax = kmToWorld(attack.attackerBase.x, cs);
      const ay = kmToWorld(attack.attackerBase.y, cs);
      const dx = kmToWorld(attack.defenderBase.x, cs);
      const dy = kmToWorld(attack.defenderBase.y, cs);
      const isOwn = playerBases?.some((pb) => pb.id === attack.attackerBaseId);

      if (attack.status === 'RETURNING' && attack.returnTime) {
        // Draw return line from defender → attacker
        const arrival  = new Date(attack.arrivalTime).getTime();
        const ret      = new Date(attack.returnTime).getTime();
        const progress = ret > arrival ? Math.min((now - arrival) / (ret - arrival), 1) : 1;
        const rx = dx + (ax - dx) * progress;
        const ry = dy + (ay - dy) * progress;
        const won = attack.attackerWon;
        const color = won ? 'rgba(74,222,128,0.7)' : 'rgba(239,68,68,0.7)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth   = 1.5;
        ctx.strokeStyle = color;
        ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(rx, ry); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(rx, ry, 2 / scale, 0, 2 * Math.PI);
        ctx.fillStyle = won ? '#4ade80' : '#ef4444';
        ctx.fill();
      } else {
        // IN_FLIGHT: draw forward line attacker → current position
        const launch   = new Date(attack.launchTime).getTime();
        const arrival  = new Date(attack.arrivalTime).getTime();
        const progress = Math.min((now - launch) / (arrival - launch), 1);
        const mx = ax + (dx - ax) * progress;
        const my = ay + (dy - ay) * progress;
        ctx.setLineDash([4, 4]);
        ctx.lineWidth   = 1.5;
        ctx.strokeStyle = isOwn ? 'rgba(74,222,128,0.8)' : 'rgba(239,68,68,0.8)';
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(mx, my); ctx.stroke();
        ctx.setLineDash([]);
        // Dot in screen space (constant 2px regardless of zoom)
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
      const r  = base.isAdmin ? 7 : 5;

      // Glow ring for own bases
      if (base.isOwn) {
        ctx.beginPath();
        ctx.arc(bx, by, r + 5, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(56,189,248,0.15)';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(bx, by, r, 0, 2 * Math.PI);
      ctx.fillStyle = base.isAdmin ? '#facc15' : base.isOwn ? '#38bdf8' : '#94a3b8';
      ctx.fill();

      ctx.font         = 'bold 7px Inter,sans-serif';
      ctx.fillStyle    = '#0a1628';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(base.initials, bx, by);

      // Name label at higher zoom
      if (scale > 1.5) {
        ctx.font      = '6px Inter,sans-serif';
        ctx.fillStyle = base.isOwn ? '#7dd3fc' : '#64748b';
        ctx.fillText(base.name, bx, by + r + 7);
      }
    }

    ctx.restore();

    // Fog of war — black outside radar circle, visible inside
    if (playerBases && playerBases.length > 0 && visRadius) {
      const circles = playerBases.map((pb) => ({
        x: kmToWorld(pb.x, cs) * scale + offsetX,
        y: kmToWorld(pb.y, cs) * scale + offsetY,
        r: (visRadius / MAP_KM) * cs * scale,
      }));
      ctx.save();
      ctx.fillStyle = 'rgba(2, 6, 18, 0.88)';
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      for (const c of circles) {
        ctx.moveTo(c.x + c.r, c.y);
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2, true); // CCW = punch hole
      }
      ctx.fill('evenodd');
      // Soft edge on each circle
      for (const c of circles) {
        const grad = ctx.createRadialGradient(c.x, c.y, c.r * 0.85, c.x, c.y, c.r);
        grad.addColorStop(0, 'rgba(2,6,18,0)');
        grad.addColorStop(1, 'rgba(2,6,18,0.88)');
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }
      ctx.restore();
    }

    frameRef.current = requestAnimationFrame(draw);
  }, [bases, attacks, tradePods, playerBases, visRadius]);

  // Init canvas size + center map; re-center only on true resize (not first init)
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
    if (e.touches.length === 2) {
      stateRef.current.pinchDist = touchDist(e);
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
        const base = findBaseAt(x, y);
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

