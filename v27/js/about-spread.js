/* ==========================================================================
   USAIndiaCFO — v27 · About page "business spread"

   Builds the footprint map (India → the corridor → the USA) into the stage
   SVG from lon/lat data, then drives it from scroll:

     p = -pinTop / (pinHeight - stageHeight), 0..1, one rAF per scroll event

     0.00–0.12  the slab unfolds: width first, then height, corners last
     0.13–0.43  India draws; Ajmer → Jaipur → Mumbai arrive along a route
     0.46–0.62  the corridor arc, Mumbai → New York; pulse + caption
     0.62–0.95  the USA draws; six client states light up one by one

   Same rules as site.js: one rAF, dirty-checked writes, reduced motion is
   honoured by rendering the final state statically. Below 940px the stage
   is hidden and two cards are built instead (see about-spread.css).
   ========================================================================== */
(function () {
  'use strict';

  var root = document.querySelector('[data-spread]');
  if (!root) return;

  var RM = false, FINE = false;
  try { RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  try { FINE = window.matchMedia('(hover: hover) and (pointer: fine)').matches; } catch (e) {}

  var NS = 'http://www.w3.org/2000/svg';
  var on = function (el, ev, fn, opt) { if (el) el.addEventListener(ev, fn, opt || false); };
  var all = function (sel, r) { return Array.prototype.slice.call((r || root).querySelectorAll(sel)); };
  var one = function (sel, r) { return (r || root).querySelector(sel); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var seg = function (p, a, b) { return clamp((p - a) / (b - a), 0, 1); };
  var easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };
  var easeInOut = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

  function setStyle(el, prop, val) {
    if (!el) return;
    var k = '__s_' + prop;
    if (el[k] === val) return;
    el[k] = val; el.style[prop] = val;
  }
  function setVar(el, name, val) {
    var k = '__v_' + name;
    if (el[k] === val) return;
    el[k] = val; el.style.setProperty(name, val);
  }
  function setOn(el, v) {
    if (!el) return;
    var s = v ? 'true' : 'false';
    if (el.__on === s) return;
    el.__on = s; el.setAttribute('data-on', s);
  }
  function mk(name, attrs, parent, cls) {
    var el = document.createElementNS(NS, name);
    if (attrs) for (var k in attrs) if (attrs.hasOwnProperty(k)) el.setAttribute(k, attrs[k]);
    if (cls) el.setAttribute('class', cls);
    if (parent) parent.appendChild(el);
    return el;
  }

  /* ── geometry ──────────────────────────────────────────────────────────
     Hand-simplified outlines as [lon, lat], clockwise. Equirectangular per
     country, with the box aspect chosen so each reads true to its shape
     (cos of mid-latitude folded into width:height). */
  var USA = [
    [-124.7, 48.4], [-95.2, 49.0], [-89.6, 48.0], [-84.3, 46.5], [-82.4, 43.0], [-79.0, 42.9],
    [-76.2, 43.9], [-74.8, 45.0], [-71.5, 45.0], [-69.2, 47.4], [-67.0, 44.8], [-70.0, 42.4],
    [-72.0, 41.1], [-74.0, 40.6], [-74.9, 38.9], [-76.0, 36.9], [-75.5, 35.3], [-78.0, 33.9],
    [-80.0, 32.7], [-81.4, 30.4], [-80.5, 28.3], [-80.1, 25.6], [-81.2, 25.1], [-82.7, 27.9],
    [-83.2, 29.3], [-85.3, 29.8], [-89.3, 29.2], [-94.6, 29.4], [-97.3, 26.0], [-99.6, 27.6],
    [-103.3, 29.0], [-106.5, 31.8], [-111.0, 31.3], [-114.8, 32.5], [-117.2, 32.6],
    [-120.5, 34.5], [-122.5, 37.7], [-124.4, 40.4], [-124.1, 43.5], [-124.0, 46.3]
  ];
  var INDIA = [
    [74.0, 33.0], [74.0, 35.4], [75.5, 36.9], [78.0, 35.6], [80.2, 35.0], [79.3, 32.6],
    [80.5, 30.3], [80.1, 28.8], [88.0, 27.2], [92.1, 26.9], [95.6, 28.7], [96.7, 27.5],
    [94.3, 24.3], [93.0, 22.2], [91.3, 23.4], [92.3, 25.0], [89.8, 25.3], [88.4, 26.4],
    [88.1, 25.0], [88.9, 23.4], [89.0, 21.8], [86.9, 20.6], [84.0, 18.3], [80.3, 15.8],
    [80.2, 13.0], [79.8, 10.3], [77.5, 8.1], [76.2, 10.0], [74.8, 12.9], [73.5, 16.0],
    [72.8, 19.0], [72.6, 21.5], [70.9, 20.7], [69.0, 22.4], [68.4, 23.7], [70.6, 25.7],
    [71.9, 27.9], [74.5, 31.2]
  ];
  var GEO = {
    india: { lon: [68, 97.5], lat: [6, 36.9], aspect: 0.886, pts: INDIA },
    usa:   { lon: [-125, -67], lat: [25, 49.2], aspect: 1.91, pts: USA }
  };
  /* Offices and client states. `nudge` is a few px of separation where two
     places sit closer than a node ring — approximately right, never wrong. */
  var NODES = {
    india: [
      { id: 'ajmer',  name: 'Ajmer',  sub: 'Rajasthan',   lon: 74.63, lat: 26.45, nudge: [-10, 8] },
      { id: 'jaipur', name: 'Jaipur', sub: 'Rajasthan',   lon: 75.79, lat: 26.91, nudge: [10, -10] },
      { id: 'mumbai', name: 'Mumbai', sub: 'Maharashtra', lon: 72.88, lat: 19.08, nudge: [0, 0] }
    ],
    usa: [
      { id: 'ny', name: 'New York',       sub: 'NY · Northeast',     lon: -74.00, lat: 40.71, nudge: [3, -5] },
      { id: 'nj', name: 'New Jersey',     sub: 'NJ · Mid-Atlantic',  lon: -74.76, lat: 40.22, nudge: [-3, 10] },
      { id: 'de', name: 'Delaware',       sub: 'DE · Mid-Atlantic',  lon: -75.52, lat: 39.16, nudge: [-8, 17] },
      { id: 'nc', name: 'North Carolina', sub: 'NC · Southeast',     lon: -78.64, lat: 35.78, nudge: [0, 0] },
      { id: 'sc', name: 'South Carolina', sub: 'SC · Southeast',     lon: -81.03, lat: 34.00, nudge: [0, 0] },
      { id: 'tx', name: 'Texas',          sub: 'TX · South-central', lon: -97.74, lat: 30.27, nudge: [0, 0] }
    ]
  };

  function projector(geo, box) {
    var lon0 = geo.lon[0], lon1 = geo.lon[1], lat0 = geo.lat[0], lat1 = geo.lat[1];
    return function (lon, lat) {
      return [box.x + (lon - lon0) / (lon1 - lon0) * box.w,
              box.y + (lat1 - lat) / (lat1 - lat0) * box.h];
    };
  }
  function outline(pr, pts) {
    var d = '';
    for (var i = 0; i < pts.length; i++) {
      var q = pr(pts[i][0], pts[i][1]);
      d += (i ? ' L ' : 'M ') + q[0].toFixed(1) + ' ' + q[1].toFixed(1);
    }
    return d + ' Z';
  }
  function place(pr, node, k) {
    var q = pr(node.lon, node.lat);
    return { x: q[0] + node.nudge[0] * k, y: q[1] + node.nudge[1] * k };
  }
  function f1(n) { return (Math.round(n * 10) / 10).toString(); }

  /* ── builders ───────────────────────────────────────────────────────── */
  function node(parent, pos, n, r, label) {
    var g = mk('g', { transform: 'translate(' + f1(pos.x) + ',' + f1(pos.y) + ')',
      'data-node': n.id, 'data-on': 'false', tabindex: '0', role: 'img',
      'aria-label': n.name + ', ' + n.sub }, parent, 'sp-node');
    mk('circle', { r: r[0] + 4 }, g, 'sp-hit');
    var pop = mk('g', null, g, 'sp-pop');
    mk('circle', { r: r[0] }, pop, 'sp-ring-o');
    mk('circle', { r: r[1] }, pop, 'sp-ring');
    mk('circle', { r: r[2] }, pop, 'sp-dot');
    return g;
  }
  /* label: {x, y, anchor, lead:[[x,y],[x,y]]|null} */
  function label(parent, n, L) {
    var g = mk('g', { 'data-node': n.id, 'data-on': 'false' }, parent, 'sp-label');
    if (L.lead) {
      mk('path', { d: 'M ' + f1(L.lead[0][0]) + ' ' + f1(L.lead[0][1]) +
        ' L ' + f1(L.lead[1][0]) + ' ' + f1(L.lead[1][1]), pathLength: '1' }, g, 'sp-lead');
    }
    var pop = mk('g', null, g, 'sp-pop');
    var t1 = mk('text', { x: f1(L.x), y: f1(L.y), 'text-anchor': L.anchor }, pop, 'sp-city');
    t1.textContent = n.name;
    var t2 = mk('text', { x: f1(L.x), y: f1(L.y + 19), 'text-anchor': L.anchor }, pop, 'sp-sub');
    t2.textContent = n.sub.toUpperCase();
    return g;
  }

  /* The full stage: both countries, the corridor, labels with leaders. */
  function buildStage(svg) {
    var R = {};
    var map = mk('g', null, svg, 'sp-layer sp-layer--map');
    var lab = mk('g', null, svg, 'sp-layer sp-layer--labels');

    // faint scaffolding — three latitude sweeps, the corridor diagram's own
    R.scaffold = [
      'M -20 500 Q 720 432 1460 500', 'M -20 592 Q 720 524 1460 592', 'M -20 684 Q 720 616 1460 684'
    ].map(function (d) { return mk('path', { d: d, pathLength: '1' }, map, 'sp-scaffold sp-dash'); });

    var IB = { x: 940, y: 112, w: 430, h: 430 / GEO.india.aspect };
    var UB = { x: 55, y: 165, w: 640, h: 640 / GEO.usa.aspect };
    var pi = projector(GEO.india, IB), pu = projector(GEO.usa, UB);
    var di = outline(pi, INDIA), du = outline(pu, USA);

    R.indiaFill = mk('path', { d: di, 'data-on': 'false' }, map, 'sp-land-fill');
    R.india = mk('path', { d: di, pathLength: '1' }, map, 'sp-land sp-dash');
    R.usaFill = mk('path', { d: du, 'data-on': 'false' }, map, 'sp-land-fill');
    R.usa = mk('path', { d: du, pathLength: '1' }, map, 'sp-land sp-dash');

    var P = {};
    NODES.india.forEach(function (n) { P[n.id] = place(pi, n, 1); });
    NODES.usa.forEach(function (n) { P[n.id] = place(pu, n, 1); });
    R.P = P;

    // the route: Ajmer → Jaipur, then Jaipur → Mumbai bowing east so it never
    // retraces over Ajmer
    var a = P.ajmer, j = P.jaipur, m = P.mumbai, ny = P.ny;
    R.seg1 = mk('path', { d: 'M ' + f1(a.x) + ' ' + f1(a.y) + ' L ' + f1(j.x) + ' ' + f1(j.y),
      pathLength: '1' }, map, 'sp-route sp-dash');
    R.seg2 = mk('path', { d: 'M ' + f1(j.x) + ' ' + f1(j.y) + ' Q ' + f1(j.x + 40) + ' ' +
      f1((j.y + m.y) / 2 + 26) + ' ' + f1(m.x) + ' ' + f1(m.y), pathLength: '1' }, map, 'sp-route sp-dash');

    // the corridor: one arc, Mumbai to New York. It leaves Mumbai westward
    // over the Arabian Sea (clear of the Ajmer label), rises like a great
    // circle and comes down into New York from the north-east.
    var c1 = [m.x - 230, m.y - 180], c2 = [ny.x + 160, ny.y - 230];
    R.arc = mk('path', { d: 'M ' + f1(m.x) + ' ' + f1(m.y) + ' C ' + f1(c1[0]) + ' ' + f1(c1[1]) +
      ' ' + f1(c2[0]) + ' ' + f1(c2[1]) + ' ' + f1(ny.x) + ' ' + f1(ny.y), pathLength: '1' }, map, 'sp-arc sp-dash');
    var px = (m.x + 3 * c1[0] + 3 * c2[0] + ny.x) / 8, py = (m.y + 3 * c1[1] + 3 * c2[1] + ny.y) / 8;
    R.pulse = mk('circle', { cx: f1(px), cy: f1(py), r: 4, 'data-on': 'false' }, map, 'sp-pulse pulse');
    R.arcCap = mk('text', { x: f1(px), y: f1(py - 26), 'text-anchor': 'middle', 'data-on': 'false' }, lab, 'sp-arc-cap');
    R.arcCap.textContent = 'ONE ENGAGEMENT · 9H 30M APART';

    var r = [24, 12, 4.2];
    R.nodes = {}; R.labels = {};
    NODES.india.forEach(function (n) { R.nodes[n.id] = node(map, P[n.id], n, r); });
    NODES.usa.forEach(function (n) { R.nodes[n.id] = node(map, P[n.id], n, r); });

    // India labels sit beside their node; Ajmer's drops below-left so it
    // clears both the western border and Jaipur's ring
    R.labels.jaipur = label(lab, NODES.india[1], { x: j.x + 26, y: j.y + 7, anchor: 'start', lead: null });
    R.labels.ajmer  = label(lab, NODES.india[0], { x: a.x + 22, y: a.y + 42, anchor: 'end', lead: null });
    R.labels.mumbai = label(lab, NODES.india[2], { x: m.x + 2, y: m.y + 44, anchor: 'end', lead: null });

    // the east-coast five fan out to one column off the coast; Texas drops
    // to the lower-left, over the border, so nothing sits on a coastline
    var colX = 716, ys = [302, 344, 386, 428, 470];
    ['ny', 'nj', 'de', 'nc', 'sc'].forEach(function (id, i) {
      var n = NODES.usa[i], q = P[id];
      R.labels[id] = label(lab, n, { x: colX, y: ys[i], anchor: 'start',
        lead: [[q.x + 16, q.y + (ys[i] - 6 - q.y) * 16 / (colX - 10 - q.x)], [colX - 10, ys[i] - 6]] });
    });
    var t = P.tx;
    R.labels.tx = label(lab, NODES.usa[5], { x: t.x - 40, y: t.y + 50, anchor: 'end',
      lead: [[t.x - 10, t.y + 12], [t.x - 32, t.y + 40]] });

    R.map = map; R.lab = lab;
    return R;
  }

  /* One country for a <940px card: outline + route + nodes, labels are the
     hairline rows beneath the card. */
  function buildCard(svg, which) {
    var map = mk('g', null, svg, 'sp-layer');
    var box = which === 'india' ? { x: 90, y: 8, w: 250, h: 250 / GEO.india.aspect }
                                : { x: 30, y: 24, w: 360, h: 360 / GEO.usa.aspect };
    var geo = GEO[which], pr = projector(geo, box), d = outline(pr, geo.pts);
    mk('path', { d: d }, map, 'sp-land-fill');
    mk('path', { d: d, pathLength: '1' }, map, 'sp-land');
    var P = {};
    var k = which === 'india' ? 1.1 : 0.7;
    NODES[which].forEach(function (n) { P[n.id] = place(pr, n, k); });
    if (which === 'india') {
      var a = P.ajmer, j = P.jaipur, m = P.mumbai;
      mk('path', { d: 'M ' + f1(a.x) + ' ' + f1(a.y) + ' L ' + f1(j.x) + ' ' + f1(j.y) +
        ' Q ' + f1(j.x + 26) + ' ' + f1((j.y + m.y) / 2 + 16) + ' ' + f1(m.x) + ' ' + f1(m.y),
        pathLength: '1' }, map, 'sp-route');
    }
    var r = which === 'india' ? [18, 9, 3.4] : [14, 7, 3];
    var delays = which === 'india' ? [1.3, 2.1, 3.3] : [1.4, 1.65, 1.9, 2.15, 2.4, 2.65];
    NODES[which].forEach(function (n, i) {
      var g = node(map, P[n.id], n, r);
      g.style.setProperty('--d', delays[i] + 's');
    });
  }

  /* ── hover: one brightens, the rest step back ───────────────────────── */
  function wireHover(scope, svg) {
    var items = all('[data-node]', scope);
    var current = null;
    function set(id) {
      if (current === id) return;
      current = id;
      items.forEach(function (el) { el.classList.toggle('is-hover', !!id && el.getAttribute('data-node') === id); });
      scope.setAttribute('data-hovering', id ? 'true' : 'false');
    }
    items.forEach(function (el) {
      var id = el.getAttribute('data-node');
      if (FINE) {
        on(el, 'pointerenter', function () { set(id); });
        on(el, 'pointerleave', function () { set(null); });
      }
      on(el, 'focus', function () { set(id); });
      on(el, 'blur', function () { set(null); });
      // a tap focuses first (which already selects), so click must select,
      // never toggle — clearing is blur, or a tap outside the map on touch
      on(el, 'click', function () { set(id); });
    });
    if (!FINE) on(document, 'pointerdown', function (e) { if (!scope.contains(e.target)) set(null); });
    return set;
  }

  /* ── desktop stage ──────────────────────────────────────────────────── */
  function stageInit() {
    var pin = one('.spread__pin'), stage = one('.spread__stage'), svg = one('.spread__svg');
    var ref = one('.spread__ref'), hdr = document.querySelector('.hdr');
    if (!pin || !stage || !svg) return;
    var R = buildStage(svg);
    var caps = all('.spread__cap-item', stage), count = one('.spread__count', stage);
    var usOrder = ['ny', 'nj', 'de', 'nc', 'sc', 'tx'];
    var hx = 0, vy = 0, raf = 0, hdrOver = null;   // window insets, measured below

    wireHover(svg, svg);

    function paint(p, enter) {
      // the scaffolding draws as the stage first comes into view (enter 0..1),
      // so the slab is never a blank card before the pin begins
      var sc = Math.max(enter == null ? 1 : enter, seg(p, 0, .14));
      R.scaffold.forEach(function (el, i) { setStyle(el, 'strokeDashoffset', (1 - seg(sc, i * .1, .8 + i * .1)).toFixed(4)); });

      // 0 · the unfold
      var ew = easeOut(seg(p, 0, .08)), eh = easeOut(seg(p, .03, .12)), er = easeInOut(seg(p, .02, .10));
      setVar(stage, '--cl', f1(hx * (1 - ew)) + 'px');
      setVar(stage, '--cr', f1(hx * (1 - ew)) + 'px');
      setVar(stage, '--ct', f1(vy * (1 - eh)) + 'px');
      setVar(stage, '--cb', f1(vy * (1 - eh)) + 'px');
      setVar(stage, '--rr', f1(38 * (1 - er)) + 'px');
      setVar(stage, '--sy', f1(18 * (1 - eh)) + 'px');
      setVar(stage, '--cast', (Math.round(clamp(1 - ew * 1.3, 0, 1) * 100) / 100).toString());

      // 1 · India
      var ind = seg(p, .13, .25);
      setStyle(R.india, 'strokeDashoffset', (1 - ind).toFixed(4));
      setOn(R.indiaFill, ind >= 1);
      setOn(R.nodes.ajmer, p >= .25); setOn(R.labels.ajmer, p >= .255);
      setStyle(R.seg1, 'strokeDashoffset', (1 - seg(p, .27, .31)).toFixed(4));
      setOn(R.nodes.jaipur, p >= .31); setOn(R.labels.jaipur, p >= .315);
      setStyle(R.seg2, 'strokeDashoffset', (1 - seg(p, .31, .43)).toFixed(4));
      setOn(R.nodes.mumbai, p >= .43); setOn(R.labels.mumbai, p >= .435);

      // 2 · the corridor
      setStyle(R.arc, 'strokeDashoffset', (1 - seg(p, .46, .62)).toFixed(4));
      setOn(R.pulse, p >= .58); setOn(R.arcCap, p >= .58);

      // 3 · the USA
      var us = seg(p, .62, .73);
      setStyle(R.usa, 'strokeDashoffset', (1 - us).toFixed(4));
      setOn(R.usaFill, us >= 1);
      usOrder.forEach(function (id, i) {
        var t = .75 + i * .04;
        setOn(R.nodes[id], p >= t); setOn(R.labels[id], p >= t + .005);
      });

      // caption
      var st = p >= .63 ? 2 : p >= .45 ? 1 : 0;
      caps.forEach(function (c, i) { setOn(c, i === st); });
      if (count) { var txt = '0' + (st + 1) + ' — 03'; if (count.__t !== txt) { count.__t = txt; count.textContent = txt; } }
    }

    // reduced motion: final state, no pin
    if (RM) {
      root.classList.add('spread--static');
      paint(1);
      return;
    }

    function measure() {
      var vw = stage.clientWidth, vh = stage.clientHeight;
      if (!vw || !vh) return false;
      var gut = ref ? parseFloat(getComputedStyle(ref).paddingLeft) || 0 : 0;
      var w0 = ref ? ref.getBoundingClientRect().width - 2 * gut : vw * .8;
      var h0 = clamp(w0 / 1.75, 320, vh * .78);
      hx = (vw - w0) / 2; vy = (vh - h0) / 2;
      return true;
    }
    function apply() {
      raf = 0;
      if (!stage.clientHeight) return;            // hidden (<940px)
      var r = pin.getBoundingClientRect();
      var span = Math.max(1, pin.offsetHeight - stage.offsetHeight);
      var p = clamp(-r.top / span, 0, 1);
      var sh = stage.offsetHeight;
      paint(p, clamp((sh * 1.1 - r.top) / (sh * .7), 0, 1));
      // The chrome inverts while the full-bleed slab is under it. The page
      // has no [data-chrome-dark] band, so site.js never touches this class.
      if (hdr) {
        var sr = stage.getBoundingClientRect(), hh = hdr.offsetHeight * .55;
        var top = sr.top + vy * (1 - easeOut(seg(p, .03, .12)));
        var bottom = sr.bottom - vy * (1 - easeOut(seg(p, .03, .12)));
        var over = top <= hh && bottom >= hh && easeOut(seg(p, 0, .08)) > .6;
        if (over !== hdrOver) { hdrOver = over; hdr.classList.toggle('hdr--over-dark', over); }
      }
    }
    function queue() { if (!raf) raf = requestAnimationFrame(apply); }
    measure();
    on(window, 'scroll', queue, { passive: true });
    on(window, 'resize', function () { measure(); queue(); });
    apply();

    // parallax: the label layer drifts a little more than the map
    if (FINE) {
      var tx = 0, ty = 0, mx = 0, my = 0, lx = 0, ly = 0, praf = 0;
      function step() {
        praf = 0;
        mx += (tx * -7 - mx) * .09; my += (ty * -5 - my) * .09;
        lx += (tx * -15 - lx) * .09; ly += (ty * -10 - ly) * .09;
        setStyle(R.map, 'transform', 'translate(' + mx.toFixed(2) + 'px,' + my.toFixed(2) + 'px)');
        setStyle(R.lab, 'transform', 'translate(' + lx.toFixed(2) + 'px,' + ly.toFixed(2) + 'px)');
        if (Math.abs(lx - tx * -15) > .05 || Math.abs(ly - ty * -10) > .05) praf = requestAnimationFrame(step);
      }
      function nudge() { if (!praf) praf = requestAnimationFrame(step); }
      on(stage, 'mousemove', function (e) {
        var r = stage.getBoundingClientRect();
        tx = (e.clientX - r.left) / Math.max(1, r.width) - .5;
        ty = (e.clientY - r.top) / Math.max(1, r.height) - .5;
        nudge();
      });
      on(stage, 'mouseleave', function () { tx = 0; ty = 0; nudge(); });
    }
  }

  /* ── <940px cards ───────────────────────────────────────────────────── */
  function cardsInit() {
    all('.spread__m-card').forEach(function (card) {
      var svg = one('.spread__m-svg', card);
      if (!svg) return;
      buildCard(svg, svg.getAttribute('data-map'));
      wireHover(card, svg);
    });
  }

  stageInit();
  cardsInit();
})();
