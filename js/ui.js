/* ============================================================
 * 实验史记 · 马刀地宫 —— 丹青卷（Canvas 渲染）
 * 瓦片地宫 + 战争迷雾 + 字牌活体 + 浮动伤害 + 屏震 + 小地图。
 * 相机随人；迷雾三态：未探全黑 / 已探半暗 / 视野内明亮。
 * 挂载：MDG.UI（渲染器），HUD 面板另在 hud.js
 * ============================================================ */
(function () {
  "use strict";
  const MDG = window.MDG;
  const { $, el } = MDG.APP;
  const GRID = () => MDG.Grid, ENG = () => MDG.Engine;

  const TILE = 42;
  let cv = null, ctx = null, mm = null, mctx = null;
  let cam = { x: 0, y: 0, init: false };
  let shake = 0;
  let floats = [];   // {x, y, text, color, t0}
  let flashes = [];  // {x, y, t0}
  let slashes = [];  // {x0,y0,x1,y1,t0}
  let armedSkill = -1; // 待发之技（点选目标模式）
  let targetInfo = null;

  function init() {
    if (MDG.UI._inited) return;
    MDG.UI._inited = true;
    cv = $("cv"); ctx = cv.getContext("2d");
    mm = $("minimap"); mctx = mm.getContext("2d");
    const fit = () => { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; cv.style.width = innerWidth + "px"; cv.style.height = innerHeight + "px"; };
    fit(); addEventListener("resize", fit);
  }

  /* ---- 迷雾：探索记录存于 G.explored（可序列化） ---- */
  function updateFov(G) {
    if (!G.explored) G.explored = {};
    const seen = GRID().fov(G.map, G.player.x, G.player.y, 8);
    seen.forEach(([x, y]) => { G.explored[x + "," + y] = 1; });
    G._visible = {};
    seen.forEach(([x, y]) => { G._visible[x + "," + y] = 1; });
  }

  function addFloat(G, x, y, text, color) { floats.push({ x, y, text, color: color || "#ece6d7", t0: performance.now() }); }
  function addFlash(x, y) { flashes.push({ x, y, t0: performance.now() }); }
  function addSlash(x0, y0, x1, y1) { slashes.push({ x0, y0, x1, y1, t0: performance.now() }); }
  function kick() { shake = Math.min(10, shake + 5); }

  /* ---- 事件 → 视听 ---- */
  function playEvents(G, evs) {
    const S = MDG.APP.sfx;
    let anyHit = false;
    evs.forEach(e => {
      switch (e.t) {
        case "hit":
          addFloat(G, e.x, e.y, e.zero ? "格挡" : "-" + e.dmg, e.aura ? "#8aa04f" : (e.crit ? "#ecd39a" : "#e0705f"));
          addFlash(e.x, e.y); anyHit = true;
          if (e.dmg >= 3) kick();
          break;
        case "miss": addFloat(G, e.x, e.y, "闪", "#9aa7c4"); break;
        case "heal": addFloat(G, e.x, e.y, "+" + e.val, "#7dc99a"); break;
        case "shield": addFloat(G, e.x, e.y, "盾-" + e.val, "#c9a45f"); break;
        case "blood": addFloat(G, e.x, e.y, "血祭！", "#c14b3a"); S.hit(); break;
        case "die": addFloat(G, e.x, e.y, "倒", "#c14b3a"); S.kill(); break;
        case "learn": MDG.APP.toast("录技：「" + e.name + "」入谱"); S.learn(); break;
        case "relic": MDG.APP.toast("得刀卡「" + e.name + "」"); S.chest(); break;
        case "alert": if (e.boss) { showBossCard(e.name); S.boss(); } break;
        case "bottle": addFloat(G, e.x, e.y, "砰！-1", "#c14b3a"); S.bottle(); kick(); break;
        case "tree": S.eat(); break;
        case "summon": addFloat(G, e.x, e.y, "起义！", "#c14b3a"); break;
        case "camp": S.camp(); break;
        case "chest": S.chest(); break;
        case "scroll": addFloat(G, e.x, e.y, "史料+1", "#c9a45f"); S.coin(); break;
        case "stairsOpen": MDG.APP.toast("楼梯已开——下行！"); break;
        case "stairsLocked": S.ui(); break;
        case "descend": S.stairs(); showFloorCard(G); break;
        case "win": S.win(); break;
        case "dead": S.dead(); break;
      }
    });
    if (anyHit) {
      const playerHit = evs.some(e => e.t === "hit" && G.player.x === e.x && G.player.y === e.y && !e.zero);
      if (playerHit) { S.hurt(); kick(); } else S.hit();
    }
  }

  function showFloorCard(G) {
    const c = $("floor-card");
    $("fc-num").textContent = "第" + ["一", "二", "三", "四", "五", "六", "七", "八", "九"][G.floorIdx] + "层";
    $("fc-name").textContent = G.floorDef.name;
    $("fc-intro").textContent = G.floorDef.intro + (G.floorDef.rule ? "　〔" + G.floorDef.rule + "〕" + G.floorDef.ruleDesc : "");
    c.classList.remove("hidden");
    c.style.animation = "none"; void c.offsetWidth; c.style.animation = "";
    setTimeout(() => c.classList.add("hidden"), 2800);
  }
  function showBossCard(name) {
    const c = $("boss-card");
    $("bc-name").textContent = name;
    $("bc-line").textContent = "镇守惊起——来呀来呀。";
    c.classList.remove("hidden");
    c.style.animation = "none"; void c.offsetWidth; c.style.animation = "";
    setTimeout(() => c.classList.add("hidden"), 2400);
  }

  /* ---- 主绘制 ---- */
  function draw(G, now) {
    if (!ctx) return;
    const Gr = GRID();
    const W = cv.width, H = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#05080f";
    ctx.fillRect(0, 0, W, H);
    /* 相机缓动 */
    const tx = G.player.x * TILE + TILE / 2, ty = G.player.y * TILE + TILE / 2;
    if (!cam.init) { cam.x = tx; cam.y = ty; cam.init = true; }
    cam.x += (tx - cam.x) * .18; cam.y += (ty - cam.y) * .18;
    let sx = 0, sy = 0;
    if (shake > 0) { shake *= .86; if (shake < .3) shake = 0; sx = (Math.random() * 2 - 1) * shake; sy = (Math.random() * 2 - 1) * shake; }
    const ox = W / 2 / devicePixelRatio - cam.x + sx, oy = H / 2 / devicePixelRatio - cam.y + sy;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, ox * devicePixelRatio, oy * devicePixelRatio);

    const x0 = Math.max(0, Math.floor((0 - ox) / TILE) - 1), y0 = Math.max(0, Math.floor((0 - oy) / TILE) - 1);
    const x1 = Math.min(G.map.w - 1, Math.ceil((W / devicePixelRatio - ox) / TILE) + 1), y1 = Math.min(G.map.h - 1, Math.ceil((H / devicePixelRatio - oy) / TILE) + 1);

    /* 瓦片 */
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const vis = G._visible && G._visible[x + "," + y];
      const exp = G.explored && G.explored[x + "," + y];
      if (!vis && !exp) continue;
      const t = Gr.at(G.map, x, y);
      drawTile(G, x, y, t, vis);
      if (!vis) { ctx.fillStyle = "rgba(5,8,15,.62)"; ctx.fillRect(x * TILE, y * TILE, TILE, TILE); }
    }
    /* cans 特则：同行同列的飞瓶预警 */
    if (G.floorDef.rule === "cans") {
      ctx.fillStyle = "rgba(193,75,58,.07)";
      G.enemies.forEach(u => {
        if (u.dead || u.chId === "tree") return;
        if (u.x === G.player.x) ctx.fillRect(u.x * TILE, 0, TILE, G.map.h * TILE);
        if (u.y === G.player.y) ctx.fillRect(0, u.y * TILE, G.map.w * TILE, TILE);
      });
    }
    /* 施技目标高亮 */
    if (armedSkill >= 0 && targetInfo) {
      const sk = G.player.skills[armedSkill];
      if (sk && sk.range) {
        ctx.strokeStyle = "rgba(236,211,154,.5)";
        for (let y = 0; y < G.map.h; y++) for (let x = 0; x < G.map.w; x++) {
          const d = Gr.manh(G.player.x, G.player.y, x, y);
          if (d > 0 && d <= sk.range && (G._visible[x + "," + y])) {
            ctx.strokeRect(x * TILE + 3, y * TILE + 3, TILE - 6, TILE - 6);
          }
        }
      }
    }
    /* 活体 */
    G.enemies.forEach(u => {
      if (u.dead) return;
      if (!(G._visible && G._visible[u.x + "," + u.y])) return;
      drawUnit(u, now, false);
    });
    if (!G.player.dead) drawUnit(G.player, now, true);

    /* 刀光 */
    slashes = slashes.filter(s => now - s.t0 < 160);
    slashes.forEach(s => {
      const k = (now - s.t0) / 160;
      ctx.strokeStyle = "rgba(236,211,154," + (1 - k) * .9 + ")";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(s.x0 * TILE + TILE / 2, s.y0 * TILE + TILE / 2);
      ctx.lineTo(s.x1 * TILE + TILE / 2, s.y1 * TILE + TILE / 2);
      ctx.stroke();
    });
    /* 受击闪白 */
    flashes = flashes.filter(f => now - f.t0 < 180);
    flashes.forEach(f => {
      const k = 1 - (now - f.t0) / 180;
      ctx.fillStyle = "rgba(255,240,210," + k * .5 + ")";
      ctx.fillRect(f.x * TILE, f.y * TILE, TILE, TILE);
    });
    /* 浮字 */
    floats = floats.filter(f => now - f.t0 < 900);
    floats.forEach(f => {
      const k = (now - f.t0) / 900;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = f.color;
      ctx.font = "bold 16px serif";
      ctx.textAlign = "center";
      ctx.fillText(f.text, f.x * TILE + TILE / 2, f.y * TILE + TILE * .35 - k * 26);
      ctx.globalAlpha = 1;
    });
    ctx.textAlign = "left";
    drawMinimap(G);
  }

  function drawTile(G, x, y, t, vis) {
    const Gr = GRID();
    const px = x * TILE, py = y * TILE;
    if (t === Gr.WALL) {
      ctx.fillStyle = vis ? "#141c2f" : "#101627";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "rgba(0,0,0,.25)";
      ctx.fillRect(px, py + TILE - 5, TILE, 5);
      ctx.strokeStyle = "rgba(29,41,65,.6)";
      ctx.strokeRect(px + .5, py + .5, TILE - 1, TILE - 1);
      return;
    }
    /* 地面 */
    ctx.fillStyle = t === Gr.CORR ? "#0d1424" : "#111a2e";
    ctx.fillRect(px, py, TILE, TILE);
    ctx.strokeStyle = "rgba(29,41,65,.35)";
    ctx.strokeRect(px + .5, py + .5, TILE - 1, TILE - 1);
    if (t === Gr.STAIRS) {
      const open = ENG().stairsOpenNow(G);
      ctx.fillStyle = open ? "rgba(201,164,95,.2)" : "rgba(125,138,165,.08)";
      ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
      ctx.fillStyle = open ? "#ecd39a" : "#4a5570";
      ctx.font = "20px serif"; ctx.textAlign = "center";
      ctx.fillText(open ? "梯" : "锁", px + TILE / 2, py + TILE / 2 + 7);
      ctx.textAlign = "left";
    } else if (t === Gr.CHEST) {
      ctx.fillStyle = "#6a4f2c"; ctx.fillRect(px + 7, py + 12, TILE - 14, TILE - 22);
      ctx.fillStyle = "#c9a45f"; ctx.fillRect(px + 7, py + 12, TILE - 14, 5);
      ctx.fillStyle = "#2c2014"; ctx.fillRect(px + TILE / 2 - 2, py + 19, 4, 7);
    } else if (t === Gr.SCROLL) {
      ctx.fillStyle = "#d8cba8"; ctx.fillRect(px + 12, py + 10, TILE - 24, TILE - 20);
      ctx.fillStyle = "#8a3b3b"; ctx.fillRect(px + 12, py + 10, 4, TILE - 20);
      ctx.fillStyle = "#5a4a2c"; ctx.font = "12px serif"; ctx.textAlign = "center";
      ctx.fillText("史", px + TILE / 2 + 2, py + TILE / 2 + 4);
      ctx.textAlign = "left";
    } else if (t === Gr.CAMPFIRE) {
      ctx.fillStyle = "#3a2c1c"; ctx.fillRect(px + 8, py + TILE - 14, TILE - 16, 6);
      const f = 3 + Math.sin(performance.now() / 160 + x) * 1.5;
      ctx.fillStyle = "rgba(230,140,60,.9)";
      ctx.beginPath(); ctx.arc(px + TILE / 2, py + TILE - 18, 5 + f, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(236,211,154,.9)";
      ctx.beginPath(); ctx.arc(px + TILE / 2, py + TILE - 19, 2.5 + f * .5, 0, 7); ctx.fill();
    } else if (t === Gr.SHOP) {
      ctx.fillStyle = "#26402f"; ctx.fillRect(px + 5, py + 10, TILE - 10, TILE - 18);
      ctx.fillStyle = "#c9a45f"; ctx.font = "16px serif"; ctx.textAlign = "center";
      ctx.fillText("贾", px + TILE / 2, py + TILE / 2 + 5);
      ctx.textAlign = "left";
    }
  }

  function drawUnit(u, now, isPlayer) {
    const px = u.x * TILE, py = u.y * TILE;
    const bob = Math.sin(now / 300 + u.x * 3) * 1.2;
    /* 影 */
    ctx.fillStyle = "rgba(0,0,0,.4)";
    ctx.beginPath(); ctx.ellipse(px + TILE / 2, py + TILE - 6, 13, 5, 0, 0, 7); ctx.fill();
    /* 体 */
    const r = 14;
    ctx.fillStyle = u.color;
    ctx.strokeStyle = isPlayer ? "#ecd39a" : (u.boss ? "#c14b3a" : "rgba(0,0,0,.4)");
    ctx.lineWidth = isPlayer ? 2.5 : (u.boss ? 2.5 : 1.5);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(px + TILE / 2 - r, py + 6 + bob, r * 2, r * 2, 7);
    else ctx.rect(px + TILE / 2 - r, py + 6 + bob, r * 2, r * 2);
    ctx.fill(); ctx.stroke();
    /* 字牌 */
    ctx.fillStyle = "#fff";
    ctx.font = "bold 17px serif"; ctx.textAlign = "center";
    ctx.fillText(u.glyph, px + TILE / 2, py + 6 + bob + 23);
    ctx.textAlign = "left";
    /* 血条 */
    const w = TILE - 12, hpr = Math.max(0, u.hp / u.maxHp);
    ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(px + 6, py + TILE - 3, w, 3);
    ctx.fillStyle = hpr > .5 ? "#7dc99a" : (hpr > .25 ? "#d0a04f" : "#c14b3a");
    ctx.fillRect(px + 6, py + TILE - 3, w * hpr, 3);
    /* 状态角标 */
    let ix = 0;
    const mark = (txt, color) => { ctx.fillStyle = color; ctx.font = "10px serif"; ctx.fillText(txt, px + 4 + ix * 11, py + 12); ix++; };
    if (u.st.shield > 0) mark("盾", "#c9a45f");
    if (u.st.poison > 0) mark("毒", "#8aa04f");
    if (u.st.stun > 0) mark("晕", "#9aa7c4");
    if (u.st.disarm > 0) mark("缴", "#d0705f");
    if (u.st.emp > 0) mark("祭", "#c14b3a");
    if (isPlayer && u.st.buffKnife > 0) mark("棒", "#d0a04f");
  }

  function drawMinimap(G) {
    if (!mctx) return;
    const Gr = GRID();
    const s = Math.min(mm.width / G.map.w, mm.height / G.map.h);
    mctx.fillStyle = "rgba(7,11,20,1)"; mctx.fillRect(0, 0, mm.width, mm.height);
    for (let y = 0; y < G.map.h; y++) for (let x = 0; x < G.map.w; x++) {
      if (!G.explored || !G.explored[x + "," + y]) continue;
      const t = Gr.at(G.map, x, y);
      mctx.fillStyle = t === Gr.WALL ? "#141c2f" : "#232f4d";
      mctx.fillRect(x * s, y * s, s, s);
      if (t === Gr.STAIRS) { mctx.fillStyle = "#c9a45f"; mctx.fillRect(x * s, y * s, s, s); }
      if (t === Gr.CAMPFIRE) { mctx.fillStyle = "#d08a4f"; mctx.fillRect(x * s, y * s, s, s); }
    }
    mctx.fillStyle = "#ecd39a";
    mctx.fillRect(G.player.x * s - 1, G.player.y * s - 1, s + 2, s + 2);
  }

  MDG.UI = { init, draw, playEvents, updateFov, addFloat, kick, showFloorCard, getCam: () => cam, armed: { get: () => armedSkill, set: (v) => { armedSkill = v; targetInfo = v >= 0 ? {} : null; } } };
})();
