/* 地宫生成检查：九层 × 多种子，皆须连通、 entities 齐、确定性成立。 */
import { loadCore, makeT } from "./harness.mjs";

const ctx = loadCore();
const { Gen, DATA, Grid } = ctx.MDG;
const t = makeT("gen");

const SEEDS = ["alpha", "beta", "gamma", "delta", "s-2026"];
let allSane = true, allHaveBossSpot = true, allStairsFar = true, campAll = true, shopOk = true;

for (const def of DATA.FLOORS) {
  for (const seed of SEEDS) {
    const { map, places } = Gen.genFloor(seed + "|" + def.n, def);
    if (!Gen.sane(map)) allSane = false;
    if (!places.boss) allHaveBossSpot = false;
    if (!map.stairs) allStairsFar = false;
    if (!places.campfire) campAll = false;
    if (!!def.shop !== !!places.shop) shopOk = false;
    /* 实体格数量 */
    const kinds = { chest: 0, scroll: 0, camp: 0, shop: 0, stairs: 0, tree: 0 };
    for (let i = 0; i < map.tiles.length; i++) {
      const v = map.tiles[i];
      if (v === Grid.CHEST) kinds.chest++;
      else if (v === Grid.SCROLL) kinds.scroll++;
      else if (v === Grid.CAMPFIRE) kinds.camp++;
      else if (v === Grid.SHOP) kinds.shop++;
      else if (v === Grid.STAIRS) kinds.stairs++;
      else if (v === Grid.TREE) kinds.tree++;
    }
    if (kinds.stairs !== 1) { allStairsFar = false; console.log("  stairs!=1", def.name, seed); }
    if (kinds.camp !== 1) campAll = false;
    if (kinds.scroll < 1) { console.log("  no scroll", def.name, seed); allSane = false; }
    if (def.rule === "zhongshu" && kinds.tree < 2) { console.log("  trees<2", seed); allSane = false; }
  }
}
t.ok(allSane, "九层×五种子全连通（sane）");
t.ok(allHaveBossSpot, "镇守皆有落点");
t.ok(allStairsFar, "楼梯唯一且存在");
t.ok(campAll, "每层恰一座灶间");
t.ok(shopOk, "商摊有无随层配置（2/4/6/8 层有）");

/* 确定性：同种子两遍，瓦片全同 */
const def3 = DATA.FLOORS[2];
const m1 = Gen.genFloor("fixed-seed", def3);
const m2 = Gen.genFloor("fixed-seed", def3);
t.ok(JSON.stringify(m1.map.tiles) === JSON.stringify(m2.map.tiles), "同种子地宫逐格全同");

/* 精英落点数量与配方一致 */
const def5 = DATA.FLOORS[4];
const r5 = Gen.genFloor("elite-check", def5);
t.eq(r5.places.elites.length, def5.elites.length, "五层精英落点=配方数");

process.exit(t.done());
