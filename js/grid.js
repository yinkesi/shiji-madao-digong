/* ============================================================
 * 实验史记 · 马刀地宫 —— 格网卷
 * 瓦片地图、视线（Bresenham）、广度寻路、视野（FOV）。
 * 瓦片码：0 墙 / 1 宫室地面 / 2 走廊 / 3 下行梯 / 4 木箱 / 5 史料 /
 *         6 灶间 / 7 树（可击碎的堵路物）/ 8 商摊
 * 核心层文件：不碰 DOM，Node 可直测。挂载：MDG.Grid
 * ============================================================ */
(function (ROOT) {
  "use strict";

  const WALL = 0, FLOOR = 1, CORR = 2, STAIRS = 3, CHEST = 4, SCROLL = 5, CAMPFIRE = 6, TREE = 7, SHOP = 8;

  function makeMap(w, h) {
    const tiles = new Array(w * h).fill(WALL);
    return { w, h, tiles, rooms: [], spawn: null, stairs: null };
  }
  const idx = (m, x, y) => y * m.w + x;
  const inB = (m, x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h;
  const at = (m, x, y) => inB(m, x, y) ? m.tiles[idx(m, x, y)] : WALL;
  const set = (m, x, y, t) => { if (inB(m, x, y)) m.tiles[idx(m, x, y)] = t; };

  /* 通行的判定：墙与树不可通行；箱子/灶间/商摊/楼梯是"可站上但要交互"的实体格。 */
  function walkable(m, x, y) {
    const t = at(m, x, y);
    return t !== WALL && t !== TREE;
  }
  const opaque = (m, x, y) => { const t = at(m, x, y); return t === WALL || t === TREE; };

  /* ---- 视线：Bresenham 直线，途经任何不透光格即被挡 ---- */
  function los(m, x0, y0, x1, y1) {
    let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0;
    while (!(x === x1 && y === y1)) {
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
      if (x === x1 && y === y1) break;
      if (opaque(m, x, y)) return false;
    }
    return true;
  }

  /* ---- 视野：以 (cx,cy) 为心、radius 为半径，逐格 los 收集可见点 ---- */
  function fov(m, cx, cy, radius) {
    const seen = [];
    for (let y = Math.max(0, cy - radius); y <= Math.min(m.h - 1, cy + radius); y++) {
      for (let x = Math.max(0, cx - radius); x <= Math.min(m.w - 1, cx + radius); x++) {
        const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d2 > radius * radius) continue;
        if (los(m, cx, cy, x, y)) seen.push([x, y]);
      }
    }
    return seen;
  }

  /* ---- 广度寻路：返回从 (sx,sy) 到 (tx,ty) 的下一步坐标；不可达返回 null。
     blockedFn(x,y) 额外排除（通常用来绕开其它活体）。 ---- */
  function stepToward(m, sx, sy, tx, ty, blockedFn) {
    if (sx === tx && sy === ty) return null;
    const w = m.w, h = m.h;
    const prev = new Int32Array(w * h).fill(-1);
    const q = [sy * w + sx];
    prev[sy * w + sx] = sy * w + sx;
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (q.length) {
      const cur = q.shift();
      const cx = cur % w, cy = (cur - cx) / w;
      if (cx === tx && cy === ty) break;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (!inB(m, nx, ny)) continue;
        const ni = ny * w + nx;
        if (prev[ni] !== -1) continue;
        if (!walkable(m, nx, ny)) continue;
        /* 目标格本身豁免 blockedFn——它往往站着目标本体（敌/玩家） */
        if (blockedFn && blockedFn(nx, ny) && !(nx === tx && ny === ty)) continue;
        prev[ni] = cur;
        q.push(ni);
      }
    }
    const ti = ty * w + tx;
    if (prev[ti] === -1) return null;
    /* 回溯到起点后的第一步 */
    let cur = ti;
    while (prev[cur] !== sy * w + sx && prev[cur] !== cur) cur = prev[cur];
    if (prev[cur] !== sy * w + sx) return null; // 起点即被占等异常
    return [cur % w, Math.floor(cur / w)];
  }

  /* ---- BFS 距离场：从 (sx,sy) 出发到全图的可达步数（不可达为 -1）。
     生成器用它挑"离出生点最远的房间"放楼梯。 ---- */
  function distField(m, sx, sy, blockedFn) {
    const d = new Int32Array(m.w * m.h).fill(-1);
    const q = [[sx, sy]];
    d[sy * m.w + sx] = 0;
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (q.length) {
      const [cx, cy] = q.shift();
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (!inB(m, nx, ny) || !walkable(m, nx, ny)) continue;
        if (blockedFn && blockedFn(nx, ny)) continue;
        if (d[ny * m.w + nx] !== -1) continue;
        d[ny * m.w + nx] = d[cy * m.w + cx] + 1;
        q.push([nx, ny]);
      }
    }
    return d;
  }

  /* ---- 四向邻接与推挤落点 ---- */
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const manh = (x0, y0, x1, y1) => Math.abs(x0 - x1) + Math.abs(y0 - y1);
  /* 把 (x,y) 沿 (dx,dy) 推 n 格，被墙/树/活体挡住即停，返回最终落点。 */
  function pushDest(m, x, y, dx, dy, n, occupiedFn) {
    let cx = x, cy = y;
    for (let i = 0; i < n; i++) {
      const nx = cx + dx, ny = cy + dy;
      if (!inB(m, nx, ny) || !walkable(m, nx, ny) || (occupiedFn && occupiedFn(nx, ny))) break;
      cx = nx; cy = ny;
    }
    return [cx, cy];
  }

  ROOT.MDG = ROOT.MDG || {};
  ROOT.MDG.Grid = { WALL, FLOOR, CORR, STAIRS, CHEST, SCROLL, CAMPFIRE, TREE, SHOP, makeMap, idx, inB, at, set, walkable, opaque, los, fov, stepToward, distField, DIRS, manh, pushDest };
})(typeof window !== "undefined" ? window : globalThis);
