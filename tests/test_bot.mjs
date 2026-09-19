/* 平衡哨兵：机器人试玩第一层，难度须可通关。
 * 战术：只打追来之敌；无人追则寻镇守；残血且无人追击则先食后歇；
 *       被围则退；血祭只予小怪与精英；梯开即行。 */
import { loadCore, makeT } from "./harness.mjs";

const ctx = loadCore();
const { Engine, Grid } = ctx.MDG;
const t = makeT("bot");

function findItem(G, pred) {
  for (let i = 0; i < G.items.length; i++) if (pred(G.items[i].id)) return i;
  return -1;
}
const manh = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

function walkTo(G, tx, ty, extraBlock) {
  const p = G.player;
  const s = Grid.stepToward(G.map, p.x, p.y, tx, ty, (x, y) =>
    (!!Engine.unitAt(G, x, y) && !(x === tx && y === ty)) ||
    [Grid.CHEST, Grid.SHOP, Grid.TRAP].includes(Grid.at(G.map, x, y)) ||
    (extraBlock ? extraBlock(x, y) : false));
  if (s) { Engine.act(G, { t: "move", dx: s[0] - p.x, dy: s[1] - p.y }); return true; }
  Engine.act(G, { t: "wait" });
  return true;
}

function botAct(G, cf) {
  const p = G.player;
  const foes = Engine.livingEnemies(G).filter(u => u.chId !== "tree");
  /* 零、梯开则下行——斩镇守即走，不恋战 */
  if (Engine.stairsOpenNow(G)) {
    return walkTo(G, G.map.stairs[0], G.map.stairs[1]);
  }
  if (!foes.length) return false;
  const byD = (a, b) => manh(a, p) - manh(b, p);
  // 同距时先打血上限低者（清掉拉仇恨的小怪再单挑镇守）
  const byD2 = (a, b) => manh(a, p) - manh(b, p) || a.maxHp - b.maxHp;
  const hunters = foes.filter(u => u.aggro).sort(byD2);     // 正在追我的
  const sleeper = foes.filter(u => !u.aggro).sort(byD);     // 还睡着的
  const nearest = hunters[0] || sleeper[0];
  /* 一、重伤先食；无人追击且血不满也食（备战） */
  {
    const quiet = foes.every(u => manh(u, p) >= 4);
    if (p.hp <= 10 || (quiet && p.hp < p.maxHp - 5)) {
      const ii = findItem(G, id => id === "fantuan" || id === "mantou");
      if (ii >= 0) { Engine.act(G, { t: "item", ii }); return true; }
    }
  }
  /* 一·五、镇守贴身战中：有余粮先吃一口再换血 */
  if (nearest.boss && manh(nearest, p) <= 1 && p.hp <= p.maxHp - 2) {
    const ii = findItem(G, id => id === "fantuan" || id === "mantou");
    if (ii >= 0) { Engine.act(G, { t: "item", ii }); return true; }
  }
  /* 二、贴身即战（血祭予小怪与精英，镇守不值） */
  if (manh(nearest, p) <= 1) {
    const wantBlood = p.st.emp === 0 && p.skills[0].cdLeft === 0 &&
      (nearest.chId === "mob" ? p.hp >= 14 : (!nearest.boss && p.hp >= 12));
    if (wantBlood) { Engine.act(G, { t: "skill", si: 0 }); return true; }
    Engine.act(G, { t: "move", dx: Math.sign(nearest.x - p.x), dy: Math.sign(nearest.y - p.y) });
    return true;
  }
  /* 三、残血有追兵：坚决脱离（借断视脱仇，甩尾后再歇） */
  if (p.hp <= 9 && hunters.length && hunters[0] && manh(hunters[0], p) <= 5) {
    let best = null, bs = -1;
    for (const [dx, dy] of Grid.DIRS) {
      const nx = p.x + dx, ny = p.y + dy;
      if (!Grid.inB(G.map, nx, ny) || !Grid.walkable(G.map, nx, ny)) continue;
      if (Engine.unitAt(G, nx, ny)) continue;
      const tv = Grid.at(G.map, nx, ny);
      if ([Grid.CHEST, Grid.CAMPFIRE, Grid.SHOP].includes(tv)) continue;
      const s = Math.min(...foes.map(u => manh(u, { x: nx, y: ny })));
      if (s > bs) { bs = s; best = [dx, dy]; }
    }
    if (best) { Engine.act(G, { t: "move", dx: best[0], dy: best[1] }); return true; }
  }
  /* 四、无追兵且血不满八成：去灶间 */
  if (cf && !G.campUsed && p.hp < p.maxHp * 0.95 && !hunters.length) {
    return walkTo(G, cf[0], cf[1]);
  }
  /* 五、有追兵打追兵；无则寻镇守（戳醒它，让它来） */
  return walkTo(G, nearest.x, nearest.y);
}

function botFloor(seed, diffV, maxTurns = 900) {
  const G = Engine.newRunState({ seed, runnerId: "yinkesi", diffV, meta: {} });
  let cf = null;
  for (let y = 0; y < G.map.h && !cf; y++) for (let x = 0; x < G.map.w && !cf; x++)
    if (Grid.at(G.map, x, y) === Grid.CAMPFIRE) cf = [x, y];
  let turns = 0;
  while (!G.over && turns++ < maxTurns) {
    if (!botAct(G, cf)) break;
    if (G.floorIdx === 1) break; // 下行即胜
    if (G.campUsed) cf = null;
  }
  return G;
}

/* 十种子采样：easy ≥7/10，normal ≥6/10 */
const seeds = ["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8", "b9", "b10"];
let easyWin = 0, normWin = 0;
for (const s of seeds) { const G = botFloor("bot-" + s, "easy"); if (G.floorIdx === 1 && !G.over) easyWin++; }
for (const s of seeds) { const G = botFloor("bot-" + s, "normal"); if (G.floorIdx === 1 && !G.over) normWin++; }
console.log(`  bot 一层通过率：easy ${easyWin}/10，normal ${normWin}/10`);
t.ok(easyWin >= 7, "简单档一层贪心可过（≥7/10）");
t.ok(normWin >= 6, "普通档一层贪心基本可过（≥6/10）");

process.exit(t.done());
