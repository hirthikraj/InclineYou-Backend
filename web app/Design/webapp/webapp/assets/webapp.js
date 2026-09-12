/* ═══════════════════════════════════════════════════════════════════════════
   X REP · WEB APPLICATION — design-file behaviour
   ═══════════════════════════════════════════════════════════════════════════
   This script belongs to the DESIGN FILE, not to the product. It does three
   things a reviewer needs and nothing a user would:

     1 · the zoom control, so a 1440px screen fits any reviewer's window
     2 · the theme switch, so every frame can be checked in both themes
     3 · deep-link landing, so the "covered by" links in the information
         architecture can point at one frame and highlight it on arrival

   A classic script, deliberately: these files are opened by double-clicking,
   and a browser refuses ES module imports over file://.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var root = document.documentElement;

  /* ── 1 · zoom ────────────────────────────────────────────────────────────
     The frames are drawn at 1440×900 and scaled with a transform. Stored in
     localStorage so a reviewer's choice survives moving between the files. */
  var STEPS = [0.5, 0.62, 0.72, 0.85, 1];
  function setZoom(z) {
    root.style.setProperty('--z', String(z));
    try { localStorage.setItem('inclineyou-web-z', String(z)); } catch (e) {}
    document.querySelectorAll('[data-z]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(Math.abs(+b.dataset.z - z) < 0.001));
    });
  }
  var saved = null;
  try { saved = localStorage.getItem('inclineyou-web-z'); } catch (e) {}
  setZoom(saved ? +saved : 0.72);

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-z]');
    if (b) { setZoom(+b.dataset.z); return; }

    /* ── 2 · theme ─────────────────────────────────────────────────────── */
    var t = e.target.closest('[data-theme-toggle]');
    if (t) {
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      document.querySelectorAll('.app,.viewport').forEach(function (el) {
        if (el.hasAttribute('data-theme')) el.setAttribute('data-theme', next);
      });
      try { localStorage.setItem('inclineyou-web-theme', next); } catch (e2) {}
      document.querySelectorAll('[data-theme-toggle]').forEach(function (el) {
        el.textContent = next === 'light' ? 'Dark' : 'Light';
      });
    }
  });
  try {
    var th = localStorage.getItem('inclineyou-web-theme');
    if (th) root.setAttribute('data-theme', th);
  } catch (e) {}

  /* keyboard: + / − step the zoom, like any design tool */
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    var cur = parseFloat(getComputedStyle(root).getPropertyValue('--z')) || 0.72;
    var i = 0, best = 9;
    STEPS.forEach(function (s, n) { var d = Math.abs(s - cur); if (d < best) { best = d; i = n; } });
    if (e.key === '+' || e.key === '=') { setZoom(STEPS[Math.min(STEPS.length - 1, i + 1)]); e.preventDefault(); }
    if (e.key === '-' || e.key === '_') { setZoom(STEPS[Math.max(0, i - 1)]); e.preventDefault(); }
  });

  /* ── 3 · deep-link landing ───────────────────────────────────────────────
     The IA links to #f-3b. Highlight it for a moment on arrival so the
     reviewer's eye lands on the right frame out of twenty on the page. */
  function land() {
    var id = location.hash.slice(1);
    if (!id) return;
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('landed');
    void el.offsetWidth;                     // force a reflow so it can replay
    el.classList.add('landed');
    setTimeout(function () { el.classList.remove('landed'); }, 2200);
  }
  window.addEventListener('hashchange', land);
  if (document.readyState !== 'loading') setTimeout(land, 60);
  else document.addEventListener('DOMContentLoaded', function () { setTimeout(land, 60); });

  /* ── the frame index, built from the page itself ─────────────────────────
     Every file gets a jump list without anyone maintaining one. */
  var idx = document.querySelector('[data-frame-index]');
  if (idx) {
    var out = [];
    document.querySelectorAll('.unit[id]').forEach(function (u) {
      var id = u.getAttribute('id');
      var n = u.querySelector('.unit__id');
      var t = u.querySelector('.unit__name');
      out.push('<a href="#' + id + '"><b>' + (n ? n.textContent : '') + '</b>' +
               (t ? t.textContent : '') + '</a>');
    });
    idx.innerHTML = out.join('');
    var c = document.querySelector('[data-frame-count]');
    if (c) c.textContent = String(out.length);
  }
}());

/* ── component-library scroll spy ───────────────────────────────────────────
   The left nav has to answer "where am I" without a click, or a 42-component
   library reads as one long page with a table of contents bolted on. */
(function () {
  var nav = document.querySelector('.lib__nav');
  if (!nav) return;
  var sections = [].slice.call(document.querySelectorAll('.cmp[id]'));
  if (!sections.length) return;
  var links = {};
  [].forEach.call(nav.querySelectorAll('a[href*="#c-"]'), function (a) {
    links[a.getAttribute('href').split('#')[1]] = a;
  });
  var current = null;
  function mark(id) {
    if (id === current) return;
    if (current && links[current]) links[current].removeAttribute('aria-current');
    current = id;
    var a = links[id];
    if (!a) return;
    a.setAttribute('aria-current', 'page');
    var nr = nav.getBoundingClientRect(), ar = a.getBoundingClientRect();
    if (ar.top < nr.top + 8 || ar.bottom > nr.bottom - 8)
      nav.scrollTop += ar.top - nr.top - nr.height / 2;
  }
  function spy() {
    var best = sections[0], bestD = Infinity;
    for (var i = 0; i < sections.length; i++) {
      var d = Math.abs(sections[i].getBoundingClientRect().top - 140);
      if (d < bestD) { bestD = d; best = sections[i]; }
    }
    mark(best.id);
  }
  var t = 0;
  addEventListener('scroll', function () {
    if (t) return;
    t = requestAnimationFrame(function () { t = 0; spy(); });
  }, { passive: true });
  spy();
})();

/* ── glass toggle ───────────────────────────────────────────────────────────
   Glass is a material decision, not a preference to bury. The toggle exists so
   it can be judged by looking at a ledger with and without it, rather than by
   reading an argument about it. Default ON. */
(function () {
  var KEY = 'inclineyou-glass';
  var root = document.documentElement;
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  root.dataset.glass = saved === 'off' ? 'off' : 'on';

  function paint() {
    var on = root.dataset.glass === 'on';
    [].forEach.call(document.querySelectorAll('[data-glass-toggle]'), function (b) {
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.textContent = on ? 'Glass' : 'Flat';
      b.title = on ? 'Glass on — overlays are translucent' : 'Flat — every surface opaque';
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-glass-toggle]');
    if (!b) return;
    root.dataset.glass = root.dataset.glass === 'on' ? 'off' : 'on';
    try { localStorage.setItem(KEY, root.dataset.glass); } catch (er) {}
    paint();
  });
  addEventListener('keydown', function (e) {
    if (e.key === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey &&
        !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      root.dataset.glass = root.dataset.glass === 'on' ? 'off' : 'on';
      try { localStorage.setItem(KEY, root.dataset.glass); } catch (er) {}
      paint();
    }
  });
  paint();
})();
