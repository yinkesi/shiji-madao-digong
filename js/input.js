/* ============================================================
 * 实验史记 · 马刀地宫 —— 手谈卷（键鼠输入）· 经典键位
 * 键盘（全部操作可无鼠标完成）：
 *   移动     方向键 / WASD
 *   攻击/交互 J（朝面朝方向：撞敌即刀击；撞箱/灶/梯/商即互动）
 *   技能1-4   U / I / O / P（数字键 1-9 仍可用）
 *   待机     空格 或 .
 *   光标模式  Tab 呼出 → 方向键移格 → J/Enter 确认（选目标施技/掷物/远眺）
 *   行囊 B · 刀谱 C · 图鉴 V · 帮助 H · 静音 M · Esc 关闭/取消
 * 鼠标（全保留）：点邻格互动；点远处自动行走；面板点选。
 * 挂载：MDG.Input
 * ============================================================ */
(function () {
  "use strict";
  const MDG = window.MDG;
  const { $ } = MDG.APP;

  let game = null;
  let autoWalk = null; // {path: [[x,y]...], i}
  let itemArmed = -1;  // 待掷之物的行囊序号
  let facing = [1, 0]; // 面朝方向（J 攻击/交互用）
  /* 光标模式：{-1 关, 否则为 [x,y]}；模式 'skill' 施技 / 'item' 掷物 / 'free' 自由查看 */
  let cursor = -1;
  let cursorMode = "free";
  let usingMouse = true;

  function bind(g) { game = g; }

  const busy = () => !game || !game.G || game.animating || MDG.HUD.panelOpen() || game.overShown;

  function act(a) {
    /* 面板内发起的动作（行囊用物等）：先关面板再执行，否则 busy() 自锁 */
    if (MDG.HUD.panelOpen()) MDG.HUD.closePanel();
    if (busy()) return;
    cancelAuto();
    game.doAction(a);
  }

  function cancelAuto() { autoWalk = null; }

  /* 面朝方向随移动更新（斜向不存在，四向即够） */
  function face(dx, dy) { facing = [dx, dy]; }
  function faceToward(x, y) {
    const G = game.G;
    const dx = x - G.player.x, dy = y - G.player.y;
    if (Math.abs(dx) >= Math.abs(dy)) facing = [Math.sign(dx) || 1, 0];
    else facing = [0, Math.sign(dy) || 1];
  }

  /* 用技入口（热键/技能栏/光标确认共用） */
  function onSkillKey(si) {
    if (busy()) return;
    const G = game.G;
    const sk = G.player.skills[si];
    if (!sk) { MDG.APP.toast("无此技"); return; }
    if (sk.cdLeft > 0) { MDG.APP.toast("「" + sk.name + "」冷却中（" + sk.cdLeft + "）"); return; }
    if (G.player.st.disarm > 0) { MDG.APP.toast("汝之技被封——" + G.player.st.disarm + "回合后方可再用"); return; }
    if (sk.kind === "unit") {
      /* 需目标：进光标模式（键盘）——鼠标用户照旧点选 */
      if (MDG.UI.armed.get() === si && cursorMode === "skill") { disarmCursor(); return; }
      MDG.UI.armed.set(si);
      enterCursor("skill", "点选目标施「" + sk.name + "」——方向键移光标，J 确认，Esc 取消");
      return;
    }
    act({ t: "skill", si, tx: null, ty: null });
  }

  function armItem(ii) {
    itemArmed = ii;
    MDG.UI.armed.set(-1);
    enterCursor("item", "点选掷掷目标——方向键移光标，J 确认，Esc 取消");
  }

  /* ---------------- 光标模式 ---------------- */
  function enterCursor(mode, tip) {
    const G = game.G;
    cursorMode = mode;
    if (!Array.isArray(cursor)) {
      /* 初始落点：优先面朝方向的邻敌 */
      const fx = G.player.x + facing[0], fy = G.player.y + facing[1];
      const foe = MDG.Engine.unitAt(G, fx, fy);
      cursor = (mode !== "free" && foe && foe.side === "e") ? [fx, fy] : [G.player.x + facing[0] * 2, G.player.y + facing[1] * 2];
      clampCursor();
    }
    usingMouse = false;
    if (tip) MDG.APP.toast(tip);
  }
  function disarmCursor() {
    cursor = -1; cursorMode = "free";
    MDG.UI.armed.set(-1); itemArmed = -1;
  }
  const cursorActive = () => Array.isArray(cursor);
  function clampCursor() {
    const G = game.G;
    cursor[0] = Math.max(0, Math.min(G.map.w - 1, cursor[0]));
    cursor[1] = Math.max(0, Math.min(G.map.h - 1, cursor[1]));
  }
  function cursorMove(dx, dy) {
    if (!cursorActive()) return;
    cursor[0] += dx; cursor[1] += dy;
    clampCursor();
    usingMouse = false;
    MDG.APP.sfx.ui();
  }
  /* 光标确认：按模式分发 */
  function cursorConfirm() {
    const G = game.G;
    const [wx, wy] = cursor;
    if (cursorMode === "skill") {
      const si = MDG.UI.armed.get();
      const sk = G.player.skills[si];
      if (sk && sk.kind === "unit") {
        const d = MDG.Grid.manh(G.player.x, G.player.y, wx, wy);
        const foe = MDG.Engine.unitAt(G, wx, wy);
        if (!foe || foe.side !== "e") { MDG.APP.toast("那里没有敌人"); return; }
        if (d > (sk.range || 1)) { MDG.APP.toast("超出射程（距" + (sk.range || 1) + "）"); return; }
        disarmCursor();
        act({ t: "skill", si, tx: wx, ty: wy });
        return;
      }
    }
    if (cursorMode === "item") {
      const it = G.items[itemArmed];
      if (!it) { disarmCursor(); return; }
      const def = MDG.DATA.ITEMS[it.id];
      const foe = MDG.Engine.unitAt(G, wx, wy);
      if (def.kind === "throw") {
        if (!foe || foe.side !== "e") { MDG.APP.toast("那里没有敌人"); return; }
        if (MDG.Grid.manh(G.player.x, G.player.y, wx, wy) > (def.range || 3)) { MDG.APP.toast("超出射程"); return; }
        const ii = itemArmed;
        disarmCursor();
        act({ t: "item", ii, tx: wx, ty: wy });
        return;
      }
      /* 非投掷物：就地使用 */
      const ii = itemArmed;
      disarmCursor();
      act({ t: "item", ii });
      return;
    }
    /* free 模式：邻格则交互，远处设面朝 */
    const d = MDG.Grid.manh(G.player.x, G.player.y, wx, wy);
    if (d === 0) { disarmCursor(); act({ t: "wait" }); return; }
    if (d === 1) { disarmCursor(); act({ t: "move", dx: wx - G.player.x, dy: wy - G.player.y }); return; }
    faceToward(wx, wy);
    MDG.APP.toast("面朝「" + ["东", "西", "南", "北"][facingIndex()] + "」——J 攻击/交互，或继续移光标");
  }
  function facingIndex() {
    if (facing[0] === 1) return 0;
    if (facing[0] === -1) return 1;
    if (facing[1] === 1) return 2;
    return 3;
  }

  /* J：朝面朝方向纯攻击/互动——绝不移动（无目标则挥空，不耗回合） */
  function interactForward() {
    if (busy()) return;
    const G = game.G;
    const tx = G.player.x + facing[0], ty = G.player.y + facing[1];
    if (!MDG.Grid.inB(G.map, tx, ty)) { MDG.APP.toast("面前是虚空——挥刀落空"); return; }
    const Gr = MDG.Grid;
    const tile = Gr.at(G.map, tx, ty);
    const foe = MDG.Engine.unitAt(G, tx, ty);
    const interactive = !!foe || [Gr.CHEST, Gr.CAMPFIRE, Gr.SHOP, Gr.STAIRS, Gr.TREE].includes(tile);
    if (interactive) { act({ t: "move", dx: facing[0], dy: facing[1] }); return; }
    MDG.APP.toast("前方无目标——挥刀落空（方向键 / WASD 移动）");
  }

  /* 点击画布（鼠标功能全保留） */
  function onCanvasClick(mx, my) {
    if (busy()) return;
    usingMouse = true;
    const G = game.G;
    const { cam } = getCam();
    const dpr = devicePixelRatio;
    const TILE = MDG.UI.TILE;
    const wx = Math.floor((mx - (cv.width / dpr / 2 - cam.x)) / TILE);
    const wy = Math.floor((my - (cv.height / dpr / 2 - cam.y)) / TILE);
    if (!MDG.Grid.inB(G.map, wx, wy)) return;
    /* 鼠标也能接手光标确认 */
    if (cursorActive()) { cursor = [wx, wy]; cursorConfirm(); return; }
    const d = MDG.Grid.manh(G.player.x, G.player.y, wx, wy);
    if (d === 1) {
      face(wx - G.player.x, wy - G.player.y);
      act({ t: "move", dx: wx - G.player.x, dy: wy - G.player.y });
      return;
    }
    if (d === 0) { act({ t: "wait" }); return; }
    faceToward(wx, wy);
    const path = pathTo(G, G.player.x, G.player.y, wx, wy);
    if (path) { autoWalk = { path, i: 0 }; stepAuto(); }
  }

  function getCam() {
    return { cam: MDG.UI.getCam() };
  }
  let cv = null;
  function setCanvas(c) { cv = c; }

  function pathTo(G, sx, sy, tx, ty) {
    const Gr = MDG.Grid;
    const prev = new Int32Array(G.map.w * G.map.h).fill(-1);
    const q = [sy * G.map.w + sx];
    prev[sy * G.map.w + sx] = sy * G.map.w + sx;
    while (q.length) {
      const cur = q.shift();
      const cx = cur % G.map.w, cy = (cur - cx) / G.map.w;
      if (cx === tx && cy === ty) break;
      for (const [dx, dy] of Gr.DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (!Gr.inB(G.map, nx, ny)) continue;
        const ni = ny * G.map.w + nx;
        if (prev[ni] !== -1) continue;
        if (nx === tx && ny === ty) { prev[ni] = cur; q.push(ni); continue; }
        if (!Gr.walkable(G.map, nx, ny)) continue;
        if ([Gr.CHEST, Gr.SHOP, Gr.CAMPFIRE, Gr.STAIRS].includes(Gr.at(G.map, nx, ny))) continue;
        if (MDG.Engine.unitAt(G, nx, ny)) continue;
        prev[ni] = cur; q.push(ni);
      }
    }
    const ti = ty * G.map.w + tx;
    if (prev[ti] === -1) return null;
    const path = [];
    let cur = ti;
    while (cur !== sy * G.map.w + sx) { path.push([cur % G.map.w, Math.floor(cur / G.map.w)]); cur = prev[cur]; }
    path.reverse();
    return path;
  }

  function stepAuto() {
    if (!autoWalk) return;
    if (busy()) { cancelAuto(); return; }
    const G = game.G;
    const threat = G.enemies.some(u => !u.dead && u.chId !== "tree" && u.aggro &&
      G._visible && G._visible[u.x + "," + u.y]);
    if (threat) { cancelAuto(); MDG.APP.toast("见敌——自动行走止"); return; }
    const p = autoWalk;
    if (p.i >= p.path.length) { cancelAuto(); return; }
    const [nx, ny] = p.path[p.i];
    const dx = nx - G.player.x, dy = ny - G.player.y;
    if (Math.abs(dx) + Math.abs(dy) !== 1) { cancelAuto(); return; }
    face(dx, dy);
    game.doAction({ t: "move", dx, dy }, () => {
      if (!autoWalk) return;
      p.i++;
      if (p.i >= p.path.length) { cancelAuto(); return; }
      setTimeout(stepAuto, 70);
    });
  }

  /* 面板键盘导航：↑↓ 选行，Enter 确认 */
  let panelIdx = 0;
  function panelKeys(k) {
    const rows = [...document.querySelectorAll("#panel-body .row")].filter(r => r.offsetParent);
    if (!rows.length) return false;
    if (panelIdx >= rows.length) panelIdx = 0;
    const btnsOf = (r) => [...r.querySelectorAll("button")].filter(b => !b.disabled);
    if (k === "ArrowDown" || k === "j2") { panelIdx = Math.min(rows.length - 1, panelIdx + 1); }
    else if (k === "ArrowUp") { panelIdx = Math.max(0, panelIdx - 1); }
    else if (k === "Enter") {
      const r = rows[panelIdx];
      const bs = btnsOf(r);
      if (bs.length) { bs[0].click(); return true; }
      if (r.onclick) { r.onclick(); return true; }
      return true;
    }
    else return false;
    rows.forEach((r, i) => { r.style.borderColor = i === panelIdx ? "var(--gold-bright)" : ""; r.style.background = i === panelIdx ? "var(--panel-2)" : ""; });
    rows[panelIdx].scrollIntoView({ block: "nearest" });
    MDG.APP.sfx.ui();
    return true;
  }

  /* 键盘 */
  function onKeyDown(e) {
    if (e.repeat) return;
    const k = e.key;
    /* 序章/尾声翻页优先 */
    if (!$("prologue-screen").classList.contains("hidden")) {
      if (k === " " || k === "Enter") { e.preventDefault(); MDG.Main.proNext(); }
      else if (k === "Escape") MDG.Main.proSkip();
      return;
    }
    const inGame = game && game.G && !game.overShown;
    /* 面板开着：↑↓/Enter 导航，Esc 关闭 */
    if (MDG.HUD.panelOpen()) {
      if (k === "Escape") { MDG.HUD.closePanel(); return; }
      if (k === "ArrowDown" || k === "ArrowUp" || k === "Enter") { e.preventDefault(); panelKeys(k); MDG.APP && 0; return; }
      return;
    }
    if (k === "Escape") {
      if (cursorActive()) { disarmCursor(); MDG.APP.toast("已取消"); return; }
      if (MDG.UI.armed.get() >= 0 || itemArmed >= 0) { MDG.UI.armed.set(-1); itemArmed = -1; return; }
      if (inGame) MDG.HUD.openSys();
      return;
    }
    if (!inGame) return;
    const G = game.G;

    /* 光标模式：方向移格 / J·Enter 确认 */
    if (cursorActive()) {
      const mv = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] }[k];
      if (mv) { e.preventDefault(); cursorMove(mv[0], mv[1]); return; }
      if (k === "j" || k === "J" || k === "Enter") { e.preventDefault(); cursorConfirm(); return; }
      if (k === "Tab") { e.preventDefault(); disarmCursor(); return; }
      return;
    }

    /* 移动 */
    const move = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0] }[k];
    if (move) { e.preventDefault(); face(move[0], move[1]); act({ t: "move", dx: move[0], dy: move[1] }); return; }
    /* J：攻击/交互（面朝方向） */
    if (k === "j" || k === "J" || k === "Enter") { e.preventDefault(); interactForward(); return; }
    /* U/I/O/P：技能 1-4；数字键 1-9 仍可用 */
    const skIdx = { u: 0, i: 1, o: 2, p: 3 }[k.toLowerCase()];
    if (skIdx !== undefined && k.toLowerCase() === k) { onSkillKey(skIdx); return; }
    if (/^[1-9]$/.test(k)) { onSkillKey(parseInt(k, 10) - 1); return; }
    /* 待机 */
    if (k === " " || k === ".") { e.preventDefault(); act({ t: "wait" }); return; }
    /* 光标模式呼出（Tab） */
    if (k === "Tab") { e.preventDefault(); enterCursor("free", "光标模式——方向键移格，J 交互，Esc/Tab 退出"); return; }
    /* 面板与系统 */
    if (k === "b" || k === "B") { MDG.HUD.openBag(); return; }
    if (k === "c" || k === "C") { MDG.HUD.openBlades(); return; }
    if (k === "v" || k === "V") { MDG.HUD.openDex(); return; }
    if (k === "h" || k === "H" || k === "?") { MDG.HUD.openHelp(); return; }
    if (k === "m" || k === "M") {
      game.meta.settings.muted = !game.meta.settings.muted;
      MDG.Meta.save(game.meta);
      MDG.APP.setMuted(game.meta.settings.muted);
      MDG.APP.toast(game.meta.settings.muted ? "静音" : "有声");
    }
  }

  function init() {
    addEventListener("keydown", onKeyDown);
    cv = $("cv");
    setCanvas(cv);
    cv.addEventListener("click", (e) => {
      const r = cv.getBoundingClientRect();
      onCanvasClick(e.clientX - r.left, e.clientY - r.top);
    });
    $("panel-close").onclick = () => MDG.HUD.closePanel();
    $("panel-mask").addEventListener("click", (e) => { if (e.target === $("panel-mask")) MDG.HUD.closePanel(); });
  }

  MDG.Input = {
    bind, init, act, onSkillKey, armItem, cancelAuto,
    facing: () => facing.slice(),
    cursorActive, cursorPos: () => (Array.isArray(cursor) ? cursor.slice() : null), cursorMode: () => cursorMode
  };
})();
