/* ============================================================
 * 实验史记 · 马刀地宫 —— 总纲卷（流程编排）
 * 标题屏 → 入宫设置（点将/难度）→ 地宫 → 终局结算 → 局外循环。
 * 每一动自动存续行档；终局经 Run.finish 折算文脉。
 * 挂载：MDG.Main
 * ============================================================ */
(function () {
  "use strict";
  const MDG = window.MDG;
  const { $, el, toast } = MDG.APP;

  const game = { G: null, meta: null, animating: false, overShown: false, busyAnim: false };

  /* ---------------- 屏切换 ---------------- */
  function show(id) {
    ["title-screen", "setup-screen", "game-screen", "end-screen"].forEach(s => $(s).classList.add("hidden"));
    $(id).classList.remove("hidden");
  }

  function showTitle() {
    game.overShown = false; game.G = null;
    const M = MDG.Meta.load();
    game.meta = M;
    $("t-wemai").textContent = M.wemai;
    $("t-wins").textContent = M.stats.wins;
    $("t-floor").textContent = M.stats.bestFloor ? M.stats.bestFloor : "—";
    $("t-runners").textContent = M.runners.length;
    $("btn-resume").style.display = MDG.Run.hasRun() ? "" : "none";
    show("title-screen");
  }

  /* ---------------- 入宫设置 ---------------- */
  function showSetup() {
    const M = game.meta || MDG.Meta.load();
    game.meta = M;
    const grid = $("setup-runners");
    grid.innerHTML = "";
    M.runners.forEach(id => {
      const c = MDG.DATA.CH(id);
      if (!c) return;
      const card = el("div", "runner-card" + (M.settings.runner === id ? " sel" : ""));
      card.innerHTML = `<div class="face" style="background:${c.color}">${c.glyph}</div>
        <div><h4>${c.name}<em>${c.hao}</em></h4>
        <div class="meta">血 ${c.hp} · 刀 ${c.dmg} · ${c.passive ? c.passive.name : ""}${c.skill ? " · 技「" + c.skill.name + "」" : ""}</div></div>`;
      card.onclick = () => {
        M.settings.runner = id; MDG.Meta.save(M);
        grid.querySelectorAll(".runner-card").forEach(x => x.classList.remove("sel"));
        card.classList.add("sel");
      };
      grid.appendChild(card);
    });
    const diffs = $("setup-diffs");
    diffs.innerHTML = "";
    MDG.DATA.DIFFS.forEach(d => {
      const row = el("div", "diff-row" + (M.settings.diffV === d.v ? " sel" : ""));
      row.innerHTML = `<b>${d.n}</b><span>${d.tip}</span>`;
      row.onclick = () => {
        M.settings.diffV = d.v; MDG.Meta.save(M);
        diffs.querySelectorAll(".diff-row").forEach(x => x.classList.remove("sel"));
        row.classList.add("sel");
      };
      diffs.appendChild(row);
    });
    show("setup-screen");
  }

  function startRun() {
    const M = game.meta;
    game.G = MDG.Run.newRun({ runnerId: M.settings.runner, diffV: M.settings.diffV });
    enterGame(true);
  }
  function resumeRun() {
    const G = MDG.Run.loadRun();
    if (!G) { toast("无续行之局"); return; }
    game.G = G;
    game.meta = MDG.Meta.load();
    enterGame(false);
  }

  function enterGame(fresh) {
    game.overShown = false;
    MDG.UI.init();
    MDG.Input.bind(game);
    MDG.HUD.bind(game);
    applyMetaBonuses();
    MDG.UI.updateFov(game.G);
    show("game-screen");
    MDG.HUD.refreshHUD();
    MDG.HUD.refreshSkillbar();
    MDG.UI.showFloorCard(game.G);
    if (fresh) toast("入第" + ["一", "二", "三", "四", "五", "六", "七", "八", "九"][game.G.floorIdx] + "层 · " + game.G.floorDef.name);
    if (!mainLoop) { mainLoop = true; requestAnimationFrame(loop); }
  }

  function applyMetaBonuses() {
    game.G._metaBonuses = MDG.Meta.bonuses(game.meta);
  }

  /* ---------------- 动作主线 ---------------- */
  function doAction(a, done) {
    if (game.animating || game.overShown) { if (done) done(); return; }
    const G = game.G;
    const evs = MDG.Engine.act(G, a);
    consumeEvents(evs);
    afterAction(done);
  }

  function consumeEvents(evs) {
    MDG.UI.playEvents(game.G, evs);
    MDG.HUD.pushLog(evs);
    evs.forEach(e => {
      if (e.t === "shop") { MDG.HUD.openShop(); }
      if (e.t === "learn") { MDG.HUD.refreshSkillbar(); }
      if (e.t === "descend") { applyMetaBonuses(); }
    });
  }

  function afterAction(done) {
    const G = game.G;
    MDG.UI.updateFov(G);
    MDG.HUD.refreshHUD();
    MDG.HUD.refreshSkillbar();
    MDG.Run.saveRun(G);
    if ((G.over || G.won) && !game.overShown) {
      game.overShown = true;
      MDG.Run.clearRun();
      setTimeout(() => finishRun(), 900);
    }
    if (done) done();
  }

  function finishRun() {
    const res = MDG.Run.finish(game.G);
    game.meta = res.meta;
    MDG.HUD.showEnd(res);
  }

  /* ---------------- 主循环 ---------------- */
  let mainLoop = false;
  function loop(now) {
    if (game.G) MDG.UI.draw(game.G, now || performance.now());
    requestAnimationFrame(loop);
  }

  /* ---------------- 装配 ---------------- */
  function boot() {
    MDG.Input.init();
    const M = MDG.Meta.load();
    MDG.APP.setMuted(M.settings.muted);
    $("btn-new").onclick = () => { game.meta = MDG.Meta.load(); showSetup(); };
    $("btn-resume").onclick = resumeRun;
    $("btn-cult").onclick = () => { game.meta = MDG.Meta.load(); MDG.HUD.bind(game); MDG.HUD.openCult(); };
    $("btn-help").onclick = () => { MDG.HUD.bind(game); MDG.HUD.openHelp(); };
    $("btn-start").onclick = startRun;
    $("btn-setup-back").onclick = showTitle;
    $("btn-bag").onclick = () => MDG.HUD.openBag();
    $("btn-blades").onclick = () => MDG.HUD.openBlades();
    $("btn-dex").onclick = () => MDG.HUD.openDex();
    $("btn-sys").onclick = () => MDG.HUD.openSys();
    MDG.HUD.bind(game);
    showTitle();
  }

  game.doAction = doAction;
  game.applyMetaBonuses = applyMetaBonuses;

  MDG.Main = { boot, showTitle, showSetup, enterGame, get game() { return game; } };
  addEventListener("DOMContentLoaded", boot);
})();
