/* 自动行走只使用已探索的安全格；危险格留给玩家逐步确认。 */
(function (ROOT) {
  'use strict';
  const MDG = ROOT.MDG;
  function safePath(G, sx, sy, tx, ty) {
    const Gr = MDG.Grid, map = G.map;
    if (!Gr.inB(map, sx, sy) || !Gr.inB(map, tx, ty)) return null;
    const known = (x, y) => G.explored && G.explored[x + ',' + y];
    if (!known(tx, ty) || Gr.at(map, tx, ty) === Gr.TRAP) return null;
    const prev = new Int32Array(map.w * map.h).fill(-1);
    const start = sy * map.w + sx, end = ty * map.w + tx;
    const queue = [start]; prev[start] = start;
    for (let i = 0; i < queue.length && prev[end] < 0; i++) {
      const cur = queue[i], cx = cur % map.w, cy = Math.floor(cur / map.w);
      for (const [dx, dy] of Gr.DIRS) {
        const x = cx + dx, y = cy + dy, idx = y * map.w + x;
        if (!Gr.inB(map, x, y) || !known(x, y) || prev[idx] >= 0) continue;
        const tile = Gr.at(map, x, y);
        if (tile === Gr.WALL || tile === Gr.TRAP || MDG.Engine.unitAt(G, x, y)) continue;
        const interactive = [Gr.CHEST, Gr.SHOP, Gr.CAMPFIRE, Gr.STAIRS, Gr.TREE].includes(tile);
        if (interactive && idx !== end) continue;
        prev[idx] = cur; queue.push(idx);
      }
    }
    if (prev[end] < 0) return null;
    const route = [];
    for (let cur = end; cur !== start; cur = prev[cur]) route.push([cur % map.w, Math.floor(cur / map.w)]);
    return route.reverse();
  }
  MDG.Navigation = { safePath };
})(typeof window !== 'undefined' ? window : globalThis);
