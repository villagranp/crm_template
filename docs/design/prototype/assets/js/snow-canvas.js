/* ==========================================================================
   Mi Cliente AG — Fondo de partículas "nieve" para autenticación
   (ver DESIGN_SPEC.md §5). Respeta prefers-reduced-motion y pausa en background.
   ========================================================================== */
(function () {
  'use strict';

  const canvas = document.getElementById('snowCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let width = 0, height = 0, dpr = 1, particles = [], rafId = null, running = false;

  function particleCount() {
    // Densidad proporcional al área: menos partículas en móvil
    return Math.round(Math.min(110, Math.max(28, (window.innerWidth * window.innerHeight) / 16000)));
  }

  function seed() {
    particles = Array.from({ length: particleCount() }, () => spawn(true));
  }

  function spawn(initial) {
    return {
      x: Math.random() * width,
      y: initial ? Math.random() * height : -8,
      r: Math.random() * 2 + 0.8,
      vy: Math.random() * 0.55 + 0.18,
      drift: Math.random() * 0.6 + 0.1,
      phase: Math.random() * Math.PI * 2,
      alpha: Math.random() * 0.5 + 0.3
    };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
    if (reduced) draw(0);
  }

  function draw(time) {
    ctx.clearRect(0, 0, width, height);
    for (const p of particles) {
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function step(time) {
    for (const p of particles) {
      p.y += p.vy;
      p.x += Math.sin(time * 0.0004 + p.phase) * p.drift;
      if (p.y - p.r > height) Object.assign(p, spawn(false));
      if (p.x < -10) p.x = width + 10;
      if (p.x > width + 10) p.x = -10;
    }
    draw(time);
    rafId = requestAnimationFrame(step);
  }

  function start() {
    if (reduced || running) return;
    running = true;
    rafId = requestAnimationFrame(step);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // Pausa cuando la pestaña no está visible (rendimiento y batería)
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });

  resize();
  start();
})();
