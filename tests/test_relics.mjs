/* 刀卡遗物逐张实弹 + 六层双钥匙门 + 敌人占梯 */
import { loadCore, makeT, placeEnemy } from "./harness.mjs";

const ctx = loadCore();
const { Engine, Grid, DATA } = ctx.MDG;
const t = makeT("relics");
Engine.setTeleChance(0); /* 钉亮刀率：数值断言不赌概率 */

function fresh() {
  const G = Engine.newRunState({ seed: "rel-" + Math.floor(Math.random() * 1e9), runnerId: "yinkesi", diffV: "normal", meta: {} });
  const [px, py] = [G.player.x, G.player.y];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [3, 0]]) Grid.set(G.map, px + dx, py + dy, Grid.FLOOR);
  G.enemies = [];
  G.player.hp = 999; G.player.maxHp = 999;
  return G;
}

/* 先手刀：每回合首次刀击+1 */
{
  const G = fresh();
  G.relics.push("firststrike");
  const a = placeEnemy(ctx, G, "mob", G.player.x + 1, G.player.y, { aggro: true });
  a.hp = 99; a.maxHp = 99;
  Engine.act(G, { t: "move", dx: 1, dy: 0 }); // 回合首刀
  t.eq(99 - a.hp, 3, "先手刀首刀+1（伤3）");
  /* 本作一回合一步：每个行动轮都是「该回合首次刀击」——先手刀=常驻+1（描述已写实） */
  const b = placeEnemy(ctx, G, "mob", G.player.x - 1, G.player.y, { aggro: true });
  b.hp = 99; b.maxHp = 99;
  Engine.act(G, { t: "move", dx: -1, dy: 0 });
  t.eq(99 - b.hp, 3, "次轮首刀同样+1（伤3）");
}

/* 班主任的偏爱：每层开局+3盾（下行单发） */
{
  const G = fresh();
  G.relics.push("shield3");
  const s0 = G.player.st.shield;
  Engine.enterFloor(G, 1);
  t.ok(G.player.st.shield - s0 === 3, "每层+3盾（实得+" + (G.player.st.shield - s0) + "）");
}

/* 以道代血：血祭零损 */
{
  const G = fresh();
  G.relics.push("bloodfree");
  G.player.hp = 20;
  Engine.act(G, { t: "skill", si: 0 });
  t.eq(G.player.hp, 20, "以道代血：血祭不损血");
  t.eq(G.player.st.emp, 2, "蓄力照常");
}

/* 庆功之宴：击破回5 */
{
  const G = fresh();
  G.relics.push("killheal");
  const foe = placeEnemy(ctx, G, "mob", G.player.x + 1, G.player.y, { aggro: true });
  foe.hp = 1; foe.maxHp = 4;
  G.player.hp = 10;
  Engine.act(G, { t: "move", dx: 1, dy: 0 });
  t.eq(G.player.hp, 15, "庆功之宴击破回5（10→15）");
}

/* 六层双钥匙门：钦法死而 为兵活 → 梯仍锁 */
{
  const G = Engine.newRunState({ seed: "gate", diffV: "normal", meta: {} });
  Engine.enterFloor(G, 5);
  const qinfa = G.enemies.find(u => u.chId === "qinfa");
  const weibing = G.enemies.find(u => u.chId === "weibing");
  t.ok(!!qinfa && !!weibing, "六层配置：钦法+为兵在场");
  if (qinfa) { qinfa.hp = 1; qinfa.x = G.player.x + 1; qinfa.y = G.player.y; Grid.set(G.map, qinfa.x, qinfa.y, Grid.FLOOR); }
  Grid.set(G.map, G.player.x - 1, G.player.y, Grid.FLOOR);
  Engine.act(G, { t: "move", dx: 1, dy: 0 }); // 斩钦法
  t.ok(!qinfa || qinfa.dead, "钦法已除");
  t.eq(Engine.stairsOpenNow(G), false, "为兵尚在 → 梯仍锁");
  if (weibing) { weibing.hp = 1; weibing.x = G.player.x; weibing.y = G.player.y + 1; Grid.set(G.map, weibing.x, weibing.y, Grid.FLOOR); }
  Engine.act(G, { t: "move", dx: 0, dy: 1 }); // 斩为兵
  t.eq(Engine.stairsOpenNow(G), true, "双钥匙齐除 → 梯开");
}

Engine.setTeleChance(1);

/* 敌人绝不落脚在楼梯上（BUGS#39 根修） */
{
  Engine.setTeleChance(0);
  const G = Engine.newRunState({ seed: "stairs", diffV: "normal", meta: {} });
  const [px, py] = [G.player.x, G.player.y];
  /* 雕两条平行通道，第二条绕过楼梯 */
  for (let x = px + 1; x <= px + 5; x++) { Grid.set(G.map, x, py, Grid.FLOOR); Grid.set(G.map, x, py + 1, Grid.FLOOR); }
  const stairPos = [px + 3, py];
  Grid.set(G.map, stairPos[0], stairPos[1], Grid.STAIRS);
  const foe = placeEnemy(ctx, G, "mob", px + 5, py, { aggro: true });
  foe.saw = 0; foe.aggro = true;
  let everOnStairs = false;
  for (let i = 0; i < 12; i++) {
    Engine.act(G, { t: "wait" });
    if (foe.x === stairPos[0] && foe.y === stairPos[1]) everOnStairs = true;
  }
  t.eq(everOnStairs, false, "敌人追击全程不踏上楼梯");
  Engine.setTeleChance(0);
}
Engine.setTeleChance(1);
process.exit(t.done());
