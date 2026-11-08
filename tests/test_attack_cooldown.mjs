/* 普攻节奏：玩家/小怪普通刀击有短冷却，下一次攻击前给出明确预警。 */
import { loadCore, makeT, placeEnemy } from "./harness.mjs";

const ctx = loadCore();
const { Engine, Grid, Gen, DATA } = ctx.MDG;
const t = makeT("attack-cooldown");
Engine.setTeleChance(1);

function fresh() {
  const G = Engine.newRunState({ seed: "attack-cd", runnerId: "yinkesi", diffV: "normal", meta: {} });
  G.enemies = [];
  const [px, py] = [G.player.x, G.player.y];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0]]) {
    Grid.set(G.map, px + dx, py + dy, Grid.FLOOR);
  }
  G.player.hp = 999;
  return G;
}

/* 玩家普攻后，下一次普通攻击被冷却拦住；移动一回合即可恢复。 */
{
  const G = fresh();
  const foe = placeEnemy(ctx, G, "mob", G.player.x + 1, G.player.y, { aggro: true });
  foe.hp = 99; foe.maxHp = 99; foe.saw = 0; foe.st.stun = 99;
  Engine.act(G, { t: "move", dx: 1, dy: 0 });
  const afterFirst = foe.hp;
  t.ok(G.player.attackCd > 0, "玩家普通攻击后进入攻击冷却");
  const blocked = Engine.act(G, { t: "move", dx: 1, dy: 0 });
  t.eq(foe.hp, afterFirst, "攻击冷却中再次撞击不重复出刀");
  t.ok(blocked.some(e => e.t === "attackCooldown"), "冷却阻止事件可观察");
  Engine.act(G, { t: "wait" });
  Engine.act(G, { t: "move", dx: 1, dy: 0 });
  t.ok(foe.hp < afterFirst, "恢复后普通攻击再次可用");
}

/* 敌人普通攻击前必须出现预警；预警窗口可被弹反消费。 */
{
  const G = fresh();
  const foe = placeEnemy(ctx, G, "mob", G.player.x + 1, G.player.y, { aggro: true });
  foe.hp = 99; foe.maxHp = 99; foe.saw = 0;
  const evs = Engine.act(G, { t: "wait" });
  t.ok(foe.attackWarning === true, "敌人下一次普攻有预警状态");
  t.ok(evs.some(e => e.t === "attackWarning"), "敌人普攻预警事件发出");
  const parried = Engine.act(G, { t: "move", dx: 1, dy: 0 });
  t.ok(parried.some(e => e.t === "parry"), "预警窗口仍可弹反");

  const H = fresh();
  const hunter = placeEnemy(ctx, H, "mob", H.player.x + 1, H.player.y, { aggro: true });
  hunter.saw = 0;
  Engine.act(H, { t: "wait" }); // 蓄力
  Engine.act(H, { t: "wait" }); // 出刀
  const hpAfterHit = H.player.hp;
  t.ok(hunter.attackCd > 0, "小怪普通攻击后进入攻击冷却");
  Engine.act(H, { t: "wait" });
  t.eq(H.player.hp, hpAfterHit, "小怪攻击冷却中不会连续出刀");
}

/* 生成层：陷阱数量增加，配置了多种陷阱的层保证至少各有一种。 */
{
  const varied = DATA.FLOORS.find(f => f.traps && f.traps.length >= 3);
  const { map } = Gen.genFloor("attack-cd-traps", varied);
  const kinds = new Set();
  let count = 0;
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    if (Grid.at(map, x, y) === Grid.TRAP) {
      count++;
      kinds.add((map.trapKinds || {})[x + "," + y]);
    }
  }
  t.ok(count >= 6, "深层陷阱数量达到可感知密度");
  t.eq(kinds.size, varied.traps.length, "多陷阱层保证每种陷阱至少出现一次");
}

/* 一颗落石只消耗一次，不能因为同一行有多个单位而重复结算。 */
{
  const G = fresh();
  const [rx, ry] = [G.player.x + 2, G.player.y + 2];
  Grid.set(G.map, rx, ry, Grid.TRAP);
  G.map.trapKinds = { [rx + "," + ry]: "rock" };
  const a = placeEnemy(ctx, G, "mob", rx + 1, ry, { aggro: false });
  const b = placeEnemy(ctx, G, "mob", rx + 2, ry, { aggro: false });
  a.saw = b.saw = 0;
  a.st.stun = b.st.stun = 1;
  a.hp = b.hp = 10;
  Engine.act(G, { t: "wait" });
  t.eq(a.hp + b.hp, 19, "同一颗落石只结算一次");
  t.eq(Grid.at(G.map, rx, ry), Grid.FLOOR, "落石触发后地形复原");
}

process.exit(t.done());
