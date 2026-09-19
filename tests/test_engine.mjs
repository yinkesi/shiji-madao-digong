/* 引擎检查：开局/移动/刀击/血祭/录技/下行/死亡/存续。受控局面直接摆子。 */
import { loadCore, makeT, findFloor, placeEnemy } from "./harness.mjs";

const ctx = loadCore();
const { Engine, Grid, DATA } = ctx.MDG;
const t = makeT("engine");

function fresh() {
  return Engine.newRunState({ seed: "engine-test", runnerId: "yinkesi", diffV: "normal", meta: {} });
}

/* 开局基本面 */
{
  const G = fresh();
  t.ok(G.player && G.player.chId === "yinkesi", "开局有史官");
  t.eq(G.player.hp, 20, "史官基准血20");
  t.eq(G.player.x, G.map.spawn[0], "史官落在出生点");
  t.ok(G.enemies.some(u => u.boss && u.chId === "wanzhen"), "一层镇守万震在场");
  t.ok(!Engine.stairsOpenNow(G), "镇守未除，梯不开");
  t.eq(G.floorIdx, 0, "第0层索引");
}

/* 刀击：把学子摆到玩家身边，撞击即攻击 */
{
  const G = fresh();
  G.enemies = []; // 清场
  const [px, py] = G.map.spawn;
  const foe = placeEnemy(ctx, G, "mob", px + 1, py, { aggro: true });
  const hp0 = foe.hp;
  Engine.act(G, { t: "move", dx: 1, dy: 0 });
  t.ok(foe.hp === hp0 - 2 || foe.dead, "刀击基准伤2");
  t.ok(G.round === 2, "一动一回合一轮");
}

/* 血祭→翻倍：两连击 */
{
  const G = fresh();
  G.enemies = [];
  const [px, py] = G.map.spawn;
  const foe = placeEnemy(ctx, G, "mob", px + 2, py, { aggro: true });
  foe.saw = 0; foe.st.stun = 99;  // 晕眩木桩：不闪不避不还手，供测数值
  foe.hp = 20; foe.maxHp = 20;
  const hp0 = G.player.hp;
  /* 血祭是 0 号技 */
  Engine.act(G, { t: "skill", si: 0 });
  t.eq(G.player.hp, hp0 - Math.floor(hp0 / 2), "血祭损半");
  t.eq(G.player.st.emp, 2, "血祭后两次翻倍");
  /* 走近再击：emp 在手，一刀 4 */
  Engine.act(G, { t: "move", dx: 1, dy: 0 });   // 至 px+1，与敌相邻
  const hpBefore = foe.hp;
  Engine.act(G, { t: "move", dx: 1, dy: 0 });   // 撞击即刀击（翻倍 4）
  t.eq(foe.hp, hpBefore - 4, "血祭后刀击翻倍（-4）");
  t.eq(G.player.st.emp, 1, "翻倍余一次");
}

/* 录技：斩万震 → 梯开 + 技入谱 */
{
  const G = fresh();
  const boss = G.enemies.find(u => u.chId === "wanzhen");
  boss.hp = 1;
  /* 挪到镇守身边斩之（直接摆位免寻路） */
  G.player.x = boss.x + 1; G.player.y = boss.y;
  if (Grid.at(G.map, G.player.x, G.player.y) === Grid.WALL) { G.player.x = boss.x - 1; }
  if (Grid.at(G.map, G.player.x, G.player.y) === Grid.WALL) { G.player.y = boss.y + 1; G.player.x = boss.x; }
  Engine.act(G, { t: "move", dx: Math.sign(boss.x - G.player.x), dy: Math.sign(boss.y - G.player.y) });
  t.ok(boss.dead, "一刀斩镇守");
  t.ok(Engine.stairsOpenNow(G), "镇守既除，梯开");
  t.ok(G.learned["wanzhen"], "录技入谱");
  t.ok(G.player.skills.some(s => s.id === "shuxue"), "「数学之首」到手");
}

/* 下行：开梯后走上梯格 */
{
  const G = fresh();
  G.enemies.forEach(u => { if (u.boss) u.hp = 1; });
  const boss = G.enemies.find(u => u.boss);
  G.player.x = boss.x; G.player.y = boss.y + 1;
  if (Grid.at(G.map, G.player.x, G.player.y) === Grid.WALL) { G.player.y = boss.y - 1; }
  if (Grid.at(G.map, G.player.x, G.player.y) === Grid.WALL) { G.player.x = boss.x - 1; G.player.y = boss.y; }
  const dx = Math.sign(boss.x - G.player.x), dy = Math.sign(boss.y - G.player.y);
  Engine.act(G, { t: "move", dx, dy });
  /* 直接走梯：置于梯上后 move 0? 直接调内部路径——把玩家放到梯格邻位走上去 */
  if (!G.over) {
    const st = G.map.stairs;
    G.player.x = st[0] + 1; G.player.y = st[1];
    if (Grid.at(G.map, G.player.x, G.player.y) === Grid.WALL) { G.player.x = st[0]; G.player.y = st[1] + 1; }
    const ddx = Math.sign(st[0] - G.player.x), ddy = Math.sign(st[1] - G.player.y);
    Engine.act(G, { t: "move", dx: ddx, dy: ddy });
  }
  t.eq(G.floorIdx, 1, "已入第二层");
  t.eq(DATA.FLOORS[1].name, G.floorDef.name, "第二层=异能之窟");
  t.ok(G.player.hp > 0, "下行喘息回血仍在");
}

/* 阵亡：把玩家摆到狂怒学子刀下连捶 */
{
  const G = fresh();
  G.enemies = [];
  const [px, py] = G.map.spawn;
  const foe = placeEnemy(ctx, G, "mob", px + 1, py, { aggro: true });
  foe.dmg = 5;
  G.player.hp = 3;
  Engine.act(G, { t: "wait" }); // 敌动：邻接则击
  t.ok(G.player.hp <= 3, "挨了一刀");
  /* 连捶至死 */
  let guard = 20;
  while (!G.over && guard-- > 0) Engine.act(G, { t: "wait" });
  t.ok(G.over && !G.won, "史官折于地下 → 一轮终结");
}

/* 存续：serialize → deserialize 后继续可动，随机序列相接 */
{
  const G = fresh();
  const snap = Engine.serialize(G);
  const G2 = Engine.deserialize(JSON.parse(JSON.stringify(snap)));
  const evs = Engine.act(G2, { t: "wait" });
  t.ok(Array.isArray(evs), "存档复活后照常行动");
  t.ok(G2.round === 2, "续局轮次推进");
  t.ok(G2.player.hp === G.player.hp, "续局血量与原局同刻");
}

/* 灶间：找灶格，撞上去 → 满血清技冷 */
{
  const G = fresh();
  let cf = null;
  for (let y = 0; y < G.map.h && !cf; y++) for (let x = 0; x < G.map.w && !cf; x++)
    if (Grid.at(G.map, x, y) === Grid.CAMPFIRE) cf = [x, y];
  t.ok(!!cf, "灶间存在");
  if (cf) {
    G.player.hp = 3;
    G.player.skills[0].cdLeft = 3;
    G.player.x = cf[0]; G.player.y = cf[1];
    Engine.act(G, { t: "skill", si: 0, tx: null, ty: null }); // 任意一动触发回合流（直接站上已算触达）
    /* 站上灶格的当回合未触发 camp（是"撞上去"才触发）——改测直撞 */
    const G3 = fresh();
    let cf2 = null;
    for (let y = 0; y < G3.map.h && !cf2; y++) for (let x = 0; x < G3.map.w && !cf2; x++)
      if (Grid.at(G3.map, x, y) === Grid.CAMPFIRE) cf2 = [x, y];
    const p2 = G3.player;
    p2.hp = 3; p2.skills[0].cdLeft = 3;
    /* 把灶格搬到玩家右边，保四邻可撞 */
    Grid.set(G3.map, cf2[0], cf2[1], Grid.FLOOR);
    Grid.set(G3.map, p2.x + 1, p2.y, Grid.CAMPFIRE);
    Engine.act(G3, { t: "move", dx: 1, dy: 0 });
    t.eq(p2.hp, p2.maxHp, "灶间歇息满血");
    t.eq(p2.skills[0].cdLeft, 0, "技冷尽清");
  }
}

/* 护身：每层开局护盾（newRunState 首层 + 下行逐层累加） */
{
  const G = Engine.newRunState({ seed: "guard", runnerId: "yinkesi", diffV: "normal", meta: { guard: 2 } });
  t.eq(G.player.st.shield, 2, "护身：首层开局盾2");
  Engine.enterFloor(G, 1);
  t.eq(G.player.st.shield, 4, "护身：入第二层再+2");
}

process.exit(t.done());
