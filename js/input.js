/* ============================================================
 * 实验史记 · 马刀地宫 —— 手谈卷（键鼠输入）
 * 键盘：方向/WASD 走、数字用技、空格待机、I 行囊、K 刀谱、
 *       J 图鉴、M 静音、Esc 关面板。
 * 鼠标：点邻格互动；点远处自动行走（见敌即停）。
 * 挂载：MDG.Input
 * ============================================================ */
(function () {
  "use strict";
  const MDG = window.MDG;
  const { $ } = MDG.APP;

  let game = null;
  let autoWalk = null; // {path: [[x,y]...], i}
  let itemArmed = -1;  // 待掷之物的行囊序号

  function bind(g) { game = g; }

  const busy = () => !game || !game.G || game.animating || MDG.HUD.panelOpen() || game.overShown;

  function act(a) {
    if (busy()) return;
    cancelAuto();
    game.doAction(a);
  }

  function cancelAuto() { autoWalk = null; }

  /* 用技入口（技能栏/数字键共用） */
  function onSkillKey(si) {
    if (busy()) return;
    const G = game.G;
    const sk = G.player.skills[si];
    if (!sk) return;
    if (sk.cdLeft > 0) { MDG.APP.toast("「" + sk.name + "」冷却中（" + sk.cdLeft + "）"); return; }
    if (G.player.st.disarm > 0) { MDG.APP.toast("汝之技被封——" + G.player.st.disarm + "回合后方可再用"); return; }
    if (sk.kind === "unit") {
      /* 需目标：进入点选模式 */
      if (MDG.UI.armed.get() === si) { MDG.UI.armed.set(-1); return; }
      MDG.UI.armed.set(si);
      MDG.APP.toast("点选目标施「" + sk.name + "」（Esc 取消）");
      return;
    }
    act({ t: "skill", si, tx: null, ty: null });
  }

  function armItem(ii) { itemArmed = ii; MDG.APP.toast("点选掷掷目标（Esc 取消）"); }

  /* 点击画布 */
  function onCanvasClick(mx, my) {
    if (busy()) return;
    const G = game.G;
    const { cam } = getCam();
    const dpr = devicePixelRatio;
    const wx = Math.floor((mx - (cv.width / dpr / 2 - cam.x)) / 42);
    const wy = Math.floor((my - (cv.height / dpr / 2 - cam.y)) / 42);
    if (!MDG.Grid.inB(G.map, wx, wy)) return;
    /* 掷物模式 */
    if (itemArmed >= 0) {
      const a = { t: "item", ii: itemArmed, tx: wx, ty: wy };
      itemArmed = -1;
      act(a);
      return;
    }
    /* 施技点选 */
    const armed = MDG.UI.armed.get();
    if (armed >= 0) {
      const a = { t: "skill", si: armed, tx: wx, ty: wy };
      MDG.UI.armed.set(-1);
      act(a);
      return;
    }
    const d = MDG.Grid.manh(G.player.x, G.player.y, wx, wy);
    const foe = MDG.Engine.unitAt(G, wx, wy);
    if (d === 1) {
      /* 邻格：方向互动（撞敌/撞箱/撞梯……） */
      act({ t: "move", dx: wx - G.player.x, dy: wy - G.player.y });
      return;
    }
    if (d === 0) { act({ t: "wait" }); return; }
    /* 远处：自动走 */
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
    /* 见敌即停：视野内有惊动之敌 */
    const threat = G.enemies.some(u => !u.dead && u.chId !== "tree" && u.aggro &&
      G._visible && G._visible[u.x + "," + u.y]);
    if (threat) { cancelAuto(); MDG.APP.toast("见敌——自动行走止"); return; }
    const p = autoWalk;
    if (p.i >= p.path.length) { cancelAuto(); return; }
    const [nx, ny] = p.path[p.i];
    const dx = nx - G.player.x, dy = ny - G.player.y;
    if (Math.abs(dx) + Math.abs(dy) !== 1) { cancelAuto(); return; }
    game.doAction({ t: "move", dx, dy }, () => {
      if (!autoWalk) return;
      p.i++;
      if (p.i >= p.path.length) { cancelAuto(); return; }
      setTimeout(stepAuto, 70);
    });
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
    if (k === "Escape") {
      if (MDG.HUD.panelOpen()) { MDG.HUD.closePanel(); return; }
      if (MDG.UI.armed.get() >= 0 || itemArmed >= 0) { MDG.UI.armed.set(-1); itemArmed = -1; return; }
      if (inGame) MDG.HUD.openSys();
      return;
    }
    if (MDG.HUD.panelOpen()) return;
    if (!inGame) return;
    const G = game.G;
    const move = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0] }[k];
    if (move) { e.preventDefault(); act({ t: "move", dx: move[0], dy: move[1] }); return; }
    if (k === " " || k === ".") { e.preventDefault(); act({ t: "wait" }); return; }
    if (/^[1-9]$/.test(k)) { onSkillKey(parseInt(k, 10) - 1); return; }
    if (k === "i" || k === "I") { MDG.HUD.openBag(); return; }
    if (k === "k" || k === "K") { MDG.HUD.openBlades(); return; }
    if (k === "j" || k === "J") { MDG.HUD.openDex(); return; }
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

  MDG.Input = { bind, init, act, onSkillKey, armItem, cancelAuto };
})();
