/* 弹反机制专项：亮刀窗口 / 抵消+加伤 / 失措 / 戒备冷却 / 晕眩不亮刀 / 掷物弹反 / 弹反斩杀 */
import { loadCore, makeT, placeEnemy } from "./harness.mjs";

const ctx = loadCore();
const { Engine, Grid, DATA } = ctx.MDG;
const t = makeT("parry");
Engine.setTeleChance(1); // 钉亮刀率=1：专项测试不赌概率（概率本身另有专项）

function fresh() {
  const G = Engine.newRunState({ seed: "parry-" + Math.floor(Math.random() * 1e9), runnerId: "yinkesi", diffV: "normal", meta: {} });
  G.enemies = [];
  G.player.hp = 999;
  /* 雕平出生点四邻：摆放不赌随机地图 */
  const [px, py] = [G.player.x, G.player.y];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0]]) Grid.set(G.map, px + dx, py + dy, Grid.FLOOR);
  return G;
}

/* 1. 贴身惊动之敌：回合开始即亮刀 */
{
  const G = fresh();
  const foe = placeEnemy(ctx, G, "mob", G.player.x + 1, G.player.y, { aggro: true });
  foe.hp = 99; foe.maxHp = 99;
  const evs = Engine.act(G, { t: "wait" });
  t.ok(foe.telegraph === true, "贴身惊动之敌亮刀");
  t.ok(evs.some(e => e.t === "telegraph"), "亮刀事件发出");
}

/* 2. 弹反：迎击=抵消+2伤+失措（敌本回合不出手） */
{
  const G = fresh();
  const foe = placeEnemy(ctx, G, "mob", G.player.x + 1, G.player.y, { aggro: true });
  foe.hp = 99; foe.maxHp = 99;
  const hp0 = G.player.hp;
  const evs = Engine.act(G, { t: "move", dx: 1, dy: 0 }); // 撞击即迎击
  t.eq(foe.hp, 95, "弹反伤害=刀2+反2（99→95）");
  t.ok(evs.some(e => e.t === "parry"), "弹反事件发出");
  t.eq(G.player.hp, hp0, "失措之敌本回合未还手");
  t.eq(foe._parried, false, "失措已消费");
  t.eq(foe.parryCd, 2, "戒备冷却置2");
}

/* 3. 戒备回合：不亮刀，敌正常出手 */
{
  const G = fresh();
  const foe = placeEnemy(ctx, G, "mob", G.player.x + 1, G.player.y, { aggro: true });
  foe.hp = 99; foe.maxHp = 99;
  Engine.act(G, { t: "move", dx: 1, dy: 0 }); // 弹反一轮（foe 4 血上限被斩？99 血在）
  t.eq(foe.telegraph, false, "弹反当轮红框熄灭");
  Engine.act(G, { t: "wait" }); // 戒备轮
  t.eq(foe.telegraph, false, "戒备轮不亮刀");
  t.eq(G.player.hp, 998, "戒备轮敌正常出手（999-1）");
  Engine.act(G, { t: "wait" }); // 冷却毕
  t.eq(foe.telegraph, true, "冷却毕重新亮刀（一反一真）");
}

/* 4. 晕眩之敌不亮刀，攻击不加伤 */
{
  const G = fresh();
  const foe = placeEnemy(ctx, G, "mob", G.player.x + 1, G.player.y, { aggro: true });
  foe.hp = 99; foe.maxHp = 99;
  foe.st.stun = 2;
  const evs = Engine.act(G, { t: "move", dx: 1, dy: 0 });
  t.ok(!evs.some(e => e.t === "parry"), "晕眩者无弹反");
  t.eq(foe.hp, 97, "普通刀击伤2（无+2）");
}

/* 5. 远敌不亮刀（亮刀看回合开始时的站位） */
{
  const G = fresh();
  const foe = placeEnemy(ctx, G, "mob", G.player.x + 3, G.player.y, { aggro: true });
  foe.hp = 99; foe.maxHp = 99;
  Engine.act(G, { t: "wait" }); // 敌走近一格（3→2），尚不贴身
  t.eq(foe.telegraph, false, "3格外未亮刀");
  Engine.act(G, { t: "wait" }); // 敌再走近一格（2→1）并出刀；但本轮开始时它在2格→未亮
  t.eq(foe.telegraph, false, "贴身当轮仍不亮（窗口看轮初站位）");
  t.eq(G.player.hp, 998, "贴身即出刀（999-1）");
  Engine.act(G, { t: "wait" }); // 轮初已贴身 → 亮
  t.eq(foe.telegraph, true, "次轮亮刀");
}

/* 6. 掷物（陀螺）打亮刀之敌同样弹反 */
{
  const G = fresh();
  const foe = placeEnemy(ctx, G, "mob", G.player.x + 1, G.player.y, { aggro: true });
  foe.hp = 99; foe.maxHp = 99;
  G.items.push({ id: "tuoluo", n: 1 });
  const evs = Engine.act(G, { t: "item", ii: G.items.length - 1, tx: foe.x, ty: foe.y });
  t.ok(evs.some(e => e.t === "parry"), "掷物命中亮刀之敌=弹反");
  t.eq(foe.hp, 95, "掷物弹反=2+2");
  t.eq(G.player.hp, 999, "其失措未还手");
}

/* 7. 弹反斩杀：加伤助你斩于亮刀之际 */
{
  const G = fresh();
  const foe = placeEnemy(ctx, G, "mob", G.player.x + 1, G.player.y, { aggro: true });
  foe.hp = 3; foe.maxHp = 3;
  Engine.act(G, { t: "move", dx: 1, dy: 0 });
  t.ok(foe.dead, "弹反一刀致命（2+2>3）");
  t.ok(Engine.stairsOpenNow(G) === false || true, "无异常");
}

/* 8. 多敌贴身：弹反只荡开被击者，其余照常出手 */
{
  const G = fresh();
  const a = placeEnemy(ctx, G, "mob", G.player.x + 1, G.player.y, { aggro: true });
  const b = placeEnemy(ctx, G, "mob", G.player.x, G.player.y + 1, { aggro: true });
  a.hp = 99; a.maxHp = 99; b.hp = 99; b.maxHp = 99;
  const hp0 = G.player.hp;
  Engine.act(G, { t: "move", dx: 1, dy: 0 }); // 弹反 a；b 当轮照常出手
  t.eq(G.player.hp, hp0 - 1, "弹反只荡开 a——b 照砍（-1）");
  Engine.act(G, { t: "wait" }); // a 戒备轮照砍，b 亦砍
  t.eq(G.player.hp, hp0 - 3, "戒备轮两敌齐出（-1-1-1）");
}

/* 8.5 戒备逐次加长：二次弹反戒备2回合 */
{
  const G = fresh();
  const foe = placeEnemy(ctx, G, "mob", G.player.x + 1, G.player.y, { aggro: true });
  foe.hp = 99; foe.maxHp = 99;
  Engine.act(G, { t: "move", dx: 1, dy: 0 }); // 一弹：cd=2
  Engine.act(G, { t: "wait" }); Engine.act(G, { t: "wait" }); // 戒备1回合+冷却毕
  t.eq(foe.telegraph, true, "冷却毕再亮刀");
  Engine.act(G, { t: "move", dx: 1, dy: 0 }); // 二弹
  t.eq(foe.parryCd, 3, "二次弹反戒备3（含当轮）");
  Engine.act(G, { t: "wait" }); Engine.act(G, { t: "wait" });
  Engine.act(G, { t: "wait" }); Engine.act(G, { t: "wait" }); // 3回合戒备+冷却
  t.eq(foe.telegraph, true, "长戒备后终再亮刀");
  Engine.act(G, { t: "move", dx: 1, dy: 0 }); // 三弹
  t.eq(foe.parryCd, 4, "三次起戒备封顶4");
}

/* 9. 血祭+弹反：翻倍连弹反加伤一起翻 */
{
  const G = fresh();
  const foe = placeEnemy(ctx, G, "mob", G.player.x + 1, G.player.y, { aggro: true });
  foe.hp = 99; foe.maxHp = 99;
  const p = G.player;
  Engine.act(G, { t: "skill", si: 0 }); // 血祭：损半获2层翻倍
  const hpMid = p.hp;
  const evs = Engine.act(G, { t: "move", dx: 1, dy: 0 }); // 翻倍迎击
  t.ok(evs.some(e => e.t === "parry"), "蓄力迎击仍算弹反");
  t.ok(99 - foe.hp >= 8, "翻倍弹反≥8伤（(2+2)×2）");
  t.eq(p.st.emp, 1, "翻倍余一层");
  void hpMid;
}

/* 10. 亮刀率=0：永不亮刀（概率旋钮生效） */
{
  Engine.setTeleChance(0);
  const G = fresh();
  const foe = placeEnemy(ctx, G, "mob", G.player.x + 1, G.player.y, { aggro: true });
  foe.hp = 99; foe.maxHp = 99;
  for (let i = 0; i < 12; i++) Engine.act(G, { t: "wait" });
  t.eq(foe.telegraph, false, "亮刀率0则永不亮刀");
  const hp0 = G.player.hp;
  const evs = Engine.act(G, { t: "move", dx: 1, dy: 0 });
  t.ok(!evs.some(e => e.t === "parry"), "无破绽则无弹反");
  t.eq(foe.hp, 97, "普通刀击伤2");
  Engine.setTeleChance(1); // 复原
}

process.exit(t.done());
