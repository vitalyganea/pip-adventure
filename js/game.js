/* ===========================================================
   game.js — game engine (physics, collisions, rendering)
   =========================================================== */
var Game = (function () {
  'use strict';

  /* ------------------------ constants ------------------------ */
  var TILE = 48;
  /* The world is always BASE_H tall; the visible width follows the viewport's
     aspect ratio, clamped so ultra-narrow / ultra-wide screens stay playable.
     Anything left over is pillar/letterboxed by the page (Design req. 1). */
  var BASE_H = 540, MIN_W = 640, MAX_W = 1400;
  var VIEW_W = 960, VIEW_H = BASE_H;
  var STEP_MS = 1000 / 60;

  var GRAVITY   = 0.60,  MAX_FALL = 16;
  var ACC       = 0.85,  MAX_SPD  = 5.0;
  var FRIC_GND  = 0.80,  FRIC_AIR = 0.93;
  var JUMP_V    = 14.2,  SPRING_V = 21.0;
  var COYOTE    = 8,     BUFFER   = 9;
  var HEARTS_MAX = 3;

  /* -------------------------- themes ------------------------- */
  var THEMES = [
    { /* 0 forest */
      sky:['#7fd8ff','#dff7ff'], orb:'#fff4bd', orbGlow:'rgba(255,244,189,.55)',
      hillFar:'#96dc90', hillNear:'#57bd62',
      grass:'#5fd35c', grassDk:'#38a43c', dirt:'#c58a58', dirtDk:'#9a6438',
      plank:'#b3793f', plankTop:'#6fd36a',
      water:'#3fb0e8', deco:'#2f8f3a', tree:'#2f8f3a', trunk:'#8a5a34',
      flake:'rgba(255,255,255,.65)', flakeShape:'leaf'
    },
    { /* 1 desert */
      sky:['#ffd08f','#fff0cf'], orb:'#fff0b0', orbGlow:'rgba(255,224,150,.55)',
      hillFar:'#eec48b', hillNear:'#dca866',
      grass:'#f2cc73', grassDk:'#cca34d', dirt:'#dcaa6d', dirtDk:'#b07f46',
      plank:'#b5814a', plankTop:'#f2cc73',
      water:'#46c5e0', deco:'#c98f46', tree:'#5fa85a', trunk:'#9a6a3a',
      flake:'rgba(255,240,200,.5)', flakeShape:'sand'
    },
    { /* 2 candy */
      sky:['#ffc0e6','#fff0f8'], orb:'#fff6d8', orbGlow:'rgba(255,220,240,.6)',
      hillFar:'#ffaadb', hillNear:'#ff83c6',
      grass:'#ff92d2', grassDk:'#e2529f', dirt:'#f7cfe8', dirtDk:'#d194bf',
      plank:'#d194bf', plankTop:'#ff92d2',
      water:'#9b7bff', deco:'#e2529f', tree:'#ff6fb5', trunk:'#c06a9a',
      flake:'rgba(255,255,255,.75)', flakeShape:'heart'
    },
    { /* 3 ice */
      sky:['#b6e7ff','#f2fbff'], orb:'#ffffff', orbGlow:'rgba(255,255,255,.6)',
      hillFar:'#d5edf9', hillNear:'#a9d6ee',
      grass:'#ecf9ff', grassDk:'#b4dcf1', dirt:'#a3c6db', dirtDk:'#7fa4bd',
      plank:'#7fa4bd', plankTop:'#ecf9ff',
      water:'#2e9fe0', deco:'#8fc6e0', tree:'#5fa9c9', trunk:'#7d94a8',
      flake:'rgba(255,255,255,.9)', flakeShape:'snow'
    },
    { /* 4 night */
      sky:['#241c56','#6146a8'], orb:'#fff8d9', orbGlow:'rgba(255,248,217,.35)',
      hillFar:'#3a2e76', hillNear:'#281f57',
      grass:'#7d66da', grassDk:'#54429f', dirt:'#3b3070', dirtDk:'#2a2154',
      plank:'#4a3b86', plankTop:'#7d66da',
      water:'#4a7ef0', deco:'#8f7ae6', tree:'#4c3b93', trunk:'#3a2d6d',
      flake:'rgba(255,255,255,.8)', flakeShape:'star', night:true
    }
  ];

  var HINTS = {
    0: [ { x: 150,  y: 300, t: 'Use  ◀  ▶  to walk' },
         { x: 500,  y: 250, t: 'Press  ▲  to jump' },
         { x: 1420, y: 250, t: 'Jump on the bug!' } ]
  };

  /* -------------------------- state -------------------------- */
  var canvas, ctx, W = null;
  var rafId = null, lastT = 0, accT = 0, paused = false, suspended = false;
  var keys = { left: false, right: false, jump: false };
  var jumpEdge = false;
  var hooks = { complete: null, gameover: null, hud: null };

  /* ------------------------- helpers ------------------------- */
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y,     x + w, y + h, r);
    c.arcTo(x + w, y + h, x,     y + h, r);
    c.arcTo(x,     y + h, x,     y,     r);
    c.arcTo(x,     y,     x + w, y,     r);
    c.closePath();
  }
  function ell(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }

  function star(c, x, y, outer, inner, points, rot) {
    c.beginPath();
    for (var i = 0; i < points * 2; i++) {
      var r = i % 2 ? inner : outer;
      var a = (i * Math.PI) / points + (rot || 0) - Math.PI / 2;
      var px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
  }

  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  /* ======================= LEVEL BUILDING ===================== */
  function buildLevel(index) {
    var def = LEVELS[index];
    var cols = 0;
    def.map.forEach(function (r) { if (r.length > cols) cols = r.length; });
    var rows = def.map.length;

    var g = def.map.map(function (r) {
      var s = r, out = [];
      while (s.length < cols) s += ' ';
      for (var i = 0; i < cols; i++) out.push(s.charAt(i));
      return out;
    });

    var w = {
      index: index, name: def.name, theme: THEMES[def.theme % THEMES.length],
      themeId: def.theme, g: g, cols: cols, rows: rows,
      pxW: cols * TILE, pxH: rows * TILE,
      coins: [], enemies: [], springs: [], movers: [], checkpoints: [],
      planks: [], waters: [], keyItem: null, goal: null,
      particles: [], decor: [], clouds: [], hills: [], bgStars: [], flakes: [],
      total: 0, got: 0, hearts: HEARTS_MAX, hasKey: false, needKey: false,
      state: 'play', timer: 0, shake: 0, flash: 0, camX: 0, camY: 0,
      spawn: { x: TILE, y: TILE }, checkpoint: null, lockBeep: 0
    };

    /* --- entities --- */
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var ch = g[y][x];
        var px = x * TILE, py = y * TILE;
        switch (ch) {
          case 'P':
            w.spawn = { x: px + 9, y: py + TILE - 38 };
            g[y][x] = ' '; break;
          case '*':
            w.coins.push({ x: px + 10, y: py + 10, w: 28, h: 28, val: 1, got: false, ph: (x * 7 + y * 13) % 100 });
            w.total += 1; g[y][x] = ' '; break;
          case 'C':
            w.coins.push({ x: px + 8, y: py + 8, w: 32, h: 32, val: 3, gem: true, got: false, ph: (x * 5) % 100 });
            w.total += 3; g[y][x] = ' '; break;
          case 'e':
            w.enemies.push({ type: 'walk', x: px + 7, y: py + TILE - 28, w: 34, h: 28,
                             vx: 0, vy: 0, dir: (x % 2 ? -1 : 1), dead: 0, t: x * 3 });
            g[y][x] = ' '; break;
          case 'b':
            w.enemies.push({ type: 'fly', x: px + 8, y: py + 11, w: 32, h: 26,
                             hx: px + 8, hy: py + 11, t: (x * 11 + y * 7) % 628 / 100,
                             dir: 1, dead: 0 });
            g[y][x] = ' '; break;
          case 's':
            w.springs.push({ x: px + 4, y: py + TILE - 22, w: 40, h: 22, c: 0 });
            g[y][x] = ' '; break;
          case 'k':
            w.keyItem = { x: px + 11, y: py + 11, w: 26, h: 26, got: false, ph: 0 };
            w.needKey = true; g[y][x] = ' '; break;
          case 'c':
            w.checkpoints.push({ x: px + 18, y: py + 6, w: 12, h: 42, on: false });
            g[y][x] = ' '; break;
          case 'G':
            w.goal = { x: px + 2, y: py - TILE, w: 44, h: TILE * 2, cx: px + 12, by: py + TILE, t: 0 };
            g[y][x] = ' '; break;
          case 'M':
            w.movers.push({ type: 'h', ox: px, oy: py + TILE - 24, x: px, y: py + TILE - 24,
                            w: TILE * 3, h: 24, amp: TILE * 2, sp: 0.014, t: Math.PI, dx: 0, dy: 0 });
            g[y][x] = ' '; break;
          case 'V':
            w.movers.push({ type: 'v', ox: px, oy: py + TILE - 24, x: px, y: py + TILE - 24,
                            w: TILE * 3, h: 24, amp: TILE * 3, sp: 0.013, t: 0, dx: 0, dy: 0 });
            g[y][x] = ' '; break;
        }
      }
    }

    /* --- group platforms and water together so they draw cleanly --- */
    for (y = 0; y < rows; y++) {
      var runStart = -1, runKind = null;
      for (x = 0; x <= cols; x++) {
        var c = x < cols ? g[y][x] : ' ';
        var kind = (c === '-') ? 'p' : (c === '~' ? 'w' : null);
        if (kind !== runKind) {
          if (runKind === 'p') w.planks.push({ x: runStart * TILE, y: y * TILE, w: (x - runStart) * TILE });
          if (runKind === 'w') w.waters.push({ x: runStart * TILE, y: y * TILE, w: (x - runStart) * TILE,
                                               top: y === 0 || g[y - 1][x > runStart ? runStart : x] !== '~' });
          runKind = kind; runStart = x;
        }
      }
    }
    // only the topmost water row counts as the surface
    w.waters.forEach(function (wt) {
      var cy = wt.y / TILE, cx = wt.x / TILE;
      wt.top = (cy === 0) || (g[cy - 1][cx] !== '~');
    });

    /* --- procedural scenery --- */
    var rnd = rng(1000 + index * 977);
    for (x = 0; x < cols; x++) {
      for (y = 0; y < rows; y++) {
        if (g[y][x] === '#' && (y === 0 || g[y - 1][x] !== '#')) {
          var v = rnd();
          if (v < 0.17)      w.decor.push({ t: 'tuft',   x: x * TILE + 8 + rnd() * 30, y: y * TILE, s: 0.7 + rnd() * 0.6 });
          else if (v < 0.25) w.decor.push({ t: 'flower', x: x * TILE + 10 + rnd() * 28, y: y * TILE, s: 0.7 + rnd() * 0.5, c: rnd() });
          else if (v < 0.30) w.decor.push({ t: 'rock',   x: x * TILE + 10 + rnd() * 26, y: y * TILE, s: 0.7 + rnd() * 0.6 });
          else if (v < 0.35) w.decor.push({ t: 'tree',   x: x * TILE + 24, y: y * TILE, s: 0.8 + rnd() * 0.7 });
          break;
        }
      }
    }
    for (var i = 0; i < 9; i++) {
      w.clouds.push({ x: rnd() * w.pxW, y: 20 + rnd() * 190, s: 0.6 + rnd() * 0.9, v: 0.12 + rnd() * 0.22 });
    }
    for (i = 0; i < 26; i++) {
      w.hills.push({ x: rnd() * (w.pxW + 600) - 300, r: 90 + rnd() * 190, far: rnd() < 0.5 });
    }
    if (w.theme.night) for (i = 0; i < 70; i++) {
      w.bgStars.push({ x: rnd() * VIEW_W, y: rnd() * VIEW_H * 0.8, s: rnd() * 1.6 + 0.6, ph: rnd() * 6.28 });
    }
    for (i = 0; i < 34; i++) {
      w.flakes.push({ x: rnd() * VIEW_W, y: rnd() * VIEW_H, s: 0.5 + rnd(), v: 0.2 + rnd() * 0.5, ph: rnd() * 6.28 });
    }

    /* --- the player --- */
    w.p = {
      x: w.spawn.x, y: w.spawn.y, w: 30, h: 38, vx: 0, vy: 0,
      onGround: true, coyote: COYOTE, buf: 0, face: 1, anim: 0,
      sq: 1, invuln: 0, blink: 0, rider: null, jumpHeld: false, canCut: true, dead: 0, winT: 0
    };
    w.checkpoint = { x: w.spawn.x, y: w.spawn.y };
    return w;
  }

  /* ======================== COLLISIONS ======================== */
  function tileAt(x, y) {
    if (x < 0 || x >= W.cols) return '#';
    if (y < 0 || y >= W.rows) return ' ';
    return W.g[y][x];
  }

  function moveX(e, dx) {
    if (!dx) return false;
    e.x += dx;
    var l = Math.floor(e.x / TILE), r = Math.ceil((e.x + e.w) / TILE) - 1;
    var t = Math.floor(e.y / TILE), b = Math.ceil((e.y + e.h) / TILE) - 1;
    for (var cy = t; cy <= b; cy++) {
      for (var cx = l; cx <= r; cx++) {
        if (tileAt(cx, cy) === '#') {
          e.x = dx > 0 ? cx * TILE - e.w : (cx + 1) * TILE;
          e.vx = 0; return true;
        }
      }
    }
    for (var i = 0; i < W.movers.length; i++) {
      var m = W.movers[i];
      if (overlap(e, m)) {
        e.x = dx > 0 ? m.x - e.w : m.x + m.w;
        e.vx = 0; return true;
      }
    }
    return false;
  }

  function moveY(e, dy) {
    if (!dy) return false;
    var prevB = e.y + e.h;
    e.y += dy;
    var l = Math.floor(e.x / TILE), r = Math.ceil((e.x + e.w) / TILE) - 1;
    var t = Math.floor(e.y / TILE), b = Math.ceil((e.y + e.h) / TILE) - 1;
    for (var cy = t; cy <= b; cy++) {
      for (var cx = l; cx <= r; cx++) {
        var ch = tileAt(cx, cy);
        var solid = (ch === '#') ||
                    (ch === '-' && dy > 0 && prevB <= cy * TILE + 1 && !e.noPlat);
        if (solid) {
          if (dy > 0) { e.y = cy * TILE - e.h; e.onGround = true; }
          else        { e.y = (cy + 1) * TILE; }
          e.vy = 0; return true;
        }
      }
    }
    for (var i = 0; i < W.movers.length; i++) {
      var m = W.movers[i];
      if (overlap(e, m)) {
        if (dy > 0 && prevB <= m.y + Math.max(2, Math.abs(m.dy) + 2)) {
          e.y = m.y - e.h; e.vy = 0; e.onGround = true; e.rider = m; return true;
        }
        if (dy < 0) { e.y = m.y + m.h; e.vy = 0; return true; }
      }
    }
    return false;
  }

  function groundUnder(e, dx) {
    var fx = dx > 0 ? e.x + e.w + 2 : e.x - 2;
    var cx = Math.floor(fx / TILE), cy = Math.floor((e.y + e.h + 3) / TILE);
    var ch = tileAt(cx, cy);
    return ch === '#' || ch === '-';
  }

  /* ========================= PARTICLES ======================== */
  function burst(x, y, n, opt) {
    opt = opt || {};
    for (var i = 0; i < n; i++) {
      var a = opt.ang != null ? opt.ang + (Math.random() - 0.5) * (opt.spread || 2)
                              : Math.random() * Math.PI * 2;
      var sp = (opt.spd || 3) * (0.4 + Math.random() * 0.9);
      W.particles.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opt.up || 0),
        life: opt.life || 34, max: opt.life || 34,
        c: opt.c || '#fff', r: (opt.r || 4) * (0.5 + Math.random()),
        g: opt.g == null ? 0.2 : opt.g, shape: opt.shape || 'dot', rot: Math.random() * 6.28,
        spin: (Math.random() - 0.5) * 0.3
      });
    }
  }

  function confetti() {
    var cols = ['#ff6ba8', '#ffc531', '#46c93a', '#35a7ff', '#a565f5', '#ff8a3d'];
    for (var i = 0; i < 90; i++) {
      W.particles.push({
        x: W.camX + Math.random() * VIEW_W, y: W.camY - 20 - Math.random() * 180,
        vx: (Math.random() - 0.5) * 2.5, vy: 1.5 + Math.random() * 3,
        life: 150, max: 150, c: cols[(Math.random() * cols.length) | 0],
        r: 4 + Math.random() * 4, g: 0.05, shape: 'conf',
        rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 0.35
      });
    }
  }

  /* ========================== DAMAGE ========================== */
  function hurt(fatal) {
    var p = W.p;
    if (p.invuln > 0 || W.state !== 'play') return;
    W.hearts--;
    W.shake = 13; W.flash = 12;
    burst(p.x + p.w / 2, p.y + p.h / 2, 12, { c: '#ff6b6b', spd: 4, r: 5, life: 26 });
    hud();
    if (W.hearts <= 0) {
      W.state = 'dead'; p.dead = 0; p.vy = -11; p.vx = 0;
      Sfx.die();
      return;
    }
    Sfx.hurt();
    p.invuln = 110;
    if (fatal) {
      p.x = W.checkpoint.x; p.y = W.checkpoint.y; p.vx = 0; p.vy = 0;
      W.camX = clampCamX(p.x - VIEW_W / 2); W.camY = clampCamY(p.y - VIEW_H / 2);
      burst(p.x + 15, p.y + 19, 16, { c: '#fff', spd: 3.5, r: 4 });
    } else {
      p.vy = -7.5; p.vx = -p.face * 6; p.canCut = false;
    }
  }

  /* ======================== UPDATE STEP ======================= */
  function step() {
    var p = W.p, i;
    W.timer++;
    if (W.shake > 0) { W.shake *= 0.86; if (W.shake < 0.05) W.shake = 0; }
    if (W.flash > 0) W.flash--;
    if (W.lockBeep > 0) W.lockBeep--;

    /* ---- moving platforms ---- */
    for (i = 0; i < W.movers.length; i++) {
      var m = W.movers[i];
      m.t += m.sp;
      var off = Math.sin(m.t) * m.amp;
      var nx = m.type === 'h' ? m.ox + off : m.ox;
      var ny = m.type === 'v' ? m.oy + off : m.oy;
      m.dx = nx - m.x; m.dy = ny - m.y;
      m.x = nx; m.y = ny;
    }

    /* ---- death: a short animation ---- */
    if (W.state === 'dead') {
      p.dead++;
      p.vy = Math.min(p.vy + GRAVITY, MAX_FALL);
      p.y += p.vy;
      if (p.dead > 95 && hooks.gameover) { var cb = hooks.gameover; hooks.gameover = null; cb(); }
      return;
    }

    /* ---- victory: a little dance ---- */
    if (W.state === 'win') {
      p.winT++;
      p.vx *= 0.8;
      moveX(p, p.vx);
      p.vy = Math.min(p.vy + GRAVITY, MAX_FALL);
      p.onGround = false; moveY(p, p.vy);
      if (p.winT % 22 === 0) burst(W.goal.cx + 12, W.goal.by - 60, 8,
        { c: '#ffd83d', spd: 2.5, r: 4, life: 40, g: 0.02, shape: 'star' });
      updParticles();
      camera();
      if (p.winT > 80 && hooks.complete) {
        var cc = hooks.complete; hooks.complete = null;
        cc({ got: W.got, total: W.total, stars: starsFor(W.got, W.total) });
      }
      return;
    }

    /* ---- carried along by a platform ---- */
    if (p.rider) {
      moveX(p, p.rider.dx);
      if (p.rider.dy < 0) { p.y += p.rider.dy; }
      else if (p.rider.dy > 0) { moveY(p, p.rider.dy); }
    }
    p.rider = null;

    /* ---- input ---- */
    var dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (dir) { p.vx += ACC * dir; p.face = dir; }
    p.vx = clamp(p.vx, -MAX_SPD, MAX_SPD);
    if (!dir) p.vx *= (p.onGround ? FRIC_GND : FRIC_AIR);
    if (Math.abs(p.vx) < 0.05) p.vx = 0;

    if (jumpEdge) { p.buf = BUFFER; jumpEdge = false; }
    if (p.buf > 0) p.buf--;
    if (p.coyote > 0) p.coyote--;

    if (p.buf > 0 && (p.onGround || p.coyote > 0)) {
      p.vy = -JUMP_V; p.onGround = false; p.coyote = 0; p.buf = 0;
      p.jumpHeld = true; p.canCut = true; p.sq = 0.72;
      Sfx.jump();
      burst(p.x + p.w / 2, p.y + p.h, 7, { c: 'rgba(255,255,255,.85)', spd: 2, r: 4, life: 20, g: 0.05 });
    }
    if (!keys.jump) p.jumpHeld = false;
    if (p.canCut && !p.jumpHeld && p.vy < -8.2) p.vy = -8.2;

    p.vy = Math.min(p.vy + GRAVITY, MAX_FALL);

    var wasGround = p.onGround;
    p.onGround = false;
    moveX(p, p.vx);
    moveY(p, p.vy);
    if (p.onGround) {
      p.coyote = COYOTE;
      if (!wasGround) { p.sq = 1.3; Sfx.land();
        burst(p.x + p.w / 2, p.y + p.h, 5, { c: 'rgba(255,255,255,.7)', spd: 1.6, r: 3, life: 16, g: 0.06 }); }
    } else if (wasGround && p.vy >= 0) { p.coyote = p.coyote || COYOTE; }

    p.sq = Math.abs(p.sq - 1) < 0.004 ? 1 : lerp(p.sq, 1, 0.18);
    if (Math.abs(p.vx) > 0.4 && p.onGround) p.anim += 0.22; else p.anim = lerp(p.anim, 0, 0.2);
    if (p.invuln > 0) p.invuln--;
    p.blink = (p.blink + 1) % 200;

    /* ---- falling out of the level ---- */
    if (p.y > W.pxH + 120) { hurt(true); }

    /* ---- spikes & water ---- */
    var cxl = Math.floor((p.x + 6) / TILE), cxr = Math.floor((p.x + p.w - 6) / TILE);
    var cyt = Math.floor((p.y + 10) / TILE), cyb = Math.floor((p.y + p.h - 2) / TILE);
    outer:
    for (var cy = cyt; cy <= cyb; cy++) {
      for (var cx = cxl; cx <= cxr; cx++) {
        var ch = tileAt(cx, cy);
        if (ch === '^' || ch === '~') { hurt(true); break outer; }
      }
    }

    /* ---- stars ---- */
    for (i = 0; i < W.coins.length; i++) {
      var co = W.coins[i];
      if (co.got) continue;
      co.ph += 0.09;
      if (overlap(p, co)) {
        co.got = true; W.got += co.val;
        if (co.gem) { Sfx.gem(); burst(co.x + 16, co.y + 16, 22, { c: '#7ee8ff', spd: 4, r: 5, life: 40, g: 0.02, shape: 'star' }); W.flash = 6; }
        else { Sfx.coin(); burst(co.x + 14, co.y + 14, 10, { c: '#ffd83d', spd: 2.6, r: 4, life: 26, g: 0.02, shape: 'star' }); }
        hud();
      }
    }

    /* ---- the key ---- */
    if (W.keyItem && !W.keyItem.got) {
      W.keyItem.ph += 0.07;
      if (overlap(p, W.keyItem)) {
        W.keyItem.got = true; W.hasKey = true; Sfx.key(); W.flash = 8;
        burst(W.keyItem.x + 13, W.keyItem.y + 13, 24, { c: '#ffd83d', spd: 4, r: 5, life: 42, g: 0.02, shape: 'star' });
        hud();
      }
    }

    /* ---- springs ---- */
    for (i = 0; i < W.springs.length; i++) {
      var sp = W.springs[i];
      sp.c = lerp(sp.c, 0, 0.16);
      if (overlap(p, sp) && p.vy > 0) {
        p.y = sp.y - p.h; p.vy = -SPRING_V; p.onGround = false;
        p.jumpHeld = true; p.canCut = false;
        sp.c = 1; p.sq = 0.6; Sfx.spring();
        burst(sp.x + 20, sp.y, 12, { c: '#fff', spd: 3, r: 4, life: 22, ang: -Math.PI / 2, spread: 1.6 });
      }
    }

    /* ---- checkpoints ---- */
    for (i = 0; i < W.checkpoints.length; i++) {
      var cp = W.checkpoints[i];
      if (!cp.on && overlap(p, cp)) {
        cp.on = true; W.checkpoint = { x: p.x, y: p.y };
        Sfx.key();
        burst(cp.x + 6, cp.y + 6, 16, { c: '#8fe86b', spd: 3, r: 4, life: 34, g: 0.02, shape: 'star' });
      }
    }

    /* ---- enemies ---- */
    for (i = 0; i < W.enemies.length; i++) {
      var e = W.enemies[i];
      if (e.dead) { e.dead++; continue; }
      e.t += 0.1;

      if (e.type === 'walk') {
        e.vx = e.dir * 1.25;
        e.onGround = false;
        e.vy = Math.min((e.vy || 0) + GRAVITY, MAX_FALL);
        if (moveX(e, e.vx)) e.dir *= -1;
        moveY(e, e.vy);
        if (e.onGround && !groundUnder(e, e.dir)) e.dir *= -1;
      } else {
        e.hx += 0; // anchor point
        e.x = e.hx + Math.sin(e.t * 0.55) * 74;
        e.y = e.hy + Math.sin(e.t * 0.9) * 22;
        e.dir = Math.cos(e.t * 0.55) >= 0 ? 1 : -1;
      }

      if (overlap(p, e) && W.state === 'play') {
        var stomp = p.vy > 1.2 && (p.y + p.h) < e.y + e.h * 0.7;
        if (stomp) {
          e.dead = 1; p.vy = -10.5; p.jumpHeld = true; p.canCut = false; p.sq = 0.75;
          W.shake = 6; Sfx.stomp();
          burst(e.x + e.w / 2, e.y + e.h / 2, 16, { c: e.type === 'fly' ? '#ffe066' : '#8fe86b', spd: 3.6, r: 5, life: 30 });
        } else if (p.invuln <= 0) {
          hurt(false);
        }
      }
    }

    /* ---- the flag ---- */
    W.goal.t += 0.08;
    if (overlap(p, W.goal)) {
      if (W.needKey && !W.hasKey) {
        if (W.lockBeep <= 0) { Sfx.locked(); W.lockBeep = 40; }
      } else {
        W.state = 'win'; p.winT = 0; p.vx = 0;
        Sfx.win(); confetti();
      }
    }

    updParticles();
    camera();
  }

  function updParticles() {
    for (var i = W.particles.length - 1; i >= 0; i--) {
      var q = W.particles[i];
      q.x += q.vx; q.y += q.vy; q.vy += q.g; q.vx *= 0.99;
      q.rot += q.spin; q.life--;
      if (q.life <= 0) W.particles.splice(i, 1);
    }
  }

  function clampCamX(v) {
    if (W.pxW <= VIEW_W) return (W.pxW - VIEW_W) / 2;
    return clamp(v, 0, W.pxW - VIEW_W);
  }
  function clampCamY(v) {
    if (W.pxH <= VIEW_H) return (W.pxH - VIEW_H) / 2;
    return clamp(v, 0, W.pxH - VIEW_H);
  }

  function camera() {
    var p = W.p;
    var tx = p.x + p.w / 2 - VIEW_W / 2;
    var ty = p.y + p.h / 2 - VIEW_H / 2 - 30;
    var gx = clampCamX(tx), gy = clampCamY(ty);
    W.camX = Math.abs(gx - W.camX) < 0.08 ? gx : lerp(W.camX, gx, 0.11);
    W.camY = Math.abs(gy - W.camY) < 0.08 ? gy : lerp(W.camY, gy, 0.09);
  }

  function starsFor(got, total) {
    if (total <= 0) return 3;
    if (got >= total) return 3;
    if (got >= total * 0.6) return 2;
    return 1;
  }

  function hud() {
    if (hooks.hud) hooks.hud({
      hearts: W.hearts, max: HEARTS_MAX, got: W.got, total: W.total,
      name: W.name, index: W.index, needKey: W.needKey, hasKey: W.hasKey
    });
  }

  /* ========================= RENDERING ======================== */
  function render() {
    var T = W.theme, p = W.p;
    var sx = (Math.random() - 0.5) * W.shake, sy = (Math.random() - 0.5) * W.shake;
    var cx = W.camX + sx, cy = W.camY + sy;

    /* --- sky --- */
    var gr = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    gr.addColorStop(0, T.sky[0]); gr.addColorStop(1, T.sky[1]);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    if (T.night) {
      for (var i = 0; i < W.bgStars.length; i++) {
        var st = W.bgStars[i];
        var tw = 0.45 + 0.55 * Math.abs(Math.sin(W.timer * 0.02 + st.ph));
        ctx.fillStyle = 'rgba(255,255,255,' + tw.toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(st.x, st.y, st.s, 0, 6.29); ctx.fill();
      }
    }

    /* --- sun / moon --- */
    var ox = VIEW_W - 150 - cx * 0.04, oy = 96 - cy * 0.03;
    var og = ctx.createRadialGradient(ox, oy, 30, ox, oy, 110);
    og.addColorStop(0, T.orbGlow); og.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = og;
    ctx.beginPath(); ctx.arc(ox, oy, 110, 0, 6.29); ctx.fill();
    ctx.fillStyle = T.orb;
    ctx.beginPath(); ctx.arc(ox, oy, 40, 0, 6.29); ctx.fill();
    if (T.night) {
      ctx.fillStyle = 'rgba(190,190,220,.35)';
      [[-13, -8, 8], [10, 6, 6], [-4, 15, 4.5], [14, -14, 4]].forEach(function (c) {
        ctx.beginPath(); ctx.arc(ox + c[0], oy + c[1], c[2], 0, 6.29); ctx.fill();
      });
    }

    /* --- hills --- */
    drawHills(cx, cy, 0.30, T.hillFar, 130);
    drawHills(cx, cy, 0.52, T.hillNear, 60);

    /* --- clouds --- */
    ctx.fillStyle = T.night ? 'rgba(255,255,255,.13)' : 'rgba(255,255,255,.82)';
    for (i = 0; i < W.clouds.length; i++) {
      var c = W.clouds[i];
      c.x -= c.v;
      if (c.x < -260) c.x = W.pxW + 200;
      var px = c.x - cx * 0.22, py = c.y - cy * 0.12;
      if (px < -260 || px > VIEW_W + 260) continue;
      cloud(px, py, c.s);
    }

    /* --- the world --- */
    ctx.save();
    ctx.translate(-cx, -cy);

    drawTrees();
    drawTiles(cx, cy);
    drawPlanks();
    drawWater();
    drawDecorFront();
    drawSprings();
    drawCheckpoints();
    drawMovers();
    drawGoal();
    drawCoins();
    drawKey();
    drawEnemies();
    if (!W.menu) { drawHints(); drawPlayer(); }
    drawParticles();

    ctx.restore();

    /* --- foreground flakes / leaves --- */
    ctx.fillStyle = T.flake;
    for (i = 0; i < W.flakes.length; i++) {
      var f = W.flakes[i];
      f.y += f.v; f.x += Math.sin(W.timer * 0.02 + f.ph) * 0.35;
      if (f.y > VIEW_H + 10) { f.y = -10; f.x = Math.random() * VIEW_W; }
      var s = f.s * 3;
      if (T.flakeShape === 'star') { star(ctx, f.x, f.y, s, s * 0.45, 4, W.timer * 0.02); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(f.x, f.y, s * 0.6, 0, 6.29); ctx.fill(); }
    }

    /* --- vignette + flash --- */
    var vg = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.42,
                                      VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.92);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(20,10,40,.34)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    if (W.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (W.flash / 40) + ')';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (W.state === 'dead') {
      ctx.fillStyle = 'rgba(30,10,40,' + Math.min(0.6, W.p.dead / 120) + ')';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  function cloud(x, y, s) {
    ctx.beginPath();
    ctx.arc(x, y, 26 * s, 0, 6.29);
    ctx.arc(x + 28 * s, y - 12 * s, 34 * s, 0, 6.29);
    ctx.arc(x + 66 * s, y + 2 * s, 26 * s, 0, 6.29);
    ctx.arc(x + 34 * s, y + 16 * s, 28 * s, 0, 6.29);
    ctx.fill();
  }

  function drawHills(cx, cy, par, col, baseUp) {
    var base = VIEW_H - baseUp + 60 - cy * (par * 0.5);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(-50, VIEW_H + 40);
    for (var i = 0; i < W.hills.length; i++) {
      var h = W.hills[i];
      if ((h.far && par > 0.4) || (!h.far && par <= 0.4)) continue;
      var x = h.x - cx * par;
      if (x < -h.r - 100 || x > VIEW_W + h.r + 100) continue;
      ctx.moveTo(x - h.r, VIEW_H + 40);
      ctx.arc(x, base, h.r, Math.PI, 0);
      ctx.lineTo(x + h.r, VIEW_H + 40);
    }
    ctx.rect(-50, base + 20, VIEW_W + 100, VIEW_H);
    ctx.fill();
  }

  function drawTrees() {
    var T = W.theme;
    for (var i = 0; i < W.decor.length; i++) {
      var d = W.decor[i];
      if (d.t !== 'tree') continue;
      var s = d.s, h = 54 * s;
      ctx.fillStyle = T.trunk;
      rr(ctx, d.x - 5 * s, d.y - h, 10 * s, h, 4); ctx.fill();
      ctx.fillStyle = T.tree;
      ell(ctx, d.x, d.y - h - 12 * s, 26 * s, 24 * s); ctx.fill();
      ell(ctx, d.x - 18 * s, d.y - h + 4 * s, 18 * s, 16 * s); ctx.fill();
      ell(ctx, d.x + 18 * s, d.y - h + 4 * s, 18 * s, 16 * s); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.16)';
      ell(ctx, d.x - 8 * s, d.y - h - 18 * s, 12 * s, 9 * s); ctx.fill();
    }
  }

  function drawTiles(cx, cy) {
    var T = W.theme;
    var x0 = Math.max(0, Math.floor(cx / TILE) - 1);
    var x1 = Math.min(W.cols - 1, Math.floor((cx + VIEW_W) / TILE) + 1);
    var y0 = Math.max(0, Math.floor(cy / TILE) - 1);
    var y1 = Math.min(W.rows - 1, Math.floor((cy + VIEW_H) / TILE) + 1);

    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var ch = W.g[y][x];
        var px = x * TILE, py = y * TILE;
        if (ch === '#') {
          var topOpen = (y === 0) || W.g[y - 1][x] !== '#';
          ctx.fillStyle = T.dirt;
          ctx.fillRect(px, py, TILE, TILE + 1);
          // speckles
          var r = rng(x * 131 + y * 977);
          ctx.fillStyle = T.dirtDk;
          for (var k = 0; k < 3; k++) {
            var bx = px + 6 + r() * 34, by = py + 10 + r() * 30, bs = 3 + r() * 4;
            ctx.beginPath(); ctx.arc(bx, by, bs, 0, 6.29); ctx.fill();
          }
          if (topOpen) {
            ctx.fillStyle = T.grassDk;
            ctx.fillRect(px, py, TILE, 18);
            ctx.fillStyle = T.grass;
            rr(ctx, px - 1, py - 5, TILE + 2, 19, 7); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.22)';
            rr(ctx, px + 2, py - 3, TILE - 4, 6, 3); ctx.fill();
          }
          // side shading
          if (x === 0 || W.g[y][x - 1] !== '#') { ctx.fillStyle = 'rgba(0,0,0,.10)'; ctx.fillRect(px, py, 4, TILE); }
          if (x === W.cols - 1 || W.g[y][x + 1] !== '#') { ctx.fillStyle = 'rgba(0,0,0,.10)'; ctx.fillRect(px + TILE - 4, py, 4, TILE); }
        } else if (ch === '^') {
          drawSpikes(px, py);
        }
      }
    }
  }

  function drawSpikes(px, py) {
    for (var i = 0; i < 3; i++) {
      var bx = px + 2 + i * 15;
      ctx.fillStyle = '#9aa3b2';
      ctx.beginPath();
      ctx.moveTo(bx, py + TILE);
      ctx.lineTo(bx + 7.5, py + 12);
      ctx.lineTo(bx + 15, py + TILE);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e8edf5';
      ctx.beginPath();
      ctx.moveTo(bx + 2.5, py + TILE);
      ctx.lineTo(bx + 7.5, py + 13);
      ctx.lineTo(bx + 8.5, py + TILE);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#6f7889';
    rr(ctx, px, py + TILE - 8, TILE, 8, 3); ctx.fill();
  }

  function drawPlanks() {
    var T = W.theme;
    for (var i = 0; i < W.planks.length; i++) {
      var pl = W.planks[i];
      ctx.fillStyle = 'rgba(0,0,0,.14)';
      rr(ctx, pl.x + 3, pl.y + 8, pl.w, 18, 8); ctx.fill();
      ctx.fillStyle = T.plank;
      rr(ctx, pl.x, pl.y, pl.w, 20, 9); ctx.fill();
      ctx.fillStyle = T.plankTop;
      rr(ctx, pl.x, pl.y - 2, pl.w, 11, 6); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      rr(ctx, pl.x + 4, pl.y - 1, pl.w - 8, 4, 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.16)';
      for (var x = pl.x + TILE; x < pl.x + pl.w; x += TILE) ctx.fillRect(x - 1, pl.y + 10, 2, 8);
    }
  }

  function drawWater() {
    if (!W.waters.length) return;
    var T = W.theme, i, x;
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = T.water;
    ctx.beginPath();
    for (i = 0; i < W.waters.length; i++) {
      var wt = W.waters[i];
      if (wt.top) {
        ctx.moveTo(wt.x, wt.y + 10);
        for (x = 0; x <= wt.w; x += 8)
          ctx.lineTo(wt.x + x, wt.y + 10 + Math.sin(x * 0.055 + W.timer * 0.06) * 5);
        ctx.lineTo(wt.x + wt.w, wt.y + TILE + 1);
        ctx.lineTo(wt.x, wt.y + TILE + 1);
        ctx.closePath();
      } else {
        ctx.rect(wt.x, wt.y, wt.w, TILE + 1);
      }
    }
    ctx.fill();
    // glints below the surface
    ctx.globalAlpha = 0.16; ctx.fillStyle = '#fff';
    for (i = 0; i < W.waters.length; i++) {
      var w2 = W.waters[i];
      for (x = 14; x < w2.w; x += 46) {
        var yy = w2.y + 20 + ((x * 7) % (TILE - 24));
        ell(ctx, w2.x + x, yy + Math.sin(W.timer * 0.04 + x) * 2, 9, 2.5); ctx.fill();
      }
    }
    // the surface line
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 3;
    for (i = 0; i < W.waters.length; i++) {
      var w3 = W.waters[i];
      if (!w3.top) continue;
      ctx.beginPath();
      for (x = 0; x <= w3.w; x += 8) {
        var y3 = w3.y + 10 + Math.sin(x * 0.055 + W.timer * 0.06) * 5;
        if (x === 0) ctx.moveTo(w3.x + x, y3); else ctx.lineTo(w3.x + x, y3);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDecorFront() {
    var T = W.theme;
    for (var i = 0; i < W.decor.length; i++) {
      var d = W.decor[i], s = d.s;
      if (d.t === 'tuft') {
        ctx.strokeStyle = T.deco; ctx.lineWidth = 3 * s; ctx.lineCap = 'round';
        for (var k = -1; k <= 1; k++) {
          ctx.beginPath();
          ctx.moveTo(d.x + k * 5 * s, d.y);
          ctx.quadraticCurveTo(d.x + k * 8 * s, d.y - 10 * s, d.x + k * 11 * s, d.y - 15 * s);
          ctx.stroke();
        }
      } else if (d.t === 'flower') {
        ctx.strokeStyle = T.deco; ctx.lineWidth = 2.5 * s;
        ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x, d.y - 14 * s); ctx.stroke();
        var cols = ['#ff7ab8', '#ffd83d', '#fff', '#a98bff'];
        ctx.fillStyle = cols[(d.c * cols.length) | 0];
        for (var a = 0; a < 5; a++) {
          var an = a * 1.256;
          ctx.beginPath();
          ctx.arc(d.x + Math.cos(an) * 5 * s, d.y - 14 * s + Math.sin(an) * 5 * s, 4 * s, 0, 6.29);
          ctx.fill();
        }
        ctx.fillStyle = '#ffd83d';
        ctx.beginPath(); ctx.arc(d.x, d.y - 14 * s, 3 * s, 0, 6.29); ctx.fill();
      } else if (d.t === 'rock') {
        ctx.fillStyle = 'rgba(0,0,0,.18)';
        ell(ctx, d.x, d.y - 2, 11 * s, 4 * s); ctx.fill();
        ctx.fillStyle = '#9aa3b2';
        ell(ctx, d.x, d.y - 6 * s, 10 * s, 7 * s); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.35)';
        ell(ctx, d.x - 3 * s, d.y - 9 * s, 4 * s, 2.5 * s); ctx.fill();
      }
    }
  }

  function drawSprings() {
    for (var i = 0; i < W.springs.length; i++) {
      var s = W.springs[i];
      var sq = 1 - s.c * 0.55;
      var top = s.y + s.h - (s.h - 6) * sq - 6;
      ctx.fillStyle = 'rgba(0,0,0,.2)';
      ell(ctx, s.x + 20, s.y + s.h, 21, 5); ctx.fill();
      // coil
      ctx.strokeStyle = '#e3e8f2'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath();
      for (var k = 0; k <= 12; k++) {
        var f = k / 12;
        var yy = s.y + s.h - 6 - f * ((s.h - 10) * sq);
        var xx = s.x + 20 + Math.sin(f * Math.PI * 3) * 13;
        if (k === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
      ctx.strokeStyle = '#a7b0c4'; ctx.lineWidth = 2.4;
      ctx.stroke();
      // foot plate
      ctx.fillStyle = '#6f7889';
      rr(ctx, s.x + 1, s.y + s.h - 8, 38, 8, 4); ctx.fill();
      // red top plate
      ctx.fillStyle = '#ff4f66';
      rr(ctx, s.x - 1, top - 5, 42, 12, 6); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      rr(ctx, s.x + 4, top - 3, 28, 4, 2); ctx.fill();
      ctx.fillStyle = '#ffd83d';
      ctx.beginPath(); ctx.arc(s.x + 20, top + 1, 2.6, 0, 6.29); ctx.fill();
    }
  }

  function drawCheckpoints() {
    for (var i = 0; i < W.checkpoints.length; i++) {
      var c = W.checkpoints[i];
      ctx.fillStyle = '#b8b1c7';
      rr(ctx, c.x + 2, c.y, 5, c.h, 2); ctx.fill();
      var wv = c.on ? Math.sin(W.timer * 0.12) * 3 : 0;
      ctx.fillStyle = c.on ? '#46c93a' : '#cfc6de';
      ctx.beginPath();
      ctx.moveTo(c.x + 7, c.y + 3);
      ctx.lineTo(c.x + 30 + wv, c.y + 11);
      ctx.lineTo(c.x + 7, c.y + 19);
      ctx.closePath(); ctx.fill();
      if (c.on) {
        ctx.fillStyle = 'rgba(140,240,120,' + (0.25 + 0.15 * Math.sin(W.timer * 0.1)) + ')';
        ctx.beginPath(); ctx.arc(c.x + 6, c.y + 12, 20, 0, 6.29); ctx.fill();
      }
    }
  }

  function drawMovers() {
    var T = W.theme;
    for (var i = 0; i < W.movers.length; i++) {
      var m = W.movers[i];
      ctx.fillStyle = 'rgba(0,0,0,.16)';
      rr(ctx, m.x + 4, m.y + 8, m.w, m.h, 9); ctx.fill();
      ctx.fillStyle = T.plank;
      rr(ctx, m.x, m.y, m.w, m.h, 9); ctx.fill();
      ctx.fillStyle = T.plankTop;
      rr(ctx, m.x, m.y - 2, m.w, 11, 6); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.3)';
      rr(ctx, m.x + 6, m.y - 1, m.w - 12, 4, 2); ctx.fill();
      ctx.fillStyle = '#ffd83d';
      [0.18, 0.82].forEach(function (f) {
        ctx.beginPath(); ctx.arc(m.x + m.w * f, m.y + m.h - 8, 4, 0, 6.29); ctx.fill();
      });
      // arrows showing which way it travels
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      var mcx = m.x + m.w / 2, mcy = m.y + m.h / 2 + 1;
      ctx.beginPath();
      if (m.type === 'h') {
        ctx.moveTo(mcx - 16, mcy); ctx.lineTo(mcx - 8, mcy - 5); ctx.lineTo(mcx - 8, mcy + 5);
        ctx.moveTo(mcx + 16, mcy); ctx.lineTo(mcx + 8, mcy - 5); ctx.lineTo(mcx + 8, mcy + 5);
      } else {
        ctx.moveTo(mcx, mcy - 9); ctx.lineTo(mcx - 5, mcy - 2); ctx.lineTo(mcx + 5, mcy - 2);
        ctx.moveTo(mcx, mcy + 9); ctx.lineTo(mcx - 5, mcy + 2); ctx.lineTo(mcx + 5, mcy + 2);
      }
      ctx.fill();
    }
  }

  function drawGoal() {
    var gl = W.goal;
    var locked = W.needKey && !W.hasKey;
    var bx = gl.cx, by = gl.by;

    // glow
    var glow = ctx.createRadialGradient(bx, by - 60, 6, bx, by - 60, 80);
    glow.addColorStop(0, locked ? 'rgba(180,180,200,.30)' : 'rgba(255,220,90,.45)');
    glow.addColorStop(1, 'rgba(255,220,90,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(bx, by - 60, 80, 0, 6.29); ctx.fill();

    // pole
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ell(ctx, bx, by - 2, 22, 6); ctx.fill();
    ctx.fillStyle = '#8a8f9e';
    rr(ctx, bx - 4, by - 92, 8, 92, 4); ctx.fill();
    ctx.fillStyle = '#ffd83d';
    ctx.beginPath(); ctx.arc(bx, by - 95, 6, 0, 6.29); ctx.fill();

    // banner
    ctx.fillStyle = locked ? '#b7b2c4' : '#ff5b8f';
    ctx.beginPath();
    ctx.moveTo(bx + 3, by - 90);
    for (var k = 0; k <= 10; k++) {
      var t = k / 10;
      ctx.lineTo(bx + 3 + t * 46, by - 90 + t * 3 + Math.sin(gl.t + t * 3.4) * 5 * t);
    }
    for (k = 10; k >= 0; k--) {
      t = k / 10;
      ctx.lineTo(bx + 3 + t * 46, by - 62 + t * 3 + Math.sin(gl.t + t * 3.4) * 5 * t);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.28)';
    ctx.beginPath();
    ctx.moveTo(bx + 5, by - 88);
    ctx.lineTo(bx + 20, by - 85);
    ctx.lineTo(bx + 5, by - 82);
    ctx.closePath(); ctx.fill();

    if (locked) {
      ctx.fillStyle = '#6d6880';
      rr(ctx, bx + 10, by - 46, 24, 20, 5); ctx.fill();
      ctx.strokeStyle = '#6d6880'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(bx + 22, by - 46, 8, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = '#ffd83d';
      ctx.beginPath(); ctx.arc(bx + 22, by - 36, 3.4, 0, 6.29); ctx.fill();
    } else {
      for (var i = 0; i < 3; i++) {
        var a = gl.t * 0.7 + i * 2.1;
        var sxx = bx + Math.cos(a) * 34, syy = by - 60 + Math.sin(a * 1.3) * 26;
        ctx.fillStyle = 'rgba(255,240,150,.9)';
        star(ctx, sxx, syy, 5, 2.2, 4, a); ctx.fill();
      }
    }
  }

  function drawCoins() {
    for (var i = 0; i < W.coins.length; i++) {
      var c = W.coins[i];
      if (c.got) continue;
      var bob = Math.sin(c.ph) * 4;
      var sc = Math.abs(Math.cos(c.ph * 0.8));
      var ccx = c.x + c.w / 2, ccy = c.y + c.h / 2 + bob;

      ctx.save(); ctx.translate(ccx, ccy); ctx.scale(0.35 + sc * 0.65, 1);
      if (c.gem) {
        ctx.fillStyle = 'rgba(120,230,255,.35)';
        ctx.beginPath(); ctx.arc(0, 0, 22, 0, 6.29); ctx.fill();
        ctx.fillStyle = '#4fd8ff';
        ctx.beginPath();
        ctx.moveTo(0, -17); ctx.lineTo(14, -4); ctx.lineTo(0, 17); ctx.lineTo(-14, -4);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.65)';
        ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(6, -4); ctx.lineTo(0, 6); ctx.lineTo(-6, -4);
        ctx.closePath(); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(255,216,61,.30)';
        ctx.beginPath(); ctx.arc(0, 0, 17, 0, 6.29); ctx.fill();
        ctx.fillStyle = '#ffc531';
        star(ctx, 0, 0, 14, 6.2, 5, 0); ctx.fill();
        ctx.fillStyle = '#ffe98a';
        star(ctx, 0, -1.5, 8.5, 3.6, 5, 0); ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawKey() {
    var k = W.keyItem;
    if (!k || k.got) return;
    var bob = Math.sin(k.ph) * 5;
    var kx = k.x + 13, ky = k.y + 13 + bob;
    ctx.fillStyle = 'rgba(255,216,61,.3)';
    ctx.beginPath(); ctx.arc(kx, ky, 20, 0, 6.29); ctx.fill();
    ctx.save(); ctx.translate(kx, ky); ctx.rotate(Math.sin(k.ph * 0.6) * 0.25);
    ctx.strokeStyle = '#ffc531'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(-4, -5, 7, 0, 6.29); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(9, 10); ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(6, 7); ctx.lineTo(1, 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, 11); ctx.lineTo(5, 16); ctx.stroke();
    ctx.restore();
  }

  function drawEnemies() {
    for (var i = 0; i < W.enemies.length; i++) {
      var e = W.enemies[i];
      if (e.dead) {
        if (e.dead > 20) continue;
        ctx.save();
        ctx.globalAlpha = 1 - e.dead / 20;
        ctx.translate(e.x + e.w / 2, e.y + e.h);
        ctx.scale(1 + e.dead * 0.04, Math.max(0.08, 1 - e.dead * 0.055));
        ctx.translate(-e.w / 2, -e.h);
        e.type === 'walk' ? bug(0, 0, e) : bee(0, 0, e);
        ctx.restore();
        continue;
      }
      ctx.save(); ctx.translate(e.x, e.y);
      e.type === 'walk' ? bug(0, 0, e) : bee(0, 0, e);
      ctx.restore();
    }
  }

  function bug(x, y, e) {
    var wob = Math.sin(e.t * 1.6) * 2;
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ell(ctx, x + 17, y + 28, 15, 4); ctx.fill();
    // legs
    ctx.strokeStyle = '#2f7a2a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (var k = -1; k <= 1; k += 2) {
      ctx.beginPath();
      ctx.moveTo(x + 17 + k * 9, y + 22);
      ctx.lineTo(x + 17 + k * 13, y + 28 + Math.sin(e.t * 3 + k) * 2);
      ctx.stroke();
    }
    // body
    var gg = ctx.createLinearGradient(x, y, x, y + 28);
    gg.addColorStop(0, '#9ef06f'); gg.addColorStop(1, '#4bb03c');
    ctx.fillStyle = gg;
    ell(ctx, x + 17, y + 15 + wob * 0.2, 17, 13 - wob * 0.3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ell(ctx, x + 11, y + 9, 6, 3.6); ctx.fill();
    // antennae
    ctx.strokeStyle = '#3d8f33'; ctx.lineWidth = 2.4;
    for (k = -1; k <= 1; k += 2) {
      ctx.beginPath();
      ctx.moveTo(x + 17 + k * 6, y + 5);
      ctx.quadraticCurveTo(x + 17 + k * 11, y - 3, x + 17 + k * 9, y - 8);
      ctx.stroke();
      ctx.fillStyle = '#ff7ab8';
      ctx.beginPath(); ctx.arc(x + 17 + k * 9, y - 9, 2.8, 0, 6.29); ctx.fill();
    }
    // eyes
    var ex = x + 17 + e.dir * 5;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(ex - 5, y + 13, 5, 0, 6.29); ctx.fill();
    ctx.beginPath(); ctx.arc(ex + 5, y + 13, 5, 0, 6.29); ctx.fill();
    ctx.fillStyle = '#26204a';
    ctx.beginPath(); ctx.arc(ex - 5 + e.dir, y + 13.5, 2.6, 0, 6.29); ctx.fill();
    ctx.beginPath(); ctx.arc(ex + 5 + e.dir, y + 13.5, 2.6, 0, 6.29); ctx.fill();
    // mouth
    ctx.strokeStyle = '#26204a'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(ex, y + 19, 3.4, 0.25, Math.PI - 0.25); ctx.stroke();
  }

  function bee(x, y, e) {
    var flap = Math.sin(e.t * 6) * 0.5 + 0.5;
    var d = e.dir, cx0 = x + 16, cy0 = y + 14;

    // wings
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.save(); ctx.translate(cx0 - 2, cy0 - 8);
    ctx.rotate(-0.55 - flap * 0.55); ell(ctx, -8, -2, 11, 5.5); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(cx0 + 2, cy0 - 8);
    ctx.rotate(0.55 + flap * 0.55); ell(ctx, 8, -2, 11, 5.5); ctx.fill(); ctx.restore();

    // stinger
    ctx.fillStyle = '#5a4a3a';
    ctx.beginPath();
    ctx.moveTo(cx0 + d * 13, cy0 + 1);
    ctx.lineTo(cx0 + d * 21, cy0 + 3);
    ctx.lineTo(cx0 + d * 13, cy0 + 6);
    ctx.closePath(); ctx.fill();

    // body
    var bgd = ctx.createLinearGradient(0, cy0 - 11, 0, cy0 + 11);
    bgd.addColorStop(0, '#ffd75e'); bgd.addColorStop(1, '#f0a81f');
    ctx.fillStyle = bgd;
    ell(ctx, cx0, cy0, 14, 11); ctx.fill();

    // stripes
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx0, cy0, 14, 11, 0, 0, 6.29); ctx.clip();
    ctx.fillStyle = '#453a56';
    rr(ctx, cx0 + d * 2, cy0 - 12, 5, 24, 2.5); ctx.fill();
    rr(ctx, cx0 + d * 10, cy0 - 12, 5, 24, 2.5); ctx.fill();
    ctx.restore();

    // head
    ctx.fillStyle = '#453a56';
    ctx.beginPath(); ctx.arc(cx0 - d * 13, cy0 - 1, 8.5, 0, 6.29); ctx.fill();

    // antennae
    ctx.strokeStyle = '#453a56'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (var k = -1; k <= 1; k += 2) {
      ctx.beginPath();
      ctx.moveTo(cx0 - d * 14, cy0 - 7);
      ctx.quadraticCurveTo(cx0 - d * 18, cy0 - 14, cx0 - d * 15 + k * 3, cy0 - 17);
      ctx.stroke();
      ctx.fillStyle = '#ffd83d';
      ctx.beginPath(); ctx.arc(cx0 - d * 15 + k * 3, cy0 - 18, 2.3, 0, 6.29); ctx.fill();
    }

    // eyes + smile
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx0 - d * 15, cy0 - 3, 4.4, 0, 6.29); ctx.fill();
    ctx.fillStyle = '#26204a';
    ctx.beginPath(); ctx.arc(cx0 - d * 16.2, cy0 - 2.6, 2.3, 0, 6.29); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx0 - d * 16.8, cy0 - 3.8, 1, 0, 6.29); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(cx0 - d * 14, cy0 + 4, 3, 0.2, Math.PI - 0.2); ctx.stroke();
  }

  function drawPlayer() {
    var p = W.p;
    if (p.invuln > 0 && Math.floor(p.invuln / 5) % 2 === 0 && W.state === 'play') return;

    var d    = p.face;
    var sy   = p.sq, sx = 2 - p.sq;
    var walk = Math.sin(p.anim) * (p.onGround ? 1 : 0);
    var bob  = p.onGround ? Math.abs(Math.sin(p.anim)) * 1.8 : 0;
    var spin = W.state === 'dead' ? p.dead * 0.12 : 0;
    var ORANGE = '#ffa64d', ORANGE_D = '#ef8228', CREAM = '#fff4e6', INK = '#3b2b4f';

    ctx.save();
    ctx.translate(p.x + p.w / 2, p.y + p.h);
    if (spin) ctx.rotate(spin);
    ctx.scale(sx, sy);

    if (!spin) { ctx.fillStyle = 'rgba(0,0,0,.18)'; ell(ctx, 0, 1, 16, 4.5); ctx.fill(); }

    /* ---------- tail ---------- */
    ctx.save();
    ctx.translate(-d * 8, -12 - bob * 0.4);
    ctx.rotate(d * (0.30 + Math.sin(W.timer * 0.09) * 0.16));
    ctx.fillStyle = ORANGE_D;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.quadraticCurveTo(-d * 15, -15, -d * 27, -7);
    ctx.quadraticCurveTo(-d * 15, 4, 0, 6);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = CREAM;
    ell(ctx, -d * 24, -5, 7.5, 6); ctx.fill();
    ctx.restore();

    /* ---------- paws ---------- */
    ctx.fillStyle = ORANGE_D;
    ell(ctx, -7 + walk * 4.5, -3.5, 6.5, 4); ctx.fill();
    ell(ctx,  7 - walk * 4.5, -3.5, 6.5, 4); ctx.fill();

    /* ---------- body ---------- */
    var bgr = ctx.createLinearGradient(0, -22, 0, -2);
    bgr.addColorStop(0, ORANGE); bgr.addColorStop(1, ORANGE_D);
    ctx.fillStyle = bgr;
    ell(ctx, 0, -11 - bob, 13, 10.5); ctx.fill();
    ctx.fillStyle = CREAM;
    ell(ctx, 0, -8.5 - bob, 7.5, 7); ctx.fill();

    /* ---------- arms ---------- */
    ctx.fillStyle = ORANGE_D;
    ell(ctx, -11.5 - walk * 2, -13 - bob, 4.2, 5.6); ctx.fill();
    ell(ctx,  11.5 + walk * 2, -13 - bob, 4.2, 5.6); ctx.fill();

    /* ---------- head ---------- */
    var hy = -25 - bob;
    for (var k = -1; k <= 1; k += 2) {                 // ears
      ctx.fillStyle = ORANGE_D;
      ctx.beginPath();
      ctx.moveTo(k * 3.5, hy - 7);
      ctx.lineTo(k * 12,  hy - 19);
      ctx.lineTo(k * 12.5, hy - 4);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffb9cb';
      ctx.beginPath();
      ctx.moveTo(k * 6, hy - 8);
      ctx.lineTo(k * 10.5, hy - 15.5);
      ctx.lineTo(k * 10.5, hy - 6);
      ctx.closePath(); ctx.fill();
    }
    var hgr = ctx.createLinearGradient(0, hy - 12, 0, hy + 11);
    hgr.addColorStop(0, '#ffb85f'); hgr.addColorStop(1, ORANGE);
    ctx.fillStyle = hgr;
    ell(ctx, 0, hy, 12.5, 11); ctx.fill();
    ctx.fillStyle = CREAM;                                // snout
    ell(ctx, d * 3.5, hy + 4, 9, 6); ctx.fill();

    /* ---------- face ---------- */
    var blinking = p.blink > 192 || W.state === 'dead';
    var ey = hy - 2.5;
    if (blinking) {
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineCap = 'round';
      [-5.5, 5.5].forEach(function (ex) {
        ctx.beginPath(); ctx.moveTo(ex - 3, ey); ctx.lineTo(ex + 3, ey); ctx.stroke();
      });
    } else {
      [-5.5, 5.5].forEach(function (ex) {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(ex, ey, 4.6, 0, 6.29); ctx.fill();
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.arc(ex + d * 1.3, ey + 0.5, 2.7, 0, 6.29); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(ex + d * 0.5, ey - 1.4, 1.1, 0, 6.29); ctx.fill();
      });
    }
    ctx.fillStyle = INK;                                // nose
    ctx.beginPath();
    ctx.moveTo(d * 6.5, hy + 1.2);
    ctx.lineTo(d * 12.5, hy + 1.2);
    ctx.quadraticCurveTo(d * 9.5, hy + 7, d * 6.5, hy + 1.2);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath();                                    // mouth
    ctx.moveTo(d * 9.5, hy + 5.5);
    ctx.quadraticCurveTo(d * 6, hy + 8.5, d * 3, hy + 6);
    ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.beginPath();                                    // whiskers
    ctx.moveTo(d * 12, hy + 3); ctx.lineTo(d * 19, hy + 1.5);
    ctx.moveTo(d * 12, hy + 6); ctx.lineTo(d * 19, hy + 6.5);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,130,165,.42)';            // cheeks
    ell(ctx, -9.5, hy + 4, 3.6, 2.4); ctx.fill();
    ell(ctx,  9.5, hy + 4, 3.6, 2.4); ctx.fill();

    ctx.restore();

    /* ---------- the key being carried ---------- */
    if (W.hasKey) {
      var kx = p.x + p.w / 2 - d * 22, ky = p.y + 2 + Math.sin(W.timer * 0.1) * 2;
      ctx.strokeStyle = '#ffc531'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(kx, ky, 5, 0, 6.29); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(kx + 3, ky + 4); ctx.lineTo(kx + 9, ky + 10); ctx.stroke();
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(kx + 7, ky + 8); ctx.lineTo(kx + 4, ky + 11); ctx.stroke();
    }
  }

  function drawParticles() {
    for (var i = 0; i < W.particles.length; i++) {
      var q = W.particles[i];
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, q.life / q.max));
      ctx.translate(q.x, q.y); ctx.rotate(q.rot);
      ctx.fillStyle = q.c;
      if (q.shape === 'star') { star(ctx, 0, 0, q.r, q.r * 0.44, 4, 0); ctx.fill(); }
      else if (q.shape === 'conf') { ctx.fillRect(-q.r / 2, -q.r / 3, q.r, q.r * 0.66); }
      else { ctx.beginPath(); ctx.arc(0, 0, q.r, 0, 6.29); ctx.fill(); }
      ctx.restore();
    }
  }

  function drawHints() {
    var hs = HINTS[W.index];
    if (!hs) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '700 22px "Baloo 2", "Comic Sans MS", system-ui, sans-serif';
    for (var i = 0; i < hs.length; i++) {
      var h = hs[i];
      var yy = h.y + Math.sin(W.timer * 0.05 + i) * 4;
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(255,255,255,.92)';
      ctx.strokeText(h.t, h.x, yy);
      ctx.fillStyle = '#4a3a6a';
      ctx.fillText(h.t, h.x, yy);
    }
    ctx.restore();
  }

  /* ========================== MAIN LOOP ======================= */
  function loop(t) {
    if (suspended) { rafId = null; return; }   // onPause: stop rendering too
    rafId = requestAnimationFrame(loop);
    if (!W) return;
    if (!lastT) lastT = t;
    var dt = Math.min(120, t - lastT); lastT = t;
    if (W.menu) {                       // decorative scene behind the menus
      W.timer++;
      W.camX += 0.45;
      if (W.camX > W.pxW - VIEW_W) W.camX = 0;
      W.camY = clampCamY(W.pxH);
      updParticles();
    } else if (!paused) {
      accT += dt;
      var n = 0;
      while (accT >= STEP_MS && n < 5) { step(); accT -= STEP_MS; n++; }
      if (accT > 400) accT = 0;
    } else {
      accT = 0;
    }
    render();
  }

  /* =========================== INPUT ========================== */
  function onKey(e, down) {
    var k = e.key;
    var used = true;
    if (k === 'ArrowLeft'  || k === 'a' || k === 'A') keys.left  = down;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = down;
    else if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W' ||
             k === 'z' || k === 'Z' || k === 'Spacebar') {
      if (down && !keys.jump) jumpEdge = true;
      keys.jump = down;
    } else used = false;
    if (used) e.preventDefault();
  }

  window.addEventListener('keydown', function (e) { if (W && !paused) onKey(e, true); }, { passive: false });
  window.addEventListener('keyup',   function (e) { if (W) onKey(e, false); }, { passive: false });
  window.addEventListener('blur', function () { keys.left = keys.right = keys.jump = false; });

  /* ============================ API =========================== */
  var stage = null, dprQuery = null;

  function setup() {
    canvas = document.getElementById('game');
    stage  = document.getElementById('stage');
    ctx    = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    watchDpr();
  }

  /* Re-fires resize when the page moves to a screen with a different pixel
     density, so text and sprites never end up blurry (Design req. 3.1). */
  function watchDpr() {
    if (!window.matchMedia) return;
    if (dprQuery && dprQuery.removeEventListener) dprQuery.removeEventListener('change', onDpr);
    var dpr = window.devicePixelRatio || 1;
    dprQuery = window.matchMedia('(resolution: ' + dpr + 'dppx)');
    if (dprQuery.addEventListener) dprQuery.addEventListener('change', onDpr);
  }
  function onDpr() { resize(); watchDpr(); }

  function resize() {
    if (!canvas) return;
    var vw = Math.max(1, window.innerWidth  || 960);
    var vh = Math.max(1, window.innerHeight || 540);

    VIEW_H = BASE_H;
    VIEW_W = Math.round(clamp(BASE_H * (vw / vh), MIN_W, MAX_W));

    // fit the logical box inside the real viewport, keeping its proportions
    var scale = Math.min(vw / VIEW_W, vh / VIEW_H);
    var cssW  = Math.round(VIEW_W * scale);
    var cssH  = Math.round(VIEW_H * scale);
    stage.style.width  = cssW + 'px';
    stage.style.height = cssH + 'px';

    /* Draw at the real device resolution, never upscaled: the backing store is
       sized in device pixels and the context scaled to match, so text and
       sprites stay sharp on any density (Design req. 3.1). The cap keeps the
       buffer sane on very large displays. */
    var dpr = window.devicePixelRatio || 1;
    var eff = Math.max(1, Math.min(dpr, 2.5, 3840 / cssW, 2160 / cssH));
    canvas.width  = Math.round(cssW * eff);
    canvas.height = Math.round(cssH * eff);
    var k = canvas.width / VIEW_W;          // device pixels per world unit
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.lineJoin = 'round';
    ctx.lineCap  = 'round';

    if (W) {                       // keep the level running, just reframed
      scatterSky(W);
      W.camX = clampCamX(W.camX);
      W.camY = clampCamY(W.camY);
      if (!suspended) render();
    }
  }

  /* Sky decorations live in screen space, so they get re-scattered on resize. */
  function scatterSky(w) {
    var i;
    for (i = 0; i < w.bgStars.length; i++) {
      w.bgStars[i].x = Math.random() * VIEW_W;
      w.bgStars[i].y = Math.random() * VIEW_H * 0.8;
    }
    for (i = 0; i < w.flakes.length; i++) {
      w.flakes[i].x = Math.random() * VIEW_W;
      w.flakes[i].y = Math.random() * VIEW_H;
    }
  }

  return {
    TILE: TILE,
    levelCount: function () { return LEVELS.length; },
    levelName: function (i) { return LEVELS[i].name; },

    on: function (name, fn) { hooks[name] = fn; },

    /* a living backdrop behind the menus */
    startMenu: function () {
      if (!ctx) setup();
      W = buildLevel(0);
      W.menu = true;
      W.camX = 0;
      W.camY = clampCamY(W.pxH);
      paused = false; lastT = 0; accT = 0;
      if (rafId == null && !suspended) rafId = requestAnimationFrame(loop);
    },

    start: function (index, cbs) {
      if (!ctx) setup();
      hooks.complete = cbs.complete; hooks.gameover = cbs.gameover; hooks.hud = cbs.hud;
      W = buildLevel(index);
      W.camX = clampCamX(W.p.x - VIEW_W / 2);
      W.camY = clampCamY(W.p.y - VIEW_H / 2);
      keys.left = keys.right = keys.jump = false; jumpEdge = false;
      paused = false; lastT = 0; accT = 0;
      hud();
      if (rafId == null && !suspended) rafId = requestAnimationFrame(loop);
    },

    stop: function () {
      W = null;
      if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
    },

    pause:  function () { paused = true;  keys.left = keys.right = keys.jump = false; },
    resume: function () { paused = false; lastT = 0; },

    /* Playables onPause: halt everything, rendering included. */
    suspend: function () {
      suspended = true;
      keys.left = keys.right = keys.jump = false;
      if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
    },
    /* Playables onResume: pick the loop back up. */
    unsuspend: function () {
      if (!suspended) return;
      suspended = false; lastT = 0; accT = 0;
      if (W && rafId == null) rafId = requestAnimationFrame(loop);
    },
    isSuspended: function () { return suspended; },
    resize: resize,
    isPaused: function () { return paused; },
    isRunning: function () { return !!W && !W.menu; },

    /* used by the automated tests */
    debug: function () { return W; },

    setKey: function (name, down) {
      if (!W || paused) return;
      if (name === 'jump') { if (down && !keys.jump) jumpEdge = true; keys.jump = down; }
      else keys[name] = down;
    }
  };
})();
