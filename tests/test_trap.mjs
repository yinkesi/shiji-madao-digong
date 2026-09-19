/* 陷阱专项：无视护盾 / 一次性 / 敌我皆触发 / 击杀 / 分布 */
import { loadCore, makeT, placeEnemy } from "./harness.mjs";

const ctx = loadCore();
const { Engine, Grid, Gen, DATA } = ctx.MDG;
const t = makeT("trap");

function fresh() {
  const G = Engine.newRunState({ seed: "trap-" + Math.floor(Math.random() * 1e9), runnerId: "yinkesi", diffV: "normal", meta: {} });
  G.enemies = [];
  return G;
}
/* 在玩家右侧造一格陷阱 */
function trapRight(G) {
  Grid.set(G.map, G.player.x + 1, G.player.y, Grid.TRAP);
  return [G.player.x + 1, G.player.y];
}

/* 1. 玩家踩中：无视护盾损3 */
{
  const G = fresh();
  const [tx, ty] = trapRight(G);
  G.player.st.shield = 99;
  Engine.act(G, { t: "move", dx: 1, dy: 0 });
  t.eq(G.player.hp, G.player.maxHp - 3, "陷阱无视护盾损3（盾99不挡）");
}

/* 2. 一次性：尖刺报废，再走无事 */
{
  const G = fresh();
  trapRight(G);
  Engine.act(G, { t: "move", dx: 1, dy: 0 });
  Engine.act(G, { t: "move", dx: 1, dy: 0 }); // 往前走
  const hpMid = G.player.hp;
  Engine.act(G, { t: "move", dx: -1, dy: 0 }); // 走回原陷阱格
  t.eq(G.player.hp, hpMid, "陷阱一次性，回踩无损");
  t.eq(Grid.at(G.map, G.player.x, G.player.y), Grid.FLOOR, "触发的陷阱格复原为地");
}

/* 3. 敌人踩中：4血杂兵踩3伤陷阱剩1 */
{
  const G = fresh();
  const foe = placeEnemy(ctx, G, "mob", G.player.x + 3, G.player.y, { aggro: true });
  foe.hp = 4; foe.maxHp = 4;
  Grid.set(G.map, G.player.x + 2, G.player.y, Grid.TRAP);
  Engine.act(G, { t: "wait" }); // 敌走近一格踩陷阱
  t.eq(foe.hp, 1, "杂兵踩陷阱损3（4→1）");
  t.eq(foe.dead, false, "未致死");
}

/* 3b. 敌人踩中必损3（不受护盾/减伤）：摆定路径 */
{
  const G = fresh();
  const foe = placeEnemy(ctx, G, "mob", G.player.x + 2, G.player.y, { aggro: true });
  foe.hp = 30; foe.maxHp = 30;
  Grid.set(G.map, G.player.x + 1, G.player.y, Grid.TRAP);
  Engine.act(G, { t: "wait" }); // 敌向玩家走一格 → 必踩陷阱
  t.eq(foe.hp, 27, "敌人踩陷阱损3（30→27）");
}

/* 4. 玩家被陷阱致死 → 结束且 dead 标记置位 */
{
  const G = fresh();
  trapRight(G);
  G.player.hp = 3;
  Engine.act(G, { t: "move", dx: 1, dy: 0 });
  t.ok(G.over && !G.won, "陷阱致死终局");
  t.eq(G.player.dead, true, "dead 标记置位（BUGS#33 已销）");
}

/* 5. 分布：每层都有陷阱、离出生点≥4、落在地面 */
{
  let okAll = true;
  for (const def of DATA.FLOORS) {
    const { map } = Gen.genFloor("trap-check|" + def.n, def);
    let n = 0;
    for (let y = 0; y < map.h && okAll; y++) for (let x = 0; x < map.w && okAll; x++) {
      if (Grid.at(map, x, y) === Grid.TRAP) {
        n++;
        const d = Math.abs(x - map.spawn[0]) + Math.abs(y - map.spawn[1]);
        if (d < 4) okAll = false;
      }
    }
    if (n < 1) okAll = false;
  }
  t.ok(okAll, "九层皆有陷阱且离出生点≥4");
}

/* 6. 敌人不会因陷阱卡死：踩发后继续行动 */
{
  const G = fresh();
  const foe = placeEnemy(ctx, G, "mob", G.player.x + 2, G.player.y, { aggro: true });
  foe.hp = 30; foe.maxHp = 30;
  Grid.set(G.map, G.player.x + 1, G.player.y, Grid.TRAP);
  Engine.act(G, { t: "wait" });
  t.ok(!G.over, "敌人踩陷阱不终局");
  t.ok(foe.hp === 27 || foe.hp === 26 || foe.dead, "踩后照常行动（27=踩中即停/26=踩中再打）");
}

process.exit(t.done());
