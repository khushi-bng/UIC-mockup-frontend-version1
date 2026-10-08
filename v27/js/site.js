/* ==========================================================================
   USAIndiaCFO — v27 "Warm Bronze Clay"

   One script for every page. Each block is opt-in: it looks for its own
   hook in the DOM and does nothing if the page does not use it, so the
   same file serves the homepage and a privacy page without branching.

   Rules carried over from v23 and the v25/v26 work:
     · one rAF, no per-frame allocation, no layout thrash in a scroll handler
     · every write is dirty-checked before it touches the DOM
     · prefers-reduced-motion is honoured by bailing out, not by shortening
     · the hero video is forced muted+playsinline ON THE ELEMENT and retried
       on first gesture — that is the only thing that reliably autoplays
   ========================================================================== */
(function () {
  'use strict';

  var RM = false;
  try { RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  var on = function (el, ev, fn, opt) { if (el) el.addEventListener(ev, fn, opt || false); };
  var all = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var one = function (sel, root) { return (root || document).querySelector(sel); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  /* Write only when the value actually changed. A scroll handler that
     re-assigns the same style string still costs a style recalculation. */
  function setStyle(el, prop, val) {
    if (!el) return;
    var k = '__s_' + prop;
    if (el[k] === val) return;
    el[k] = val;
    el.style[prop] = val;
  }

  /* ── header: scroll state + which ground it is over ──────────────────── */
  function header() {
    var hdr = one('.hdr');
    if (!hdr) return;
    // The dark band the chrome has to invert over: the video hero on the
    // homepage, nothing on inner pages (their top is the ivory ground).
    var dark = one('[data-chrome-dark]');
    var raf = 0;

    function apply() {
      raf = 0;
      var y = window.pageYOffset || document.documentElement.scrollTop || 0;
      hdr.classList.toggle('hdr--stuck', y > 24);
      if (dark) {
        // invert while the header still overlaps the dark region
        var end = dark.offsetTop + dark.offsetHeight - hdr.offsetHeight - 8;
        hdr.classList.toggle('hdr--over-dark', y < end);
      }
    }
    function queue() { if (!raf) raf = requestAnimationFrame(apply); }

    on(window, 'scroll', queue, { passive: true });
    on(window, 'resize', queue);
    apply();
  }

  /* ── mobile drawer ───────────────────────────────────────────────────── */
  function drawer() {
    var btn = one('.burger'), pane = one('.drawer'), veil = one('.drawer-veil');
    if (!btn || !pane) return;
    var lastFocus = null;

    function set(open) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      pane.setAttribute('data-open', open ? 'true' : 'false');
      if (veil) veil.setAttribute('data-open', open ? 'true' : 'false');
      pane.setAttribute('aria-hidden', open ? 'false' : 'true');
      document.documentElement.style.overflow = open ? 'hidden' : '';
      if (open) {
        lastFocus = document.activeElement;
        var first = one('.drawer__link', pane);
        if (first) first.focus();
      } else if (lastFocus) {
        lastFocus.focus();
      }
    }
    set(false);
    on(btn, 'click', function () { set(btn.getAttribute('aria-expanded') !== 'true'); });
    on(veil, 'click', function () { set(false); });
    on(document, 'keydown', function (e) { if (e.key === 'Escape') set(false); });
    all('.drawer__link', pane).forEach(function (a) { on(a, 'click', function () { set(false); }); });

    // Keep tab focus inside the drawer while it is open.
    on(pane, 'keydown', function (e) {
      if (e.key !== 'Tab' || pane.getAttribute('data-open') !== 'true') return;
      var f = all('a[href],button:not([disabled])', pane);
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  /* ── scroll reveal ───────────────────────────────────────────────────── */
  function reveal() {
    // Stagger groups: index the children once so CSS can fan the delays.
    all('[data-stagger]').forEach(function (g) {
      Array.prototype.forEach.call(g.children, function (c, i) {
        c.style.setProperty('--i', String(i));
      });
    });
    var items = all('[data-rise], [data-rise-scale], [data-stagger]');
    if (!items.length) return;
    // No observer, or reduced motion: show everything and stop. The CSS
    // hides these, so failing to reveal would hide content permanently.
    if (RM || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.setAttribute('data-shown', 'true'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        var d = parseFloat(el.getAttribute('data-delay') || el.getAttribute('data-rise')) || 0;
        setTimeout(function () { el.setAttribute('data-shown', 'true'); }, d * 1000);
        io.unobserve(el);
      });
    // -10%/0.06 meant a tall section (common on mobile, where the same
    // content runs to a much greater scroll length) needed real scroll
    // distance before ANY of it was considered "visible enough" to trigger —
    // read as noticeably late, particularly for the sections right after the
    // hero. -2%/0.01 fires as soon as a sliver is on screen; the transition
    // itself (opacity + 22-44px rise, ~0.8s) is unchanged, so it still reads
    // as a scroll reveal, just a prompter one.
    }, { rootMargin: '0px 0px -2% 0px', threshold: 0.01 });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ── collage drift ─────────────────────────────────────────────────────
     The claude-corps move: as the page scrolls, collage columns travel at
     slightly different rates, so the image field feels suspended rather
     than pasted. One rAF, one CSS-variable write per collage per frame
     (items pick it up via their own --drift multiplier), dirty-checked. */
  function drift() {
    var fields = all('.collage');
    if (!fields.length || RM) return;
    var raf = 0;
    function apply() {
      raf = 0;
      var vh = window.innerHeight || 1;
      fields.forEach(function (f) {
        var r = f.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        // progress of the collage centre through the viewport: -1 … 1
        var pr = clamp(((r.top + r.height / 2) - vh / 2) / (vh / 2 + r.height / 2), -1, 1);
        var y = (pr * -46).toFixed(1) + 'px';
        if (f.__dy !== y) { f.__dy = y; f.style.setProperty('--drift-y', y); }
      });
    }
    function queue() { if (!raf) raf = requestAnimationFrame(apply); }
    on(window, 'scroll', queue, { passive: true });
    on(window, 'resize', queue);
    apply();
  }

  /* ── hero video ──────────────────────────────────────────────────────────
     Three things break autoplay in practice, and all three are handled:
       1. an unmuted video is refused by every browser — force muted on the
          ELEMENT, not just as an attribute;
       2. iOS needs playsinline or it goes fullscreen;
       3. an iframe without allow="autoplay" refuses the first play() — so
          arm a one-shot retry on the first real gesture.
     The poster carries the frame until decode, so the hero is never black. */
  function video() {
    var vids = all('video[data-hero]');
    if (!vids.length) return;

    vids.forEach(function (v) {
      v.muted = true;
      v.defaultMuted = true;
      v.setAttribute('muted', '');
      v.setAttribute('playsinline', '');
      v.playsInline = true;
      v.loop = true;

      if (RM) { try { v.pause(); } catch (e) {} return; }

      var tries = 0;
      function play() {
        if (!v.paused) return;
        var p = v.play();
        if (p && p.catch) {
          p.catch(function () {
            if (tries++ === 0) {
              console.warn('[v27] hero video autoplay was refused; retrying on first interaction.');
              ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(function (ev) {
                document.addEventListener(ev, play, { once: true, passive: true });
              });
            }
          });
        }
      }
      play();
      on(v, 'loadeddata', play);
      on(v, 'canplay', play);

      // A decoded video scrolled off screen costs real power for nothing.
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (es) {
          es.forEach(function (en) {
            if (en.isIntersecting) play();
            else if (!v.paused) { try { v.pause(); } catch (e) {} }
          });
        }, { threshold: 0.01 }).observe(v);
      }
      // Tab hidden: same reasoning.
      on(document, 'visibilitychange', function () {
        if (document.hidden) { try { v.pause(); } catch (e) {} } else play();
      });
    });
  }

  /* ── hero cursor parallax (v23's restrained move) ─────────────────────── */
  function heroParallax() {
    var hero = one('[data-parallax]');
    if (!hero || RM) return;
    var media = one('.hero__media video, .hero__media img.hero__still', hero);
    var body = one('.hero__body', hero);
    var hx = 0, hy = 0, raf = 0;

    function write() {
      raf = 0;
      // The media drifts against the copy, the copy moves less — that
      // difference is the whole effect. v23's ratio, kept.
      if (media) setStyle(media, 'transform',
        'translate(-50%,-50%) scale(1.06) translate3d(' + (hx * -13).toFixed(1) + 'px,' + (hy * -9).toFixed(1) + 'px,0)');
      if (body) setStyle(body, 'transform',
        'translate3d(' + (hx * 6).toFixed(1) + 'px,' + (hy * 4).toFixed(1) + 'px,0)');
    }
    function queue() { if (!raf) raf = requestAnimationFrame(write); }

    on(hero, 'mousemove', function (e) {
      var r = hero.getBoundingClientRect();
      hx = clamp((e.clientX - r.left) / Math.max(1, r.width) - 0.5, -0.5, 0.5);
      hy = clamp((e.clientY - r.top) / Math.max(1, r.height) - 0.5, -0.5, 0.5);
      queue();
    });
    on(hero, 'mouseleave', function () { hx = 0; hy = 0; queue(); });
  }

  /* ── the five-stage flow track ───────────────────────────────────────── */
  function flow() {
    var root = one('[data-flow]');
    if (!root) return;
    var cards = all('.flow__card', root);
    var dots = all('.flow__dot', root);
    var fill = one('.flow__rail-fill', root);
    if (!cards.length) return;

    function select(i) {
      cards.forEach(function (c, n) { c.setAttribute('data-on', n === i ? 'true' : 'false'); });
      dots.forEach(function (d, n) { d.setAttribute('data-on', n <= i ? 'true' : 'false'); });
      if (fill) setStyle(fill, 'width', (((i + 1) / cards.length) * 100).toFixed(2) + '%');
    }
    cards.forEach(function (c, i) {
      on(c, 'mouseenter', function () { select(i); });
      on(c, 'focus', function () { select(i); });
      on(c, 'click', function () { select(i); });
    });
    select(0);
  }

  /* ── tabs ────────────────────────────────────────────────────────────── */
  function tabs() {
    all('[data-tabs]').forEach(function (group) {
      var btns = all('[role="tab"]', group);
      var panels = all('[role="tabpanel"]', group);
      if (!btns.length) return;

      function select(i) {
        btns.forEach(function (b, n) {
          b.setAttribute('aria-selected', n === i ? 'true' : 'false');
          b.tabIndex = n === i ? 0 : -1;
        });
        panels.forEach(function (p, n) { p.hidden = n !== i; });
      }
      btns.forEach(function (b, i) {
        on(b, 'click', function () { select(i); });
        on(b, 'keydown', function (e) {
          var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          var next = (i + d + btns.length) % btns.length;
          select(next); btns[next].focus();
        });
      });
      select(0);
    });
  }

  /* ── accordion ───────────────────────────────────────────────────────── */
  function accordion() {
    all('.acc').forEach(function (acc) {
      var items = all('.acc__item', acc);
      items.forEach(function (item) {
        var btn = one('.acc__btn', item);
        var panel = one('.acc__panel', item);
        if (!btn || !panel) return;
        var id = panel.id || ('acc-p-' + Math.random().toString(36).slice(2, 8));
        panel.id = id;
        btn.setAttribute('aria-controls', id);
        btn.setAttribute('aria-expanded', 'false');
        item.setAttribute('data-open', 'false');

        on(btn, 'click', function () {
          var open = item.getAttribute('data-open') === 'true';
          // one at a time — a wall of open panels is not a reference doc
          items.forEach(function (o) {
            o.setAttribute('data-open', 'false');
            var b = one('.acc__btn', o); if (b) b.setAttribute('aria-expanded', 'false');
          });
          if (!open) {
            item.setAttribute('data-open', 'true');
            btn.setAttribute('aria-expanded', 'true');
          }
        });
      });
    });
  }

  /* ── stat counters ───────────────────────────────────────────────────── */
  function counters() {
    var els = all('[data-count]');
    if (!els.length) return;
    if (RM || !('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.textContent = el.getAttribute('data-count') + (el.getAttribute('data-suffix') || ''); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target; io.unobserve(el);
        var to = parseFloat(el.getAttribute('data-count')) || 0;
        var suffix = el.getAttribute('data-suffix') || '';
        var dp = (el.getAttribute('data-count').split('.')[1] || '').length;
        var t0 = 0, dur = 1100;
        function step(t) {
          if (!t0) t0 = t;
          var k = clamp((t - t0) / dur, 0, 1);
          var e = 1 - Math.pow(1 - k, 3);              // easeOutCubic
          el.textContent = (to * e).toFixed(dp) + suffix;
          if (k < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
    }, { threshold: 0.4 });
    els.forEach(function (el) { el.textContent = '0' + (el.getAttribute('data-suffix') || ''); io.observe(el); });
  }

  /* ── constellation teaser ────────────────────────────────────────────── */
  function tease() {
    var root = one('[data-tease]');
    if (!root) return;
    var world = one('.tease__world', root);
    if (!world) return;

    // Same layout language as v23: an off-centre scatter with a readable
    // gap through the middle, because the copy sits there.
    var NODES = [
      [86,140,74,56],[214,230,58,58],[66,348,66,50],[158,452,82,62],[58,548,54,54],
      [330,108,60,46],[296,500,70,52],[340,330,52,52],[430,84,74,56],[402,470,58,44],
      [1204,148,76,58],[1078,244,56,56],[1236,240,68,52],[1090,470,80,60],[1240,506,52,52],
      [968,100,58,44],[996,520,66,50],[950,330,50,50],[872,200,62,46],[880,430,54,42]
    ];
    var LINKS = [[0,1],[1,2],[2,3],[3,4],[1,5],[3,6],[5,8],[7,1],[7,6],[9,6],[9,3],
      [10,11],[11,12],[12,13],[13,14],[10,15],[12,16],[17,11],[17,16],[18,15],[15,10],
      [19,17],[19,13],[0,5],[6,4],[14,13],[18,19]];
    // Placed in the gaps between nodes — a label cut mid-word by a thumbnail
    // reads as a bug, not as depth.
    var HUBS = [
      ['How do I set up?', 196, 300],['Staying compliant in India', 226, 620],
      ['US obligations', 1120, 320],['Cross-border tax', 1108, 398]
    ];

    world.style.left = '50%'; world.style.top = '50%';
    world.style.right = 'auto'; world.style.bottom = 'auto';
    world.style.width = '1320px'; world.style.height = '560px';
    world.style.margin = '-280px 0 0 -660px';

    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '1320'); svg.setAttribute('height', '560');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none';
    LINKS.forEach(function (l, i) {
      var a = NODES[l[0]], b = NODES[l[1]];
      if (!a || !b) return;
      var ln = document.createElementNS(NS, 'line');
      ln.setAttribute('x1', a[0]); ln.setAttribute('y1', a[1]);
      ln.setAttribute('x2', b[0]); ln.setAttribute('y2', b[1]);
      ln.setAttribute('vector-effect', 'non-scaling-stroke');
      ln.setAttribute('stroke', '#f8f3e8');
      ln.setAttribute('stroke-opacity', i % 4 === 0 ? '0.24' : '0.13');
      ln.setAttribute('stroke-width', '1');
      svg.appendChild(ln);
    });
    world.appendChild(svg);

    var frag = document.createDocumentFragment();
    NODES.forEach(function (n, i) {
      var d = document.createElement('div');
      d.className = 'tease__node';
      d.setAttribute('aria-hidden', 'true');
      d.style.cssText = 'left:' + (n[0] - n[2] / 2) + 'px;top:' + (n[1] - n[3] / 2) +
        'px;width:' + n[2] + 'px;height:' + n[3] + 'px';
      var img = document.createElement('img');
      // 220px thumbnails, not the full-size photos: these draw at ~70px and
      // decoding the originals cost a visible hitch in v25.
      img.src = '../v2img/thumb/' + String((i % 28) + 1).padStart(2, '0') + '.webp';
      img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
      d.appendChild(img);
      frag.appendChild(d);
    });
    HUBS.forEach(function (h) {
      var s = document.createElement('span');
      s.className = 'tease__hub';
      s.setAttribute('aria-hidden', 'true');
      s.style.cssText = 'left:' + h[1] + 'px;top:' + h[2] + 'px';
      s.textContent = h[0];
      frag.appendChild(s);
    });
    world.appendChild(frag);

    var raf = 0, tx = 0, ty = 0, k = 1.04;
    function write() {
      raf = 0;
      setStyle(world, 'transform',
        'translate3d(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px,0) scale(' + k.toFixed(3) + ')');
    }
    function fit() {
      var r = root.getBoundingClientRect();
      k = Math.max(r.width / 1320, r.height / 560, 1) * 1.04;
      if (!raf) raf = requestAnimationFrame(write);
    }
    fit();
    on(window, 'resize', fit);
    if (RM) return;
    on(root, 'mousemove', function (e) {
      var r = root.getBoundingClientRect();
      tx = (((e.clientX - r.left) / Math.max(1, r.width)) - 0.5) * -34;
      ty = (((e.clientY - r.top) / Math.max(1, r.height)) - 0.5) * -22;
      if (!raf) raf = requestAnimationFrame(write);
    });
    on(root, 'mouseleave', function () { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(write); });
  }

  /* ── contact form ────────────────────────────────────────────────────────
     Client-side only. There is no endpoint wired, and the form says so
     rather than pretending to send — a form that silently drops a real
     enquiry is worse than one that admits it is a mockup. */
  function form() {
    var f = one('form[data-contact]');
    if (!f) return;
    var ok = one('[data-form-ok]', f.parentNode) || one('[data-form-ok]');

    function fieldOf(input) { return input.closest('.field'); }
    function fail(input, msg) {
      var wrap = fieldOf(input); if (!wrap) return;
      wrap.setAttribute('data-invalid', 'true');
      var e = one('.field__err', wrap); if (e) e.textContent = msg;
      input.setAttribute('aria-invalid', 'true');
    }
    function pass(input) {
      var wrap = fieldOf(input); if (!wrap) return;
      wrap.setAttribute('data-invalid', 'false');
      var e = one('.field__err', wrap); if (e) e.textContent = '';
      input.removeAttribute('aria-invalid');
    }
    function check(input) {
      var v = (input.value || '').trim();
      if (input.required && !v) { fail(input, 'This field is required.'); return false; }
      if (input.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
        fail(input, 'Enter a valid email address.'); return false;
      }
      pass(input); return true;
    }

    all('input,textarea,select', f).forEach(function (i) {
      on(i, 'blur', function () { if ((i.value || '').trim() || i.required) check(i); });
      on(i, 'input', function () { if (fieldOf(i) && fieldOf(i).getAttribute('data-invalid') === 'true') check(i); });
    });

    on(f, 'submit', function (e) {
      e.preventDefault();
      var inputs = all('input,textarea,select', f);
      var bad = null;
      inputs.forEach(function (i) { if (!check(i) && !bad) bad = i; });
      if (bad) { bad.focus(); return; }
      f.hidden = true;
      if (ok) { ok.hidden = false; ok.setAttribute('tabindex', '-1'); ok.focus(); }
      console.info('[v27] form validated. No endpoint is wired — nothing was sent.');
    });
  }


  /* ── seq: scroll-driven roll call ──────────────────────────────────────
     Maps pin-scroll progress to how many items have arrived. The stage is
     sticky for (items x 52vh) of travel; each threshold flips one item on.
     Small screens and reduced motion get a plain grid instead of a pin. */
  function seq() {
    var root = one('[data-seq]');
    if (!root) return;
    var stage = one('.seq__stage', root);
    var items = all('.seq__item', root);
    if (!stage || !items.length) return;

    // Reduced motion only. Screen WIDTH used to force this same fallback —
    // a compromise the design explicitly should not make — replaced by the
    // contain-fit canvas below, which keeps the exact wave/curve/positions
    // at any size instead of swapping in a plain grid.
    if (RM) {
      root.classList.add('seq--static');
      items.forEach(function (it) { it.setAttribute('data-on', 'true'); });
      return;
    }

    // Contain-fit the 1440x900 canvas (curve + all six items) into the real
    // stage box — same technique as the constellation's .v20fit, so the wave
    // shape and every relative position stay identical at any screen size;
    // only the zoom level changes. min(), not the constellation's height-only
    // fit, because this stage is a portrait-friendly sticky panel (not a
    // pannable map) and must never spill past its own width.
    function fit() {
      var w = stage.clientWidth, h = stage.clientHeight;
      if (!w || !h) return;
      var k = Math.min(w / 1440, h / 900);
      root.style.setProperty('--seqk', k.toFixed(4));
      // Damped caption recovery: below k=1, captions get SOME of their size
      // back (sqrt curve) rather than all of it — full recovery collided at
      // phone widths (measured directly, not guessed). At k>=1 this is
      // exactly 1, i.e. no change from the original undamped behaviour.
      var capK = k < 1 ? Math.min(2.4, 1 / Math.sqrt(k)) : 1;
      root.style.setProperty('--seqCapK', capK.toFixed(4));
    }
    fit();
    on(window, 'resize', fit);

    root.style.height = (100 + items.length * 52) + 'vh';
    var count = one('.seq__count', root);
    var line = one('.seq__line path', root);
    var raf = 0, lastN = -1;
    function apply() {
      raf = 0;
      var r = root.getBoundingClientRect();
      var span = Math.max(1, r.height - stage.offsetHeight);
      var p = clamp(-r.top / span, 0, 1);
      // the connecting line draws continuously; portraits pop as it passes
      if (line) setStyle(line, 'strokeDashoffset', (1 - p).toFixed(4));
      var n = Math.min(items.length, Math.floor(p * (items.length + 1)));
      if (n === lastN) return;
      lastN = n;
      items.forEach(function (it, i) { it.setAttribute('data-on', i < n ? 'true' : 'false'); });
      if (count) count.textContent =
        String(n).padStart(2, '0') + ' — ' + String(items.length).padStart(2, '0');
    }
    function queue() { if (!raf) raf = requestAnimationFrame(apply); }
    on(window, 'scroll', queue, { passive: true });
    on(window, 'resize', queue);
    apply();
  }


  /* ── roster: hover a name, the portrait swaps on one uniform stage ────── */
  function roster() {
    var root = one('[data-roster]');
    if (!root) return;
    var frame = one('.roster__frame', root);
    var capName = one('.roster__cap b', root);
    var capRole = one('.roster__cap span', root);
    var rows = all('.roster__row[data-photo]', root);
    if (!frame || !rows.length) return;

    var imgs = {};
    rows.forEach(function (r) {
      var src = r.getAttribute('data-photo');
      var im = document.createElement('img');
      // eager: ten small portraits — instant hover swaps, and no lazy loads
      // left mid-flight when the page is left
      im.src = src; im.alt = ''; im.loading = 'eager'; im.decoding = 'async';
      frame.appendChild(im);
      imgs[src] = im;
    });
    var current = null;
    function show(row) {
      var src = row.getAttribute('data-photo');
      if (current === src) return;
      current = src;
      Object.keys(imgs).forEach(function (k) { imgs[k].classList.toggle('on', k === src); });
      rows.forEach(function (r) { r.setAttribute('data-on', r === row ? 'true' : 'false'); });
      if (capName) capName.textContent = row.getAttribute('data-name') || '';
      if (capRole) capRole.textContent = row.getAttribute('data-role') || '';
    }
    rows.forEach(function (r) {
      on(r, 'mouseenter', function () { show(r); });
      on(r, 'focus', function () { show(r); });
      on(r, 'click', function () { show(r); });
    });
    show(rows[0]);
  }

  /* ── mark the current page in the nav ────────────────────────────────── */
  function currentNav() {
    var here = location.pathname.split('/').pop() || 'index.html';
    all('.nav__link, .drawer__link').forEach(function (a) {
      var href = (a.getAttribute('href') || '').split('/').pop().split('#')[0];
      if (href && href === here) a.setAttribute('aria-current', 'page');
    });
  }

  function boot() {
    header(); drawer(); reveal(); drift(); video(); heroParallax();
    flow(); tabs(); accordion(); counters(); tease(); form(); seq(); roster(); currentNav();
    document.documentElement.setAttribute('data-v27', 'ready');
  }
  if (document.readyState === 'loading') on(document, 'DOMContentLoaded', boot);
  else boot();
})();
