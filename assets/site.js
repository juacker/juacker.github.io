/* juacker.github.io — hero animation and daily-briefing rendering. No dependencies. */
(function () {
  'use strict';

  // Site is served from the domain root; paths inside index.json are relative to it.
  var SITE_ROOT = '/';
  var INDEX_URL = SITE_ROOT + 'briefings/index.json';
  var PREVIOUS_ON_HOME = 6;

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- Helpers ---------- */

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'text') node.textContent = value;
        else if (key === 'className') node.className = value;
        else node.setAttribute(key, value === true ? '' : value);
      });
    }
    (children || []).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  // Only same-site relative paths or http(s) URLs become links.
  function siteHref(path) {
    if (typeof path !== 'string' || path === '') return null;
    if (/^https?:\/\//i.test(path)) return path;
    if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.indexOf('//') === 0) return null;
    return SITE_ROOT + path.replace(/^\/+/, '');
  }

  function parseDay(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  }

  var dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  var longDayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  var monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  function fmtDay(iso, fmt) {
    var d = parseDay(iso);
    return d ? (fmt || dayFmt).format(d) : String(iso || '');
  }

  // "87:24:35" -> "87 h 24 min"
  function fmtDuration(text) {
    var m = /^(\d+):(\d{2})(?::\d{2})?$/.exec(text || '');
    if (!m) return '';
    var h = +m[1], min = +m[2];
    return h ? h + ' h' + (min ? ' ' + min + ' min' : '') : min + ' min';
  }

  function plural(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's');
  }

  function langName(lang) {
    return lang === 'es' ? 'Spanish' : lang === 'en' ? 'English' : (lang || '');
  }

  function timeEl(iso, fmt) {
    return el('time', { datetime: iso, text: fmtDay(iso, fmt) });
  }

  // Optional per-subject `headlines`: array of strings or {title, url}.
  function headlinesOf(subject) {
    var list = Array.isArray(subject.headlines) ? subject.headlines : [];
    return list.map(function (h) {
      return typeof h === 'string' ? { title: h } : { title: String((h && h.title) || ''), url: h && h.url };
    }).filter(function (h) { return h.title; });
  }

  function loadIndex() {
    return fetch(INDEX_URL, { cache: 'no-cache', headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.editions)) throw new Error('Malformed briefing index');
        data.editions = data.editions.filter(function (e) { return e && parseDay(e.date); });
        return data;
      });
  }

  function showNotice(container, message) {
    if (!container || container.querySelector('.notice[data-generated]')) return;
    container.insertBefore(el('p', { className: 'notice', role: 'status', 'data-generated': true, text: message }), container.firstChild);
  }

  /* ---------- Homepage: latest edition ---------- */

  function subjectCard(subject) {
    var href = siteHref(subject.path);
    var isEs = subject.lang === 'es';
    var meta = el('span', { className: 'subject-card__meta' }, [
      typeof subject.count === 'number' ? plural(subject.count, 'item') : '',
      subject.lang ? ' · ' : '',
      isEs ? el('span', { className: 'lang-badge', title: 'In Spanish', text: 'ES' }) : langName(subject.lang),
      isEs ? el('span', { className: 'visually-hidden', text: ' (in Spanish)' }) : null
    ]);
    var children = [el('span', { className: 'subject-card__title', text: subject.title || subject.slug }), meta];
    return el('li', null, [href
      ? el('a', { className: 'subject-card', href: href, hreflang: subject.lang || null }, children)
      : el('div', { className: 'subject-card' }, children)]);
  }

  function editionSummary(edition) {
    var parts = [];
    if (typeof edition.total_items === 'number') parts.push(plural(edition.total_items, 'item'));
    var subjects = Array.isArray(edition.subjects) ? edition.subjects.length : 0;
    if (subjects) parts.push(plural(subjects, 'subject'));
    var dur = edition.window && fmtDuration(edition.window.duration);
    if (dur) parts.push('covers ' + dur);
    return parts.join(' · ');
  }

  function renderHome(root, data) {
    var editions = data.editions;
    var latestEl = root.querySelector('[data-briefing-latest]');
    var previousEl = root.querySelector('[data-briefing-previous]');
    if (!latestEl || !previousEl) return;

    if (!editions.length) {
      latestEl.replaceChildren(el('p', { className: 'notice', role: 'status', text: 'No briefings published yet. Check back soon.' }));
      previousEl.replaceChildren();
      return;
    }

    var latest = editions[0];
    var latestHref = siteHref(latest.path);
    var date = timeEl(latest.date, longDayFmt);
    latestEl.replaceChildren(
      el('p', { className: 'latest__date' }, [latestHref ? el('a', { href: latestHref }, [date]) : date]),
      el('p', { className: 'latest__meta', text: editionSummary(latest) }),
      el('ul', { className: 'subject-grid', role: 'list' }, (latest.subjects || []).map(subjectCard))
    );

    var previous = editions.slice(1, 1 + PREVIOUS_ON_HOME);
    if (!previous.length) {
      previousEl.replaceChildren(el('p', { className: 'latest__meta', text: 'Earlier editions will appear here.' }));
      return;
    }
    previousEl.replaceChildren(el('ul', { className: 'edition-list', role: 'list' }, previous.map(function (e) {
      var href = siteHref(e.path);
      var inner = [el('span', { className: 'edition-list__date' }, [timeEl(e.date)]),
        el('span', { className: 'edition-list__count', text: typeof e.total_items === 'number' ? plural(e.total_items, 'item') : '' })];
      return el('li', null, [href ? el('a', { href: href }, inner) : el('span', null, inner)]);
    })));
  }

  /* ---------- Archive page ---------- */

  function readQuery() {
    var params = new URLSearchParams(window.location.search);
    return { subject: params.get('subject') || 'all', q: params.get('q') || '' };
  }

  function writeQuery(state) {
    var params = new URLSearchParams();
    if (state.subject !== 'all') params.set('subject', state.subject);
    if (state.q) params.set('q', state.q);
    var qs = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : '') + window.location.hash);
  }

  function tokens(q) {
    return q.toLowerCase().split(/\s+/).filter(Boolean);
  }

  function matchesAll(text, toks) {
    var hay = text.toLowerCase();
    return toks.every(function (t) { return hay.indexOf(t) !== -1; });
  }

  function highlight(text, toks) {
    if (!toks.length) return [text];
    var escaped = toks.map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
    return text.split(new RegExp('(' + escaped.join('|') + ')', 'ig')).map(function (part, i) {
      return i % 2 ? el('mark', { text: part }) : part;
    });
  }

  // Returns null when the edition does not match, else the subjects to show with their headline hits.
  function filterEdition(edition, state, toks) {
    var subjects = (edition.subjects || []).filter(function (s) {
      return state.subject === 'all' || s.slug === state.subject;
    });
    if (!subjects.length) return null;
    var dateText = [edition.date, fmtDay(edition.date), fmtDay(edition.date, longDayFmt)].join(' ');
    var dateHit = !toks.length || matchesAll(dateText, toks);
    var rows = subjects.map(function (s) {
      var hits = toks.length ? headlinesOf(s).filter(function (h) { return matchesAll(h.title, toks); }) : [];
      var titleHit = toks.length && matchesAll((s.title || '') + ' ' + s.slug, toks);
      return { subject: s, hits: hits, matched: dateHit || titleHit || hits.length > 0 };
    });
    var any = rows.some(function (r) { return r.matched; });
    if (!any) return null;
    return dateHit ? rows : rows.filter(function (r) { return r.matched; });
  }

  function editionDetails(edition, rows, open, toks) {
    var href = siteHref(edition.path);
    var list = el('ul', { className: 'edition__links', role: 'list' }, rows.map(function (r) {
      var s = r.subject;
      var sHref = siteHref(s.path);
      var label = [el('span', null, [s.title || s.slug, s.lang === 'es' ? ' ' : null,
        s.lang === 'es' ? el('span', { className: 'lang-badge', title: 'In Spanish', text: 'ES' }) : null,
        s.lang === 'es' ? el('span', { className: 'visually-hidden', text: ' (in Spanish)' }) : null]),
        el('span', { className: 'count', text: typeof s.count === 'number' ? plural(s.count, 'item') : '' })];
      var hits = r.hits.length ? el('ul', { className: 'edition__hits', role: 'list' }, r.hits.slice(0, 5).map(function (h) {
        var url = siteHref(h.url);
        var text = highlight(h.title, toks);
        return el('li', null, [url ? el('a', { href: url }, text) : el('span', null, text)]);
      })) : null;
      return el('li', null, [sHref ? el('a', { className: 'edition__subject', href: sHref, hreflang: s.lang || null }, label)
        : el('span', { className: 'edition__subject' }, label), hits]);
    }));
    return el('li', null, [el('details', { className: 'edition', open: open }, [
      el('summary', null, [el('span', { className: 'edition__date' }, [timeEl(edition.date)]),
        el('span', { className: 'edition__meta', text: editionSummary(edition) })]),
      el('div', { className: 'edition__body' }, [list,
        href ? el('a', { className: 'edition__all', href: href, text: 'Open the full edition →' }) : null])
    ])]);
  }

  function renderArchive(root, data) {
    var listEl = root.querySelector('[data-archive-list]');
    var form = root.querySelector('[data-archive-filters]');
    var status = root.querySelector('[data-archive-status]');
    var search = form && form.querySelector('input[type="search"]');
    if (!listEl || !form || !search) return;
    if (!data.editions.length) {
      listEl.replaceChildren(el('p', { className: 'notice', role: 'status', text: 'No briefings published yet. Check back soon.' }));
      return;
    }

    var state = readQuery();
    var known = Array.prototype.map.call(form.querySelectorAll('input[name="subject"]'), function (i) { return i.value; });
    if (known.indexOf(state.subject) === -1) state.subject = 'all';
    search.value = state.q;
    form.querySelector('input[name="subject"][value="' + state.subject + '"]').checked = true;
    form.hidden = false;

    function update() {
      var toks = tokens(state.q);
      var filtering = toks.length > 0 || state.subject !== 'all';
      var months = [];
      var byMonth = {};
      var shown = 0;
      data.editions.forEach(function (edition) {
        var rows = filterEdition(edition, state, toks);
        if (!rows) return;
        var key = edition.date.slice(0, 7);
        if (!byMonth[key]) { byMonth[key] = []; months.push(key); }
        byMonth[key].push(editionDetails(edition, rows, filtering || shown === 0, toks));
        shown++;
      });
      listEl.replaceChildren.apply(listEl, months.map(function (key) {
        return el('section', { className: 'archive-month', 'aria-labelledby': 'm-' + key }, [
          el('h2', { id: 'm-' + key, text: monthFmt.format(parseDay(key + '-01')) }),
          el('ul', { className: 'archive-list', role: 'list' }, byMonth[key])
        ]);
      }));
      if (!shown) status.textContent = 'No editions match. Try another subject or search term.';
      else status.textContent = filtering ? 'Showing ' + plural(shown, 'edition') + ' of ' + data.editions.length + '.'
        : plural(shown, 'edition') + ', newest first.';
    }

    var timer = 0;
    search.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { state.q = search.value.trim(); writeQuery(state); update(); }, 150);
    });
    form.addEventListener('change', function (event) {
      if (event.target.name !== 'subject') return;
      state.subject = event.target.value;
      writeQuery(state);
      update();
    });
    form.addEventListener('submit', function (event) { event.preventDefault(); });
    update();
  }

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
    var scheme = window.matchMedia('(prefers-color-scheme: dark)');
    scheme.addEventListener && scheme.addEventListener('change', function () { readColor(); draw(); });
    resume();
  }

  /* ---------- Print: closed <details> would hide edition links ---------- */

  window.addEventListener('beforeprint', function () {
    document.querySelectorAll('details:not([open])').forEach(function (d) {
      d.setAttribute('open', '');
      d.setAttribute('data-print-opened', '');
    });
  });
  window.addEventListener('afterprint', function () {
    document.querySelectorAll('details[data-print-opened]').forEach(function (d) {
      d.removeAttribute('open');
      d.removeAttribute('data-print-opened');
    });
  });

  /* ---------- Boot ---------- */

  var canvas = document.getElementById('life');
  if (canvas) startLife(canvas);

  var home = document.querySelector('[data-briefings="home"]');
  var archive = document.querySelector('[data-briefings="archive"]');
  if (!home && !archive) return;

  loadIndex().then(function (data) {
    if (home) renderHome(home, data);
    if (archive) renderArchive(archive, data);
  }).catch(function () {
    var message = 'The briefing index could not be loaded right now. Showing the last edition known when this page was published.';
    showNotice(home && home.querySelector('[data-briefing-latest]'), message);
    showNotice(archive && archive.querySelector('[data-archive-list]'), message);
  });
})();
