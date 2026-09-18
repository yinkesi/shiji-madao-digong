/* ============================================================
 * 实验史记 · 马刀地宫 —— 局外卷（文脉 / 修炼 / 点将 / 图鉴 / 成就）
 * localStorage 不存在于 Node：存取走 MDG.Store 适配（浏览器用真库，
 * Node 测试自动落内存）。挂载：MDG.Meta
 * ============================================================ */
(function (ROOT) {
  "use strict";
  const MDG = ROOT.MDG = ROOT.MDG || {};
  const D = () => MDG.DATA;

  /* ---------------- 存储适配 ---------------- */
  const _mem = {};
  const Store = {
    get(k) { try { return (typeof localStorage !== "undefined") ? localStorage.getItem(k) : (k in _mem ? _mem[k] : null); } catch (e) { return _mem[k] || null; } },
    set(k, v) { try { if (typeof localStorage !== "undefined") localStorage.setItem(k, v); else _mem[k] = v; } catch (e) { _mem[k] = v; } },
    del(k) { try { if (typeof localStorage !== "undefined") localStorage.removeItem(k); else delete _mem[k]; } catch (e) { delete _mem[k]; } }
  };
  MDG.Store = Store;

  const KEY = "shiji_digong_v1";
  function fresh() {
    return {
      v: 1, wemai: 0,
      tree: {},                        // nodeId -> level
      runners: ["yinkesi"],
      dex: {},                         // chId -> 斩杀数
      scrolls: 0,
      achieves: {},
      flags: {},                       // 序章已读等一次性标记
      stats: { runs: 0, wins: 0, bestFloor: 0 },
      settings: { muted: false, diffV: "normal", runner: "yinkesi" }
    };
  }
  function load() {
    const raw = Store.get(KEY);
    if (!raw) return fresh();
    try {
      const m = JSON.parse(raw);
      return Object.assign(fresh(), m, { settings: Object.assign(fresh().settings, m.settings || {}) });
    } catch (e) { return fresh(); }
  }
  function save(M) { Store.set(KEY, JSON.stringify(M)); return M; }

  /* ---------------- 修炼树 ---------------- */
  function treeLevel(M, id) { return M.tree[id] || 0; }
  function nextCost(M, id) {
    const node = D().META_TREE.find(n => n.id === id);
    if (!node) return null;
    const lv = treeLevel(M, id);
    if (lv >= node.max) return null;
    return node.cost[lv];
  }
  function buy(M, id) {
    const cost = nextCost(M, id);
    if (cost == null || M.wemai < cost) return false;
    M.wemai -= cost;
    M.tree[id] = treeLevel(M, id) + 1;
    save(M);
    return true;
  }
  /* 修炼加成拍平成引擎吃的形参 */
  function bonuses(M) {
    return {
      fist: treeLevel(M, "fist"), body: treeLevel(M, "body"), purse: treeLevel(M, "purse"),
      appetite: treeLevel(M, "appetite"), hearth: treeLevel(M, "hearth"),
      blood: treeLevel(M, "blood"), guard: treeLevel(M, "guard"), royalty: treeLevel(M, "royalty")
    };
  }
  function unlockRunner(M, chId) {
    if (M.runners.includes(chId)) return false;
    M.runners.push(chId);
    save(M);
    return true;
  }

  /* ---------------- 一轮结束的局外结算 ---------------- */
  function finishRun(M, G) {
    const dd = D().DIFF_BY_V[G.diff] || D().DIFF_BY_V.normal;
    const mult = dd.mul * (1 + 0.1 * treeLevel(M, "royalty"));
    const earned = Math.round((G.wemai || 0) * mult);
    M.wemai += earned;
    /* 点将解锁：斩过的 runner 型镇守入册 */
    const newUnlocks = [];
    (G.bossKills || []).forEach(chId => {
      const ch = D().CH(chId);
      if (ch && ch.runner && unlockRunner(M, chId)) newUnlocks.push(ch);
    });
    /* 图鉴与史料 */
    Object.keys(G.dexKills || {}).forEach(chId => { M.dex[chId] = (M.dex[chId] || 0) + G.dexKills[chId]; });
    M.scrolls += (G.scrollsGot || []).length;
    /* 统计 */
    M.stats.runs++;
    if (G.won) M.stats.wins++;
    M.stats.bestFloor = Math.max(M.stats.bestFloor, G.bestFloor || 0);
    /* 成就 */
    const newAchs = [];
    const grant = (id) => { if (!M.achieves[id]) { M.achieves[id] = true; newAchs.push(D().ACHIEVES.find(a => a.id === id)); } };
    grant("a_in");
    if ((G.bestFloor || 0) >= 3) grant("a_f3");
    if ((G.bestFloor || 0) >= 6) grant("a_f6");
    if (G.won) grant("a_win");
    if (Object.keys(G.learned || {}).length >= 3) grant("a_elite3");
    if (M.scrolls >= 10) grant("a_scroll10");
    if (M.runners.length >= 8) grant("a_allrunner");
    if (G.won && G.diff === "nightmare") grant("a_nm_win");
    save(M);
    MDG.Store.del("shiji_digong_run_v1"); // 一轮既终，续行存档作废
    return { earned, newUnlocks, newAchs: newAchs.filter(Boolean) };
  }

  MDG.Meta = { KEY, fresh, load, save, treeLevel, nextCost, buy, bonuses, unlockRunner, finishRun };
})(typeof window !== "undefined" ? window : globalThis);
