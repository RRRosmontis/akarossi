'use strict';
/* ============================================================
 * 雷霆战机 Thunder Fighter —— Canvas 2D 纵向卷轴射击
 * 素材: Kenney Space Shooter Redux (CC0)
 * ============================================================ */

// ---------------- 基础常量 ----------------
var W = 420, H = 720;
var ASSET_DIR = 'assets/';

var IMG_SRC = {
  bg: 'bg.png', player: 'player.png', life: 'life.png',
  scout: 'enemy_scout.png', fighter: 'enemy_fighter.png', striker: 'enemy_striker.png',
  heavy: 'enemy_heavy.png', bossA: 'boss_a.png', bossB: 'boss_b.png',
  bossC: 'boss_c.png', bossD: 'boss_d.png', ufo: 'ufo.png',
  meteor1: 'meteor1.png', meteor2: 'meteor2.png', meteor3: 'meteor3.png',
  bPlayer: 'bullet_player.png', bPlayer2: 'bullet_player2.png', bEnemy: 'bullet_enemy.png',
  powWeapon: 'pow_weapon.png', powShield: 'pow_shield.png', powBomb: 'pow_bomb.png', powLife: 'pow_life.png',
  powMissile: 'pow_missile.png', powScore: 'pow_score.png', powSlow: 'pow_slow.png', powDrone: 'pow_drone.png',
  shieldFx: 'shield_fx.png',
  fire1: 'fire1.png', fire2: 'fire2.png', fire3: 'fire3.png', fire4: 'fire4.png'
};

var SND_SRC = {
  laser: 'sfx_laser.mp3', elaser: 'sfx_elaser.mp3', powerup: 'sfx_powerup.mp3',
  shieldUp: 'sfx_shield_up.mp3', shieldDown: 'sfx_shield_down.mp3',
  lose: 'sfx_lose.mp3', hit: 'sfx_hit.mp3'
};

var IMG = {};   // name -> Image
var SND = {};   // name -> AudioBuffer

// ---------------- 小工具 ----------------
function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
function wrapAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

// ---------------- 画布 ----------------
var canvas = document.getElementById('game');
var ctx = canvas.getContext('2d');
var DPR = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = W * DPR;
canvas.height = H * DPR;
ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

// ---------------- 音频引擎 ----------------
var AC = null;
var masterGain = null, sfxGain = null, bgmGain = null;
var noiseBuf = null;
var muted = localStorage.getItem('tf_mute') === '1';

function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  var Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;
  AC = new Ctor();
  masterGain = AC.createGain();
  masterGain.gain.value = muted ? 0 : 1;
  masterGain.connect(AC.destination);
  sfxGain = AC.createGain();
  sfxGain.gain.value = 0.8;
  sfxGain.connect(masterGain);
  bgmGain = AC.createGain();
  bgmGain.gain.value = 0.16;
  bgmGain.connect(masterGain);

  // 共享噪声 buffer（爆炸 / 鼓点用）
  var len = AC.sampleRate * 1.2;
  noiseBuf = AC.createBuffer(1, len, AC.sampleRate);
  var d = noiseBuf.getChannelData(0);
  for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

  // 解码音效
  Object.keys(SND_SRC).forEach(function (name) {
    fetch(ASSET_DIR + SND_SRC[name]).then(function (r) { return r.arrayBuffer(); })
      .then(function (ab) { return AC.decodeAudioData(ab); })
      .then(function (buf) { SND[name] = buf; })
      .catch(function () { /* 忽略单个音效失败 */ });
  });
}

function sfx(name, vol, rate) {
  if (!AC || !SND[name]) return;
  var src = AC.createBufferSource();
  src.buffer = SND[name];
  src.playbackRate.value = rate || 1;
  var g = AC.createGain();
  g.gain.value = (vol == null ? 1 : vol);
  src.connect(g);
  g.connect(sfxGain);
  src.start();
}

// 合成爆炸声（素材包无爆炸音效）
function sfxExplosion(big) {
  if (!AC || !noiseBuf) return;
  var t = AC.currentTime;
  var src = AC.createBufferSource();
  src.buffer = noiseBuf;
  var lp = AC.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(big ? 2600 : 3400, t);
  lp.frequency.exponentialRampToValueAtTime(90, t + (big ? 0.7 : 0.35));
  var g = AC.createGain();
  g.gain.setValueAtTime(big ? 0.9 : 0.45, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + (big ? 0.8 : 0.4));
  src.connect(lp); lp.connect(g); g.connect(sfxGain);
  src.start(t);
  src.stop(t + (big ? 0.85 : 0.45));
  if (big) {
    var o = AC.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(32, t + 0.5);
    var g2 = AC.createGain();
    g2.gain.setValueAtTime(0.8, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    o.connect(g2); g2.connect(sfxGain);
    o.start(t); o.stop(t + 0.6);
  }
}

// ---------------- BGM（程序化循环） ----------------
var bgm = { on: false, timer: null, step: 0, nextTime: 0 };
// Am - F - C - G 进行，每和弦 8 个 16 分音符
var BGM_BASS = [55, 55, 0, 55, 43.65, 43.65, 0, 43.65, 65.41, 65.41, 0, 65.41, 49, 49, 0, 49,
                55, 55, 0, 55, 43.65, 43.65, 0, 43.65, 65.41, 65.41, 0, 65.41, 49, 49, 0, 49];
var BGM_ARP = [220, 261.63, 329.63, 440, 174.61, 220, 261.63, 349.23,
               261.63, 329.63, 392, 523.25, 196, 246.94, 293.66, 392,
               220, 261.63, 329.63, 440, 174.61, 220, 261.63, 349.23,
               261.63, 329.63, 392, 523.25, 293.66, 392, 493.88, 587.33];
var BGM_STEP = 60 / 132 / 4; // 132 BPM，16 分音符

function bgmStart() {
  if (!AC || bgm.on) return;
  bgm.on = true;
  bgm.step = 0;
  bgm.nextTime = AC.currentTime + 0.1;
  bgm.timer = setInterval(bgmTick, 90);
}

function bgmStop() {
  bgm.on = false;
  if (bgm.timer) { clearInterval(bgm.timer); bgm.timer = null; }
}

function bgmTick() {
  if (!bgm.on) return;
  while (bgm.nextTime < AC.currentTime + 0.25) {
    bgmPlayStep(bgm.step, bgm.nextTime);
    bgm.nextTime += BGM_STEP;
    bgm.step = (bgm.step + 1) % 32;
  }
}

function bgmPlayStep(step, t) {
  if (!AC) return;
  var bassF = BGM_BASS[step];
  if (bassF) {
    var o = AC.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = bassF;
    var lp = AC.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    var g = AC.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + BGM_STEP * 3.5);
    o.connect(lp); lp.connect(g); g.connect(bgmGain);
    o.start(t); o.stop(t + BGM_STEP * 4);
  }
  var arpF = BGM_ARP[step];
  if (arpF) {
    var o2 = AC.createOscillator();
    o2.type = 'square';
    o2.frequency.value = arpF;
    var g2 = AC.createGain();
    g2.gain.setValueAtTime(0.11, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + BGM_STEP * 1.8);
    o2.connect(g2); g2.connect(bgmGain);
    o2.start(t); o2.stop(t + BGM_STEP * 2);
  }
  if (step % 4 === 0 && noiseBuf) { // 底鼓
    var o3 = AC.createOscillator();
    o3.type = 'sine';
    o3.frequency.setValueAtTime(130, t);
    o3.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    var g3 = AC.createGain();
    g3.gain.setValueAtTime(0.55, t);
    g3.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o3.connect(g3); g3.connect(bgmGain);
    o3.start(t); o3.stop(t + 0.16);
  }
  if (step % 2 === 1 && noiseBuf) { // 踩镲
    var src = AC.createBufferSource();
    src.buffer = noiseBuf;
    var hp = AC.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    var g4 = AC.createGain();
    g4.gain.setValueAtTime(0.08, t);
    g4.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(hp); hp.connect(g4); g4.connect(bgmGain);
    src.start(t); src.stop(t + 0.06);
  }
}

function setMuted(m) {
  muted = m;
  localStorage.setItem('tf_mute', m ? '1' : '0');
  if (masterGain) masterGain.gain.value = m ? 0 : 1;
  var btn = document.getElementById('btn-mute');
  btn.classList.toggle('muted', m);
}

// ---------------- 输入 ----------------
var keys = {};
var pointer = { active: false, x: 0, y: 0 };

window.addEventListener('keydown', function (e) {
  var k = e.key.toLowerCase();
  keys[k] = true;
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(k) >= 0) e.preventDefault();
  if (k === ' ' || k === 'z' || k === 'x') { if (game.state === 'playing') useBomb(); }
  if (k === 'p' || k === 'escape') { if (game.state === 'playing' || game.state === 'paused') togglePause(); }
  if (k === 'm') setMuted(!muted);
  if (k === 'enter') {
    if (game.state === 'title') startGame();
    else if (game.state === 'gameover' && !document.getElementById('gameover-screen').classList.contains('hidden')) startGame();
  }
});
window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });

function canvasPos(e) {
  var r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * W / r.width,
    y: (e.clientY - r.top) * H / r.height
  };
}
canvas.addEventListener('pointerdown', function (e) {
  if (game.state !== 'playing') return;
  pointer.active = true;
  var p = canvasPos(e);
  pointer.x = p.x; pointer.y = p.y;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', function (e) {
  if (!pointer.active) return;
  var p = canvasPos(e);
  pointer.x = p.x; pointer.y = p.y;
});
canvas.addEventListener('pointerup', function () { pointer.active = false; });
canvas.addEventListener('pointercancel', function () { pointer.active = false; });

// ---------------- 游戏状态 ----------------
var game = {
  state: 'loading',   // loading / title / playing / paused / gameover
  score: 0,
  high: parseInt(localStorage.getItem('tf_high') || '0', 10) || 0,
  level: 1,
  lives: 3,
  bombs: 2,
  time: 0,
  shake: 0,
  flash: 0,          // 炸弹白闪
  overT: 0,
  scoreMulT: 0,      // 双倍分数剩余秒数
  slowT: 0,          // 时间减缓剩余秒数
  levelClearT: 0,
  combo: 0,          // 连击数
  comboT: 0,         // 连击剩余窗口
  comboPop: 0,       // 连击弹跳动画
  hurtFlash: 0,      // 受击红屏
  levelDur: 78,      // 当前关时长（进度条用）
  banner: null,      // {text, sub, t, dur}
  warning: 0         // Boss 警告计时
};

var MAX_LIVES = 5, MAX_BOMBS = 5, MAX_WEAPON = 5;

var player = {
  x: W / 2, y: H - 100, r: 11, speed: 360,
  weapon: 1, fireT: 0, invT: 0, shieldT: 0, shieldN: 0,
  alive: true, respawnT: 0, tilt: 0, trailT: 0,
  missileT: 0, missileFireT: 0, droneT: 0,
  enterT: 0, enterDur: 1.6   // 入场动画
};
var drone = null;   // 僚机 {x,y,fireT}
var bgStreaks = []; // 背景流星 {x,y,vx,vy,life,max}
var cam = { scale: 1, target: 1 }; // Boss 战镜头缩放

var bulletsP = [];  // {x,y,vx,vy,dmg,img,r,scale}
var bulletsE = [];  // {x,y,vx,vy,r}
var enemies = [];   // 由 addEnemy 创建
var powerups = [];  // {x,y,vy,kind,img,t}
var particles = [];
var rings = [];     // 冲击波 {x,y,r,maxR,t,dur,color}
var popTexts = [];  // {x,y,vy,life,str,color,size}
var stars = [];
var boss = null;
var bgScroll = 0;

for (var si = 0; si < 90; si++) {
  stars.push({ x: rand(0, W), y: rand(0, H), sp: pick([22, 48, 95]), s: rand(0.6, 2.2), tw: rand(0, 6.28) });
}

// ---------------- 玩家武器 ----------------
function firePlayer() {
  var px = player.x, py = player.y - 22;
  var w = player.weapon;
  var img1 = IMG.bPlayer, img2 = IMG.bPlayer2;
  function b(dx, dy, vx, vy, dmg, img) {
    bulletsP.push({ x: px + dx, y: py + dy, vx: vx, vy: vy, dmg: dmg, img: img, r: 5 });
  }
  if (w === 1) {
    b(0, 0, 0, -580, 12, img1);
  } else if (w === 2) {
    b(-10, 0, 0, -580, 12, img1); b(10, 0, 0, -580, 12, img1);
  } else if (w === 3) {
    b(0, -4, 0, -600, 14, img1);
    b(-12, 4, -95, -560, 11, img2); b(12, 4, 95, -560, 11, img2);
  } else if (w === 4) {
    b(-11, -2, 0, -600, 13, img1); b(11, -2, 0, -600, 13, img1);
    b(-20, 6, -130, -550, 11, img2); b(20, 6, 130, -550, 11, img2);
  } else {
    b(0, -8, 0, -640, 26, img1);
    b(-13, 0, 0, -600, 13, img1); b(13, 0, 0, -600, 13, img1);
    b(-24, 8, -150, -540, 12, img2); b(24, 8, 150, -540, 12, img2);
  }
  sfx('laser', 0.35, rand(0.95, 1.08));
}

// ---------------- 敌机定义 ----------------
var ENEMY_DEFS = {
  scout:   { img: 'scout',   hp: 14,  r: 17, score: 100, scale: 0.52 },
  fighter: { img: 'fighter', hp: 32,  r: 18, score: 200, scale: 0.52 },
  striker: { img: 'striker', hp: 48,  r: 20, score: 300, scale: 0.55 },
  heavy:   { img: 'heavy',   hp: 130, r: 25, score: 500, scale: 0.66 },
  ufo:     { img: 'ufo',     hp: 26,  r: 17, score: 400, scale: 0.46 },
  meteor1: { img: 'meteor1', hp: 46,  r: 22, score: 150, scale: 0.52 },
  meteor2: { img: 'meteor2', hp: 30,  r: 17, score: 120, scale: 0.55 },
  meteor3: { img: 'meteor3', hp: 30,  r: 17, score: 120, scale: 0.55 }
};

function addEnemy(type, x, y, opts) {
  var def = ENEMY_DEFS[type];
  var hpMul = 1 + (game.level - 1) * 0.22;
  var e = {
    type: type, def: def, img: IMG[def.img],
    x: x, y: y, baseX: x,
    vx: 0, vy: 0,
    hp: Math.round(def.hp * hpMul), maxHp: Math.round(def.hp * hpMul),
    r: def.r, score: def.score,
    t: 0, fireT: rand(0.8, 1.6), flashT: 0,
    rot: 0, rotV: 0, phase: rand(0, 6.28),
    dead: false
  };
  if (type === 'scout') e.vy = rand(140, 170) + game.level * 4;
  if (type === 'fighter') e.vy = 100;
  if (type === 'striker') { e.vy = 140; e.targetY = rand(150, 230); e.hoverT = rand(2.6, 3.6); e.leaving = false; }
  if (type === 'heavy') e.vy = 58;
  if (type === 'ufo') e.vy = 0;
  if (type.indexOf('meteor') === 0) { e.vy = rand(100, 160); e.vx = rand(-45, 45); e.rotV = rand(-1.6, 1.6); }
  if (opts) for (var k in opts) e[k] = opts[k];  // opts 覆盖默认参数
  enemies.push(e);
  return e;
}

// ---------------- 敌方子弹 ----------------
// type: normal / homing(追踪) / big(大型弹) / wobble(曲线弹)
function eb(x, y, angle, speed, opts) {
  var b = { x: x, y: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            r: 5, type: 'normal', scale: 1, spd: speed };
  if (opts) for (var k in opts) b[k] = opts[k];
  if (b.type === 'wobble') { b.baseAng = angle; b.wobT = 0; if (b.phase == null) b.phase = rand(0, 6.28); }
  if (b.type === 'homing') { b.trackT = 3.5; }
  bulletsE.push(b);
  return b;
}

function enemyFireAimed(e, speed, spread, count, opts) {
  var ang = Math.atan2(player.y - e.y, player.x - e.x);
  for (var i = 0; i < count; i++) {
    var a = ang + (count > 1 ? (i - (count - 1) / 2) * spread : 0);
    eb(e.x, e.y + e.r * 0.5, a, speed, opts);
  }
  sfx('elaser', 0.18, rand(0.9, 1.05));
}

function enemyFireRadial(e, speed, count, offset, opts) {
  for (var i = 0; i < count; i++) {
    var a = (Math.PI * 2 * i / count) + (offset || 0);
    eb(e.x, e.y, a, speed, opts);
  }
  sfx('elaser', 0.16, 0.8);
}

function updateEnemy(e, dt) {
  e.t += dt;
  if (e.flashT > 0) e.flashT -= dt;
  var L = game.level;
  var bulletSpd = 195 + L * 9;

  // 环形编队（绕中心旋转，悬停扫射后离场）
  if (e.orbit) {
    var o = e.orbit;
    if (!e.leaving) {
      o.ang += o.angV * dt;
      o.cy += o.drop * dt;
      if (o.targetCy != null && o.cy >= o.targetCy) { o.cy = o.targetCy; o.drop = 6; }
      e.x = o.cx + Math.cos(o.ang) * o.r;
      e.y = o.cy + Math.sin(o.ang) * o.r;
      e.hoverT -= dt;
      e.fireT -= dt;
      if (e.fireT <= 0 && e.y > 10) {
        enemyFireAimed(e, bulletSpd * 0.9, 0.15, 2);
        e.fireT = rand(1.4, 1.9) * Math.max(0.65, 1 - L * 0.04);
      }
      if (e.hoverT <= 0) { e.leaving = true; e.vy = 185; }
    } else {
      e.y += e.vy * dt;
    }
  } else switch (e.type) {
    case 'scout':
      if (e.sideVx) {          // 侧翼横穿
        e.x += e.sideVx * dt;
        e.y += e.vy * dt;
      } else {
        e.y += e.vy * dt;
        e.x = e.holdX ? e.baseX : e.baseX + Math.sin(e.t * 3 + e.phase) * 85;
      }
      if (L >= 2 && !e.fired && e.t > 1.1 && Math.random() < 0.4) {
        e.fired = true;
        if (e.y > 0 && e.y < H * 0.6) enemyFireAimed(e, bulletSpd, 0, 1);
      }
      break;
    case 'fighter':
      if (e.y < 170) e.y += e.vy * dt;
      else {
        e.y += 34 * dt;
        e.x = e.holdX ? e.baseX : e.baseX + Math.sin(e.t * 1.6 + e.phase) * 60;
      }
      e.fireT -= dt;
      if (e.fireT <= 0 && e.y > 0) {
        enemyFireAimed(e, bulletSpd, 0.09, L >= 4 ? 3 : L >= 2 ? 2 : 1, { shape: 'orb', color: '#ff9d5c' });
        e.fireT = rand(1.3, 1.9) * Math.max(0.55, 1 - L * 0.05);
      }
      break;
    case 'striker':
      if (!e.leaving) {
        if (e.y < e.targetY) e.y += e.vy * dt;
        else {
          e.hoverT -= dt;
          e.fireT -= dt;
          if (e.fireT <= 0) {
            // L2 起交替使用曲线光点弹
            if (L >= 2 && (e.fanN = (e.fanN || 0) + 1) % 2 === 0) {
              var ang0 = Math.atan2(player.y - e.y, player.x - e.x);
              for (var wi = -1; wi <= 1; wi++) {
                eb(e.x, e.y + e.r * 0.5, ang0 + wi * 0.3, bulletSpd * 0.9, { type: 'wobble', shape: 'orb', color: '#ffd76c' });
              }
              sfx('elaser', 0.18, 0.85);
            } else {
              enemyFireAimed(e, bulletSpd * 0.95, 0.34, 3);
            }
            e.fireT = rand(1.15, 1.5) * Math.max(0.55, 1 - L * 0.05);
          }
          if (e.hoverT <= 0) { e.leaving = true; e.vy = 175; }
        }
      } else e.y += e.vy * dt;
      break;
    case 'heavy':
      e.y += e.vy * dt;
      e.x = e.baseX + Math.sin(e.t * 0.9 + e.phase) * 40;
      e.fireT -= dt;
      if (e.fireT <= 0 && e.y > 20) {
        enemyFireRadial(e, bulletSpd * 0.72, L >= 4 ? 16 : 14, rand(0, 0.6));
        if (L >= 3) {  // L3 起附带 3 颗追踪光点弹
          var angH = Math.atan2(player.y - e.y, player.x - e.x);
          for (var hi = -1; hi <= 1; hi++) {
            eb(e.x, e.y, angH + hi * 0.45, bulletSpd * 0.62, { type: 'homing', turn: 1.05, shape: 'orb', color: '#ff5c8a' });
          }
        }
        e.fireT = rand(2.3, 2.9) * Math.max(0.55, 1 - L * 0.05);
      }
      break;
    case 'ufo':
      e.x += e.vx * dt;
      if (L >= 3) {  // L3 起 UFO 抛洒曲线光点弹
        e.fireT -= dt;
        if (e.fireT <= 0 && e.x > 30 && e.x < W - 30) {
          eb(e.x, e.y + 14, Math.PI / 2, bulletSpd * 0.8, { type: 'wobble', shape: 'orb', color: '#c07dff' });
          e.fireT = 1.3;
        }
      }
      break;
    default: // meteors
      e.y += e.vy * dt;
      e.x += e.vx * dt;
      e.rot += e.rotV * dt;
      break;
  }

  // 飞出屏幕处理（上方允许深度待命，编队从场外进入）
  if (e.y > H + 80 || e.x < -320 || e.x > W + 320 || e.y < -1200) e.dead = true;
}

// ---------------- 补给 ----------------
var POW_DEFS = {
  weapon: { img: 'powWeapon' },
  shield: { img: 'powShield' },
  bomb:   { img: 'powBomb' },
  life:   { img: 'powLife' },
  missile:{ img: 'powMissile' },
  score:  { img: 'powScore' },
  slow:   { img: 'powSlow' },
  drone:  { img: 'powDrone' }
};

function dropPowerup(x, y, forceKind) {
  var kind = forceKind;
  if (!kind) {
    var roll = Math.random() * 100;
    if (roll < 26) kind = 'weapon';
    else if (roll < 40) kind = 'bomb';
    else if (roll < 56) kind = 'shield';
    else if (roll < 64) kind = 'life';
    else if (roll < 76) kind = 'missile';
    else if (roll < 86) kind = 'score';
    else if (roll < 94) kind = 'slow';
    else kind = 'drone';
  }
  powerups.push({ x: x, y: y, vy: 88, kind: kind, img: IMG[POW_DEFS[kind].img], t: rand(0, 6.28) });
}

function maybeDrop(e) {
  var chance = 0;
  if (e.type === 'fighter') chance = 0.10;
  else if (e.type === 'striker') chance = 0.16;
  else if (e.type === 'heavy') chance = 0.30;
  else if (e.type === 'ufo') chance = 1.0;
  else if (e.type.indexOf('meteor') === 0) chance = 0.07;
  else chance = 0.03;
  if (Math.random() < chance) dropPowerup(e.x, e.y);
}

function applyPowerup(kind) {
  if (kind === 'weapon') {
    if (player.weapon < MAX_WEAPON) { player.weapon++; addText(player.x, player.y - 40, '火力提升!', '#7df3ff', 16); }
    else { gainScore(300); addText(player.x, player.y - 40, '+300', '#ffd76c', 14); }
  } else if (kind === 'shield') {
    player.shieldN = 3;
    player.shieldT = 15;
    sfx('shieldUp', 0.6);
    addText(player.x, player.y - 40, '能量护盾 x3!', '#7dffb0', 16);
  } else if (kind === 'bomb') {
    if (game.bombs < MAX_BOMBS) { game.bombs++; addText(player.x, player.y - 40, '炸弹 +1', '#ff9d6c', 16); }
    else { gainScore(300); addText(player.x, player.y - 40, '+300', '#ffd76c', 14); }
  } else if (kind === 'life') {
    if (game.lives < MAX_LIVES) { game.lives++; addText(player.x, player.y - 40, '生命 +1!', '#ff8fb3', 17); }
    else { gainScore(500); addText(player.x, player.y - 40, '+500', '#ffd76c', 14); }
  } else if (kind === 'missile') {
    player.missileT = 15;
    addText(player.x, player.y - 40, '导弹支援!', '#ffb35c', 16);
  } else if (kind === 'score') {
    game.scoreMulT = 20;
    addText(player.x, player.y - 40, '双倍分数!', '#ffd76c', 16);
  } else if (kind === 'slow') {
    game.slowT = 8;
    addText(player.x, player.y - 40, '时间减缓!', '#9adcff', 16);
  } else if (kind === 'drone') {
    player.droneT = 25;
    if (!drone) drone = { x: player.x - 52, y: player.y + 30, fireT: 0.3 };
    addText(player.x, player.y - 40, '僚机出击!', '#7df3ff', 16);
  }
  updateBombButton();
  sfx('powerup', 0.55, rand(0.95, 1.05));
}

// ---------------- 特效 ----------------
function addText(x, y, str, color, size) {
  popTexts.push({ x: x, y: y, vy: -46, life: 1.1, str: str, color: color || '#fff', size: size || 13 });
}

function explode(x, y, size) {
  var n = Math.round(size * 14);
  var colors = ['#ffd76c', '#ff9d5c', '#ff5c5c', '#fff3d6'];
  for (var i = 0; i < n; i++) {
    var a = rand(0, Math.PI * 2), sp = rand(40, 240) * size;
    particles.push({
      x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: rand(0.3, 0.8), maxLife: 0.8, size: rand(1.5, 3.5) * size,
      color: pick(colors), drag: 0.9
    });
  }
  // 火焰贴图碎片
  var fn = Math.round(2 + size * 2);
  for (var j = 0; j < fn; j++) {
    particles.push({
      x: x + rand(-14, 14) * size, y: y + rand(-14, 14) * size,
      vx: rand(-40, 40), vy: rand(-60, 10),
      life: rand(0.25, 0.5), maxLife: 0.5, size: rand(18, 30) * size,
      img: pick([IMG.fire1, IMG.fire2, IMG.fire3, IMG.fire4]), drag: 0.85, spin: rand(-4, 4), rot: rand(0, 6.28)
    });
  }
  if (size >= 1.2) rings.push({ x: x, y: y, r: 6, maxR: 90 * size, t: 0, dur: 0.45, color: '255,215,108' });
  if (particles.length > 500) particles.splice(0, particles.length - 500);
  game.shake = Math.min(24, game.shake + size * 6);
  sfxExplosion(size >= 1.2);
}

function sparks(x, y, color) {
  for (var i = 0; i < 5; i++) {
    var a = rand(0, Math.PI * 2), sp = rand(30, 130);
    particles.push({
      x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: rand(0.15, 0.35), maxLife: 0.35, size: rand(1, 2.4),
      color: color || '#9adcff', drag: 0.85
    });
  }
}

// ---------------- 击杀与受伤 ----------------
function gainScore(n) {
  var pts = game.scoreMulT > 0 ? n * 2 : n;
  game.score += pts;
  return pts;
}

function killEnemy(e) {
  e.dead = true;
  game.combo++;
  game.comboT = 2.5;
  game.comboPop = 0.18;
  var bonus = Math.min(game.combo, 30) * 2;
  var pts = gainScore(e.score + bonus);
  addText(e.x, e.y, '+' + pts, '#ffd76c', 13);
  explode(e.x, e.y, e.r > 26 ? 1.3 : 0.8);
  maybeDrop(e);
}

function damagePlayer() {
  if (!player.alive || player.invT > 0) return;
  if (player.shieldN > 0) {
    player.shieldN--;
    player.invT = 1.0;
    if (player.shieldN <= 0) {
      player.shieldT = 0;
      sfx('shieldDown', 0.7);
      addText(player.x, player.y - 40, '护盾破碎!', '#7dffb0', 15);
    } else {
      sfx('shieldDown', 0.5, 1.4);
      addText(player.x, player.y - 40, '护盾 -1 (剩' + player.shieldN + '层)', '#7dffb0', 13);
    }
    rings.push({ x: player.x, y: player.y, r: 10, maxR: 70, t: 0, dur: 0.35, color: '125,255,176' });
    return;
  }
  explode(player.x, player.y, 1.5);
  sfx('lose', 0.8);
  game.lives--;
  game.combo = 0;
  game.comboT = 0;
  game.hurtFlash = 0.6;
  player.alive = false;
  player.respawnT = 1.4;
  player.weapon = Math.max(1, player.weapon - 1);
  game.shake = 22;
  if (game.lives <= 0) game.overT = 1.8;
}

function useBomb() {
  if (game.state !== 'playing' || game.bombs <= 0 || !player.alive || player.enterT > 0) return;
  game.bombs--;
  game.flash = 0.85;
  game.shake = 24;
  rings.push({ x: player.x, y: player.y, r: 20, maxR: 520, t: 0, dur: 0.6, color: '140,220,255' });
  // 清弹
  for (var i = 0; i < bulletsE.length; i++) sparks(bulletsE[i].x, bulletsE[i].y, '#8cd8ff');
  bulletsE.length = 0;
  // 全体伤害
  for (var j = 0; j < enemies.length; j++) {
    var e = enemies[j];
    e.hp -= 350;
    e.flashT = 0.15;
    if (e.hp <= 0 && !e.dead) killEnemy(e);
  }
  if (boss && !boss.dying && boss.phaseT <= 0) {
    boss.hp -= 300;
    boss.flashT = 0.2;
    if (boss.hp <= 0) startBossDeath();
  }
  sfxExplosion(true);
  updateBombButton();
}

// ---------------- Boss ----------------
var BOSS_DEFS = {
  A: { name: '钢铁巨兽 · 歼灭者', img: 'bossA', scale: 2.6, r: 72, amp: 110, hpMul: 1,    spdMul: 1,    aimedCount: 3, radialCount: 18, hoverV: 0.7,
       patterns: ['aimed', 'radial', 'fan', 'summon'] },
  B: { name: '星环母舰 · 守望者', img: 'bossB', scale: 2.3, r: 70, amp: 140, hpMul: 1,    spdMul: 1.05, aimedCount: 3, radialCount: 22, hoverV: 0.7,
       patterns: ['radial', 'fan', 'summon', 'aimed'] },
  C: { name: '血色妖星 · 徘徊者', img: 'bossC', scale: 2.2, r: 62, amp: 175, hpMul: 0.85, spdMul: 1.22, aimedCount: 5, radialCount: 14, hoverV: 1.05,
       patterns: ['aimed', 'fan', 'aimed', 'summon', 'radial'] },
  D: { name: '虚空堡垒 · 碾压者', img: 'bossD', scale: 3.1, r: 82, amp: 55,  hpMul: 1.45, spdMul: 0.9,  aimedCount: 3, radialCount: 26, hoverV: 0.4, fortress: true,
       patterns: ['radial', 'summon', 'radial', 'fan'] }
};

function spawnBoss() {
  var kind = 'ABCD'[(game.level - 1) % 4];
  var def = BOSS_DEFS[kind];
  var hp = Math.round((1500 + (game.level - 1) * 850) * def.hpMul);
  boss = {
    kind: kind, def: def,
    name: def.name,
    img: IMG[def.img],
    x: W / 2, y: -130, targetY: def.fortress ? 185 : 150,
    hp: hp, maxHp: hp,
    r: def.r, t: 0, fireT: 1.2, burstT: 0,
    pattern: 'enter', patternT: 0, patIdx: 0,
    patterns: def.patterns.slice(),
    phase: 1, phaseT: 0, spiralA: 0,
    flashT: 0, dying: false, dieT: 0, burstN: 0
  };
  game.bossSpawned = true;
  showBanner(boss.name, 'LEVEL ' + game.level + ' BOSS', 2.6);
}

function startBossDeath() {
  if (!boss || boss.dying) return;
  boss.dying = true;
  boss.dieT = 2.0;
  bulletsE.length = 0;
}

function bossDie() {
  explode(boss.x, boss.y, 2.4);
  var pts = gainScore(5000);
  addText(boss.x, boss.y, '+' + pts, '#ffd76c', 22);
  dropPowerup(boss.x - 30, boss.y, 'weapon');
  dropPowerup(boss.x + 30, boss.y, Math.random() < 0.5 ? 'life' : 'bomb');
  boss = null;
  game.levelClearT = 2.4;
  showBanner('LEVEL ' + game.level + ' CLEAR', '准备进入下一空域…', 2.2);
}

// Boss 阶段转换
function enterPhase(p) {
  boss.phase = p;
  boss.phaseT = 1.3;
  for (var i = 0; i < bulletsE.length; i++) sparks(bulletsE[i].x, bulletsE[i].y, '#ffb3b3');
  bulletsE.length = 0;
  explode(boss.x, boss.y, 1.2);
  game.shake = Math.max(game.shake, 16);
  if (p >= 2 && boss.def.fortress && boss.patterns.indexOf('spiral') < 0) boss.patterns.push('spiral');
  if (p === 3 && boss.patterns.indexOf('spiral') < 0) boss.patterns.push('spiral');
  showBanner(p === 3 ? '最终形态!' : 'BOSS 阶段 ' + p, p === 3 ? '全力开火!' : '', 1.6);
}

function updateBoss(dt) {
  var b = boss;
  b.t += dt;
  if (b.flashT > 0) b.flashT -= dt;

  if (b.dying) {
    b.dieT -= dt;
    if (Math.random() < dt * 14) {
      explode(b.x + rand(-60, 60), b.y + rand(-40, 40), rand(0.5, 0.9));
    }
    if (b.dieT <= 0) bossDie();
    return;
  }

  // 阶段检测
  if (b.phase === 1 && b.hp <= b.maxHp * 2 / 3) enterPhase(2);
  else if (b.phase === 2 && b.hp <= b.maxHp / 3) enterPhase(3);

  if (b.pattern === 'enter') {
    b.y += 90 * dt;
    if (b.y >= b.targetY) { b.pattern = b.patterns[0]; b.patternT = 0; b.t = 0; }
    return;
  }

  // 悬停机动（镜头拉远时横扫范围同步放大）
  var amp = b.def.amp / cam.scale;
  b.x = W / 2 + Math.sin(b.t * b.def.hoverV) * amp;
  b.y = b.targetY + Math.sin(b.t * 1.25) * 22;

  // 阶段转换中：无敌、停火
  if (b.phaseT > 0) { b.phaseT -= dt; return; }

  var spd = (205 + game.level * 11) * b.def.spdMul * (b.phase === 3 ? 1.45 : 1);

  b.patternT += dt;
  var patDur = b.phase === 1 ? 3.6 : b.phase === 2 ? 3.0 : 2.4;
  if (b.patternT >= patDur) {
    b.patIdx = (b.patIdx + 1) % b.patterns.length;
    b.pattern = b.patterns[b.patIdx];
    b.patternT = 0;
    b.burstN = 0;
    if (b.pattern === 'summon') {
      var ns = 3 + (b.phase >= 2 ? 1 : 0);
      for (var i = 0; i < ns; i++) addEnemy('scout', 60 + i * (W - 120) / (ns - 1), -40 - i * 50);
      if (b.phase >= 3) { addEnemy('striker', 120, -90); addEnemy('striker', W - 120, -90); }
      if (b.def.fortress) {
        addEnemy('meteor1', rand(60, W - 60), -60);
        addEnemy(pick(['meteor1', 'meteor2', 'meteor3']), rand(60, W - 60), -140);
      }
    }
  }

  b.fireT -= dt;
  var rate = b.phase === 3 ? 0.62 : b.phase === 2 ? 0.82 : 1;
  if (b.pattern === 'aimed' && b.fireT <= 0) {
    b.burstN++;
    if (b.phase >= 2 && b.burstN % 4 === 0) {
      // 分裂母弹：1.15s 后炸成 6 颗小弹
      var angS = Math.atan2(player.y - b.y, player.x - b.x);
      eb(b.x, b.y + 20, angS, spd * 0.5, { type: 'split', scale: 1.7, r: 9, splitT: 1.15 });
      sfx('elaser', 0.22, 0.6);
    } else if (game.level >= 2 && b.burstN % 3 === 0) {
      // 每 3 轮夹一轮追踪弹
      var angH = Math.atan2(player.y - b.y, player.x - b.x);
      eb(b.x - 30, b.y + 20, angH - 0.2, spd * 0.62, { type: 'homing', turn: 1.15 });
      eb(b.x + 30, b.y + 20, angH + 0.2, spd * 0.62, { type: 'homing', turn: 1.15 });
      sfx('elaser', 0.2, 0.7);
    } else {
      enemyFireAimed(b, spd * 1.12, 0.12, b.def.aimedCount);
    }
    b.fireT = 0.6 * rate;
  } else if (b.pattern === 'radial' && b.fireT <= 0) {
    if (b.burstN % 2 === 1) {
      // 快慢相间的重型大弹
      enemyFireRadial(b, spd * 0.55, Math.round(b.def.radialCount * 0.65), b.burstN * 0.17 + 0.26, { type: 'big', scale: 1.9, r: 9 });
    } else {
      enemyFireRadial(b, spd * 0.78, b.def.radialCount, b.burstN * 0.17);
    }
    b.burstN++;
    b.fireT = 1.15 * rate;
  } else if (b.pattern === 'fan' && b.fireT <= 0) {
    var ang = Math.atan2(player.y - b.y, player.x - b.x);
    var useWob = game.level >= 2 && b.burstN % 2 === 1;
    for (var k = -3; k <= 3; k++) {
      eb(b.x, b.y + 30, ang + k * 0.16, spd, useWob ? { type: 'wobble' } : null);
    }
    b.burstN++;
    sfx('elaser', 0.2, 0.75);
    b.fireT = 1.0 * rate;
  } else if (b.pattern === 'spiral' && b.fireT <= 0) {
    // 双头旋转弹链
    b.spiralA += 0.52;
    eb(b.x, b.y + 20, b.spiralA, spd * 0.62);
    eb(b.x, b.y + 20, b.spiralA + Math.PI, spd * 0.62);
    b.burstN++;
    if (b.burstN % 5 === 0) sfx('elaser', 0.1, 0.9);
    b.fireT = 0.075;
  }
  if (bulletsE.length > 380) bulletsE.splice(0, bulletsE.length - 380);
}

// ---------------- 关卡与出怪 ----------------
var levelTime = 0;
var schedule = [];
var trickleT = 5;   // 环境补怪计时

function patrolScouts(n) {
  var m = Math.min(n, 9);
  for (var i = 0; i < m; i++) {
    addEnemy('scout', 50 + (W - 100) * (i / Math.max(1, m - 1)), -40 - i * 52);
  }
}

function fighterWave(n) {
  for (var i = 0; i < n; i++) {
    addEnemy('fighter', rand(60, W - 60), -50 - i * 80);
  }
}

function strikerWave(n) {
  for (var i = 0; i < n; i++) {
    addEnemy('striker', 90 + (W - 180) * (n === 1 ? 0.5 : i / (n - 1)), -60 - i * 90);
  }
}

function meteorShower(n) {
  for (var i = 0; i < n; i++) {
    addEnemy(pick(['meteor1', 'meteor2', 'meteor3']), rand(30, W - 30), -60 - i * 110);
  }
}

function heavyWave(n) {
  for (var i = 0; i < n; i++) {
    var hx = n === 1 ? W / 2 : 100 + i * (W - 200) / (n - 1);
    addEnemy('heavy', hx, -70 - i * 130);
    addEnemy('scout', hx - 60, -110 - i * 130);
    addEnemy('scout', hx + 60, -110 - i * 130);
  }
}

function ufoPass() {
  var fromLeft = Math.random() < 0.5;
  addEnemy('ufo', fromLeft ? -50 : W + 50, rand(80, 150), { vx: (fromLeft ? 1 : -1) * 215 });
}

// V 形侦察机编队
function vFormation(n) {
  var mid = (n - 1) / 2;
  for (var i = 0; i < n; i++) {
    var off = i - mid;
    addEnemy('scout', W / 2 + off * 46, -40 - Math.abs(off) * 44, { holdX: true, vy: 150 });
  }
}

// 菱形战斗机编队
function diamondWave() {
  var cx = W / 2;
  var pos = [[0, -50], [-70, -130], [70, -130], [-140, -210], [140, -210], [0, -290]];
  for (var i = 0; i < pos.length; i++) {
    addEnemy('fighter', cx + pos[i][0], pos[i][1], { holdX: true });
  }
}

// 侧翼横穿编队
function sideCross(n, fromLeft) {
  for (var i = 0; i < n; i++) {
    addEnemy('scout', fromLeft ? -50 - i * 70 : W + 50 + i * 70, 60 + i * 38,
             { sideVx: (fromLeft ? 1 : -1) * rand(165, 195), vy: 22, holdX: true });
  }
}

// 交叉剪刀（双侧同时横穿）
function crossScissors() {
  sideCross(4, true);
  sideCross(4, false);
}

// 双排横队（战斗机压阵 + 侦察机补位）
function doubleRow(n) {
  for (var i = 0; i < n; i++) {
    var x = 50 + (W - 100) * (i / Math.max(1, n - 1));
    addEnemy('fighter', x, -60, { holdX: true });
    if (i % 2 === 0) addEnemy('scout', x, -130, { holdX: true });
  }
}

// 梯队（斜线阶梯下压）
function echelon(n, fromLeft) {
  for (var i = 0; i < n; i++) {
    addEnemy('scout', fromLeft ? 60 + i * 46 : W - 60 - i * 46, -50 - i * 52, { holdX: true, vy: 160 });
  }
}

// 蛇形纵队
function snakeScouts(n) {
  var bx = rand(130, W - 130), ph = rand(0, 6.28);
  for (var i = 0; i < n; i++) {
    addEnemy('scout', bx, -40 - i * 58, { phase: ph });
  }
}

// 环形旋转编队（从屏幕上方旋转入场，绕中心扫射后散开）
function orbitStrikers(n) {
  var cx = W / 2, r = 112, a0 = rand(0, 6.28);
  for (var i = 0; i < n; i++) {
    var ang = a0 + i * Math.PI * 2 / n;
    addEnemy('striker', cx + Math.cos(ang) * r, -140 + Math.sin(ang) * r,
             { orbit: { cx: cx, cy: -140, targetCy: 195, r: r, ang: ang, angV: 0.55, drop: 150 }, hoverT: 5.5 });
  }
}

function buildLevel(L) {
  levelTime = 0;
  schedule = [];
  function at(t, fn) { schedule.push({ t: t, fn: fn, fired: false }); }
  var extra = Math.min(3, Math.floor(L / 2));
  at(1, function () { patrolScouts(6 + extra); });
  at(6, function () { vFormation(L >= 3 ? 9 : 7); });
  at(11, function () { fighterWave(3 + (L >= 3 ? 1 : 0)); });
  at(16, function () { meteorShower(6 + Math.min(5, L)); });
  at(21, function () { if (L >= 3) crossScissors(); else sideCross(4, Math.random() < 0.5); });
  at(24, function () { strikerWave(2 + (L >= 3 ? 1 : 0)); });
  at(29, function () { snakeScouts(8); });
  at(33, function () { if (L >= 2) doubleRow(5); else patrolScouts(5); });
  at(37, function () { ufoPass(); });
  at(39, function () { heavyWave(1); });
  at(44, function () { if (L >= 2) diamondWave(); else fighterWave(3); });
  at(50, function () { vFormation(9); });
  at(55, function () { strikerWave(2 + (L >= 4 ? 1 : 0)); meteorShower(4); });
  at(59, function () { echelon(7, Math.random() < 0.5); });
  at(62, function () { if (L >= 2) orbitStrikers(5); else patrolScouts(6); });
  at(67, function () { heavyWave(L >= 2 ? 2 : 1); sideCross(4, Math.random() < 0.5); });
  at(72, function () { ufoPass(); patrolScouts(5); });
  at(76, function () { fighterWave(3); strikerWave(2); });
  game.bossSpawned = false;
  game.warning = 0;
  trickleT = 5;
  game.levelDur = schedule[schedule.length - 1].t + 2; // 进度条总时长
  showBanner('LEVEL ' + L, pick(['敌机接近中！', '保持阵型！', '火力全开！']), 2.0);
}

function updateSpawner(dt) {
  if (boss || game.levelClearT > 0) return;
  levelTime += dt;
  var allFired = true;
  for (var i = 0; i < schedule.length; i++) {
    var ev = schedule[i];
    if (!ev.fired && levelTime >= ev.t) { ev.fired = true; ev.fn(); }
    if (!ev.fired) allFired = false;
  }
  // 环境补怪：时间表未耗尽且同屏敌机稀少时，持续补入小编队
  trickleT -= dt;
  if (trickleT <= 0) {
    trickleT = rand(4.5, 6.5) * Math.max(0.6, 1 - game.level * 0.04);
    if (!allFired && enemies.length < 7 && game.warning <= 0) {
      var fillers = [
        function () { patrolScouts(3 + Math.min(3, game.level)); },
        function () { fighterWave(2); },
        function () { snakeScouts(4 + Math.min(2, game.level)); },
        function () { sideCross(3, Math.random() < 0.5); }
      ];
      pick(fillers)();
    }
  }
  if (allFired && enemies.length === 0 && !game.bossSpawned) {
    if (game.warning <= 0) {
      game.warning = 2.4;
      sfx('hit', 0.6, 0.6);
    }
  }
  if (game.warning > 0) {
    game.warning -= dt;
    if (game.warning <= 0) spawnBoss();
  }
}

// ---------------- 关卡横幅 ----------------
function showBanner(text, sub, dur) {
  game.banner = { text: text, sub: sub || '', t: 0, dur: dur || 2 };
}

// ---------------- 主更新 ----------------
function update(dt) {
  game.time += dt;
  if (game.scoreMulT > 0) game.scoreMulT -= dt;
  if (game.slowT > 0) game.slowT -= dt;
  if (game.comboT > 0) { game.comboT -= dt; if (game.comboT <= 0) game.combo = 0; }
  if (game.comboPop > 0) game.comboPop -= dt;
  if (game.hurtFlash > 0) game.hurtFlash -= dt;
  // 背景流星
  if (Math.random() < dt * 0.35) {
    bgStreaks.push({ x: rand(W * 0.3, W + 40), y: rand(-40, H * 0.4),
                     vx: -rand(260, 420), vy: rand(140, 220), life: rand(0.5, 0.9), max: 0.9 });
  }
  for (var bsi = bgStreaks.length - 1; bsi >= 0; bsi--) {
    var bs = bgStreaks[bsi];
    bs.life -= dt;
    bs.x += bs.vx * dt;
    bs.y += bs.vy * dt;
    if (bs.life <= 0 || bs.x < -60 || bs.y > H + 60) bgStreaks.splice(bsi, 1);
  }
  var eDt = game.slowT > 0 ? dt * 0.45 : dt; // 敌方时间流速（时间减缓道具生效时减半）
  // Boss 战镜头缩放
  cam.target = (boss && boss.pattern !== 'enter') ? 0.78 : 1;
  cam.scale += (cam.target - cam.scale) * Math.min(1, dt * 2.2);
  bgScroll = (bgScroll + dt * 34) % 256;

  // 星星
  for (var si = 0; si < stars.length; si++) {
    var st = stars[si];
    st.y += st.sp * dt;
    if (st.y > H) { st.y = -2; st.x = rand(0, W); }
  }

  // 玩家
  if (player.alive && player.enterT > 0) {
    // 入场动画：从屏幕下方飞入，期间无敌、不可操控
    player.enterT -= dt;
    var ep = clamp(1 - player.enterT / player.enterDur, 0, 1);
    var ease = 1 - Math.pow(1 - ep, 3);
    player.x = W / 2;
    player.y = (H + 60) + ((H - 100) - (H + 60)) * ease;
    player.tilt = 0;
    if (Math.random() < dt * 90) {
      particles.push({ x: player.x + rand(-7, 7), y: player.y + 26,
                       vx: rand(-25, 25), vy: rand(240, 340),
                       life: rand(0.2, 0.4), maxLife: 0.4, size: rand(2, 4),
                       color: pick(['#6cf0ff', '#2fa8ff', '#b3f6ff']), drag: 0.95 });
    }
    if (player.invT > 0) player.invT -= dt;
    if (player.enterT <= 0) player.invT = Math.max(player.invT, 1.0);
  } else if (player.alive) {
    var mx = 0, my = 0;
    if (keys['arrowleft'] || keys['a']) mx -= 1;
    if (keys['arrowright'] || keys['d']) mx += 1;
    if (keys['arrowup'] || keys['w']) my -= 1;
    if (keys['arrowdown'] || keys['s']) my += 1;
    if (mx || my) {
      var len = Math.sqrt(mx * mx + my * my);
      player.x += mx / len * player.speed * dt;
      player.y += my / len * player.speed * dt;
    }
    var xMargin = cam.scale < 0.999 ? (W / cam.scale - W) / 2 : 0;
    if (pointer.active) {
      // 屏幕坐标 → 世界坐标（考虑镜头缩放）
      var wpx = W / 2 + (pointer.x - W / 2) / cam.scale;
      var wpy = H / 2 + (pointer.y - 85 - H / 2) / cam.scale;
      var tx = clamp(wpx, 20 - xMargin, W - 20 + xMargin);
      var ty = clamp(wpy, 40, H - 40);
      player.x += (tx - player.x) * Math.min(1, dt * 16);
      player.y += (ty - player.y) * Math.min(1, dt * 16);
    }
    player.x = clamp(player.x, 20 - xMargin, W - 20 + xMargin);
    player.y = clamp(player.y, 40, H - 40);
    player.tilt += ((mx * 0.16) - player.tilt) * Math.min(1, dt * 10);

    // 自动开火
    player.fireT -= dt;
    if (player.fireT <= 0) {
      firePlayer();
      player.fireT = 0.13;
    }
    if (player.invT > 0) player.invT -= dt;
    if (player.shieldT > 0) {
      player.shieldT -= dt;
      if (player.shieldT <= 0) player.shieldN = 0;
    }

    // 追踪导弹（道具，限时副武器）
    if (player.missileT > 0) {
      player.missileT -= dt;
      player.missileFireT -= dt;
      if (player.missileFireT <= 0) {
        player.missileFireT = 0.38;
        for (var ms = -1; ms <= 1; ms += 2) {
          bulletsP.push({ x: player.x + ms * 26, y: player.y + 8, vx: ms * 60, vy: -230,
                          dmg: 18, img: IMG.bPlayer2, r: 7, homing: true, turn: 3.4, spd: 400, age: 0 });
        }
        sfx('laser', 0.18, 0.7);
      }
    }

    // 僚机（道具，限时跟随射击）
    if (player.droneT > 0) {
      player.droneT -= dt;
      if (player.droneT <= 0) drone = null;
      else if (drone) {
        drone.x += (player.x - 52 - drone.x) * Math.min(1, dt * 7);
        drone.y += (player.y + 16 - drone.y) * Math.min(1, dt * 7);
        drone.fireT -= dt;
        if (drone.fireT <= 0) {
          drone.fireT = 0.28;
          bulletsP.push({ x: drone.x, y: drone.y - 14, vx: 0, vy: -560, dmg: 10, img: IMG.bPlayer, r: 5 });
        }
      }
    }

    // 尾焰粒子
    player.trailT -= dt;
    if (player.trailT <= 0) {
      player.trailT = 0.03;
      particles.push({
        x: player.x + rand(-3, 3), y: player.y + 24,
        vx: rand(-12, 12), vy: rand(90, 150),
        life: rand(0.18, 0.3), maxLife: 0.3, size: rand(2, 4),
        color: pick(['#6cf0ff', '#2fa8ff', '#b3f6ff']), drag: 0.95
      });
    }
  } else if (game.lives > 0) {
    player.respawnT -= dt;
    if (player.respawnT <= 0) {
      player.alive = true;
      player.x = W / 2; player.y = H + 40;
      player.enterT = 1.2; player.enterDur = 1.2;
      player.invT = 2.5;
    }
  }

  updateSpawner(dt);

  // 敌机
  for (var i = enemies.length - 1; i >= 0; i--) {
    var e = enemies[i];
    updateEnemy(e, eDt);
    if (e.dead) enemies.splice(i, 1);
  }

  if (boss) updateBoss(eDt);

  // 关卡结束推进
  if (game.levelClearT > 0) {
    game.levelClearT -= dt;
    if (game.levelClearT <= 0) {
      game.level++;
      buildLevel(game.level);
    }
  }

  // 子弹（玩家）
  for (var bi = bulletsP.length - 1; bi >= 0; bi--) {
    var b = bulletsP[bi];
    if (b.homing) {
      b.age += dt;
      var tx = 0, ty = 0, best = 480 * 480, found = false;
      for (var hi = 0; hi < enemies.length; hi++) {
        var he = enemies[hi];
        if (he.dead) continue;
        var hd = dist2(b.x, b.y, he.x, he.y);
        if (hd < best) { best = hd; tx = he.x; ty = he.y; found = true; }
      }
      if (boss && !boss.dying) {
        var bd = dist2(b.x, b.y, boss.x, boss.y);
        if (bd < best) { best = bd; tx = boss.x; ty = boss.y; found = true; }
      }
      if (found) {
        var want = Math.atan2(ty - b.y, tx - b.x);
        var cur = Math.atan2(b.vy, b.vx);
        cur += clamp(wrapAngle(want - cur), -b.turn * dt, b.turn * dt);
        b.vx = Math.cos(cur) * b.spd;
        b.vy = Math.sin(cur) * b.spd;
      } else {
        b.vy += (-b.spd - b.vy) * Math.min(1, dt * 3);
        b.vx *= 0.98;
      }
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y < -30 || b.x < -30 || b.x > W + 30 || (b.homing && b.age > 6)) bulletsP.splice(bi, 1);
  }
  // 子弹（敌方）：normal / homing 追踪 / wobble 曲线
  for (var ei = bulletsE.length - 1; ei >= 0; ei--) {
    var eb2 = bulletsE[ei];
    if (eb2.type === 'homing' && eb2.trackT > 0 && player.alive) {
      eb2.trackT -= eDt;
      var want2 = Math.atan2(player.y - eb2.y, player.x - eb2.x);
      var cur2 = Math.atan2(eb2.vy, eb2.vx);
      var tr = eb2.turn || 1.1;
      cur2 += clamp(wrapAngle(want2 - cur2), -tr * eDt, tr * eDt);
      eb2.vx = Math.cos(cur2) * eb2.spd;
      eb2.vy = Math.sin(cur2) * eb2.spd;
    } else if (eb2.type === 'wobble') {
      eb2.wobT += eDt;
      var wa = eb2.baseAng + Math.sin(eb2.wobT * 4.5 + eb2.phase) * 0.55;
      eb2.vx = Math.cos(wa) * eb2.spd;
      eb2.vy = Math.sin(wa) * eb2.spd;
    } else if (eb2.type === 'split') {
      eb2.splitT -= eDt;
      if (eb2.splitT <= 0) {
        for (var sp2 = 0; sp2 < 6; sp2++) {
          eb(eb2.x, eb2.y, sp2 * Math.PI / 3 + rand(0, 0.4), eb2.spd * 1.2);
        }
        sparks(eb2.x, eb2.y, '#ff9d5c');
        bulletsE.splice(ei, 1);
        continue;
      }
    }
    eb2.x += eb2.vx * eDt; eb2.y += eb2.vy * eDt;
    if (eb2.y < -40 || eb2.y > H + 40 || eb2.x < -40 || eb2.x > W + 40) bulletsE.splice(ei, 1);
  }

  // 补给
  for (var pi = powerups.length - 1; pi >= 0; pi--) {
    var p = powerups[pi];
    p.t += dt;
    p.y += p.vy * dt;
    // 靠近玩家时吸附
    if (player.alive) {
      var dd = dist2(p.x, p.y, player.x, player.y);
      if (dd < 90 * 90) {
        p.x += (player.x - p.x) * dt * 6;
        p.y += (player.y - p.y) * dt * 6;
      }
    }
    if (p.y > H + 30) powerups.splice(pi, 1);
  }

  // 粒子 / 冲击波 / 浮字
  for (var qi = particles.length - 1; qi >= 0; qi--) {
    var q = particles[qi];
    q.life -= dt;
    if (q.life <= 0) { particles.splice(qi, 1); continue; }
    q.x += q.vx * dt; q.y += q.vy * dt;
    q.vx *= q.drag; q.vy *= q.drag;
    if (q.spin) q.rot += q.spin * dt;
  }
  for (var ri = rings.length - 1; ri >= 0; ri--) {
    var rg = rings[ri];
    rg.t += dt;
    rg.r = rg.maxR * (rg.t / rg.dur);
    if (rg.t >= rg.dur) rings.splice(ri, 1);
  }
  for (var ti = popTexts.length - 1; ti >= 0; ti--) {
    var tx2 = popTexts[ti];
    tx2.life -= dt;
    tx2.y += tx2.vy * dt;
    if (tx2.life <= 0) popTexts.splice(ti, 1);
  }

  collisions();

  if (game.shake > 0) game.shake = Math.max(0, game.shake - dt * 46);
  if (game.flash > 0) game.flash = Math.max(0, game.flash - dt * 2.2);
  if (game.banner) {
    game.banner.t += dt;
    if (game.banner.t >= game.banner.dur) game.banner = null;
  }

  // Game Over 计时
  if (game.lives <= 0 && game.overT > 0) {
    game.overT -= dt;
    if (game.overT <= 0) gameOver();
  }
}

// ---------------- 碰撞 ----------------
function collisions() {
  var i, j, b, e;

  // 玩家子弹 vs 敌机 / Boss
  for (i = bulletsP.length - 1; i >= 0; i--) {
    b = bulletsP[i];
    var hit = false;
    for (j = enemies.length - 1; j >= 0; j--) {
      e = enemies[j];
      if (e.dead) continue;
      var rr = e.r + b.r;
      if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
        e.hp -= b.dmg;
        e.flashT = 0.08;
        sparks(b.x, b.y, '#9adcff');
        if (e.hp <= 0) killEnemy(e);
        hit = true;
        break;
      }
    }
    if (!hit && boss && !boss.dying && boss.pattern !== 'enter' && boss.phaseT <= 0) {
      var br = boss.r + b.r;
      if (dist2(b.x, b.y, boss.x, boss.y) < br * br) {
        boss.hp -= b.dmg;
        boss.flashT = 0.06;
        sparks(b.x, b.y, '#9adcff');
        hit = true;
        if (boss.hp <= 0) startBossDeath();
      }
    }
    if (hit) bulletsP.splice(i, 1);
  }

  if (!player.alive || player.invT > 0) return;

  // 敌方子弹 vs 玩家
  for (i = bulletsE.length - 1; i >= 0; i--) {
    b = bulletsE[i];
    var pr = player.r + b.r - 2;
    if (dist2(b.x, b.y, player.x, player.y) < pr * pr) {
      bulletsE.splice(i, 1);
      damagePlayer();
      if (!player.alive) return;
    }
  }

  // 敌机撞击
  for (j = enemies.length - 1; j >= 0; j--) {
    e = enemies[j];
    var cr = player.r + e.r - 4;
    if (dist2(e.x, e.y, player.x, player.y) < cr * cr) {
      e.hp -= 100;
      if (e.hp <= 0) killEnemy(e);
      damagePlayer();
      if (!player.alive) return;
    }
  }

  // Boss 撞击
  if (boss && !boss.dying) {
    var brr = player.r + boss.r - 8;
    if (dist2(boss.x, boss.y, player.x, player.y) < brr * brr) damagePlayer();
  }

  // 补给拾取
  for (i = powerups.length - 1; i >= 0; i--) {
    var p = powerups[i];
    if (dist2(p.x, p.y, player.x, player.y) < 30 * 30) {
      applyPowerup(p.kind);
      powerups.splice(i, 1);
    }
  }
}

// ---------------- 渲染 ----------------
function drawImageCentered(img, x, y, scale, rot) {
  var w = img.width * scale, h = img.height * scale;
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, W, H);

  // 背景
  var bg = IMG.bg;
  if (bg) {
    for (var y = -256 + bgScroll; y < H; y += 256) {
      for (var x = 0; x < W; x += 256) ctx.drawImage(bg, x, y);
    }
  } else {
    ctx.fillStyle = '#0b0b1e';
    ctx.fillRect(0, 0, W, H);
  }
  // 星星
  for (var i = 0; i < stars.length; i++) {
    var st = stars[i];
    var a = 0.4 + 0.6 * Math.abs(Math.sin(game.time * 2 + st.tw));
    ctx.globalAlpha = a * (st.sp / 95);
    ctx.fillStyle = '#cfe6ff';
    ctx.fillRect(st.x, st.y, st.s, st.s * 2.2);
  }
  ctx.globalAlpha = 1;

  // 背景流星
  for (var gsi = 0; gsi < bgStreaks.length; gsi++) {
    var gst = bgStreaks[gsi];
    ctx.globalAlpha = clamp(gst.life / gst.max, 0, 1) * 0.65;
    ctx.strokeStyle = '#cfe6ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(gst.x, gst.y);
    ctx.lineTo(gst.x - gst.vx * 0.09, gst.y - gst.vy * 0.09);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.save();
  if (game.shake > 0) ctx.translate(rand(-game.shake, game.shake) * 0.4, rand(-game.shake, game.shake) * 0.4);
  // Boss 战镜头缩放（以屏幕中心为原点）
  if (cam.scale < 0.999) {
    ctx.translate(W / 2, H / 2);
    ctx.scale(cam.scale, cam.scale);
    ctx.translate(-W / 2, -H / 2);
  }

  // 补给
  for (var pi = 0; pi < powerups.length; pi++) {
    var p = powerups[pi];
    var bob = Math.sin(p.t * 5) * 3;
    var pulse = 0.66 + 0.09 * Math.sin(p.t * 6);
    // 光环
    ctx.globalAlpha = 0.2 + 0.08 * Math.sin(p.t * 6);
    ctx.fillStyle = '#ffe9a3';
    ctx.beginPath();
    ctx.arc(p.x, p.y + bob, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    drawImageCentered(p.img, p.x, p.y + bob, pulse);
  }

  // 敌机
  for (var ei = 0; ei < enemies.length; ei++) {
    var e = enemies[ei];
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.rot) ctx.rotate(e.rot);
    var ew = e.img.width * e.def.scale, eh = e.img.height * e.def.scale;
    ctx.drawImage(e.img, -ew / 2, -eh / 2, ew, eh);
    if (e.flashT > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.75;
      ctx.drawImage(e.img, -ew / 2, -eh / 2, ew, eh);
    }
    ctx.restore();
    // 精英敌机血条
    if (e.maxHp >= 45 && e.hp < e.maxHp && e.y > 10) {
      var hw = e.r * 1.8, hr = clamp(e.hp / e.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(e.x - hw / 2, e.y - e.r - 11, hw, 4);
      ctx.fillStyle = hr > 0.4 ? '#7dffb0' : '#ff5c5c';
      ctx.fillRect(e.x - hw / 2, e.y - e.r - 11, hw * hr, 4);
    }
  }

  // Boss
  if (boss) {
    var bs = boss.def.scale;
    ctx.save();
    ctx.translate(boss.x, boss.y);
    var bw = boss.img.width * bs, bh = boss.img.height * bs;
    ctx.drawImage(boss.img, -bw / 2, -bh / 2, bw, bh);
    if (boss.flashT > 0 || boss.dying) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = boss.dying ? (0.4 + 0.4 * Math.sin(game.time * 30)) : 0.7;
      ctx.drawImage(boss.img, -bw / 2, -bh / 2, bw, bh);
    }
    ctx.restore();
    // 阶段转换无敌护盾圈
    if (boss.phaseT > 0) {
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(game.time * 14);
      drawImageCentered(IMG.shieldFx, boss.x, boss.y, 2.6);
      ctx.globalAlpha = 1;
    }
  }

  // 玩家
  if (player.alive) {
    var blink = player.invT > 0 && Math.floor(player.invT * 12) % 2 === 0;
    if (!blink) {
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(player.tilt);
      // 引擎火焰（双喷口）
      var fimg = [IMG.fire1, IMG.fire2, IMG.fire3, IMG.fire4][Math.floor(game.time * 20) % 4];
      ctx.globalAlpha = 0.9;
      for (var fe = -1; fe <= 1; fe += 2) {
        var fs = 0.95 + 0.2 * Math.sin(game.time * 30 + fe);
        ctx.drawImage(fimg, fe * 8 - fimg.width * fs / 2, 20, fimg.width * fs, fimg.height * fs);
      }
      ctx.globalAlpha = 1;
      var pw = IMG.player.width * 0.6, ph = IMG.player.height * 0.6;
      ctx.drawImage(IMG.player, -pw / 2, -ph / 2, pw, ph);
      ctx.restore();
    }
    if (player.shieldN > 0) {
      var low = player.shieldT < 3 && Math.floor(player.shieldT * 8) % 2 === 0;
      if (!low) {
        ctx.globalAlpha = (0.3 + 0.16 * player.shieldN) + 0.15 * Math.sin(game.time * 6);
        drawImageCentered(IMG.shieldFx, player.x, player.y, 0.62 + 0.1 * player.shieldN);
        ctx.globalAlpha = 1;
      }
    }
  }

  // 僚机
  if (drone && player.droneT > 0) {
    ctx.globalAlpha = (player.droneT < 3 && Math.floor(player.droneT * 8) % 2 === 0) ? 0.35 : 0.9;
    var dfimg = [IMG.fire1, IMG.fire2, IMG.fire3, IMG.fire4][Math.floor(game.time * 20) % 4];
    drawImageCentered(dfimg, drone.x, drone.y + 16, 0.5, 0);
    drawImageCentered(IMG.player, drone.x, drone.y, 0.42, 0);
    ctx.globalAlpha = 1;
  }

  // 子弹（玩家）
  for (var bi = 0; bi < bulletsP.length; bi++) {
    var b = bulletsP[bi];
    ctx.save();
    ctx.translate(b.x, b.y);
    if (b.vx || b.homing) ctx.rotate(Math.atan2(b.vy, b.vx) + Math.PI / 2);
    ctx.drawImage(b.img, -b.img.width * 0.85 / 2, -b.img.height * 0.85 / 2, b.img.width * 0.85, b.img.height * 0.85);
    ctx.restore();
  }
  // 子弹（敌方）
  for (var qi = 0; qi < bulletsE.length; qi++) {
    var eb = bulletsE[qi];
    var es = (eb.scale || 1) * 0.85;
    if (eb.shape === 'orb') {
      // 圆形光点弹
      var oc = eb.color || '#ff7d7d';
      var orad = 8 * es;
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = oc;
      ctx.beginPath(); ctx.arc(eb.x, eb.y, orad + 3.5 * es, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.95;
      ctx.beginPath(); ctx.arc(eb.x, eb.y, orad, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(eb.x, eb.y, orad * 0.45, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      continue;
    }
    ctx.save();
    ctx.translate(eb.x, eb.y);
    ctx.rotate(Math.atan2(eb.vy, eb.vx) + Math.PI / 2);
    ctx.drawImage(IMG.bEnemy, -IMG.bEnemy.width * es / 2, -IMG.bEnemy.height * es / 2,
                  IMG.bEnemy.width * es, IMG.bEnemy.height * es);
    ctx.restore();
  }

  // 粒子
  for (var mi = 0; mi < particles.length; mi++) {
    var q = particles[mi];
    var la = clamp(q.life / q.maxLife, 0, 1);
    if (q.img) {
      ctx.globalAlpha = la;
      drawImageCentered(q.img, q.x, q.y, q.size / 40, q.rot || 0);
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = la;
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
      ctx.globalAlpha = 1;
    }
  }
  // 冲击波
  for (var ri = 0; ri < rings.length; ri++) {
    var rg = rings[ri];
    ctx.globalAlpha = clamp(1 - rg.t / rg.dur, 0, 1) * 0.8;
    ctx.strokeStyle = 'rgba(' + rg.color + ',1)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(rg.x, rg.y, rg.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // 浮字
  ctx.textAlign = 'center';
  for (var ti = 0; ti < popTexts.length; ti++) {
    var t2 = popTexts[ti];
    ctx.globalAlpha = clamp(t2.life, 0, 1);
    ctx.fillStyle = t2.color;
    ctx.font = t2.size + 'px KenVector, sans-serif';
    ctx.fillText(t2.str, t2.x, t2.y);
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // 时间减缓滤镜
  if (game.slowT > 0) {
    ctx.fillStyle = 'rgba(90, 150, 255, 0.10)';
    ctx.fillRect(0, 0, W, H);
  }

  drawHUD();

  // 炸弹白闪
  if (game.flash > 0) {
    ctx.globalAlpha = clamp(game.flash, 0, 1);
    ctx.fillStyle = '#dff2ff';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // 受击红屏
  if (game.hurtFlash > 0) {
    ctx.globalAlpha = clamp(game.hurtFlash, 0, 1) * 0.26;
    ctx.fillStyle = '#ff2828';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // 横幅
  if (game.banner) {
    var bn = game.banner;
    var ba = bn.t < 0.25 ? bn.t / 0.25 : (bn.t > bn.dur - 0.4 ? clamp((bn.dur - bn.t) / 0.4, 0, 1) : 1);
    ctx.globalAlpha = ba;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#6cf0ff';
    ctx.font = '34px KenVector, sans-serif';
    ctx.fillText(bn.text, W / 2, H * 0.36);
    if (bn.sub) {
      ctx.fillStyle = '#8f9bd8';
      ctx.font = '14px KenVector, sans-serif';
      ctx.fillText(bn.sub, W / 2, H * 0.36 + 30);
    }
    ctx.globalAlpha = 1;
  }

  // Boss 警告
  if (game.warning > 0 && Math.floor(game.warning * 6) % 2 === 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff3b3b';
    ctx.font = '40px KenVector, sans-serif';
    ctx.fillText('!! WARNING !!', W / 2, H * 0.42);
    ctx.fillStyle = '#ffb3b3';
    ctx.font = '14px KenVector, sans-serif';
    ctx.fillText('强大敌机接近中', W / 2, H * 0.42 + 30);
  }
}

function drawHUD() {
  // 顶栏
  ctx.fillStyle = 'rgba(8,10,30,0.55)';
  ctx.fillRect(0, 0, W, 46);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#8f9bd8';
  ctx.font = '10px KenVector, sans-serif';
  ctx.fillText('SCORE', 12, 16);
  ctx.fillStyle = '#ffffff';
  ctx.font = '17px KenVector, sans-serif';
  ctx.fillText(String(game.score).padStart(7, '0'), 12, 36);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8f9bd8';
  ctx.font = '10px KenVector, sans-serif';
  ctx.fillText('BEST', W / 2, 16);
  ctx.fillStyle = '#ffd76c';
  ctx.font = '15px KenVector, sans-serif';
  ctx.fillText(String(Math.max(game.high, game.score)).padStart(7, '0'), W / 2, 35);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#8f9bd8';
  ctx.font = '10px KenVector, sans-serif';
  ctx.fillText('LEVEL', W - 100, 16);
  ctx.fillStyle = '#6cf0ff';
  ctx.font = '17px KenVector, sans-serif';
  ctx.fillText(String(game.level), W - 100, 36);

  // 关卡进度条（Boss 战时由 Boss 血条替代）
  var barShown = boss && boss.pattern !== 'enter';
  if (!barShown && (game.state === 'playing' || game.state === 'paused')) {
    var pbX = 12, pbW = W - 132, pbY = 48;
    var inWarn = game.warning > 0;
    var prog = inWarn ? 1 : clamp(levelTime / (game.levelDur || 78), 0, 1);
    ctx.fillStyle = 'rgba(8,10,30,0.6)';
    ctx.fillRect(pbX, pbY, pbW, 5);
    var pgrd = ctx.createLinearGradient(pbX, 0, pbX + pbW, 0);
    if (inWarn) { pgrd.addColorStop(0, '#ff5c5c'); pgrd.addColorStop(1, '#ff9d5c'); }
    else { pgrd.addColorStop(0, '#2fa8ff'); pgrd.addColorStop(1, '#7df3ff'); }
    ctx.fillStyle = pgrd;
    var pwf = pbW * prog;
    if (inWarn && Math.floor(game.time * 4) % 2 === 0) pwf = 0; // 警告时闪烁
    ctx.fillRect(pbX, pbY, pwf, 5);
    // 终点 Boss 标记
    ctx.fillStyle = inWarn ? '#ff5c5c' : '#565e8f';
    ctx.beginPath();
    ctx.moveTo(pbX + pbW + 5, pbY - 2);
    ctx.lineTo(pbX + pbW + 13, pbY + 2.5);
    ctx.lineTo(pbX + pbW + 5, pbY + 7);
    ctx.closePath();
    ctx.fill();
  }

  // Boss 血条
  if (barShown) {
    var bw = 300, bx = (W - bw) / 2, by = 52;
    ctx.fillStyle = 'rgba(8,10,30,0.6)';
    ctx.fillRect(bx - 4, by - 4, bw + 8, 16);
    ctx.fillStyle = '#3a0d18';
    ctx.fillRect(bx, by, bw, 8);
    var ratio = clamp(boss.hp / boss.maxHp, 0, 1);
    var grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    grad.addColorStop(0, '#ff3b3b');
    grad.addColorStop(1, '#ff9d5c');
    ctx.fillStyle = grad;
    ctx.fillRect(bx, by, bw * ratio, 8);
    // 阶段刻度（1/3、2/3）
    ctx.fillStyle = 'rgba(8,10,30,0.85)';
    ctx.fillRect(bx + bw / 3 - 1, by, 2, 8);
    ctx.fillRect(bx + bw * 2 / 3 - 1, by, 2, 8);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffb3b3';
    ctx.font = '10px KenVector, sans-serif';
    ctx.fillText('BOSS · 阶段 ' + boss.phase + '/3', W / 2, by + 22);
  }

  // 生效中的限时道具
  var ey = barShown ? 86 : 58;
  function drawEff(img, remain) {
    if (remain > 0) {
      ctx.globalAlpha = (remain < 3 && Math.floor(remain * 6) % 2 === 0) ? 0.4 : 1;
      ctx.drawImage(img, 12, ey, 18, 18);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#b9c3f2';
      ctx.font = '10px KenVector, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(Math.ceil(remain) + 's', 33, ey + 14);
      ey += 22;
    }
  }
  // 护盾层数
  if (player.shieldN > 0) {
    ctx.drawImage(IMG.powShield, 12, ey, 18, 18);
    for (var sp = 0; sp < player.shieldN; sp++) {
      ctx.fillStyle = '#7dffb0';
      ctx.fillRect(34 + sp * 10, ey + 5, 7, 9);
    }
    ey += 22;
  }
  drawEff(IMG.powMissile, player.missileT);
  drawEff(IMG.powScore, game.scoreMulT);
  drawEff(IMG.powSlow, game.slowT);
  drawEff(IMG.powDrone, player.droneT);

  // 连击
  if (game.combo >= 3) {
    var cs = 13 + game.comboPop * 32;
    ctx.textAlign = 'center';
    ctx.fillStyle = game.combo >= 10 ? '#ffd76c' : '#b9c3f2';
    ctx.font = cs + 'px KenVector, sans-serif';
    ctx.fillText(game.combo + ' COMBO', W / 2, barShown ? 98 : 72);
  }

  // 残血警报
  if (game.lives === 1 && game.state === 'playing' && Math.floor(game.time * 3) % 2 === 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff3b3b';
    ctx.font = '13px KenVector, sans-serif';
    ctx.fillText('!! DANGER !!', W / 2, H - 86);
  }

  // 生命
  for (var i = 0; i < game.lives; i++) {
    ctx.drawImage(IMG.life, 12 + i * 30, H - 32, 24, 20);
  }
  // 炸弹
  for (var j = 0; j < game.bombs; j++) {
    ctx.drawImage(IMG.powBomb, 12 + j * 24, H - 62, 20, 20);
  }
  // 火力等级
  ctx.fillStyle = '#8f9bd8';
  ctx.font = '9px KenVector, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('WPN', 178, H - 50);
  for (var k = 0; k < MAX_WEAPON; k++) {
    ctx.fillStyle = k < player.weapon ? '#7df3ff' : 'rgba(125,243,255,0.18)';
    ctx.fillRect(178 + k * 16, H - 42, 11, 7);
  }
}

// ---------------- 界面切换 ----------------
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

function updateBombButton() {
  var el = document.getElementById('bomb-count');
  el.textContent = game.bombs;
  document.getElementById('btn-bomb').classList.toggle('empty', game.bombs <= 0);
}

function startGame() {
  initAudio();
  game.state = 'playing';
  game.score = 0;
  game.level = 1;
  game.lives = 3;
  game.bombs = 2;
  game.time = 0;
  game.shake = 0;
  game.flash = 0;
  game.scoreMulT = 0;
  game.slowT = 0;
  game.combo = 0;
  game.comboT = 0;
  game.comboPop = 0;
  game.hurtFlash = 0;
  game.overT = 0;
  game.banner = null;
  game.warning = 0;
  game.levelClearT = 0;
  bulletsP.length = 0;
  bulletsE.length = 0;
  enemies.length = 0;
  powerups.length = 0;
  particles.length = 0;
  rings.length = 0;
  popTexts.length = 0;
  boss = null;
  player.x = W / 2; player.y = H + 60;
  player.enterT = 1.6;
  player.enterDur = 1.6;
  player.weapon = 1;
  player.alive = true;
  player.invT = 2.2;
  player.shieldT = 0;
  player.shieldN = 0;
  player.fireT = 0.2;
  player.missileT = 0;
  player.missileFireT = 0;
  player.droneT = 0;
  drone = null;
  bgStreaks.length = 0;
  hide('title-screen');
  hide('gameover-screen');
  hide('pause-screen');
  updateBombButton();
  buildLevel(1);
  bgmStart();
}

function togglePause(force) {
  if (game.state === 'playing' && force !== false) {
    game.state = 'paused';
    show('pause-screen');
    if (bgmGain) bgmGain.gain.value = 0.05;
  } else if (game.state === 'paused') {
    game.state = 'playing';
    hide('pause-screen');
    if (bgmGain) bgmGain.gain.value = 0.16;
  }
}

function gameOver() {
  game.state = 'gameover';
  bgmStop();
  var isRecord = game.score > game.high;
  if (isRecord) {
    game.high = game.score;
    localStorage.setItem('tf_high', String(game.high));
  }
  document.getElementById('final-score').textContent = game.score;
  document.getElementById('best-score').textContent = game.high;
  document.getElementById('new-record').classList.toggle('hidden', !isRecord);
  document.getElementById('title-best').textContent = game.high;
  show('gameover-screen');
}

// ---------------- 主循环 ----------------
var lastT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  if (!lastT) lastT = now;
  var dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (game.state === 'playing') update(dt);
  else bgScroll = (bgScroll + dt * 12) % 256;
  render();
}

// ---------------- 资源加载与启动 ----------------
function loadAll(onProgress) {
  var names = Object.keys(IMG_SRC);
  var total = names.length + 1; // 图片 + 字体
  var done = 0;
  function step() { done++; onProgress(done / total); }

  var jobs = names.map(function (name) {
    return new Promise(function (resolve) {
      var im = new Image();
      im.onload = function () { IMG[name] = im; step(); resolve(); };
      im.onerror = function () { step(); resolve(); };
      im.src = ASSET_DIR + IMG_SRC[name];
    });
  });

  var fontJob;
  if (window.FontFace) {
    var ff = new FontFace('KenVector', 'url(' + ASSET_DIR + 'font.ttf)');
    fontJob = ff.load().then(function (f) { document.fonts.add(f); step(); }).catch(function () { step(); });
  } else {
    fontJob = Promise.resolve();
    step();
  }
  jobs.push(fontJob);
  return Promise.all(jobs);
}

window.addEventListener('load', function () {
  document.getElementById('btn-mute').classList.toggle('muted', muted);
  document.getElementById('title-best').textContent = game.high;

  loadAll(function (p) {
    document.getElementById('loading-fill').style.width = Math.round(p * 100) + '%';
  }).then(function () {
    game.state = 'title';
    hide('loading-screen');
    show('title-screen');
    requestAnimationFrame(loop);
  });

  document.getElementById('btn-start').addEventListener('click', startGame);
  document.getElementById('btn-restart').addEventListener('click', startGame);
  document.getElementById('btn-resume').addEventListener('click', function () { togglePause(); });
  document.getElementById('btn-pause').addEventListener('click', function () {
    if (game.state === 'playing' || game.state === 'paused') togglePause();
  });
  document.getElementById('btn-mute').addEventListener('click', function () {
    initAudio();
    setMuted(!muted);
  });
  var bombBtn = document.getElementById('btn-bomb');
  bombBtn.addEventListener('click', function () { useBomb(); });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && game.state === 'playing') togglePause();
  });
});
