/* ==========================================================================
   USAIndiaCFO — v27 · home-window.js
   Drives "the window" (css/home-window.css): the constellation slab that
   opens into the page, wipes to the live map, and closes again.

   Progress p runs 0→1 over the pinned section (sticky 100svh stage inside
   a 320vh section):   p = clamp(-top / (sectionH - stageH), 0, 1)
     0.00 – 0.30  open   : rotateX 7°→0, scale .86→1, the frame grows to the
                            stage (+--r-xl overshoot), the cast shadow fades
     0.30 – 0.72  reveal : 61° feathered wipe takes the cover away; "Think"
                            and "globally." travel to opposite corners, the
                            CTA slides to the bottom edge; sub/eyebrow fade
     0.78 – 1.00  close  : the copy returns, a centre veil rises, the frame
                            shrinks back into its card (the map stays)

   Same rules as site.js: one rAF, no per-frame allocation, every write is
   dirty-checked, layout is read once per frame and never after a write.
   Relies on site.js's tease() having built the world (site.js boots first).
   ========================================================================== */
(function () {
  'use strict';

  var RM = false;
  try { RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  var root = document.querySelector('[data-window]');
  if (!root) return;

  var one = function (sel, r) { return (r || root).querySelector(sel); };
  var all = function (sel, r) { return Array.prototype.slice.call((r || root).querySelectorAll(sel)); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var seg = function (p, a, b) { return clamp((p - a) / (b - a), 0, 1); };
  var smooth = function (t) { return t * t * (3 - 2 * t); };
  var px = function (v) { return parseFloat(v) || 0; };

  var stage = one('.win__stage'), frame = one('.win__frame'), shadow = one('.win__shadow'),
      view = one('.win__view'), cover = one('.win__cover'), edge = one('.win__edge'),
      veil = one('.win__veil'), teaseRoot = one('[data-tease]'), measureStack = one('.win__stack--acts');
  if (!stage || !frame || !view || !cover || !measureStack) return;

  /* Write only when the value changed (same idea as site.js setStyle). */
  function set(el, prop, val) {
    if (!el) return;
    var k = '__w_' + prop;
    if (el[k] === val) return;
    el[k] = val;
    el.style[prop] = val;
  }
  function setVar(el, name, val) {
    var k = '__v_' + name;
    if (el[k] === val) return;
    el[k] = val;
    el.style.setProperty(name, val);
  }

  var NAMES = ['w1', 'w2', 'sub', 'eye', 'acts'];
  var pieces = {};
  NAMES.forEach(function (n) { pieces[n] = all('[data-piece="' + n + '"]'); });

  var vw = 0, vh = 0, exF = 1, eyF = 1, mobile = false;
  var tg = { w1: { x: 0, y: 0 }, w2: { x: 0, y: 0 }, sub: { x: 0, y: -14 }, eye: { x: 0, y: -10 }, acts: { x: 0, y: 0 } };
  var lastP = 0, lastA = 0;

  /* ── measure: stage size, frame size, corner targets ──────────────────
     Reads come after the one write (the view's size) so there is a single
     reflow. Targets are deltas from each piece's centred layout position
     to its corner, in stage px — the open view IS the stage. */
  function measure() {
    var cs = getComputedStyle(root);
    var R = px(cs.getPropertyValue('--r-xl')) || 38;
    var gutter = px(cs.getPropertyValue('--gutter')) || 60;
    mobile = window.innerWidth <= 940;                     // the CSS breakpoint

    vw = stage.clientWidth; vh = stage.clientHeight;
    if (!RM) {                                             // static: CSS fills the stage
      view.style.width = vw + 'px'; view.style.height = vh + 'px';
      view.style.margin = (-vh / 2) + 'px 0 0 ' + (-vw / 2) + 'px';
    }

    var cw = frame.offsetWidth || 1, ch = frame.offsetHeight || 1;
    exF = (vw + 2 * R) / cw;
    eyF = (vh + 2 * R) / ch;

    // Same fit tease() computes, from layout boxes (transform-free), so the
    // small-screen pan in CSS can be expressed in world units.
    if (teaseRoot) {
      var wk = Math.max(teaseRoot.clientWidth / 1320, teaseRoot.clientHeight / 560, 1) * 1.04;
      setVar(root, '--wk', wk.toFixed(4));
    }

    var w1 = one('[data-piece="w1"]', measureStack), w2 = one('[data-piece="w2"]', measureStack),
        acts = one('[data-piece="acts"]', measureStack);
    if (!w1 || !w2 || !acts) return;
    // below the condensed header (.hdr--stuck is 82px), with breathing room
    var top = 82 + (mobile ? 18 : 24);
    tg.w1.x = gutter - w1.offsetLeft;
    tg.w1.y = top - w1.offsetTop;
    if (mobile) {
      // the bottom-right is too narrow: the whole line travels to the
      // top-left as one unit (same delta, so the words never cross)
      tg.w2.x = tg.w1.x;
      tg.w2.y = tg.w1.y;
    } else {
      tg.w2.x = (vw - gutter - w2.offsetWidth) - w2.offsetLeft;
      tg.w2.y = (vh - gutter * .75 - w2.offsetHeight) - w2.offsetTop;
    }
    // the button slides straight down to the bottom edge: the world's node
    // field leaves its centre column empty by design, so nothing is under it
    tg.acts.x = 0;
    tg.acts.y = (vh - gutter - acts.offsetHeight) - acts.offsetTop;
  }

  /* ── draw: p → every transform/opacity, dirty-checked ─────────────── */
  var maskA = -1;
  function draw(p) {
    var E1 = smooth(seg(p, 0, .3)),       // open
        E2 = smooth(seg(p, .3, .72)),     // reveal
        E3 = smooth(seg(p, .8, 1)),       // close (frame + veil)
        E3t = smooth(seg(p, .78, .9));    // close (copy comes home first)
    var A = E1 * (1 - E3);                // openness of the frame
    var T = E2 * (1 - E3t);               // travel of the copy
    var W = E2;                           // the wipe — never reverses
    var V = E3;                           // centre veil
    if (RM) { A = 1; T = 1; W = 1; V = 0; }
    lastA = A;

    var ex = lerp(1, exF, A), ey = lerp(1, eyF, A);
    var g, tf;
    if (mobile) {
      g = lerp(.9, 1, A);
      tf = 'scale(' + (g * ex).toFixed(4) + ',' + (g * ey).toFixed(4) + ')';
    } else {
      g = lerp(.86, 1, A);
      tf = 'perspective(1400px) translate3d(0,' + lerp(44, 0, A).toFixed(1) + 'px,0) rotateX(' +
           lerp(7, 0, A).toFixed(2) + 'deg) scale(' + (g * ex).toFixed(4) + ',' + (g * ey).toFixed(4) + ')';
    }
    set(frame, 'transform', tf);
    set(shadow, 'transform', tf);
    set(shadow, 'opacity', (1 - clamp(A * 3.2, 0, 1)).toFixed(3));
    set(view, 'transform', 'scale(' + (1 / ex).toFixed(4) + ',' + (1 / ey).toFixed(4) + ')');
    setVar(root, '--lit', (hover * (1 - clamp(A * 2.4, 0, 1))).toFixed(2));

    // the wipe: a 61° gradient mask with an 8% feather, bottom-left first
    if (W <= 0) {
      set(cover, 'visibility', 'visible');
      if (maskA !== -1) { maskA = -1; cover.style.webkitMaskImage = cover.style.maskImage = 'none'; }
    } else if (W >= 1) {
      set(cover, 'visibility', 'hidden');
    } else {
      set(cover, 'visibility', 'visible');
      var a = Math.round(lerp(-8, 100, W) * 4) / 4;
      if (a !== maskA) {
        maskA = a;
        var m = 'linear-gradient(61deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) ' + a + '%, #000 ' + (a + 8) + '%, #000 100%)';
        cover.style.webkitMaskImage = m; cover.style.maskImage = m;
      }
    }

    // the copy: each piece moves between its centred and corner positions
    var n, i, t, s, list;
    for (n = 0; n < NAMES.length; n++) {
      t = tg[NAMES[n]]; list = pieces[NAMES[n]];
      s = 'translate3d(' + (t.x * T).toFixed(1) + 'px,' + (t.y * T).toFixed(1) + 'px,0)';
      for (i = 0; i < list.length; i++) set(list[i], 'transform', s);
    }
    // gone by 18% of the travel, back only for the last 18% — so the sub
    // never sits under a headline that is still in flight
    var fade = (1 - clamp(T * 5.5, 0, 1)).toFixed(3);
    for (i = 0; i < pieces.sub.length; i++) set(pieces.sub[i], 'opacity', fade);
    for (i = 0; i < pieces.eye.length; i++) set(pieces.eye[i], 'opacity', fade);

    set(veil, 'opacity', V.toFixed(3));
  }

  /* ── scroll: progress through the pinned section ──────────────────── */
  var raf = 0;
  function apply() {
    raf = 0;
    if (RM) { draw(1); return; }
    var r = root.getBoundingClientRect();
    var span = Math.max(1, r.height - vh);
    lastP = clamp(-r.top / span, 0, 1);
    draw(lastP);
  }
  function queue() { if (!raf) raf = requestAnimationFrame(apply); }

  /* ── resize ─────────────────────────────────────────────────────────
     Registered NOW, before site.js boots, so it runs ahead of tease()'s
     own resize fit. tease() measures [data-tease] with getBoundingClientRect,
     which includes our ancestors' transforms — so for the length of the
     event the frame and view are put back to identity and re-measured
     (nothing paints in between: the restore is queued in the same
     frame's rAF). */
  var mraf = 0;
  function onResize() {
    frame.style.transform = 'none'; frame.__w_transform = 'none';
    view.style.transform = 'none'; view.__w_transform = 'none';
    // measure NOW, not in the rAF: the view's size is inline px, and tease()
    // reads the box synchronously in its own (later) resize listener
    measure();
    if (!mraf) mraf = requestAnimationFrame(function () { mraf = 0; apply(); });
  }
  window.addEventListener('resize', onResize);

  /* ── pointer: the slab's edge catches the light where the cursor is ── */
  var hover = 0, mx = 50, my = -30, praf = 0;
  function writePointer() {
    praf = 0;
    setVar(edge, '--mx', mx.toFixed(1) + '%');
    setVar(edge, '--my', my.toFixed(1) + '%');
    setVar(root, '--lit', (hover * (1 - clamp(lastA * 2.4, 0, 1))).toFixed(2));
  }
  function pointer() {
    if (RM || !edge) return;
    stage.addEventListener('mousemove', function (e) {
      var r = frame.getBoundingClientRect();
      mx = clamp((e.clientX - r.left) / Math.max(1, r.width), -.2, 1.2) * 100;
      my = clamp((e.clientY - r.top) / Math.max(1, r.height), -.2, 1.2) * 100;
      hover = 1;
      if (!praf) praf = requestAnimationFrame(writePointer);
    });
    stage.addEventListener('mouseleave', function () {
      hover = 0;
      if (!praf) praf = requestAnimationFrame(writePointer);
    });
  }

  function init() {
    if (RM) {
      root.classList.add('win--static');
      measure(); draw(1);
      return;
    }
    root.style.height = '320vh';
    measure();
    apply();
    pointer();
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('load', onResize);
    // the corner targets depend on Newsreader's metrics
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize);
  }

  // reduced motion: the static class must be on before first paint
  if (RM) root.classList.add('win--static');

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
