/* 第二轮全流程找茬修复验证：
 * 无效动作不耗时 / 玩家晕眩 / 弹反溅射 / 长杆 / 卧薪 / 夜行每层 / 免死 /
 * wonder血祭 / 录技限史官 / 杂兵掉钱 / 血祭下限与蓄力封顶 / 起义落点 / 结算去重 */
import { loadCore, makeT, placeEnemy } from "./harness.mjs";

const ctx = loadCore();
const { Engine, Grid, DATA, Run } = ctx.MDG;
const t = makeT("fix2");
Engine.setTeleChance(0); // 钉亮刀率=0：数值断言不赌概率（概率另有专项）

function fresh() {
  const G = Engine.newRunState({ seed: "f2-" + Math.floor(Math.random() * 1e9), runnerId: "yinkesi", diffV: "normal", meta: {} });
  G.enemies = [];
  const [px, py] = [G.player.x, G.player.y];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [3, 0], [0, 2]]) Grid.set(G.map, px + dx, py + dy, Grid.FLOOR);
  G.player.hp = 999; G.player.maxHp = 999;
  return G;
}

/* F-01 撞墙不耗时 */
{
  const G = fresh();
  Grid.set(G.map, G.player.x + 1, G.player.y, Grid.WALL);
  placeEnemy(ctx, G, "mob", G.player.x, G.player.y + 5, { aggro: false }).saw = 0;
  const r0 = G.round, e0 = G.enemies.map(u => [u.x, u.y]);
  Engine.act(G, { t: "move", dx: 1, dy: 0 });
  t.eq(G.round, r0, "撞墙不推进回合");
  t.ok(JSON.stringify(G.enemies.map(u => [u.x, u.y])) === JSON.stringify(e0), "敌人也没动");
}

/* F-02 梯封未开不耗时（不清场——镇守在，梯才锁） */
{
  const G = Engine.newRunState({ seed: "f2b-" + Math.floor(Math.random() * 1e9), runnerId: "yinkesi", diffV: "normal", meta: {} });
  const st = G.map.stairs;
  Grid.set(G.map, st[0] + 1, st[1], Grid.FLOOR);
  G.player.x = st[0] + 1; G.player.y = st[1];
  const r0 = G.round;
  const evs = Engine.act(G, { t: "move", dx: -1, dy: 0 });
  t.eq(G.round, r0, "撞锁梯不推进回合");
  t.ok(evs.some(e => e.t === "log" && e.text.includes("梯封未开")), "提示封梯原因");
}

/* F-03 技能无目标不耗时 */
{
  const G = fresh();
  const r0 = G.round;
  Engine.act(G, { t: "skill", si: 1, tx: null, ty: null }); // 1号技不存在
  t.eq(G.round, r0, "无此技不耗时");
  const G2 = fresh();
  const r02 = G2.round;
  Engine.act(G2, { t: "skill", si: 0, tx: G2.player.x + 9, ty: G2.player.y }); // 血祭 self 但参数当 unit? self 总有效
  t.eq(G2.round, r02 + 1, "self 技有效照常耗时");
}

/* F-04 玩家被晕：行动作废、晕层消耗 */
{
  const G = fresh();
  placeEnemy(ctx, G, "mob", G.player.x + 1, G.player.y, { aggro: true }).saw = 0;
  G.player.st.stun = 1;
  const [x0, y0] = [G.player.x, G.player.y];
  const evs = Engine.act(G, { t: "move", dx: -1, dy: 0 });
  t.eq(G.player.x, x0, "被晕走不动");
  t.eq(G.player.st.stun, 0, "晕层消耗");
  t.ok(evs.some(e => e.t === "stunned"), "晕眩事件");
}

/* F-05 刀扫一片：溅射身旁另一敌 */
{
  const G = fresh();
  G.relics.push("cleave");
  const a = placeEnemy(ctx, G, "mob", G.player.x + 1, G.player.y, { aggro: true });
  const b = placeEnemy(ctx, G, "mob", G.player.x - 1, G.player.y, { aggro: true });
  a.hp = 99; a.maxHp = 99; b.hp = 99; b.maxHp = 99;
  G.player.hp = 500;
  Engine.act(G, { t: "move", dx: 1, dy: 0 });
  t.ok(a.hp < 99 || a.dead, "主目标受击");
  t.eq(b.hp, a.hp, "溅射与主目标同伤");
}

/* F-06 长杆马刀：隔格直刺且不移动 */
{
  const G = fresh();
  G.relics.push("reach");
  const f = placeEnemy(ctx, G, "mob", G.player.x + 2, G.player.y, { aggro: true });
  f.hp = 99; f.maxHp = 99;
  const [x0, y0] = [G.player.x, G.player.y];
  Engine.act(G, { t: "move", dx: 1, dy: 0 });
  t.eq(f.hp, 97, "隔格直刺伤2");
  t.ok(G.player.x === x0 && G.player.y === y0, "刺而不移");
}

/* F-07 卧薪尝胆：受伤积怨、刀击消耗 */
{
  const G = fresh();
  G.relics.push("grudge");
  const foe = placeEnemy(ctx, G, "mob", G.player.x + 1, G.player.y, { aggro: true });
  foe.hp = 99; foe.maxHp = 99; foe.dmg = 1;
  Engine.act(G, { t: "wait" }); // 挨打积怨（1伤桩，999血无所谓）
  t.eq(G.player.st.grudge, 1, "受伤积怨1层");
  Engine.act(G, { t: "move", dx: 1, dy: 0 }); // 带怨还击
  t.eq(foe.hp, 96, "怨愤刀击+1（伤3）");
  t.ok(G.player.st.grudge >= 0 && G.player.st.grudge <= 2, "积怨层界内（敌反击可再积）");
}

/* F-08 锦绣夜行：每层首刀重置 */
{
  const G = fresh();
  G.relics.push("nightwalk");
  const a = placeEnemy(ctx, G, "mob", G.player.x + 1, G.player.y, { aggro: true });
  a.hp = 99; a.maxHp = 99;
  Engine.act(G, { t: "move", dx: 1, dy: 0 }); // 首刀+2
  t.eq(99 - a.hp, 4, "本层首刀+2（伤4）");
  Engine.enterFloor(G, 1);
  G.enemies = [];
  const b = placeEnemy(ctx, G, "mob", G.player.x + 1, G.player.y, { aggro: true });
  b.hp = 99; b.maxHp = 99;
  Engine.act(G, { t: "move", dx: 1, dy: 0 });
  t.eq(99 - b.hp, 4, "新层首刀重置再+2");
}

/* F-09 弃车保帅：崇国致命伤免死留血 */
{
  const G = fresh();
  const c = placeEnemy(ctx, G, "chongguo", G.player.x + 1, G.player.y, { aggro: true, boss: true });
  c.hp = 2; c.maxHp = 30;
  Engine.act(G, { t: "move", dx: 1, dy: 0 }); // 2伤 → 致命
  t.eq(c.dead, false, "免死触发未死");
  t.eq(c.hp, 4, "留1回3（4血）");
  t.eq(c.lethalUsed, true, "每场一次");
  Engine.act(G, { t: "move", dx: 1, dy: 0 });
  t.ok(c.hp <= 2 || c.dead, "第二次不再生效（4-2=2）");
}

/* F-10 点将 wonder 自带血祭三连 */
{
  const G = Engine.newRunState({ seed: "w", runnerId: "wonder", diffV: "normal", meta: {} });
  const xj = G.player.skills.find(s => s.id === "xueji");
  t.ok(!!xj, "wonder 有血祭");
  t.eq(xj.blood, 3, "三次翻倍与被动配套");
}

/* F-11 录技仅史官 */
{
  const G = Engine.newRunState({ seed: "z2", runnerId: "wanzhen", diffV: "normal", meta: {} });
  G.enemies = [];
  const [px, py] = [G.player.x, G.player.y];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) Grid.set(G.map, px + dx, py + dy, Grid.FLOOR);
  const foe = placeEnemy(ctx, G, "shenren", px + 1, py, { aggro: true });
  foe.hp = 1; foe.maxHp = 1;
  Engine.act(G, { t: "move", dx: 1, dy: 0 });
  t.ok(foe.dead, "斩敌");
  t.ok(!G.learned["shenren"], "非史官不录技");
}

/* F-12 杂兵掉钱 */
{
  const G = fresh();
  const foe = placeEnemy(ctx, G, "mob", G.player.x + 1, G.player.y, { aggro: true });
  foe.hp = 1; foe.maxHp = 1;
  const m0 = G.money;
  Engine.act(G, { t: "move", dx: 1, dy: 0 });
  t.ok(G.money >= m0 + 2, "杂兵掉2-3钱（" + (G.money - m0) + "）");
}

/* F-13 血祭下限与蓄力封顶 */
{
  const G = fresh();
  const p = G.player;
  p.hp = 18; G.enemies = [];
  Engine.act(G, { t: "skill", si: 0 }); // 18→9 emp2
  p.hp = 18;
  let guard = 12;
  while (p.skills[0].cdLeft > 0 && guard--) Engine.act(G, { t: "wait", auto: true });
  Engine.act(G, { t: "skill", si: 0 }); // 再祭 emp4（封顶）
  t.eq(p.st.emp, 4, "蓄力封顶4");
  p.hp = 1;
  const r0 = G.round;
  Engine.act(G, { t: "skill", si: 0 });
  t.eq(G.round, r0, "血1时血祭无效不耗时");
}

/* F-14 起义援军不压特殊格 */
{
  const G = Engine.newRunState({ seed: "up2", diffV: "normal", meta: {} });
  Engine.enterFloor(G, 3);
  G.floorDef = Object.assign({}, G.floorDef, { rule: "uprising" });
  const zc = G.enemies.find(u => u.boss);
  if (zc) {
    zc.hp = Math.floor(zc.maxHp / 2) - 1;
    for (let i = 0; i < 8; i++) Engine.act(G, { t: "wait", auto: true });
    const specials = [Grid.CHEST, Grid.SHOP, Grid.CAMPFIRE, Grid.TRAP];
    const bad = G.enemies.filter(u => !u.dead && u.chId === "mob" && specials.includes(Grid.at(G.map, u.x, u.y)));
    t.eq(bad.length, 0, "援军不站特殊格");
  } else t.ok(true, "（无琛可测）");
}

/* F-15 结算斩镇守去重 */
{
  const G = Engine.newRunState({ seed: "dd", diffV: "normal", meta: {} });
  G.bossKills = ["wonder", "wonder"];
  const s = Run.summarize(G);
  t.eq(s.bossKills.length, 1, "同镇守结算只写一次");
}

Engine.setTeleChance(1); // 复原
process.exit(t.done());
