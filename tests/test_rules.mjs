/* 特则检查：情比金坚 / 党争 / 起义 / 鲍鱼之肆 / 锁门 / 验算 / 种树不绝 / 看台飞瓶 */
import { loadCore, makeT, placeEnemy } from "./harness.mjs";

const ctx = loadCore();
const { Engine, Grid } = ctx.MDG;
const t = makeT("rules");

function fresh(floorIdx = 0, rule = null) {
  const G = Engine.newRunState({ seed: "rule-test", runnerId: "yinkesi", diffV: "normal", meta: {} });
  if (floorIdx !== 0) Engine.enterFloor(G, floorIdx);
  if (rule !== null) { G.floorDef = Object.assign({}, G.floorDef, { rule, ruleDesc: "" }); }
  G.enemies = []; // 特则单测清场，敌皆自摆
  return G;
}

/* dyad 情比金坚：两敌相邻且有一者贴着玩家 → 伤害+1 */
{
  const G = fresh(1, "dyad");
  const [px, py] = G.map.spawn;
  const a = placeEnemy(ctx, G, "mob", px + 1, py, { aggro: true });
  placeEnemy(ctx, G, "mob", px + 2, py, { aggro: true });
  G.player.hp = 100;
  Engine.act(G, { t: "wait" });
  /* 玩家100血任打；验证 a 的伤害为 2（1+1） */
  t.ok(G.player.hp <= 98, "dyad：相邻敌伤+1（100-2）");
  void a;
}

/* 无 dyad 对照：孤敌伤害为基准 1 */
{
  const G = fresh(0, null);
  const [px, py] = G.map.spawn;
  placeEnemy(ctx, G, "mob", px + 1, py, { aggro: true });
  G.player.hp = 100;
  Engine.act(G, { t: "wait" });
  t.ok(G.player.hp === 99, "孤敌伤1（对照）");
}

/* stench 鲍鱼之肆：回合末相邻互蚀 */
{
  const G = fresh(4, "stench");
  const [px, py] = G.map.spawn;
  const foe = placeEnemy(ctx, G, "mob", px + 1, py, { aggro: false });
  G.player.hp = 50;
  Engine.act(G, { t: "wait" });
  t.ok(foe.hp === 3, "stench：敌人被蚀1（4→3）");
  t.ok(G.player.hp === 49, "stench：玩家被蚀1（50→49）");
}

/* yansuan 验算：wonder 偶血回2 */
{
  const G = fresh(6, "yansuan");
  const [px, py] = G.map.spawn;
  const w = placeEnemy(ctx, G, "wonder", px + 5, py, { aggro: false });
  w.hp = 10; w.maxHp = 26;
  Engine.act(G, { t: "wait" });
  t.eq(w.hp, 12, "验算：偶血回2（10→12）");
  w.hp = 11;
  Engine.act(G, { t: "wait" });
  t.eq(w.hp, 11, "验算：奇血不回（11→11）");
}

/* zhongshu 种树不绝：树上限3，逐轮渐生 */
{
  const G = fresh(7, "zhongshu");
  const cnt = () => { let n = 0; for (let i = 0; i < G.map.tiles.length; i++) if (G.map.tiles[i] === Grid.TREE) n++; return n; };
  t.ok(cnt() >= 2, "入层即有二树");
  for (let i = 0; i < 6; i++) Engine.act(G, { t: "wait" });
  t.ok(cnt() <= 3, "树上限3");
  t.ok(cnt() >= 3, "逐轮补种至3");
}

/* cans 看台飞瓶：同行/列即砸 */
{
  const G = fresh(8, "cans");
  const [px, py] = G.map.spawn;
  placeEnemy(ctx, G, "mob", px + 4, py, { aggro: false }); // 同行
  G.player.hp = 30;
  Engine.act(G, { t: "wait" });
  t.eq(G.player.hp, 29, "cans：同行挨瓶（30→29）");
}

/* suomen 锁门：击退失效（用仙女技打不开路） */
{
  const G = fresh(5, "suomen");
  const [px, py] = G.map.spawn;
  const x = placeEnemy(ctx, G, "xiannv", px + 1, py, { aggro: true });
  /* 玩家改成站墙边、仙女击退方向上再无阻挡——直接看位置不动即可 */
  const [x0, y0] = [x.x, x.y];
  /* 仙女 AI：邻接则刀击（不带push），用技才push——多轮促其用技 */
  let moved = false, guard = 12;
  const before = [x.x, x.y];
  while (guard-- > 0) {
    Engine.act(G, { t: "wait" });
    if (x.x !== before[0] && x.x !== px + 1) { moved = true; break; }
    if (x.dead) break;
  }
  t.ok(!moved, "suomen：击退未生效（位置未弹开）");
  void x0; void y0;
}

/* uprising 起义：琛半血召二心腹 */
{
  const G = fresh(3, "uprising");
  const zc = placeEnemy(ctx, G, "zichen", G.map.spawn[0] + 3, G.map.spawn[1], { aggro: true, boss: true });
  G.enemies = G.enemies.filter(u => u === zc || u.chId !== "mob"); // 清散兵
  zc.hp = Math.floor(zc.maxHp / 2) - 1;
  const mobN0 = G.enemies.filter(u => u.chId === "mob").length;
  let mobN1 = mobN0;
  for (let i = 0; i < 6; i++) { Engine.act(G, { t: "wait" }); mobN1 = G.enemies.filter(u => u.chId === "mob").length; if (mobN1 - mobN0 >= 2) break; }
  t.ok(mobN1 - mobN0 === 2, "起义：半血召二心腹");
  /* 只召一次 */
  Engine.act(G, { t: "wait" });
  t.eq(G.enemies.filter(u => u.chId === "mob").length, mobN1, "起义只发一次");
}

/* chaos 党争：四向格上「前排怪」有概率误伤身后的「后排怪」。
   封死侧墙造成一列纵队：玩家 — 前排a — 后排b（b 邻 a 且邻 p 的只有 a）。 */
{
  const G = fresh(2, "chaos");
  const [px, py] = G.map.spawn;
  Grid.set(G.map, px + 1, py - 1, Grid.WALL);
  Grid.set(G.map, px + 1, py + 1, Grid.WALL);
  Grid.set(G.map, px + 2, py - 1, Grid.WALL);
  Grid.set(G.map, px + 2, py + 1, Grid.WALL);
  Grid.set(G.map, px + 3, py, Grid.WALL);
  const a = placeEnemy(ctx, G, "mob", px + 1, py, { aggro: true });
  const b = placeEnemy(ctx, G, "mob", px + 2, py, { aggro: true });
  G.player.hp = 999;
  let friendlyFire = 0;
  for (let i = 0; i < 50; i++) {
    if (a.dead || b.hp < 4 || b.dead) { friendlyFire = 1; break; }
    Engine.act(G, { t: "wait" });
  }
  t.ok(friendlyFire, "chaos：纵队之内同门相残");
}

process.exit(t.done());
