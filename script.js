// bart_2216 Studio — ambient background: drifting "static particles"
// Subtle, low-motion field suggesting signal noise / unease. Respects reduced motion.

(function () {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = canvas.getContext('2d');
  let w, h, particles;

  const PARTICLE_COUNT = 55;
  const BLOOD = [143, 43, 43];
  const BONE = [236, 231, 226];

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  function makeParticles() {
    particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.6 + 0.4,
      vx: (Math.random() - 0.5) * 0.12,
      vy: (Math.random() - 0.5) * 0.12,
      flicker: Math.random() * Math.PI * 2,
      blood: Math.random() < 0.12,
    }));
  }

  function step() {
    ctx.clearRect(0, 0, w, h);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.flicker += 0.02;

      if (p.x < 0) p.x = w;
      if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h;
      if (p.y > h) p.y = 0;

      const alpha = 0.15 + Math.sin(p.flicker) * 0.12;
      const [r, g, b] = p.blood ? BLOOD : BONE;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${Math.max(alpha, 0.03)})`;
      ctx.fill();
    }

    if (!reduceMotion) requestAnimationFrame(step);
  }

  resize();
  makeParticles();
  window.addEventListener('resize', () => {
    resize();
    makeParticles();
  });

  if (reduceMotion) {
    // draw a single static frame, no animation loop
    step();
  } else {
    requestAnimationFrame(step);
  }
})();

// Header hide-on-scroll-down, show-on-scroll-up
(function () {
  const header = document.querySelector('.site-header');
  if (!header) return;
  let lastY = window.scrollY;

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (y > lastY && y > 120) {
      header.style.transform = 'translateY(-100%)';
    } else {
      header.style.transform = 'translateY(0)';
    }
    header.style.transition = 'transform 0.35s ease';
    lastY = y;
  }, { passive: true });
})();
