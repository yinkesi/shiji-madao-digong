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

  const TILE = MDG.Terrain.TILE;
  let cv = null, ctx = null, mm = null, mctx = null;
  let cam = { x: 0, y: 0, init: false };
  let shake = 0;
  let floats = [];   // {x, y, text, color, t0}
  let flashes = [];  // {x, y, t0}
  let slashes = [];  // {x0,y0,x1,y1,t0}
  let armedSkill = -1;
  let parryFlash = null;

  /* 离屏层：地形 / 视野暗化 / 未探全黑 / 小地图缓存 */
  let terrain = null, visMask = null, fogMask = null, miniCache = null;
  let builtFloor = -1, terrainDirty = false, fogDirty = true, miniDirty = true;
  let visualMap = null;
  function syncMap(G) {
    if (visualMap === G.map) return;
    visualMap = G.map;
    terrainDirty = fogDirty = miniDirty = true;
    cam.init = false;
    floats = []; flashes = []; slashes = []; parryFlash = null; shake = 0;
    MDG.CombatFX.reset();
  }
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
    syncMap(G);
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
      MDG.Terrain.drawTile(t, G, x, y, Gr.at(G.map, x, y), campfires);
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
  function kick() { if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) shake = Math.min(10, shake + 5); }

  /* ---- 事件 → 视听 ---- */
  function playEvents(G, evs) {
    syncMap(G);
    MDG.CombatFX.consume(G, evs, performance.now());
    const S = MDG.APP.sfx;
    let anyHit = false, playerHit = false;
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      if (["swing", "hit", "miss", "shield", "die", "parry", "attackWarning", "telegraph"].includes(e.t)
          && e.x !== undefined && !G._visible?.[e.x + "," + e.y] && e.uid !== G.player.uid) continue;
      switch (e.t) {
        case "swing": S.swing(); break;
        case "hit":
          if (!evs.some(v => v.t === "parry" && v.x === e.x && v.y === e.y))
            addFloat(e.x, e.y, e.zero ? "格挡" : "-" + e.dmg, e.aura ? "#8aa04f" : (e.crit ? "#ecd39a" : "#e0705f"));
          if (e.zero) S.block();
          else {
            if (!e.uid) addFlash(e.x, e.y);
            anyHit = true;
            if (e.uid === G.player.uid || (e.x === G.player.x && e.y === G.player.y)) playerHit = true;
          }
          if (e.dmg >= 3) kick();
          break;
        case "miss": addFloat(e.x, e.y, "闪", "#9aa7c4"); S.miss(); break;
        case "heal": addFloat(e.x, e.y, "+" + e.val, "#7dc99a"); break;
        case "shield": addFloat(e.x, e.y, "盾-" + e.val, "#c9a45f"); S.block(); break;
        case "blood": addFloat(e.x, e.y, "血祭！", "#c14b3a"); S.hit(); break;
        case "die": addFloat(e.x, e.y, "倒", "#c14b3a"); S.kill(); break;
        case "learn": MDG.APP.toast("录技：「" + e.name + "」入谱"); S.learn(); break;
        case "lethalkeep": addFloat(e.x, e.y, "免死！", "#ecd39a"); S.parry(); break;
        case "coin": addFloat(e.x, e.y, "+" + e.val + " 钱", "#c9a45f"); S.coin(); break;
        case "relic": MDG.APP.toast("得刀卡「" + e.name + "」"); S.chest(); break;
        case "relicProc": addFloat(e.x, e.y, e.text, "#7dc99a"); break;
        case "alert": if (e.boss) { showBossCard(e.name); S.boss(); } break;
        case "bottle": addFloat(e.x, e.y, "砰！-1", "#c14b3a"); S.bottle(); kick(); break;
        case "parry": {
          parryFlash = { x: G.player.x, y: G.player.y, t0: performance.now() };
          const hit = evs.find(v => v.t === "hit" && v.uid === e.uid);
          addFloat(e.x, e.y - .45, "弹反" + (hit?.dmg ? " -" + hit.dmg : "！"), "#ecd39a");
          addSlash(G.player.x, G.player.y, e.x, e.y);
          S.parry(); kick();
          break;
        }
        case "stagger": if (!evs.some(v => v.t === "parry" && v.x === e.x && v.y === e.y)) addFloat(e.x, e.y, "失措", "#9aa7c4"); break;
        case "attackCooldown": addFloat(e.x, e.y, "刀冷 " + e.turns, "#d0a04f"); break;
        case "attackWarning": if (!evs.some(v => v.t === "telegraph" && v.x === e.x && v.y === e.y)) S.tele(); break;
        case "telegraph": S.tele(); break;
        case "trap":
          if (e.kind === "毒沼") { addFloat(e.x, e.y, "中毒！", "#8aa04f"); }
          else if (e.kind === "落石") { addFloat(e.x, e.y, "落石！-1", "#c9a45f"); kick(); terrainDirty = true; }
          else { addFloat(e.x, e.y, "尖刺！-3", "#e0705f"); addFlash(e.x, e.y); kick(); terrainDirty = true; }
          S.trap();
          break;
        case "descend": S.stairs(); showFloorCard(G); cam.init = false; break;
        case "win": S.win(); break;
        case "dead": S.dead(); break;
        case "scroll": addFloat(e.x, e.y, "史料+1", "#c9a45f"); S.coin(); terrainDirty = true; break;
        case "stairsOpen": MDG.APP.toast("楼梯已开——下行！"); break;
        case "tree": case "treebreak": case "chest": case "camp":
          terrainDirty = true; // 瓦片变了：下一帧重铺地形
          break;
      }
    }
    if (anyHit) {
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
    syncMap(G);
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
    }
    /* 普攻预警：黄三角表示下一轮会尝试普通攻击；红色叹号优先级更高。 */
    for (let i = 0; i < G.enemies.length; i++) {
      const u = G.enemies[i];
      if (u.dead || !u.attackWarning || u.telegraph || !(G._visible && G._visible[u.x + "," + u.y])) continue;
      const pulse = .55 + Math.sin(now / 150) * .2;
      ctx.fillStyle = "rgba(208,160,79," + pulse.toFixed(2) + ")";
      ctx.font = "bold 16px serif";
      ctx.textAlign = "center";
      ctx.fillText("△", u.x * TILE + TILE / 2, u.y * TILE - 5);
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
      MDG.Units.draw(ctx, u, now, false);
    }
    if (!G.player.dead) MDG.Units.draw(ctx, G.player, now, true);
    MDG.CombatFX.draw(ctx, G, now);

    /* 标牌在角色之后绘制，固定于敌人格内，不压到邻格玩家的血条。 */
    for (const u of G.enemies) {
      if (u.dead || !u.telegraph || !G._visible || !G._visible[u.x + "," + u.y]) continue;
      const x = u.x * TILE, y = u.y * TILE;
      const ready = MDG.Engine.counterReady(G, u);
      const age = (G.combatTime || 0) - (u.windupAt || 0);
      ctx.fillStyle = ready ? "#f1d8ab" : "#722e29";
      ctx.fillRect(x + 7, y + 1, TILE - 14, 12);
      ctx.fillStyle = ready ? "#292217" : "#fff0d1";
      ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(ready && MDG.Grid.manh(G.player.x, G.player.y, u.x, u.y) === 1 ? "J 反" : age >= MDG.Engine.PARRY_TIMING.close ? "出刀" : "蓄力", x + TILE / 2, y + 10);
      ctx.fillStyle = ready ? "#fff0d1" : "#ed8775";
      ctx.fillRect(x + 7, y + 14, (TILE - 14) * Math.min(1, Math.max(0, age / MDG.Engine.PARRY_TIMING.strike)), 2);
      ctx.textAlign = "left";
    }

    if (parryFlash) {
      const age = Math.max(0, (now - parryFlash.t0) / 360);
      if (age >= 1) parryFlash = null;
      else {
        ctx.strokeStyle = "rgba(236,211,154," + (1 - age) + ")";
        ctx.lineWidth = 3 * (1 - age) + 1;
        ctx.beginPath();
        ctx.arc((parryFlash.x + .5) * TILE, (parryFlash.y + .5) * TILE, 16 + age * 24, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

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
