/* Issuefy — BorderGlow pointer logic (vanilla port).
   Sets --edge-proximity and --cursor-angle on each .bg-card from the pointer. */
(function () {
  function center(el) { const r = el.getBoundingClientRect(); return [r.width / 2, r.height / 2]; }
  function edgeProximity(el, x, y) {
    const [cx, cy] = center(el);
    const dx = x - cx, dy = y - cy;
    let kx = Infinity, ky = Infinity;
    if (dx !== 0) kx = cx / Math.abs(dx);
    if (dy !== 0) ky = cy / Math.abs(dy);
    return Math.min(Math.max(1 / Math.min(kx, ky), 0), 1);
  }
  function cursorAngle(el, x, y) {
    const [cx, cy] = center(el);
    const dx = x - cx, dy = y - cy;
    if (dx === 0 && dy === 0) return 0;
    let deg = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (deg < 0) deg += 360;
    return deg;
  }
  function attach(card) {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      card.style.setProperty('--edge-proximity', (edgeProximity(card, x, y) * 100).toFixed(2));
      card.style.setProperty('--cursor-angle', cursorAngle(card, x, y).toFixed(2) + 'deg');
    }, { passive: true });
  }
  function init() {
    // hover glow is pointer-driven; skip entirely on touch devices
    if (window.matchMedia && !window.matchMedia('(pointer: fine)').matches) return;
    document.querySelectorAll('.bg-card').forEach(attach);
  }
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
