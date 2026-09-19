/* ============================================================
 * 实验史记 · 马刀地宫 —— 应用工具卷（表现层地基）
 * DOM 工厂 / toast / WebAudio 程序合成音效 / 存档别名。
 * 挂载：MDG.APP
 * ============================================================ */
(function () {
  "use strict";
  const MDG = window.MDG = window.MDG || {};

  /* ---- DOM 工厂 ---- */
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  const $ = (id) => document.getElementById(id);

  /* ---- toast ---- */
  function toast(text, ms) {
    const box = $("toasts");
    if (!box) return;
    const t = el("div", "toast", text);
    box.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .4s"; }, ms || 1900);
    setTimeout(() => t.remove(), (ms || 1900) + 450);
  }

  /* ---- 音效：WebAudio 程序合成，零外部资源 ---- */
  let AC = null, muted = false;
  function setMuted(m) { muted = !!m; }
  function ac() {
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
    if (AC && AC.state === "suspended") AC.resume();
    return AC;
  }
  function tone(freq, dur, type, vol, slide) {
    if (muted) return;
    const c = ac(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || "square"; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), c.currentTime + dur);
    g.gain.value = (vol || .12) * .5;
    g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + dur);
    o.connect(g).connect(c.destination);
    o.start(); o.stop(c.currentTime + dur + .02);
  }
  function noise(dur, vol) {
    if (muted) return;
    const c = ac(); if (!c) return;
    const n = c.sampleRate * dur, buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(), g = c.createGain();
    src.buffer = buf; g.gain.value = (vol || .1) * .6;
    src.connect(g).connect(c.destination); src.start();
  }
  const sfx = {
    hit() { tone(220, .09, "square", .1, -80); noise(.06, .08); },
    hurt() { tone(140, .16, "sawtooth", .12, -60); noise(.1, .1); },
    kill() { tone(180, .22, "square", .1, -120); },
    coin() { tone(880, .07, "square", .08); setTimeout(() => tone(1320, .09, "square", .08), 60); },
    learn() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, .12, "triangle", .1), i * 80)); },
    stairs() { [660, 520, 392, 300].forEach((f, i) => setTimeout(() => tone(f, .12, "triangle", .1), i * 90)); },
    boss() { tone(80, .7, "sawtooth", .14, -20); setTimeout(() => tone(60, .8, "sawtooth", .12, -10), 200); },
    ui() { tone(660, .04, "square", .05); },
    eat() { tone(320, .08, "triangle", .1, 60); },
    camp() { [330, 415, 494, 659].forEach((f, i) => setTimeout(() => tone(f, .18, "sine", .09), i * 110)); },
    chest() { tone(500, .08, "square", .08); setTimeout(() => tone(750, .1, "square", .08), 70); },
    bottle() { noise(.14, .14); tone(120, .12, "square", .1, -40); },
    parry() { noise(.04, .12); tone(1180, .06, "square", .1); setTimeout(() => tone(1568, .1, "square", .09), 45); },
    tele() { tone(196, .09, "sawtooth", .05); },
    dead() { [220, 175, 147, 110].forEach((f, i) => setTimeout(() => tone(f, .3, "sawtooth", .1), i * 220)); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => tone(f, .25, "triangle", .1), i * 160)); }
  };

  MDG.APP = { el, $, toast, sfx, tone, noise, setMuted };
})();
