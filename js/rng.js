/* ============================================================
 * 实验史记 · 马刀地宫 —— 随机数卷
 * 可播种 RNG：同一种子必出同一座地宫（测试与「重走此局」的根基）。
 * 核心层文件：不碰 DOM/window，Node 可直测。
 * 挂载：MDG.RNG
 * ============================================================ */
(function (ROOT) {
  "use strict";

  /* mulberry32：32 位播种 PRNG，短小、统计够用、天生可序列化。
     state 是共享的内部状态盒 {a}——存档时把 state 一并入库，续局用
     RNG.from(state) 接着摇，随机序列分毫不差。seedOf() 从字符串导出
     数值种子（同一串字永远同一宫）。 */
  function rngFrom(state) {
    return function () {
      state.a = (state.a + 0x6D2B79F5) | 0;
      let t = Math.imul(state.a ^ (state.a >>> 15), 1 | state.a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function mulberry32(state) {
    if (typeof state === "object" && state !== null && "a" in state) return rngFrom(state);
    return rngFrom({ a: state >>> 0 });
  }
  function seedOf(str) {
    str = String(str);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /* 造一个 RNG 对象：next()∈[0,1)，int(a,b) 双闭区间，pick/chance/shuffle。
     make(seed) 新起一局；from(stateObj) 续用既有状态（存档恢复）。 */
  function buildR(next, seed) {
    return {
      seed,
      state: next.state,
      next,
      int(a, b) { return a + Math.floor(next() * (b - a + 1)); },
      pick(arr) { return arr[Math.floor(next() * arr.length)]; },
      chance(p) { return next() < p; },
      shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
        return a;
      }
    };
  }
  function make(seed) {
    const state = { a: (typeof seed === "string" ? seedOf(seed) : (seed >>> 0)) };
    const next = rngFrom(state); next.state = state;
    return buildR(next, typeof seed === "string" ? seed : (seed >>> 0));
  }
  function from(stateObj) {
    const next = rngFrom(stateObj); next.state = stateObj;
    return buildR(next, stateObj.a);
  }

  ROOT.MDG = ROOT.MDG || {};
  ROOT.MDG.RNG = { make, from, seedOf, mulberry32 };
})(typeof window !== "undefined" ? window : globalThis);
