/* 敌方 AI 审计：仇恨链完整、远程不振荡、失明才弃追 */
import { loadCore, makeT, placeEnemy } from "./harness.mjs";

const ctx = loadCore();
const { Engine, Grid } = ctx.MDG;
const t = makeT("ai");

function fresh() {
  const G = Engine.newRunState({ seed: "ai-" + Math.floor(Math.random() * 1e9), runnerId: "yinkesi", diffV: "normal", meta: {} });
  G.enemies = [];
  G.player.hp = 999;
  return G;
}

/* 1. 远程敌看得见你 → 永不弃追、每轮都在行动（修振荡 bug：24 轮零 lost 事件） */
{
  const G = fresh();
  // 挑一块与玩家有视线、距 3-4 的落点（不赌随机地图）
  let spot = null;
  for (let y = 1; y < G.map.h - 1 && !spot; y++) for (let x = 1; x < G.map.w - 1 && !spot; x++) {
    const d = Math.abs(x - G.player.x) + Math.abs(y - G.player.y);
    if (d >= 3 && d <= 4 && Grid.at(G.map, x, y) === Grid.FLOOR && Grid.los(G.map, x, y, G.player.x, G.player.y)) spot = [x, y];
  }
  t.ok(!!spot, "测1：存在有视线的落点");
  if (!spot) { process.exit(t.done()); }
  const w = placeEnemy(ctx, G, "wenbin", spot[0], spot[1], { aggro: false }); // 弹簧纸箭射程4
  let lostEvents = 0, actedRounds = 0;
  for (let i = 0; i < 24; i++) {
    const hp0 = G.player.hp;
    const evs = Engine.act(G, { t: "wait" });
    lostEvents += evs.filter(e => e.t === "lost" && e.uid === w.uid).length;
    /* 行动 = 移动/施技/对玩家造成任何伤害（含普攻） */
    if (evs.some(e => (e.t === "emove" && e.uid === w.uid) || e.t === "skill") || G.player.hp < hp0) actedRounds++;
    if (w.aggro === false) { lostEvents += 99; }
  }
  t.eq(lostEvents, 0, "看得见你时永不弃追（无 lost）");
  t.ok(actedRounds >= 20, "远程敌每轮都在行动（24 轮中行动 " + actedRounds + "）");
}

/* 2. 真失明才弃追：视线断绝 6 回合 → 弃追 */
{
  const G = fresh();
  const f = placeEnemy(ctx, G, "mob", G.player.x + 1, G.player.y, { aggro: true });
  f.saw = 0; // seen 判定收窄为近身，远处必失明
  Engine.act(G, { t: "wait" }); // 惊动确立
  t.eq(f.aggro, true, "惊动成立");
  // 把玩家瞬移到远处（≥13 格——记忆期 6 轮内它最多追近 6 格，须始终看不见）
  let far = null;
  for (let y = 1; y < G.map.h - 1 && !far; y++) for (let x = 1; x < G.map.w - 1 && !far; x++) {
    if (Grid.at(G.map, x, y) === Grid.FLOOR && Math.abs(x - f.x) + Math.abs(y - f.y) >= 13) far = [x, y];
  }
  if (far) {
    G.player.x = far[0]; G.player.y = far[1];
    let lost = false;
    for (let i = 0; i < 10 && !lost; i++) {
      const evs = Engine.act(G, { t: "wait" });
      lost = lost || evs.some(e => e.t === "lost") || f.aggro === false;
    }
    t.ok(lost, "失明 6 回合内弃追");
  } else t.ok(true, "（无远格可测，跳过）");
}

/* 3. 邻接必出手：贴身惊动之敌待机轮必攻击（不因巡逻/技能吞掉攻击） */
{
  let attacked = 0;
  for (let k = 0; k < 5; k++) {
    const G = fresh();
    const f = placeEnemy(ctx, G, "mob", G.player.x + 1, G.player.y, { aggro: true });
    const hp0 = G.player.hp;
    Engine.act(G, { t: "wait" });
    if (G.player.hp < hp0 || f.dead) attacked++;
  }
  t.ok(attacked === 5, "贴身敌 5/5 必出手（实得 " + attacked + "）");
}

/* 4. 走位链：远处之敌逐轮逼近（雕一条直廊，路径确定） */
{
  const G = fresh();
  const [px, py] = [G.player.x, G.player.y];
  for (let x = px + 2; x <= px + 7 && x < G.map.w - 1; x++) Grid.set(G.map, x, py, Grid.FLOOR);
  const f = placeEnemy(ctx, G, "mob", px + 6, py, { aggro: true });
  f.saw = 0;
  f.aggro = true;
  const d0 = Math.abs(f.x - px) + Math.abs(f.y - py);
  for (let i = 0; i < 3; i++) Engine.act(G, { t: "wait" });
  const d1 = Math.abs(f.x - px) + Math.abs(f.y - py);
  t.ok(d1 < d0, "追击链有效（" + d0 + "→" + d1 + "）");
}

/* 5. 群体不互踩：同回合多敌行动后无重叠 */
{
  const G = fresh();
  const a = placeEnemy(ctx, G, "mob", G.player.x + 3, G.player.y, { aggro: true });
  const b = placeEnemy(ctx, G, "mob", G.player.x, G.player.y + 3, { aggro: true });
  a.aggro = b.aggro = true; a.saw = b.saw = 0;
  for (let i = 0; i < 3; i++) Engine.act(G, { t: "wait" });
  const seen = new Set();
  let overlap = false;
  for (const u of G.enemies) {
    if (u.dead) continue;
    const k = u.x + "," + u.y;
    if (seen.has(k)) overlap = true;
    seen.add(k);
  }
  t.ok(!overlap, "敌人位置互斥（无重叠）");
}

process.exit(t.done());
