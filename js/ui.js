/* ============================================================
 * 实验史记 · 马刀地宫 —— 丹青卷（Canvas 渲染）· 预渲染管线
 * 性能设计：
 *   · 地形（墙/地/箱/史料/商摊/灶台/梯座）预渲染到离屏画布，
 *     每帧一次 drawImage；仅当瓦片事件（碎树/开箱/熄灶/生树）才脏重绘。
 *   · 明暗两片遮罩（视野暗化/未探全黑）随行动重建，每帧纯 blit。
 *   · 小地图随行动缓存，每帧 blit。
 *   · 浮字/刀光原地压实，不出垃圾。
 * 每帧成本 ≈ 4 次 blit + 活体与特效，瓦片循环只在行动时发生。
 * 挂载：MDG.UI（TILE 亦从此导出，input 共用此单一来源）
 * ============================================================ */
(function () {
  "use strict";
  const MDG = window.MDG;
  const { $ } = MDG.APP;
  const GRID = () => MDG.Grid;

  const TILE = 42;
  let cv = null, ctx = null, mm = null, mctx = null;
  let cam = { x: 0, y: 0, init: false };
  let shake = 0;
  let floats = [];   // {x, y, text, color, t0}
  let flashes = [];  // {x, y, t0}
  let slashes = [];  // {x0,y0,x1,y1,t0}
  let armedSkill = -1;

  /* 离屏层：地形 / 视野暗化 / 未探全黑 / 小地图缓存 */
  let terrain = null, visMask = null, fogMask = null, miniCache = null;
  let builtFloor = -1, terrainDirty = false, fogDirty = true, miniDirty = true;
  let campfires = []; // 火苗动态绘制，静态灶台在地形层

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
    let grew = false;
    for (let i = 0; i < seen.length; i++) {
      const k = seen[i][0] + "," + seen[i][1];
      if (!G.explored[k]) { G.explored[k] = 1; grew = true; }
    }
    G._visible = {};
    for (let i = 0; i < seen.length; i++) G._visible[seen[i][0] + "," + seen[i][1]] = 1;
    if (grew) fogDirty = true;
    miniDirty = true;
    rebuildVisMask(G);
    if (fogDirty) rebuildFogMask(G);
  }

  function mkCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }

  /* ---- 地形层：静态瓦片一次画全 ---- */
  function rebuildTerrain(G) {
    const Gr = GRID();
    terrain = mkCanvas(G.map.w * TILE, G.map.h * TILE);
    const t = terrain.getContext("2d");
    campfires = [];
    for (let y = 0; y < G.map.h; y++) for (let x = 0; x < G.map.w; x++) {
      drawTileStatic(t, G, x, y, Gr.at(G.map, x, y), campfires);
    }
    terrainDirty = false;
  }

  /* 视野暗化遮罩：全图半暗，视野格抠亮。每次行动重建。 */
  function rebuildVisMask(G) {
    if (!visMask || visMask.width !== G.map.w * TILE || visMask.height !== G.map.h * TILE)
      visMask = mkCanvas(G.map.w * TILE, G.map.h * TILE);
    const t = visMask.getContext("2d");
    t.globalCompositeOperation = "source-over";
    t.clearRect(0, 0, visMask.width, visMask.height);
    t.fillStyle = "rgba(5,8,15,.62)";
    t.fillRect(0, 0, visMask.width, visMask.height);
    t.globalCompositeOperation = "destination-out";
    for (const k in G._visible) {
      const i = k.indexOf(",");
      t.clearRect((+k.slice(0, i)) * TILE, (+k.slice(i + 1)) * TILE, TILE, TILE);
    }
    t.globalCompositeOperation = "source-over";
  }

  /* 未探遮罩：全图全黑，探过格抠空。探索增长时重建。 */
  function rebuildFogMask(G) {
    if (!fogMask || fogMask.width !== G.map.w * TILE || fogMask.height !== G.map.h * TILE)
      fogMask = mkCanvas(G.map.w * TILE, G.map.h * TILE);
    const t = fogMask.getContext("2d");
    t.globalCompositeOperation = "source-over";
    t.fillStyle = "#05080f";
    t.fillRect(0, 0, fogMask.width, fogMask.height);
    t.globalCompositeOperation = "destination-out";
    for (const k in G.explored) {
      const i = k.indexOf(",");
      t.clearRect((+k.slice(0, i)) * TILE, (+k.slice(i + 1)) * TILE, TILE, TILE);
    }
    t.globalCompositeOperation = "source-over";
    fogDirty = false;
  }

  /* ---- 视听素材登记 ---- */
  function addFloat(x, y, text, color) { if (floats.length < 40) floats.push({ x, y, text, color: color || "#ece6d7", t0: performance.now() }); }
  function addFlash(x, y) { if (flashes.length < 24) flashes.push({ x, y, t0: performance.now() }); }
  function addSlash(x0, y0, x1, y1) { if (slashes.length < 12) slashes.push({ x0, y0, x1, y1, t0: performance.now() }); }
  function kick() { shake = Math.min(10, shake + 5); }

  /* ---- 事件 → 视听 ---- */
  function playEvents(G, evs) {
    const S = MDG.APP.sfx;
    let anyHit = false;
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      switch (e.t) {
        case "hit":
          addFloat(e.x, e.y, e.zero ? "格挡" : "-" + e.dmg, e.aura ? "#8aa04f" : (e.crit ? "#ecd39a" : "#e0705f"));
          addFlash(e.x, e.y); anyHit = true;
          if (e.dmg >= 3) kick();
          break;
        case "miss": addFloat(e.x, e.y, "闪", "#9aa7c4"); break;
        case "heal": addFloat(e.x, e.y, "+" + e.val, "#7dc99a"); break;
        case "shield": addFloat(e.x, e.y, "盾-" + e.val, "#c9a45f"); break;
        case "blood": addFloat(e.x, e.y, "血祭！", "#c14b3a"); S.hit(); break;
        case "die": addFloat(e.x, e.y, "倒", "#c14b3a"); S.kill(); break;
        case "learn": MDG.APP.toast("录技：「" + e.name + "」入谱"); S.learn(); break;
        case "relic": MDG.APP.toast("得刀卡「" + e.name + "」"); S.chest(); break;
        case "alert": if (e.boss) { showBossCard(e.name); S.boss(); } break;
        case "bottle": addFloat(e.x, e.y, "砰！-1", "#c14b3a"); S.bottle(); kick(); break;
        case "parry":
          addFloat(e.x, e.y, "弹反！", "#ecd39a");
          addFlash(e.x, e.y); addFlash(G.player.x, G.player.y);
          addSlash(G.player.x, G.player.y, e.x, e.y);
          S.parry(); kick();
          break;
        case "stagger": addFloat(e.x, e.y, "失措", "#9aa7c4"); break;
        case "telegraph": S.tele(); break;
        case "trap":
          addFloat(e.x, e.y, "陷阱！-3", "#e0705f");
          addFlash(e.x, e.y); kick();
          terrainDirty = true; /* 尖刺报废，瓦片复原为地 */
          S.trap();
          break;
        case "descend": S.stairs(); showFloorCard(G); cam.init = false; break;
        case "win": S.win(); break;
        case "dead": S.dead(); break;
        case "scroll": addFloat(e.x, e.y, "史料+1", "#c9a45f"); S.coin(); break;
        case "stairsOpen": MDG.APP.toast("楼梯已开——下行！"); break;
        case "tree": case "treebreak": case "chest": case "camp":
          terrainDirty = true; // 瓦片变了：下一帧重铺地形
          break;
      }
    }
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
    $("bc-line").textContent = "记忆里的人不会让路——来呀来呀。";
    c.classList.remove("hidden");
    c.style.animation = "none"; void c.offsetWidth; c.style.animation = "";
    setTimeout(() => c.classList.add("hidden"), 2400);
  }

  /* ---- 静态瓦片（进地形层）——可读性优先：墙近黑带棱，地亮，交界描金 ---- */
  function drawTileStatic(t, G, x, y, tile, campfiresOut) {
    const Gr = GRID();
    const px = x * TILE, py = y * TILE;
    if (tile === Gr.WALL) {
      /* 墙：近黑实体块 + 顶棱亮边 + 砖缝——一眼即知「不可走」 */
      t.fillStyle = "#0d1220";
      t.fillRect(px, py, TILE, TILE);
      t.fillStyle = "#3a4e7d";
      t.fillRect(px, py, TILE, 3);
      t.fillStyle = "rgba(58,78,125,.4)";
      t.fillRect(px, py, 3, TILE);
      t.strokeStyle = "rgba(0,0,0,.45)";
      t.lineWidth = 1;
      t.beginPath();
      t.moveTo(px, py + TILE * 0.5 + .5); t.lineTo(px + TILE, py + TILE * 0.5 + .5);
      const off = (y % 2) ? TILE * 0.25 : TILE * 0.75;
      t.moveTo(px + off + .5, py + TILE * 0.5); t.lineTo(px + off + .5, py + TILE);
      t.stroke();
      t.fillStyle = "rgba(0,0,0,.3)";
      t.fillRect(px, py + TILE - 4, TILE, 4);
      return;
    }
    /* 地面：明显亮于墙的可走区（宫室更暖、走廊更冷） */
    t.fillStyle = tile === Gr.CORR ? "#18243e" : "#202d4a";
    t.fillRect(px, py, TILE, TILE);
    if (((x * 7 + y * 13) % 6) === 0) {
      t.fillStyle = "rgba(236,230,215,.025)";
      t.fillRect(px, py, TILE, TILE);
    }
    /* 与墙的交界描金边——可走区域的轮廓一眼可辨 */
    t.fillStyle = "rgba(236,211,154,.16)";
    if (Gr.at(G.map, x - 1, y) === Gr.WALL) t.fillRect(px, py, 2, TILE);
    if (Gr.at(G.map, x + 1, y) === Gr.WALL) t.fillRect(px + TILE - 2, py, 2, TILE);
    if (Gr.at(G.map, x, y - 1) === Gr.WALL) t.fillRect(px, py, TILE, 2);
    if (Gr.at(G.map, x, y + 1) === Gr.WALL) t.fillRect(px, py + TILE - 2, TILE, 2);
    if (tile === Gr.TRAP) {
      /* 陷阱：醒目的尖刺（朱红，一眼即知是危险物） */
      t.fillStyle = "rgba(193,75,58,.18)";
      t.fillRect(px + 3, py + 3, TILE - 6, TILE - 6);
      t.fillStyle = "#8a3b3b";
      t.beginPath(); t.moveTo(px + 4, py + TILE - 6); t.lineTo(px + 9, py + TILE - 20); t.lineTo(px + 14, py + TILE - 6); t.closePath(); t.fill();
      t.beginPath(); t.moveTo(px + 13, py + TILE - 6); t.lineTo(px + 18, py + TILE - 24); t.lineTo(px + 23, py + TILE - 6); t.closePath(); t.fill();
      t.beginPath(); t.moveTo(px + 22, py + TILE - 6); t.lineTo(px + 27, py + TILE - 18); t.lineTo(px + 32, py + TILE - 6); t.closePath(); t.fill();
      t.fillStyle = "#e0705f";
      t.fillRect(px + 4, py + TILE - 7, TILE - 8, 3);
      return;
    }
    if (tile === Gr.TREE) {
      /* 树：明确的堵路物（此前没有画出来，是字面意义的空气墙） */
      t.fillStyle = "rgba(0,0,0,.35)";
      t.beginPath(); t.ellipse(px + TILE / 2, py + TILE - 8, 11, 4.5, 0, 0, 7); t.fill();
      t.fillStyle = "#3d2c1a";
      t.fillRect(px + TILE / 2 - 3, py + TILE - 16, 6, 10);
      t.fillStyle = "#2f5232";
      t.beginPath(); t.arc(px + TILE / 2, py + TILE / 2 - 4, 13, 0, 7); t.fill();
      t.fillStyle = "#3c6a40";
      t.beginPath(); t.arc(px + TILE / 2 - 4, py + TILE / 2 - 7, 8, 0, 7); t.fill();
      return;
    }
    if (tile === Gr.CHEST) {
      t.fillStyle = "#6a4f2c"; t.fillRect(px + 7, py + 12, TILE - 14, TILE - 22);
      t.fillStyle = "#c9a45f"; t.fillRect(px + 7, py + 12, TILE - 14, 5);
      t.fillStyle = "#2c2014"; t.fillRect(px + TILE / 2 - 2, py + 19, 4, 7);
    } else if (tile === Gr.SCROLL) {
      t.fillStyle = "#d8cba8"; t.fillRect(px + 12, py + 10, TILE - 24, TILE - 20);
      t.fillStyle = "#8a3b3b"; t.fillRect(px + 12, py + 10, 4, TILE - 20);
      t.fillStyle = "#5a4a2c"; t.font = "12px serif"; t.textAlign = "center";
      t.fillText("史", px + TILE / 2 + 2, py + TILE / 2 + 4);
      t.textAlign = "left";
    } else if (tile === Gr.CAMPFIRE) {
      t.fillStyle = "#3a2c1c"; t.fillRect(px + 8, py + TILE - 14, TILE - 16, 6);
      campfiresOut.push([x, y]);
    } else if (tile === Gr.SHOP) {
      t.fillStyle = "#26402f"; t.fillRect(px + 5, py + 10, TILE - 10, TILE - 18);
      t.fillStyle = "#c9a45f"; t.font = "16px serif"; t.textAlign = "center";
      t.fillText("贾", px + TILE / 2, py + TILE / 2 + 5);
      t.textAlign = "left";
    }
  }

  /* ---- 动态瓦片（每帧画，量极少） ---- */
  function drawStairs(G) {
    const open = !!G._stairsOpen;
    const [sx, sy] = G.map.stairs;
    const px = sx * TILE, py = sy * TILE;
    ctx.fillStyle = open ? "rgba(201,164,95,.2)" : "rgba(125,138,165,.08)";
    ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
    ctx.fillStyle = open ? "#ecd39a" : "#4a5570";
    ctx.font = "20px serif"; ctx.textAlign = "center";
    ctx.fillText(open ? "梯" : "锁", px + TILE / 2, py + TILE / 2 + 7);
    ctx.textAlign = "left";
  }
  function drawCampfires(now) {
    for (let i = 0; i < campfires.length; i++) {
      const [x, y] = campfires[i];
      const px = x * TILE, py = y * TILE;
      const f = 3 + Math.sin(now / 160 + x) * 1.5;
      ctx.fillStyle = "rgba(230,140,60,.9)";
      ctx.beginPath(); ctx.arc(px + TILE / 2, py + TILE - 18, 5 + f, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(236,211,154,.9)";
      ctx.beginPath(); ctx.arc(px + TILE / 2, py + TILE - 19, 2.5 + f * .5, 0, 7); ctx.fill();
    }
  }

  function drawUnit(u, now, isPlayer) {
    const px = u.x * TILE, py = u.y * TILE;
    const bob = Math.sin(now / 300 + u.x * 3) * 1.2;
    ctx.fillStyle = "rgba(0,0,0,.4)";
    ctx.beginPath(); ctx.ellipse(px + TILE / 2, py + TILE - 6, 13, 5, 0, 0, 7); ctx.fill();
    const r = 14;
    ctx.fillStyle = u.color;
    ctx.strokeStyle = isPlayer ? "#ecd39a" : (u.boss ? "#c14b3a" : "rgba(0,0,0,.4)");
    ctx.lineWidth = isPlayer ? 2.5 : (u.boss ? 2.5 : 1.5);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(px + TILE / 2 - r, py + 6 + bob, r * 2, r * 2, 7);
    else ctx.rect(px + TILE / 2 - r, py + 6 + bob, r * 2, r * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 17px serif"; ctx.textAlign = "center";
    ctx.fillText(u.glyph, px + TILE / 2, py + 6 + bob + 23);
    ctx.textAlign = "left";
    const w = TILE - 12, hpr = Math.max(0, u.hp / u.maxHp);
    ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(px + 6, py + TILE - 3, w, 3);
    ctx.fillStyle = hpr > .5 ? "#7dc99a" : (hpr > .25 ? "#d0a04f" : "#c14b3a");
    ctx.fillRect(px + 6, py + TILE - 3, w * hpr, 3);
    let ix = 0;
    ctx.font = "10px serif";
    const mark = (txt, color) => { ctx.fillStyle = color; ctx.fillText(txt, px + 4 + ix * 11, py + 12); ix++; };
    if (u.st.shield > 0) mark("盾", "#c9a45f");
    if (u.st.poison > 0) mark("毒", "#8aa04f");
    if (u.st.stun > 0) mark("晕", "#9aa7c4");
    if (u.st.disarm > 0) mark("缴", "#d0705f");
    if (u.st.emp > 0) mark("祭", "#c14b3a");
    if (isPlayer && u.st.buffKnife > 0) mark("棒", "#d0a04f");
  }

  /* ---- 小地图：随行动缓存，每帧 blit ---- */
  function rebuildMini(G) {
    const Gr = GRID();
    if (!miniCache) miniCache = mkCanvas(mm.width, mm.height);
    const t = miniCache.getContext("2d");
    t.fillStyle = "rgba(7,11,20,1)"; t.fillRect(0, 0, mm.width, mm.height);
    const s = Math.min(mm.width / G.map.w, mm.height / G.map.h);
    for (let y = 0; y < G.map.h; y++) for (let x = 0; x < G.map.w; x++) {
      if (!G.explored || !G.explored[x + "," + y]) continue;
      const v = Gr.at(G.map, x, y);
      t.fillStyle = v === Gr.WALL ? "#0c1322" : "#2e4066";
      t.fillRect(x * s, y * s, s, s);
      if (v === Gr.STAIRS) { t.fillStyle = "#c9a45f"; t.fillRect(x * s, y * s, s, s); }
      if (v === Gr.CAMPFIRE) { t.fillStyle = "#d08a4f"; t.fillRect(x * s, y * s, s, s); }
      if (v === Gr.SHOP) { t.fillStyle = "#7dc99a"; t.fillRect(x * s, y * s, s, s); }
      if (v === Gr.TREE) { t.fillStyle = "#3c6a40"; t.fillRect(x * s, y * s, s, s); }
      if (v === Gr.TRAP) { t.fillStyle = "#c14b3a"; t.fillRect(x * s, y * s, s, s); }
    }
    miniDirty = false;
  }

  /* ---- 主绘制：四次 blit + 活体特效 ---- */
  function draw(G, now) {
    if (!ctx) return;
    if (builtFloor !== G.floorIdx || terrainDirty || !terrain) {
      rebuildTerrain(G); builtFloor = G.floorIdx;
      rebuildFogMask(G); rebuildMini(G); fogDirty = false; miniDirty = false;
    }
    const W = cv.width, H = cv.height, dpr = devicePixelRatio;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#05080f";
    ctx.fillRect(0, 0, W, H);
    const tx = G.player.x * TILE + TILE / 2, ty = G.player.y * TILE + TILE / 2;
    if (!cam.init) { cam.x = tx; cam.y = ty; cam.init = true; }
    cam.x += (tx - cam.x) * .18; cam.y += (ty - cam.y) * .18;
    let sx = 0, sy = 0;
    if (shake > 0) { shake *= .86; if (shake < .3) shake = 0; sx = (Math.random() * 2 - 1) * shake; sy = (Math.random() * 2 - 1) * shake; }
    const ox = W / dpr / 2 - cam.x + sx, oy = H / dpr / 2 - cam.y + sy;
    ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);

    /* 三层 blit：地形 → 火光/梯（动态瓦片） → 视野暗化 → 未探全黑 */
    ctx.drawImage(terrain, 0, 0);
    drawStairs(G);
    drawCampfires(now);
    ctx.drawImage(visMask, 0, 0);
    ctx.drawImage(fogMask, 0, 0);

    /* cans 飞瓶预警线 */
    if (G.floorDef.rule === "cans") {
      ctx.fillStyle = "rgba(193,75,58,.07)";
      const p = G.player;
      const es = G.enemies;
      for (let i = 0; i < es.length; i++) {
        const e = es[i];
        if (e.dead || e.chId === "tree") continue;
        if (e.x === p.x) ctx.fillRect(e.x * TILE, 0, TILE, G.map.h * TILE);
        else if (e.y === p.y) ctx.fillRect(0, e.y * TILE, G.map.w * TILE, TILE);
      }
    }
    /* 施技射程高亮 */
    if (armedSkill >= 0) {
      const sk = G.player.skills[armedSkill];
      if (sk && sk.range) {
        ctx.strokeStyle = "rgba(236,211,154,.5)";
        const p = G.player;
        for (let y = 1; y < G.map.h - 1; y++) for (let x = 1; x < G.map.w - 1; x++) {
          const d = Math.abs(x - p.x) + Math.abs(y - p.y);
          if (d > 0 && d <= sk.range && G._visible[x + "," + y]) ctx.strokeRect(x * TILE + 3, y * TILE + 3, TILE - 6, TILE - 6);
        }
      }
    }
    /* 弹反窗口：亮刀之敌红框+叹号 */
    for (let i = 0; i < G.enemies.length; i++) {
      const u = G.enemies[i];
      if (u.dead || !u.telegraph || !(G._visible && G._visible[u.x + "," + u.y])) continue;
      const pulse = .55 + Math.sin(now / 110) * .3;
      ctx.strokeStyle = "rgba(193,75,58," + pulse.toFixed(2) + ")";
      ctx.lineWidth = 2.5;
      ctx.strokeRect(u.x * TILE + 1.5, u.y * TILE + 1.5, TILE - 3, TILE - 3);
      ctx.fillStyle = "#e0705f";
      ctx.font = "bold 18px serif";
      ctx.textAlign = "center";
      ctx.fillText("！", u.x * TILE + TILE / 2, u.y * TILE - 5);
      ctx.textAlign = "left";
    }
    /* 键盘光标 */
    if (MDG.Input && MDG.Input.cursorActive && MDG.Input.cursorActive()) {
      const [cx2, cy2] = MDG.Input.cursorPos();
      const mode = MDG.Input.cursorMode();
      const col = mode === "skill" ? "rgba(236,211,154,.9)" : mode === "item" ? "rgba(125,201,154,.9)" : "rgba(154,167,196,.9)";
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      const t = now / 300;
      const pad = 2 + Math.sin(t) * 1.5;
      ctx.strokeRect(cx2 * TILE + pad, cy2 * TILE + pad, TILE - pad * 2, TILE - pad * 2);
      ctx.fillStyle = col;
      ctx.font = "10px serif";
      ctx.fillText("J", cx2 * TILE + 3, cy2 * TILE + 11);
    }
    /* 活体 */
    for (let i = 0; i < G.enemies.length; i++) {
      const u = G.enemies[i];
      if (u.dead || !(G._visible && G._visible[u.x + "," + u.y])) continue;
      drawUnit(u, now, false);
    }
    if (!G.player.dead) drawUnit(G.player, now, true);

    /* 刀光（原地压实） */
    let w = 0;
    for (let i = 0; i < slashes.length; i++) {
      const s = slashes[i], k = (now - s.t0) / 160;
      if (k >= 1) continue;
      slashes[w++] = s;
      ctx.strokeStyle = "rgba(236,211,154," + (1 - k) * .9 + ")";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(s.x0 * TILE + TILE / 2, s.y0 * TILE + TILE / 2);
      ctx.lineTo(s.x1 * TILE + TILE / 2, s.y1 * TILE + TILE / 2);
      ctx.stroke();
    }
    slashes.length = w;
    /* 受击闪白 */
    w = 0;
    for (let i = 0; i < flashes.length; i++) {
      const f = flashes[i], k = 1 - (now - f.t0) / 180;
      if (k < 0) continue;
      flashes[w++] = f;
      ctx.fillStyle = "rgba(255,240,210," + k * .5 + ")";
      ctx.fillRect(f.x * TILE, f.y * TILE, TILE, TILE);
    }
    flashes.length = w;
    /* 浮字 */
    w = 0;
    for (let i = 0; i < floats.length; i++) {
      const f = floats[i], k = (now - f.t0) / 900;
      if (k >= 1) continue;
      floats[w++] = f;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = f.color;
      ctx.font = "bold 16px serif";
      ctx.textAlign = "center";
      ctx.fillText(f.text, f.x * TILE + TILE / 2, f.y * TILE + TILE * .35 - k * 26);
    }
    floats.length = w;
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";

    /* 小地图 blit */
    if (miniDirty) rebuildMini(G);
    mctx.clearRect(0, 0, mm.width, mm.height);
    mctx.drawImage(miniCache, 0, 0);
    const s = Math.min(mm.width / G.map.w, mm.height / G.map.h);
    mctx.fillStyle = "#ecd39a";
    mctx.fillRect(G.player.x * s - 1, G.player.y * s - 1, s + 2, s + 2);
  }

  MDG.UI = {
    init, draw, playEvents, updateFov, addFloat, kick, showFloorCard,
    getCam: () => cam,
    TILE,
    armed: { get: () => armedSkill, set: (v) => { armedSkill = v; } }
  };
})();
