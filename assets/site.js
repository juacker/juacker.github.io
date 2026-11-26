/* juacker.github.io — hero animation. No dependencies. */
(function () {
  'use strict';

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- Hero: Game of Life background ---------- */

  function startLife(canvas) {
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var CELL = 6, GAP = 1, STEP = CELL + GAP, TICK_MS = 150;
    var hero = canvas.parentElement;
    var cols = 0, rows = 0, width = 0, height = 0, grid, next, timer = 0, visible = true, color = '';

    function readColor() {
      color = getComputedStyle(document.documentElement).getPropertyValue('--life').trim() || 'rgba(0,0,0,0.13)';
    }

    function setup() {
      var w = hero.clientWidth, h = hero.clientHeight;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = w;
      height = h;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.max(1, Math.ceil(w / STEP));
      rows = Math.max(1, Math.ceil(h / STEP));
      grid = new Uint8Array(cols * rows);
      next = new Uint8Array(cols * rows);
      for (var i = 0; i < grid.length; i++) grid[i] = Math.random() < 0.18 ? 1 : 0;
    }

    function tick() {
      for (var y = 0; y < rows; y++) {
        var up = ((y - 1 + rows) % rows) * cols, mid = y * cols, down = ((y + 1) % rows) * cols;
        for (var x = 0; x < cols; x++) {
          var l = (x - 1 + cols) % cols, r = (x + 1) % cols;
          var n = grid[up + l] + grid[up + x] + grid[up + r] + grid[mid + l] + grid[mid + r] +
            grid[down + l] + grid[down + x] + grid[down + r];
          next[mid + x] = n === 3 || (n === 2 && grid[mid + x]) ? 1 : 0;
        }
      }
      var swap = grid; grid = next; next = swap;
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = color;
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          if (grid[y * cols + x]) ctx.fillRect(x * STEP, y * STEP, CELL, CELL);
        }
      }
    }

    function running() {
      return visible && !document.hidden && !reducedMotion.matches;
    }

    function loop() {
      timer = 0;
      if (!running()) return;
      tick();
      draw();
      timer = setTimeout(function () { requestAnimationFrame(loop); }, TICK_MS);
    }

    function resume() {
      if (!timer && running()) timer = setTimeout(loop, TICK_MS);
    }

    readColor();
    setup();
    // A few generations so the static frame (reduced motion) shows life-like shapes, not noise.
    for (var g = 0; g < 12; g++) tick();
    draw();

    if ('ResizeObserver' in window) {
      new ResizeObserver(function () {
        if (hero.clientWidth === width && hero.clientHeight === height) return;
        setup();
        draw();
      }).observe(hero);
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        resume();
      }).observe(hero);
    }
    document.addEventListener('visibilitychange', resume);
    reducedMotion.addEventListener && reducedMotion.addEventListener('change', resume);
    resume();
  }

  /* ---------- Boot ---------- */

  var canvas = document.getElementById('life');
  if (canvas) startLife(canvas);
})();
