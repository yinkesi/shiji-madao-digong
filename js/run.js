/* ============================================================
 * 实验史记 · 马刀地宫 —— 行卷（一轮流程编排）
 * 开局（选将/难度/种子）→ 引擎逐回合 → 楼梯下行 → 终局结算。
 * 续行存档逐回合写入 shiji_digong_run_v1；终局由 Meta.finishRun 结账。
 * 核心层文件：不碰 DOM。挂载：MDG.Run
 * ============================================================ */
(function (ROOT) {
  "use strict";
  const MDG = ROOT.MDG = ROOT.MDG || {};

  const RUN_KEY = "shiji_digong_run_v1";

  function newRun(opts) {
    opts = opts || {};
    const M = opts.meta || MDG.Meta.load();
    const G = MDG.Engine.newRunState({
      seed: opts.seed, runnerId: opts.runnerId || M.settings.runner || "yinkesi",
      diffV: opts.diffV || M.settings.diffV || "normal",
      meta: MDG.Meta.bonuses(M)
    });
    G._metaBonuses = MDG.Meta.bonuses(M);
    saveRun(G);
    return G;
  }

  function saveRun(G) {
    if (!G || G.over) { MDG.Store.del(RUN_KEY); return; }
    MDG.Store.set(RUN_KEY, MDG.Engine.saveString(G));
  }
  function loadRun() {
    const raw = MDG.Store.get(RUN_KEY);
    if (!raw) return null;
    try {
      const G = MDG.Engine.deserialize(JSON.parse(raw));
      G.ev = [];
      return G;
    } catch (e) { return null; }
  }
  function hasRun() { return !!MDG.Store.get(RUN_KEY); }
  function clearRun() { MDG.Store.del(RUN_KEY); }

  /* 结算摘要（UI 展示用） */
  function summarize(G, result) {
    const D = MDG.DATA;
    return {
      won: !!G.won,
      floorName: D.FLOORS[G.floorIdx].name,
      bestFloor: G.bestFloor || (G.floorIdx + 1),
      kills: G.kills || 0, eliteKills: G.eliteKills || 0,
      bossKills: [...new Set(G.bossKills || [])].map(id => D.CH(id).name),
      learned: Object.keys(G.learned || {}).map(id => D.CH(id).name),
      scrolls: (G.scrollsGot || []).length,
      relics: (G.relics || []).map(id => D.RELICS[id].name),
      diff: G.diff,
      rounds: G.round || 0
    };
  }
  /* 终局：局外结账（引擎不再动） */
  function finish(G) {
    const M = MDG.Meta.load();
    const res = MDG.Meta.finishRun(M, G);
    clearRun();
    return { meta: M, result: res, summary: summarize(G) };
  }

  MDG.Run = { RUN_KEY, newRun, saveRun, loadRun, hasRun, clearRun, finish, summarize };
})(typeof window !== "undefined" ? window : globalThis);
