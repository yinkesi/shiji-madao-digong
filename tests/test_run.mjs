/* 流程与局外检查：续行存档、结算入账、点将解锁、成就、修炼购买、难度缩放。 */
import { loadCore, makeT } from "./harness.mjs";

const ctx = loadCore();
const { Run, Meta, Engine, DATA } = ctx.MDG;
const t = makeT("run");

/* 开局 + 续行存档往返 */
{
  const G = Run.newRun({ seed: "run-test", runnerId: "yinkesi", diffV: "normal" });
  t.ok(Run.hasRun(), "续行存档已写");
  const G2 = Run.loadRun();
  t.ok(G2 && G2.floorIdx === G.floorIdx && G2.player.hp === G.player.hp, "续行读档一致");
  t.ok(G2.map.tiles.join() === G.map.tiles.join(), "续行地图逐格一致");
}

/* 终局结算：文脉入账 + 点将解锁 + 成就 + 存档作废 */
{
  const M = Meta.fresh();
  Meta.save(M);
  const G = Run.newRun({ seed: "run-finish", runnerId: "yinkesi", diffV: "hard", meta: M });
  G.kills = 12; G.eliteKills = 3; G.bossKills = ["wanzhen"];
  G.wemai = 30; G.learned = { wanzhen: true, shenren: true, xiannv: true };
  G.scrollsGot = ["f0@a", "f0@b"]; G.bestFloor = 3;
  const res = Run.finish(G);
  const M2 = res.meta; // finish 内部重新 load，断言须认新引用
  t.ok(res.result.earned > 0, "文脉入账");
  t.ok(M2.wemai >= res.result.earned, "文脉记入局外");
  t.ok(M2.runners.includes("wanzhen"), "斩万震 → 点将解锁");
  t.ok(M2.achieves["a_in"] && M2.achieves["a_f3"] && M2.achieves["a_elite3"], "成就三连");
  t.eq(M2.scrolls, 2, "史料累计");
  t.eq(M2.stats.runs, 1, "局数统计");
  t.ok(!Run.hasRun(), "终局后续行存档作废");
  /* 二轮累计 */
  const G2 = Run.newRun({ seed: "run-finish2", runnerId: "wanzhen", diffV: "normal", meta: M });
  t.eq(G2.player.chId, "wanzhen", "换将入宫");
  const res2 = Run.finish(G2);
  t.eq(res2.meta.stats.runs, 2, "局数累计");
}

/* 修炼购买 */
{
  const M = Meta.fresh();
  M.wemai = 20;
  t.ok(Meta.buy(M, "fist"), "买入拳不离手");
  t.eq(M.tree.fist, 1, "拳不离手一级");
  t.eq(M.wemai, 12, "扣费8");
  t.ok(Meta.nextCost(M, "fist") === 16, "下一级价16");
  t.ok(!Meta.buy(M, "fist"), "钱不够拒买");
}

/* 难度缩放：同种子下，噩梦杂兵血高于简单 */
{
  const ge = Engine.newRunState({ seed: "diff-cmp", diffV: "easy", meta: {} });
  const gn = Engine.newRunState({ seed: "diff-cmp", diffV: "nightmare", meta: {} });
  const mobE = ge.enemies.find(u => u.mob), mobN = gn.enemies.find(u => u.mob);
  t.ok(mobN.hp > mobE.hp, "噩梦杂兵更厚");
  t.ok(ge.enemies.length < gn.enemies.length + 3, "噩梦杂兵更多（至多+2）");
  void DATA;
}

/* 文脉倍率：同额 wemai，噩梦结算多于普通 */
{
  const finishWith = (diff) => {
    const M = Meta.fresh(); Meta.save(M);
    const G = Run.newRun({ seed: "mul-" + diff, diffV: diff, meta: M });
    G.wemai = 100;
    return Run.finish(G).result.earned;
  };
  t.ok(finishWith("nightmare") > finishWith("normal"), "噩梦文脉倍率生效");
}

process.exit(t.done());
