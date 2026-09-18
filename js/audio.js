/* ===========================================================
   audio.js — sounds and music synthesised with WebAudio (no files)
   =========================================================== */
var Sfx = (function () {
  var ctx = null, master = null, sfxBus = null, musBus = null;
  var sfxOn = true, musOn = true;
  var platformOn = true;          // YouTube's own audio setting — overrides everything
  var musicTimer = null, step = 0, nextTime = 0;

  var STEP_DUR = 0.16;           // length of one eighth note
  var LOOKAHEAD = 0.25;          // how far ahead notes get scheduled

  function init() {
    if (ctx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();  master.gain.value = platformOn ? 0.85 : 0; master.connect(ctx.destination);
    sfxBus = ctx.createGain();  sfxBus.gain.value = 0.55; sfxBus.connect(master);
    musBus = ctx.createGain();  musBus.gain.value = 0.0;  musBus.connect(master);
  }

  function resume() {
    init();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  /* ---------- a simple enveloped tone ---------- */
  function tone(o) {
    if (!sfxOn || !platformOn || !ctx) return;
    var t0   = ctx.currentTime + (o.delay || 0);
    var dur  = o.dur || 0.12;
    var osc  = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
    var v = (o.vol == null ? 0.3 : o.vol);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(v, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain); gain.connect(sfxBus);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }

  function noise(dur, vol, freq) {
    if (!sfxOn || !platformOn || !ctx) return;
    var t0 = ctx.currentTime;
    var len = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var flt = ctx.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = freq || 900;
    var g = ctx.createGain(); g.gain.value = vol || 0.2;
    src.connect(flt); flt.connect(g); g.connect(sfxBus);
    src.start(t0);
  }

  /* ---------- sound effects ---------- */
  var api = {
    unlock: resume,

    jump:  function(){ tone({ freq:330, to:640, dur:0.16, type:'square',   vol:0.22 }); },
    land:  function(){ noise(0.08, 0.10, 500); },
    coin:  function(){ tone({ freq:1046, dur:0.07, type:'triangle', vol:0.26 });
                       tone({ freq:1568, dur:0.14, type:'triangle', vol:0.22, delay:0.06 }); },
    gem:   function(){ [784,1046,1318,1760].forEach(function(f,i){
                         tone({ freq:f, dur:0.16, type:'triangle', vol:0.24, delay:i*0.055 }); }); },
    stomp: function(){ tone({ freq:420, to:120, dur:0.16, type:'sawtooth', vol:0.22 }); noise(0.1,0.16,300); },
    spring:function(){ tone({ freq:260, to:900, dur:0.24, type:'sine',     vol:0.28 }); },
    key:   function(){ [659,880,1174].forEach(function(f,i){
                         tone({ freq:f, dur:0.2, type:'triangle', vol:0.26, delay:i*0.08 }); }); },
    hurt:  function(){ tone({ freq:400, to:90,  dur:0.32, type:'sawtooth', vol:0.26 }); },
    die:   function(){ [523,392,330,196].forEach(function(f,i){
                         tone({ freq:f, dur:0.26, type:'square', vol:0.24, delay:i*0.13 }); }); },
    win:   function(){ [523,659,784,1046,1318].forEach(function(f,i){
                         tone({ freq:f, dur:0.3, type:'triangle', vol:0.28, delay:i*0.1 }); }); },
    click: function(){ tone({ freq:700, to:1000, dur:0.06, type:'square', vol:0.16 }); },
    locked:function(){ tone({ freq:180, dur:0.1, type:'square', vol:0.2 });
                       tone({ freq:140, dur:0.14, type:'square', vol:0.2, delay:0.1 }); }
  };

  /* ---------- background music ---------- */
  // C major: I - V - vi - IV  (C, G, Am, F)
  var CHORDS = [[261.63,329.63,392.00], [196.00,246.94,392.00],
                [220.00,261.63,329.63], [174.61,220.00,261.63]];
  var BASS   = [130.81, 98.00, 110.00, 87.31];
  // 32-step melody (0 = rest), C major pentatonic
  var MEL = [523.25,0,659.25,0,783.99,0,659.25,0,
             587.33,0,493.88,0,587.33,659.25,0,0,
             440.00,0,523.25,0,659.25,0,523.25,0,
             349.23,392.00,440.00,0,523.25,0,0,0];

  function playNote(freq, time, dur, type, vol) {
    var osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(vol, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(g); g.connect(musBus);
    osc.start(time); osc.stop(time + dur + 0.05);
  }

  function schedule() {
    if (!ctx) return;
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      var bar = Math.floor(step / 8) % 4;
      var beat = step % 8;

      if (beat === 0) {                                   // sustained chord
        CHORDS[bar].forEach(function (f) { playNote(f, nextTime, 1.15, 'sine', 0.055); });
      }
      if (beat % 2 === 0) {                               // bass
        playNote(BASS[bar], nextTime, 0.26, 'triangle', 0.10);
      }
      var m = MEL[step % 32];
      if (m) playNote(m, nextTime, 0.22, 'triangle', 0.075);

      nextTime += STEP_DUR;
      step = (step + 1) % 32;
    }
  }

  function startMusic() {
    resume();
    if (!ctx || musicTimer) return;
    step = 0; nextTime = ctx.currentTime + 0.1;
    musicTimer = setInterval(schedule, 60);
    musBus.gain.cancelScheduledValues(ctx.currentTime);
    musBus.gain.setValueAtTime(musBus.gain.value, ctx.currentTime);
    musBus.gain.linearRampToValueAtTime(musOn ? 0.5 : 0, ctx.currentTime + 1.2);
  }

  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    if (ctx) {
      musBus.gain.cancelScheduledValues(ctx.currentTime);
      musBus.gain.setValueAtTime(musBus.gain.value, ctx.currentTime);
      musBus.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
    }
  }

  api.music = function (on) {
    musOn = on;
    if (on) startMusic(); else stopMusic();
  };
  api.sound  = function (on) { sfxOn = on; };

  /* Driven by ytgame.system.isAudioEnabled / onAudioEnabledChange.
     When YouTube has audio off nothing may be output, whatever the in-game
     toggles say (Integration req. 5). */
  api.platformAudio = function (on) {
    platformOn = !!on;
    if (!ctx) return;
    var t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(platformOn ? 0.85 : 0, t + 0.15);
  };
  api.isPlatformAudio = function () { return platformOn; };
  api.isMusic = function () { return musOn; };
  api.isSound = function () { return sfxOn; };

  return api;
})();
