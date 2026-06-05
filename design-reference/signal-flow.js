/* Issuefy — "How it works" signal flow (light, minimal, futuristic).
   A thin glowing light travels through three abstract stages
   (monitor → summarize → verify) and loops seamlessly.
   Refinement of the original: white theme, tiny line-style source icons in
   stage 1 (overlaid HugeIcons), a clearer summarizing motion in stage 2. */

(function () {
  const canvas = document.getElementById('signal-flow');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const iconLayer = document.querySelector('.flow-icons');
  const iconEls = iconLayer ? [...iconLayer.querySelectorAll('.si')] : [];
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- light palette ----
  const ACC = '45,91,227';                 // accent blue (rgb)
  const COL = {
    line:    'rgba(45,91,227,0.10)',
    node:    'rgba(21,23,26,0.26)',
    nodeLit: '#2D5BE3',
    accent:  ACC,
    glow:    ACC
  };

  let W = 0, H = 0, dpr = 1, cy = 0;
  const stagesN = [1 / 6, 1 / 2, 5 / 6];
  let SX = [0, 0, 0];
  let R = 70;

  // source nodes (original scatter); a few carry an overlaid icon
  const srcNodes = [
    { a: -2.55, r: 0.92, icon: 0 },   // web      (GlobeIcon)
    { a: -1.95, r: 0.64 },
    { a: -1.15, r: 0.95, icon: 1 },   // social   (NewTwitterIcon)
    { a: -0.45, r: 0.58 },
    { a: 0.40,  r: 0.92, icon: 2 },   // reviews  (StarIcon)
    { a: 1.18,  r: 0.64 },
    { a: 2.45,  r: 0.88, icon: 3 }    // forum    (RedditIcon)
  ];
  const feeders = [-0.66, -0.34, 0, 0.34, 0.66];
  // stage-3 outputs (icon circles, same style as the sources): Insight, Idea, Risk
  const outputs = [ { dx: 0.85, dy: -0.68, icon: 0 }, { dx: 0.85, dy: 0, icon: 1 }, { dx: 0.85, dy: 0.68, icon: 2 } ];

  let particles = [];
  function seedParticles() {
    const n = Math.max(12, Math.round(W / 70));
    particles = [];
    for (let i = 0; i < n; i++) particles.push({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5,
      r: Math.random() * 1.2 + 0.4, a: Math.random() * 0.18 + 0.04,
      tw: Math.random() * Math.PI * 2
    });
  }

  function srcPos(s) {
    return { x: SX[0] + Math.cos(s.a) * R * s.r * 1.18, y: cy + Math.sin(s.a) * R * s.r * 0.82 };
  }
  function outPos(o) {
    return { x: SX[1] + R * o.dx, y: cy + R * o.dy };
  }
  function placeIcons() {
    iconEls.forEach(el => {
      let p = null;
      if (el.dataset.srci != null) {
        const node = srcNodes.find(n => n.icon === +el.dataset.srci);
        if (node) p = srcPos(node);
      } else if (el.dataset.out != null) {
        const o = outputs[+el.dataset.out];
        if (o) p = outPos(o);
      }
      if (!p) return;
      el.style.left = p.x + 'px';
      el.style.top = p.y + 'px';
      el.style.opacity = 0.9;
    });
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cy = H * 0.5;
    SX = stagesN.map(n => n * W);
    R = Math.max(54, Math.min(92, W * 0.072));
    seedParticles();
    placeIcons();
  }

  // ---- light timeline (eased travel + dwell, seamless wrap) ----
  const s1 = stagesN[0], s2 = stagesN[1], s3 = stagesN[2];
  const KF = [
    [0.00, -0.06], [0.05, s1], [0.17, s1],
    [0.33, s2],    [0.45, s2],
    [0.61, s3],    [0.73, s3],
    [0.92, 1.06],  [1.00, 1.10]
  ];
  const smooth = t => t * t * (3 - 2 * t);
  function lightX(phase) {
    for (let i = 0; i < KF.length - 1; i++) {
      const [t0, x0] = KF[i], [t1, x1] = KF[i + 1];
      if (phase >= t0 && phase <= t1) {
        const k = (phase - t0) / (t1 - t0 || 1);
        return x0 + (x1 - x0) * smooth(k);
      }
    }
    return KF[KF.length - 1][1];
  }
  function lightPresent(phase) {
    return Math.max(0, Math.min(Math.min(1, phase / 0.045), Math.min(1, (1 - phase) / 0.08)));
  }

  const CYCLE = 9.2;          // seconds per left→right pass
  let prevLxN = -0.06;
  const act = [1, 1, 1];      // stages run continuously, independent of the light
  let start = null;

  function drawNode(x, y, r, fill, glowAmt) {
    ctx.save();
    if (glowAmt > 0.01) { ctx.shadowBlur = 20 * glowAmt; ctx.shadowColor = `rgba(${COL.glow},${0.85 * glowAmt})`; }
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
    ctx.restore();
  }
  function ring(x, y, r, w, alpha) {
    if (r <= 0 || alpha <= 0) return;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = w; ctx.strokeStyle = `rgba(${COL.accent},${alpha})`; ctx.stroke();
  }
  // small solid shield (stage-3 centre)
  function drawShield(cx, a) {
    const w = 7, h = 9;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy - h);
    ctx.lineTo(cx + w, cy - h * 0.5);
    ctx.lineTo(cx + w, cy + h * 0.2);
    ctx.quadraticCurveTo(cx + w, cy + h * 0.85, cx, cy + h);
    ctx.quadraticCurveTo(cx - w, cy + h * 0.85, cx - w, cy + h * 0.2);
    ctx.lineTo(cx - w, cy - h * 0.5);
    ctx.closePath();
    ctx.shadowBlur = 12 * a; ctx.shadowColor = `rgba(${COL.glow},${0.7 * a})`;
    ctx.fillStyle = COL.nodeLit;
    ctx.fill();
    ctx.restore();
  }

  // ---- stage 1: monitor (sources feeding a hub) ----
  function stageMonitor(x, a, time) {
    for (let i = 0; i < srcNodes.length; i++) {
      const s = srcNodes[i], p = srcPos(s);
      const dx = x - p.x, dy = cy - p.y, dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist, uy = dy / dist;
      const ringR = 15;
      // for icon nodes, start the line at the circle's outer edge (not its centre)
      const sx = s.icon != null ? p.x + ux * ringR : p.x;
      const sy = s.icon != null ? p.y + uy * ringR : p.y;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(x, cy);
      ctx.lineWidth = 1; ctx.strokeStyle = `rgba(${COL.accent},${0.07 + 0.3 * a})`; ctx.stroke();
      if (s.icon != null) {
        // thin line-style ring; the HugeIcon glyph sits inside (HTML overlay)
        ring(p.x, p.y, ringR, 1, 0.18 + 0.5 * a);
      } else {
        const tw = 0.5 + 0.5 * Math.sin(time * 1.5 + i);
        drawNode(p.x, p.y, 1.8 + 1 * a, `rgba(${COL.accent},${0.2 + a * (0.4 + 0.4 * tw)})`, a * 0.5);
      }
      // signal flowing inward to the hub (continuous), from the circle edge
      const ff = ((time * 0.55) + i * 0.21) % 1;
      drawNode(sx + (x - sx) * ff, sy + (cy - sy) * ff, 1.5, `rgba(${COL.glow},${(1 - ff) * 0.75})`, 0.5);
    }
    if (a > 0.02) {
      const ph = (time * 0.5) % 1;
      for (let k = 0; k < 2; k++) {
        const f = (ph + k * 0.5) % 1;
        ring(x, cy, R * (0.3 + f * 1.0), 1, (1 - f) * 0.24 * a);
      }
    }
    drawNode(x, cy, 3.4 + a * 1.6, a > 0.3 ? COL.nodeLit : COL.node, a);
  }

  // ---- stage 2: summarize (signals condense into a core, then split into outputs) ----
  function stageSummarize(x, a, time) {
    const ringR = 14;
    // signals converge from the left
    for (let i = 0; i < feeders.length; i++) {
      const ang = Math.PI + feeders[i];
      const sx = x + Math.cos(ang) * R * 1.3, sy = cy + Math.sin(ang) * R * 0.9;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(x, cy);
      ctx.lineWidth = 1; ctx.strokeStyle = `rgba(${COL.accent},${0.06 + 0.26 * a})`; ctx.stroke();
      const f = ((time * 0.7) + i * 0.16) % 1;
      drawNode(sx + (x - sx) * f, sy + (cy - sy) * f, 1.6, `rgba(${COL.glow},${(1 - f) * 0.85 * a})`, a);
    }
    // processing: compact contracting rings (condensing many → one)
    for (let k = 0; k < 2; k++) {
      const f = ((time * 0.55) + k * 0.5) % 1;
      ring(x, cy, R * (0.7 - f * 0.5), 1, Math.sin(Math.PI * f) * 0.34 * a);
    }
    // split into the three categorized outputs (Insight / Idea / Risk icon circles)
    for (let i = 0; i < outputs.length; i++) {
      const p = outPos(outputs[i]);
      const dx = p.x - x, dy = p.y - cy, dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist, uy = dy / dist;
      const endX = p.x - ux * ringR, endY = p.y - uy * ringR;
      ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(endX, endY);
      ctx.lineWidth = 1; ctx.strokeStyle = `rgba(${COL.accent},${0.1 + 0.28 * a})`; ctx.stroke();
      const f = ((time * 0.6) + i * 0.33) % 1;
      drawNode(x + (endX - x) * f, cy + (endY - cy) * f, 1.5, `rgba(${COL.glow},${(1 - f) * 0.8})`, 0.5);
      ring(p.x, p.y, ringR, 1, 0.18 + 0.5 * a);
    }
    // structured summary at the core: three short condensing lines (instead of a dot)
    const cond = 0.7 + 0.3 * Math.sin(time * 1.6);
    const ws = [15, 9, 12];
    for (let r = 0; r < 3; r++) {
      const w = ws[r] * (0.7 + 0.3 * cond);
      const yy = cy - 5 + r * 5;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x - w / 2, yy - 1.1, w, 2.2, 1.1);
      else ctx.rect(x - w / 2, yy - 1.1, w, 2.2);
      ctx.fillStyle = `rgba(${COL.glow},${(0.55 + 0.45 * cond) * a})`; ctx.fill();
    }
  }

  // ---- stage 3: verify (trace each claim back to its sources) ----
  function stageVerify(x, a, time) {
    const vb = [-0.52, 0, 0.52];
    for (let i = 0; i < vb.length; i++) {
      const ang = vb[i];
      const ex = x + Math.cos(ang) * R * 1.24, ey = cy + Math.sin(ang) * R * 1.0;
      ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(ex, ey);
      ctx.lineWidth = 1; ctx.strokeStyle = `rgba(${COL.accent},${0.1 + 0.28 * a})`; ctx.stroke();
      const f = ((time * 0.6) + i * 0.33) % 1;
      drawNode(x + (ex - x) * f, cy + (ey - cy) * f, 1.6, `rgba(${COL.glow},${(1 - f) * 0.85})`, a * 0.6);
      const pls = 0.6 + 0.4 * Math.sin(time * 2 + i);
      drawNode(ex, ey, 2.4, COL.nodeLit, a * 0.55 * pls);
      ring(ex, ey, 5.5 + pls * 2.5, 1, 0.3 * a);
    }
    const a0 = (time * 0.6) % (Math.PI * 2);
    ctx.beginPath();
    ctx.arc(x, cy, R * 0.32, a0, a0 + Math.PI * 1.1);
    ctx.lineWidth = 1.4; ctx.strokeStyle = `rgba(${COL.glow},${0.5 * a})`; ctx.stroke();
    drawShield(x, a);
  }

  function baseline() {
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(45,91,227,0.01)');
    g.addColorStop(0.12, COL.line);
    g.addColorStop(0.88, COL.line);
    g.addColorStop(1, 'rgba(45,91,227,0.01)');
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy);
    ctx.lineWidth = 1; ctx.strokeStyle = g; ctx.stroke();
  }

  function drawParticles(time) {
    for (const p of particles) {
      const tw = 0.6 + 0.4 * Math.sin(time * 1.2 + p.tw);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${COL.accent},${p.a * tw})`; ctx.fill();
    }
  }
  function stepParticles(dt) {
    for (const p of particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
      if (p.y < -10) p.y = H + 10; if (p.y > H + 10) p.y = -10;
    }
  }

  function render(time, lxN, present) {
    ctx.clearRect(0, 0, W, H);
    drawParticles(time);
    baseline();
    stageMonitor(SX[0], act[0], time);
    stageSummarize(SX[1], act[1], time);
    stageVerify(SX[2], act[2], time);
    if (present > 0.01) {
      const lx = lxN * W;
      const dir = lxN >= prevLxN ? 1 : -1;          // trail points back along travel
      const tx0 = lx - dir * 150;
      const tg = ctx.createLinearGradient(tx0, 0, lx, 0);
      tg.addColorStop(0, `rgba(${COL.glow},0)`);
      tg.addColorStop(1, `rgba(${COL.glow},${0.32 * present})`);
      ctx.beginPath(); ctx.moveTo(tx0, cy); ctx.lineTo(lx, cy);
      ctx.lineWidth = 1.6; ctx.strokeStyle = tg; ctx.stroke();
      ctx.save();
      ctx.shadowBlur = 24; ctx.shadowColor = `rgba(${COL.glow},${present})`;
      ctx.beginPath(); ctx.arc(lx, cy, 7, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${COL.glow},${0.35 * present})`; ctx.fill();
      ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(lx, cy, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${COL.glow},${present})`; ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.arc(lx, cy, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(30,71,192,${present})`; ctx.fill();
    }
  }

  function frame(ts) {
    if (start == null) start = ts;
    const time = (ts - start) / 1000;
    const phase = (time % CYCLE) / CYCLE;
    const lxN = lightX(phase);          // enters left, glides across, exits right
    const present = lightPresent(phase); // fades only at the very ends → seamless re-entry
    act[0] = act[1] = act[2] = 1;       // stages never gate or fade with the light
    stepParticles(1 / 60);
    render(time, lxN, present);
    prevLxN = lxN;
    raf = requestAnimationFrame(frame);
  }

  function renderStatic() {
    if (iconEls.length) for (const el of iconEls) el.style.opacity = 0.9;
    render(2.0, 0, 0);
  }

  let raf = 0;
  function startAnim() { if (!raf && !reduce) raf = requestAnimationFrame(frame); }
  function stopAnim() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  function init() {
    resize();
    if (reduce) { renderStatic(); return; }
    render(0, lightX(0.1), lightPresent(0.1));   // immediate first paint
    let onScreen = false;
    const sync = () => {
      if (onScreen && !document.hidden) { start = null; startAnim(); }
      else stopAnim();
    };
    // only animate while the strip is actually on-screen (stays off on mobile where it's display:none)
    const io = new IntersectionObserver((ents) => { onScreen = ents[0].isIntersecting; sync(); }, { threshold: 0 });
    io.observe(canvas);
    document.addEventListener('visibilitychange', sync);
    let rt;
    const ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { resize(); if (reduce) renderStatic(); }, 120); });
    ro.observe(canvas);
  }

  if (window.Issuefy && window.Issuefy.ready) init();
  else document.addEventListener('issuefy:icons-ready', init, { once: true });
})();
