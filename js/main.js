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

  /* ---------------- 序章 / 尾声（记忆体的世界观） ----------------
     承前作结句「写进书里的刀，不会消」——本作的地宫不是校园塌了，
     是音克思为收最后一卷、梦入卷底：九层即九层记忆。 */
  const PROLOGUE = [
    "毕业那天，wonder 躺在校门口说：写完这一场，你就毕业了。\n我答：写进书里的刀，不会消。\n——话，是说满了。",
    "回来收拾旧物的夜里，我摊开九卷旧稿，却写不出第十卷。\n写了三年的『事』：谁与谁战，胜负如何。\n可我记不清了——万震抬头时先看题还是先看人？\n仙女那一声『滚』，尾音有没有停顿？\n隔着的纸，终究不是人。",
    "那夜我在旧教室睡着。梦里校园一层层往下沉：\n操场在最上，校门在最底；\n人人还在原地，做着各自记得的事——\n万震等题，wonder 验算，头哥的陀螺没有停。\n梦里的人不会老，也不会让路。要往下走，只得一刀一刀，重新赢过。",
    "醒来天未亮，我忽然懂了最后一卷的写法：\n不写事，写人；不写刀，写刀后面的人。\n梦里每想对一处，笔下便多一行；想错的、想不动的，也不白想——都算文脉。\n于是提刀入梦。既毕业，无复有刀者——\n然记忆九层，刀声未绝。"
  ];
  const EPILOGUE = [
    "梦醒。粉笔题被晨光擦得干干净净。\n旧稿摊在桌上，最后一卷恰好落笔：\n『wonder 者，最早讲规则之人也。\n刀后面的人，这一回，写清楚了。』",
    "既毕业，无复有刀者——悲哉。\n然想清楚再写下来的刀，这次是真的不会消了。\n（刀已收，卷已合。九层记忆，来日可重走——重开重开。）"
  ];
  let proPages = null, proIdx = 0, proCb = null;
  function showPages(pages, cb) {
    proPages = pages; proIdx = 0; proCb = cb || null;
    renderPage();
    show("prologue-screen");
  }
  function renderPage() {
    $("pro-pages").innerHTML = proPages[proIdx].split("\n").map(l => "<p>" + l + "</p>").join("");
    $("pro-ind").textContent = (proIdx + 1) + " / " + proPages.length;
    $("pro-next").textContent = proIdx === proPages.length - 1 ? "合上" : "翻页";
  }
  function proEnd(cb) {
    proPages = null; proCb = null;
    $("prologue-screen").classList.add("hidden");
    if (cb) cb(); else showTitle();
  }
  function proNext() {
    if (!proPages) return;
    if (++proIdx >= proPages.length) proEnd(proCb); else renderPage();
  }
  function proSkip() { if (proPages) proEnd(proCb); }

  /* ---------------- 屏切换 ---------------- */
  function show(id) {
    ["title-screen", "setup-screen", "game-screen", "end-screen", "prologue-screen"].forEach(s => $(s).classList.add("hidden"));
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
    if (res.summary.won) {
      /* 收卷：先播「梦醒」尾声，再上结算 */
      MDG.HUD.showEnd(res, true);      // 渲染但先不显示
      showPages(EPILOGUE, () => { $("end-screen").classList.remove("hidden"); });
    } else {
      MDG.HUD.showEnd(res);
    }
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
    $("btn-new").onclick = () => {
      game.meta = MDG.Meta.load();
      if (!game.meta.flags.prologueSeen) {
        showPages(PROLOGUE, () => {
          game.meta.flags.prologueSeen = true;
          MDG.Meta.save(game.meta);
          showSetup();
        });
      } else showSetup();
    };
    $("btn-why").onclick = () => showPages(PROLOGUE, showTitle);
    $("pro-next").onclick = proNext;
    $("pro-skip").onclick = proSkip;
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

  MDG.Main = {
    boot, showTitle, showSetup, enterGame,
    proNext, proSkip, proActive: () => !!proPages,
    get game() { return game; }
  };
  addEventListener("DOMContentLoaded", boot);
})();
