/* 闲置巡逻：世界不因静立而冻结——杂兵/精英踱步，镇守望岗 */
import { loadCore, makeT, placeEnemy } from "./harness.mjs";

const ctx = loadCore();
const { Engine, Grid } = ctx.MDG;
const t = makeT("idle");

function fresh() {
  const G = Engine.newRunState({ seed: "idle-" + Math.floor(Math.random() * 1e9), runnerId: "yinkesi", diffV: "normal", meta: {} });
  G.enemies = [];
  G.player.hp = 999;
  return G;
}
const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
/* 找一块「四面宽敞」的空地（≥3 邻格可走、离玩家足够远），避免死角冤案 */
function openSpot(G, minDist) {
  for (let y = 1; y < G.map.h - 1; y++) for (let x = 1; x < G.map.w - 1; x++) {
    if (!Grid.walkable(G.map, x, y)) continue;
    if (Grid.at(G.map, x, y) !== Grid.FLOOR) continue;
    if (dist({ x, y }, G.player) < minDist) continue;
    let free = 0;
    for (const [dx, dy] of Grid.DIRS) {
      const nx = x + dx, ny = y + dy;
      if (Grid.walkable(G.map, nx, ny) && Grid.at(G.map, nx, ny) === Grid.FLOOR) free++;
    }
    if (free >= 3) return [x, y];
  }
  return null;
}

/* 杂兵：闲置会踱步（40%/轮，30 轮不动概率≈2e-7） */
{
  const G = fresh();
  const [sx, sy] = openSpot(G, 7);
  const m = placeEnemy(ctx, G, "mob", sx, sy, { aggro: false });
  m.saw = 0; // 关目力，保持闲置
  const [x0, y0] = [m.x, m.y];
  for (let i = 0; i < 30 && m.x === x0 && m.y === y0; i++) Engine.act(G, { t: "wait" });
  t.ok(m.x !== x0 || m.y !== y0, "杂兵闲置会踱步");
}

/* 精英：闲置也会踱步（25%/轮，40 轮不动概率≈1e-5） */
{
  const G = fresh();
  const [sx, sy] = openSpot(G, 7);
  const e = placeEnemy(ctx, G, "shenren", sx, sy, { aggro: false });
  e.saw = 0;
  const [x0, y0] = [e.x, e.y];
  for (let i = 0; i < 40 && e.x === x0 && e.y === y0; i++) Engine.act(G, { t: "wait" });
  t.ok(e.x !== x0 || e.y !== y0, "精英闲置会踱步");
}

/* 镇守：望岗不动（惊动前永远守在楼梯旁） */
{
  const G = fresh();
  const b = placeEnemy(ctx, G, "wanzhen", G.player.x, G.player.y + 9, { aggro: false, boss: true });
  b.saw = 0;
  const [x0, y0] = [b.x, b.y];
  for (let i = 0; i < 30; i++) Engine.act(G, { t: "wait" });
  t.ok(b.x === x0 && b.y === y0, "镇守望岗不动");
  t.ok(dist(b, G.player) >= 8, "且未向玩家漂移");
}

/* 巡逻步会发移动事件（表现层可播） */
{
  const G = fresh();
  const [sx, sy] = openSpot(G, 7);
  const m = placeEnemy(ctx, G, "mob", sx, sy, { aggro: false });
  m.saw = 0;
  let sawMove = false;
  for (let i = 0; i < 40 && !sawMove; i++) {
    const evs = Engine.act(G, { t: "wait" });
    sawMove = evs.some(e => e.t === "emove" && e.uid === m.uid);
  }
  t.ok(sawMove, "巡逻步带 emove 事件");
}

process.exit(t.done());
