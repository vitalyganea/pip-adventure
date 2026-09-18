/* ===========================================================
   ui.js — menus, level map, progress saving, Playables lifecycle
   =========================================================== */
(function () {
  'use strict';

  var N = Game.levelCount();
  var LOAD_TIMEOUT = 3000;                  // never let a slow load block gameReady
  var SAVE_KEY = 'pip-save-v1';             // standalone builds only, see store()

  /* True only when running inside YouTube Playables. Outside it (opening
     index.html directly) the SDK is absent and we fall back to localStorage
     purely so the game is testable; inside Playables the SDK is the only
     mechanism used, as Integration req. 4 demands. */
  var IN_YT = !!(window.ytgame && window.ytgame.IN_PLAYABLES_ENV);

  /* -------------------------- saving ------------------------- */
  function defaults() { return { unlocked: 1, stars: {}, sfx: true, music: true }; }
  var save = defaults();
  var canSave = false;                      // flips on once loadData() has settled
  var saving = false, saveAgain = false;

  function adopt(raw) {
    if (!raw) return;
    try {
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return;
      // Tolerant on purpose: saves written by older versions must still load.
      save.unlocked = Math.min(N, Math.max(1, parseInt(o.unlocked, 10) || 1));
      save.stars = (o.stars && typeof o.stars === 'object') ? o.stars : {};
      save.sfx = o.sfx !== false;
      save.music = o.music !== false;
    } catch (e) { /* corrupt save — carry on with the defaults */ }
  }

  function loadSave() {
    if (IN_YT) {
      return Promise.race([
        window.ytgame.game.loadData().then(adopt, function () { /* no save yet */ }),
        new Promise(function (r) { setTimeout(r, LOAD_TIMEOUT); })
      ]);
    }
    try { adopt(localStorage.getItem(SAVE_KEY)); } catch (e) {}
    return Promise.resolve();
  }

  function store() {
    if (!canSave) return;                   // saveData must never precede loadData
    if (saving) { saveAgain = true; return; }
    var data = JSON.stringify(save);
    if (!IN_YT) {
      try { localStorage.setItem(SAVE_KEY, data); } catch (e) {}
      return;
    }
    saving = true;
    window.ytgame.game.saveData(data).then(done, function () {
      window.ytgame.game.saveData(data).then(done, done);   // one retry
    });
    function done() {
      saving = false;
      pushScore();
      if (saveAgain) { saveAgain = false; store(); }
    }
  }

  function totalStars() {
    var s = 0;
    for (var k in save.stars) if (save.stars.hasOwnProperty(k)) s += save.stars[k];
    return s;
  }

  /* Score dimension = stars collected, kept in step with the saved game. */
  var lastScore = -1;
  function pushScore() {
    if (!IN_YT || !window.ytgame.engagement) return;
    var v = totalStars();
    if (v === lastScore) return;
    lastScore = v;
    window.ytgame.engagement.sendScore({ value: v }).then(null, function () { lastScore = -1; });
  }

  /* ------------------------- elements ------------------------ */
  var $ = function (id) { return document.getElementById(id); };
  var screens = {
    title:    $('screen-title'),
    help:     $('screen-help'),
    levels:   $('screen-levels'),
    confirm:  $('screen-confirm'),
    pause:    $('screen-pause'),
    complete: $('screen-complete'),
    gameover: $('screen-gameover'),
    victory:  $('screen-victory')
  };
  var hud = $('hud'), touch = $('touch');
  var current = 0, currentScreen = 'title';

  var SCENE   = { title: 1, help: 1, levels: 1, confirm: 1, victory: 1 };
  var OVER_GAME = { pause: 1, complete: 1, gameover: 1 };

  function show(name) {
    currentScreen = name;
    for (var k in screens) screens[k].classList.toggle('hidden', k !== name);
    hud.classList.toggle('hidden', !OVER_GAME[name]);
    touch.classList.add('hidden');
    if (name === 'levels') buildGrid();
    if (SCENE[name]) Game.startMenu();
  }

  function showGame() {
    currentScreen = 'game';
    for (var k in screens) screens[k].classList.add('hidden');
    hud.classList.remove('hidden');
    touch.classList.remove('hidden');
  }

  /* --------------------------- HUD --------------------------- */
  function renderHud(s) {
    var h = '';
    for (var i = 0; i < s.max; i++) h += '<span class="h' + (i < s.hearts ? '' : ' lost') + '">❤️</span>';
    $('hearts').innerHTML = h;
    $('coin-count').textContent = s.got + ' / ' + s.total;
    $('level-name').textContent = (s.index + 1) + '. ' + s.name +
      (s.needKey ? (s.hasKey ? '  🔑' : '  🔒') : '');
  }

  /* ------------------------ level map ------------------------ */
  function buildGrid() {
    var grid = $('level-grid');
    grid.innerHTML = '';
    for (var i = 0; i < N; i++) {
      (function (idx) {
        var locked = idx + 1 > save.unlocked;
        var st = save.stars[idx] || 0;
        var b = document.createElement('button');
        b.className = 'lvl' + (locked ? ' locked' : (st ? ' done' : ''));
        b.title = Game.levelName(idx);
        b.setAttribute('aria-label', 'Level ' + (idx + 1) + ': ' + Game.levelName(idx) +
          (locked ? ' (locked)' : ', ' + st + ' of 3 stars'));
        b.disabled = locked;
        b.innerHTML = locked
          ? '<span>🔒</span>'
          : '<span>' + (idx + 1) + '</span><span class="lvl-stars">' +
            '★★★'.slice(0, st).padEnd(3, '☆') + '</span>';
        b.addEventListener('click', function () {
          if (locked) { Sfx.locked(); return; }
          Sfx.click(); play(idx);
        });
        grid.appendChild(b);
      })(i);
    }
    $('total-stars').textContent = totalStars();
    $('max-stars').textContent = N * 3;
  }

  /* --------------------------- game -------------------------- */
  function play(idx) {
    current = idx;
    showGame();
    Sfx.unlock();
    Game.start(idx, { hud: renderHud, complete: onComplete, gameover: onGameOver });
  }

  function onComplete(res) {
    var prev = save.stars[current] || 0;
    if (res.stars > prev) save.stars[current] = res.stars;
    if (current + 1 >= save.unlocked) save.unlocked = Math.min(N, current + 2);
    store();

    var sp = $('stars-earned').children;
    for (var i = 0; i < 3; i++) {
      sp[i].textContent = i < res.stars ? '★' : '☆';
      sp[i].classList.toggle('lit', i < res.stars);
    }
    $('complete-info').textContent = 'You collected ' + res.got + ' of ' + res.total + ' stars';

    var last = current + 1 >= N;
    screens.complete.querySelector('[data-action="next"]').textContent =
      last ? '🏆 See the ending' : 'Next level ⟶';

    Game.pause();
    show('complete');
  }

  function onGameOver() {
    Game.pause();
    show('gameover');
  }

  /* -------------------------- actions ------------------------ */
  function act(name) {
    switch (name) {
      case 'play':        Sfx.click(); play(Math.min(save.unlocked - 1, N - 1)); break;
      case 'levels':      Sfx.click(); Game.stop(); show('levels'); break;
      case 'help':        Sfx.click(); show('help'); break;
      case 'back-title':  Sfx.click(); Game.stop(); show('title'); break;
      case 'resume':      Sfx.click(); showGame(); Game.resume(); break;
      case 'restart':     Sfx.click(); play(current); break;
      case 'reset':       Sfx.click(); show('confirm'); break;
      case 'confirm-no':  Sfx.click(); show('levels'); break;
      case 'confirm-yes':
        Sfx.click();
        var sfx = save.sfx, music = save.music;
        save = defaults(); save.sfx = sfx; save.music = music;
        store(); show('levels');
        break;
      case 'next':
        Sfx.click();
        if (current + 1 >= N) {
          Game.stop();
          $('victory-stars').textContent = '⭐ ' + totalStars() + ' / ' + (N * 3);
          show('victory');
        } else { play(current + 1); }
        break;
    }
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-action]') : null;
    if (t) act(t.getAttribute('data-action'));
  });

  $('btn-menu').addEventListener('click', function () {
    if (!Game.isRunning() || Game.isPaused()) return;
    Sfx.click(); Game.pause(); show('pause');
  });

  /* ----------------------- audio toggles --------------------- */
  function syncToggles() {
    [['t-sfx', 't-sfx2', save.sfx], ['t-music', 't-music2', save.music]].forEach(function (g) {
      [$(g[0]), $(g[1])].forEach(function (el) {
        if (!el) return;
        el.classList.toggle('on', g[2]);
        el.setAttribute('aria-pressed', g[2] ? 'true' : 'false');
      });
    });
  }
  function toggleSfx() {
    save.sfx = !save.sfx; store(); Sfx.sound(save.sfx); syncToggles();
    if (save.sfx) Sfx.click();
  }
  function toggleMusic() {
    save.music = !save.music; store(); Sfx.unlock(); Sfx.music(save.music); syncToggles();
  }
  ['t-sfx', 't-sfx2'].forEach(function (id) { var e = $(id); if (e) e.addEventListener('click', toggleSfx); });
  ['t-music', 't-music2'].forEach(function (id) { var e = $(id); if (e) e.addEventListener('click', toggleMusic); });

  /* ------------------------- keyboard ------------------------ */
  /* Esc is never swallowed: Design req. 2 forbids preventDefault() on it. */
  function onEscape() {
    if (currentScreen === 'help' || currentScreen === 'levels') { Sfx.click(); act('back-title'); }
    else if (currentScreen === 'confirm') { Sfx.click(); act('confirm-no'); }
    else if (currentScreen === 'pause') { act('resume'); }
    else if (Game.isRunning() && !Game.isPaused()) { Game.pause(); show('pause'); }
  }

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { onEscape(); return; }
    if (!Game.isRunning()) return;
    if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      if (Game.isPaused()) { if (currentScreen === 'pause') act('resume'); }
      else { Game.pause(); show('pause'); }
    } else if ((e.key === 'r' || e.key === 'R') && !Game.isPaused()) {
      e.preventDefault(); play(current);
    }
  });

  /* ------------ on-screen controls (pointer = mouse + touch) -- */
  Array.prototype.forEach.call(touch.querySelectorAll('.tbtn'), function (b) {
    var key = b.getAttribute('data-key');
    function press(e) {
      e.preventDefault();
      if (e.pointerId != null && b.setPointerCapture) {
        try { b.setPointerCapture(e.pointerId); } catch (err) {}
      }
      b.classList.add('down');
      Sfx.unlock();
      Game.setKey(key, true);
    }
    function release(e) {
      if (e && e.preventDefault) e.preventDefault();
      b.classList.remove('down');
      Game.setKey(key, false);
    }
    b.addEventListener('pointerdown', press);
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    b.addEventListener('lostpointercapture', release);
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  });
  // safety net: a pointer released anywhere clears every held control
  window.addEventListener('pointerup', function () {
    Array.prototype.forEach.call(touch.querySelectorAll('.tbtn.down'), function (b) {
      b.classList.remove('down');
      Game.setKey(b.getAttribute('data-key'), false);
    });
  });

  /* ------------------ Playables lifecycle -------------------- */
  function platformPause() {
    if (Game.isRunning() && !Game.isPaused()) {
      Game.pause();
      show('pause');
      store();                       // SHOULD save progress on pause
    }
    Game.suspend();                  // stops the loop and rendering entirely
  }
  function platformResume() { Game.unsuspend(); }

  function bootSdk() {
    if (!IN_YT) return;
    var sys = window.ytgame.system;
    sys.onPause(platformPause);
    sys.onResume(platformResume);
    try { Sfx.platformAudio(sys.isAudioEnabled()); } catch (e) {}
    sys.onAudioEnabledChange(function (on) { Sfx.platformAudio(on); });
  }

  function announce(fn) {
    if (!IN_YT) return;
    try { window.ytgame.game[fn](); } catch (e) {}
  }

  /* -------------------- unlocking the audio ------------------ */
  function firstGesture() {
    Sfx.unlock();
    Sfx.sound(save.sfx);
    Sfx.music(save.music);
    window.removeEventListener('pointerdown', firstGesture);
    window.removeEventListener('keydown', firstGesture);
  }
  window.addEventListener('pointerdown', firstGesture);
  window.addEventListener('keydown', firstGesture);

  /* --------------------------- boot -------------------------- */
  bootSdk();
  Sfx.sound(save.sfx);
  syncToggles();
  show('title');

  // A frame has been drawn: tell YouTube the game is on screen.
  requestAnimationFrame(function () {
    announce('firstFrameReady');
    loadSave().then(function () {
      canSave = true;
      syncToggles();
      Sfx.sound(save.sfx);
      if (currentScreen === 'levels') buildGrid();
      pushScore();
      announce('gameReady');         // title menu is up and fully interactive
    });
  });
})();
