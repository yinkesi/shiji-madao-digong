/* ============================================================
 * 实验史记 · 马刀地宫 —— 营造卷（地宫生成）
 * 房间 + 走廊 + 环路；楼梯放在离出生点最远的宫室；Boss 镇于梯旁，
 * 精英游荡、杂兵散布；灶间/小卖部/木箱/史料各有安置。
 * 同一种子必生成同一座宫，且自检连通（不通则换子种子重营）。
 * 核心层文件：不碰 DOM，Node 可直测。挂载：MDG.Gen
 * ============================================================ */
(function (ROOT) {
  "use strict";
  const G3 = () => ROOT.MDG.Grid;
  const R2 = () => ROOT.MDG.RNG;

  /* 在矩形房内随机取一个空地格（避开房心——房心是走廊节点，留给交通） */
  function roomSpot(map, room, R, taken) {
    for (let i = 0; i < 40; i++) {
      const x = R.int(room.x, room.x + room.w - 1), y = R.int(room.y, room.y + room.h - 1);
      if (x === room.cx && y === room.cy) continue;
      const key = y * map.w + x;
      if (!taken.has(key) && G3().at(map, x, y) === G3().FLOOR) { taken.add(key); return [x, y]; }
    }
    return null;
  }

  function carveCorridor(map, x0, y0, x1, y1, R) {
    let [cx, cy] = [x0, y0];
    const horizFirst = R.chance(0.5);
    const hseg = () => { while (cx !== x1) { cx += Math.sign(x1 - cx); if (G3().at(map, cx, cy) === G3().WALL) G3().set(map, cx, cy, G3().CORR); } };
    const vseg = () => { while (cy !== y1) { cy += Math.sign(y1 - cy); if (G3().at(map, cx, cy) === G3().WALL) G3().set(map, cx, cy, G3().CORR); } };
    if (horizFirst) { hseg(); vseg(); } else { vseg(); hseg(); }
  }

  /* 单次营造：返回 map 或 null（房间摆不下/不连通时） */
  function buildOnce(def, R) {
    const G = G3();
    const w = Math.min(44, 28 + def.n * 2), h = Math.min(26, 18 + def.n);
    const map = G.makeMap(w, h);
    const target = Math.min(10, 6 + def.n);
    /* 1) 摆房：重叠（留一格缓冲）即弃 */
    for (let t = 0; t < 160 && map.rooms.length < target; t++) {
      const rw = R.int(4, 8), rh = R.int(4, 6);
      const rx = R.int(1, w - rw - 2), ry = R.int(1, h - rh - 2);
      const clash = map.rooms.some(r => rx < r.x + r.w + 1 && rx + rw + 1 > r.x && ry < r.y + r.h + 1 && ry + rh + 1 > r.y);
      if (clash) continue;
      for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) G.set(map, x, y, G.FLOOR);
      map.rooms.push({ x: rx, y: ry, w: rw, h: rh, cx: rx + (rw >> 1), cy: ry + (rh >> 1) });
    }
    if (map.rooms.length < 4) return null;
    /* 2) 串房成廊 + 两道环路 */
    const order = map.rooms.slice().sort((a, b) => (a.cx + a.cy) - (b.cx + b.cy));
    for (let i = 1; i < order.length; i++) carveCorridor(map, order[i - 1].cx, order[i - 1].cy, order[i].cx, order[i].cy, R);
    for (let i = 0; i < 2; i++) {
      const a = R.pick(order), b = R.pick(order);
      if (a !== b) carveCorridor(map, a.cx, a.cy, b.cx, b.cy, R);
    }
    /* 3) 出生点在首房；楼梯放 BFS 最远的房心 */
    const spawnRoom = order[0];
    map.spawn = [spawnRoom.cx, spawnRoom.cy];
    const df = G.distField(map, spawnRoom.cx, spawnRoom.cy);
    let best = null, bestD = -1;
    map.rooms.forEach(r => {
      const d = df[r.cy * w + r.cx];
      if (d > bestD) { bestD = d; best = r; }
    });
    if (bestD < 6) return null; // 太挤，重营
    /* 楼梯放在最远房的非中心格——房心是走廊节点，梯不可堵路 */
    {
      const cand = [];
      for (let y = best.y; y < best.y + best.h; y++) for (let x = best.x; x < best.x + best.w; x++) {
        if (x === best.cx && y === best.cy) continue;
        if (G.at(map, x, y) === G.FLOOR) cand.push([x, y]);
      }
      map.stairs = cand.length ? cand[R.int(0, cand.length - 1)] : [best.cx, best.cy];
    }
    G.set(map, map.stairs[0], map.stairs[1], G.STAIRS);
    map.stairsRoom = best;
    return map;
  }

  /* 营造一层：返回 {map, places}，places 里给出各实体的落点（引擎负责造人）。
     places: boss/[x,y]、elites [[chId,x,y]]、mobs [[x,y]]、campfire、shop、
             chests [[x,y]]、scrolls [[x,y,id]]、trees [[x,y]] */
  function genFloor(seedStr, def) {
    const R = R2().make(seedStr + "|" + def.name);
    let map = null;
    for (let k = 0; k < 12 && !map; k++) map = buildOnce(def, R2().make(seedStr + "|" + def.name + "#" + k));
    if (!map) throw new Error("gen failed: " + seedStr + " " + def.name);
    const G = G3();
    const places = { elites: [], mobs: [], chests: [], scrolls: [], trees: [], campfire: null, shop: null, boss: null };
    const taken = new Set();
    taken.add(map.spawn[1] * map.w + map.spawn[0]);
    taken.add(map.stairs[1] * map.w + map.stairs[0]);
    const df = G.distField(map, map.spawn[0], map.spawn[1]);
    const far = (x, y, minD) => df[y * map.w + x] >= minD;
    const free = (x, y) => !taken.has(y * map.w + x) && G.walkable(map, x, y) && far(x, y, 4);

    /* Boss 镇守于楼梯旁 */
    {
      const [sx, sy] = map.stairs;
      const spot = G.DIRS.map(([dx, dy]) => [sx + dx, sy + dy])
        .find(([x, y]) => G.inB(map, x, y) && G.walkable(map, x, y) && !taken.has(y * map.w + x));
      if (spot) { places.boss = spot; taken.add(spot[1] * map.w + spot[0]); }
      else { places.boss = [sx, sy - 1]; }
    }
    /* 精英：各占一间远房 */
    const farRooms = map.rooms.filter(r => !(r === map.stairsRoom) && df[r.cy * map.w + r.cx] >= 7);
    def.elites.forEach((chId, i) => {
      const room = farRooms.length ? farRooms[(i * 3 + 1) % farRooms.length] : R.pick(map.rooms);
      const spot = roomSpot(map, room, R, taken) || roomSpot(map, R.pick(map.rooms), R, taken);
      if (spot) places.elites.push([chId, spot[0], spot[1]]);
    });
    /* 杂兵 */
    for (let i = 0; i < def.mobs; i++) {
      for (let t = 0; t < 40; t++) {
        const x = R.int(1, map.w - 2), y = R.int(1, map.h - 2);
        if (G.at(map, x, y) === G.FLOOR && free(x, y) && far(x, y, 6)) { places.mobs.push([x, y]); taken.add(y * map.w + x); break; }
      }
    }
    /* 灶间：既非出生房也非楼梯房 */
    {
      const midRooms = map.rooms.filter(r => r !== map.stairsRoom && !(r.cx === map.spawn[0] && r.cy === map.spawn[1]));
      const room = midRooms.length ? R.pick(midRooms) : R.pick(map.rooms);
      const spot = roomSpot(map, room, R, taken);
      if (spot) { G.set(map, spot[0], spot[1], G.CAMPFIRE); places.campfire = spot; }
    }
    /* 小卖部 */
    if (def.shop) {
      const room = R.pick(map.rooms);
      const spot = roomSpot(map, room, R, taken);
      if (spot) { G.set(map, spot[0], spot[1], G.SHOP); places.shop = spot; }
    }
    /* 木箱与史料：箱子只进房间（免堵走廊），史料可落于廊中（走过即拾） */
    const chestN = 2 + Math.floor(def.n / 2);
    const allRooms = map.rooms.slice();
    for (let i = 0; i < chestN; i++) {
      const spot = roomSpot(map, R.pick(allRooms), R, taken) || roomSpot(map, R.pick(allRooms), R, taken);
      if (spot) { places.chests.push(spot); }
    }
    const scrollN = 2 + (def.n % 2);
    for (let i = 0; i < scrollN; i++) {
      for (let t = 0; t < 40; t++) {
        const x = R.int(1, map.w - 2), y = R.int(1, map.h - 2);
        if (G.at(map, x, y) === G.FLOOR && free(x, y)) {
          places.scrolls.push([x, y, "f" + def.n + "s" + i]); taken.add(y * map.w + x); break;
        }
      }
    }
    for (let i = 0; i < places.scrolls.length; i++) {
      const s = places.scrolls[i]; G.set(map, s[0], s[1], G.SCROLL);
    }
    /* 陷阱：可见的尖刺，踩中即发（一次性）；离出生点至少4格 */
    const trapN = Math.min(7, 1 + Math.ceil(def.n / 2));
    for (let i = 0; i < trapN; i++) {
      for (let t = 0; t < 40; t++) {
        const x = R.int(1, map.w - 2), y = R.int(1, map.h - 2);
        if (G.at(map, x, y) === G.FLOOR && free(x, y)) {
          G.set(map, x, y, G.TRAP); taken.add(y * map.w + x); break;
        }
      }
    }
    /* 崇国庭：先种两株树 */
    if (def.rule === "zhongshu") {
      for (let i = 0; i < 2; i++) {
        for (let t = 0; t < 40; t++) {
          const x = R.int(1, map.w - 2), y = R.int(1, map.h - 2);
          if (G.at(map, x, y) === G.FLOOR && free(x, y) && far(x, y, 5)) {
            G.set(map, x, y, G.TREE); places.trees.push([x, y]); taken.add(y * map.w + x); break;
          }
        }
      }
    }
    return { map, places };
  }

  /* 连通性自检：出生点能到楼梯、灶间、商摊与所有实体格 */
  function sane(map) {
    const G = G3();
    const df = G.distField(map, map.spawn[0], map.spawn[1]);
    const ok = (p) => p && df[p[1] * map.w + p[0]] >= 0;
    if (!ok(map.stairs)) return false;
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      const t = G.at(map, x, y);
      if ((t === G.CAMPFIRE || t === G.SHOP || t === G.CHEST || t === G.SCROLL) && df[y * map.w + x] < 0) return false;
    }
    return true;
  }

  ROOT.MDG = ROOT.MDG || {};
  ROOT.MDG.Gen = { genFloor, sane };
})(typeof window !== "undefined" ? window : globalThis);
