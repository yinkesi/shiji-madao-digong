/* bug 猎手 · 一：不变量猴测
 * 随机合法动作轰炸引擎，每步后核对不变量；抓崩溃、NaN、穿墙、负数、软锁。 */
import { loadCore } from "./harness.mjs";

const ctx = loadCore();
const { Engine, Grid, Gen, DATA } = ctx.MDG;

const SEEDS = Array.from({ length: 40 }, (_, i) => "fuzz-" + i);
const violations = new Map(); // key -> {count, detail}
function V(key, detail) {
  const v = violations.get(key);
  if (v) { v.count++; if (v.count < 3) v.details.push(detail); }
  else violations.set(key, { count: 1, details: [detail] });
}

let totalTurns = 0, crashes = 0, floorsSeen = new Set(), overRuns = 0;

for (const seed of SEEDS) {
  const AR = ctx.MDG.RNG.make(seed + "|actions");
  const rnd = () => AR.next();
  let G;
  try { G = Engine.newRunState({ seed, runnerId: "yinkesi", diffV: seed.length % 5 === 0 ? "normal" : "easy", meta: { fist: 2, body: 2, purse: 1, blood: 1, guard: 1 } }); }
  catch (e) { V("crash:newRunState", seed + ": " + e.message); continue; }

  let turns = 0;
  while (!G.over && turns++ < 2500) {
    totalTurns++;
    const p = G.player;
    floorsSeen.add(G.floorIdx);
    try {
    /* 混合动作：85% 智能（test_bot 战术 + 下行），15% 随机扰动 */
    const roll = rnd();
    const p2 = G.player;
    const foes = Engine.livingEnemies(G).filter(u => u.chId !== "tree");
    const manh2 = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    const walkTo2 = (tx, ty) => {
      const st = Grid.stepToward(G.map, p2.x, p2.y, tx, ty, (x, y) => (!!Engine.unitAt(G, x, y) && !(x === tx && y === ty)) || [Grid.CHEST, Grid.SHOP].includes(Grid.at(G.map, x, y)));
      if (st) Engine.act(G, { t: "move", dx: st[0] - p2.x, dy: st[1] - p2.y });
      else Engine.act(G, { t: "wait" });
    };
    if (roll < 0.08) {
      const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rnd() * 4)];
      Engine.act(G, { t: "move", dx, dy });
    } else if (Engine.stairsOpenNow(G)) {
      walkTo2(G.map.stairs[0], G.map.stairs[1]);
    } else if (!foes.length) {
      /* 找镇守戳醒它 */
      const b = G.enemies.find(u => u.boss && !u.dead);
      if (b) walkTo2(b.x, b.y); else Engine.act(G, { t: "wait" });
    } else {
      const near = foes.slice().sort((a, b) => manh2(a, p2) - manh2(b, p2))[0];
      const hunters = foes.filter(u => u.aggro);
      if (p2.hp <= 14 && G.items.length) Engine.act(G, { t: "item", ii: 0 });
      else if (p2.hp <= 10 && hunters.length && manh2(hunters[0], p2) <= 5) {
        let best = null, bs = -1;
        for (const [dx, dy] of Grid.DIRS) {
          const nx = p2.x + dx, ny = p2.y + dy;
          if (!Grid.inB(G.map, nx, ny) || !Grid.walkable(G.map, nx, ny) || Engine.unitAt(G, nx, ny)) continue;
          if ([Grid.CHEST, Grid.CAMPFIRE, Grid.SHOP].includes(Grid.at(G.map, nx, ny))) continue;
          const sc = Math.min(...foes.map(u => manh2(u, { x: nx, y: ny })));
          if (sc > bs) { bs = sc; best = [dx, dy]; }
        }
        if (best) Engine.act(G, { t: "move", dx: best[0], dy: best[1] }); else Engine.act(G, { t: "wait" });
      } else if (manh2(near, p2) <= 1) {
        const wb = p2.st.emp === 0 && p2.skills[0].cdLeft === 0 && p2.hp >= 14;
        if (wb) Engine.act(G, { t: "skill", si: 0 });
        else Engine.act(G, { t: "move", dx: Math.sign(near.x - p2.x), dy: Math.sign(near.y - p2.y) });
      } else walkTo2(near.x, near.y);
    }
    if (G.player.hp <= 0 && !G.player.dead) {
      V("hp<=0:alive", `${seed} turn=${turns} hp=0 alive; 最近事件: ${JSON.stringify((G.ev||[]).filter(e=>["hit","poison","bottle","heal","camp","blood","die","dead"].includes(e.t)).slice(-8))}`);
    }
    } catch (e) {
      crashes++;
      V("crash:act", `seed=${seed} floor=${G.floorIdx} turn=${turns}: ${e.message}\n    ${String(e.stack).split("\n")[1]}`);
      break;
    }

    /* ---- 不变量核对 ---- */
    const units = [G.player, ...G.enemies].filter(u => u && !u.dead);
    for (const u of units) {
      const t = Grid.at(G.map, u.x, u.y);
      if (Number.isNaN(u.hp) || Number.isNaN(u.x) || Number.isNaN(u.y)) V("NaN:unit", `${seed} ${u.name}@${u.x},${u.y} hp${u.hp}`);
      if (u.hp > u.maxHp + 0.5) V("hp>max", `${seed} ${u.name} hp${u.hp}>${u.maxHp}`);
      if (u.hp <= 0 && !u.dead) V("hp<=0:alive", `${seed} ${u.name} hp${u.hp} 未判死`);
      if (t === Grid.WALL) V("unit-in-wall", `${seed} f${G.floorIdx} ${u.name}(${u.chId})@${u.x},${u.y} 嵌在墙里`);
      if (u.x < 0 || u.y < 0 || u.x >= G.map.w || u.y >= G.map.h) V("unit-oob", `${seed} ${u.name}@${u.x},${u.y}`);
    }
    if (!(G.money >= 0)) V("money<0", `${seed} money=${G.money}`);
    if (G.player.st.emp > 6) V("emp>6", `${seed} emp=${G.player.st.emp}`);
    for (const u of [G.player, ...G.enemies]) for (const s of (u.skills || [])) {
      if (s.cdLeft < 0 || Number.isNaN(s.cdLeft)) V("cd<0", `${seed} ${u.name} ${s.id} cd=${s.cdLeft}`);
    }
    for (const it of G.items) if (!(it.n >= 1)) V("item.n<1", `${seed} ${it.id} n=${it.n}`);
    if (new Set(G.relics).size !== G.relics.length) V("relic-dup", `${seed} ${G.relics.join(",")}`);
    if (G.over && !G.player.dead && !G.won) V("over:unexplained", `${seed} over 但人活着且未胜`);
    if (G.won !== (G.floorIdx >= DATA.FLOORS.length - 1 && G.over)) { /* 收卷只在九层 */ }
    if (G.won && G.floorIdx !== DATA.FLOORS.length - 1) V("win:wrongfloor", `${seed} 在第${G.floorIdx + 1}层胜了`);
    /* 敌人站在楼梯上（堵门）——连续计数 */
    for (const u of G.enemies) {
      if (!u.dead && u.x === G.map.stairs[0] && u.y === G.map.stairs[1]) V("enemy-on-stairs", `${seed} f${G.floorIdx} ${u.name} 停在楼梯上`);
    }
    /* 敌人站在史料/箱/灶/商上（堵互动） */
    for (const u of G.enemies) {
      if (!u.dead && [Grid.CHEST, Grid.CAMPFIRE, Grid.SHOP].includes(Grid.at(G.map, u.x, u.y))) V("enemy-on-special", `${seed} f${G.floorIdx} ${u.name}@${u.x},${u.y} 停在实体格上`);
    }
    /* 玩家所在格必须可通行（允许站楼梯/史料） */
    const pt = Grid.at(G.map, G.player.x, G.player.y);
    if (!Grid.walkable(G.map, G.player.x, G.player.y)) V("player-unwalkable", `${seed} f${G.floorIdx}@${G.player.x},${G.player.y} tile=${pt}`);
    /* 史官永不站在封闭区：楼梯必须可达 */
    const dfT = Grid.distField(G.map, G.player.x, G.player.y);
    if (dfT[G.map.stairs[1] * G.map.w + G.map.stairs[0]] < 0) V("stairs-unreachable-terrain", `${seed} f${G.floorIdx} 楼梯被地形围死（软锁）`);
    if (G.over) overRuns++;
  }
}

console.log(`猴测：${SEEDS.length} 局 × ≤500 动，共 ${totalTurns} 动，其中 ${overRuns} 局打完（终局）；异常崩溃 ${crashes} 次`);
console.log(`触及层数：[${[...floorsSeen].sort((a, b) => a - b).join(",")}]`);
if (!violations.size) { console.log("未发现不变量违例"); }
else {
  console.log(`发现 ${violations.size} 类违例：`);
  for (const [k, v] of violations) {
    console.log(`  ✗ ${k} ×${v.count}`);
    v.details.slice(0, 3).forEach(d => console.log(`      ${d}`));
  }
}
