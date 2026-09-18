/* 测试脚手架：把核心层 js 按依赖序灌进一个 vm 沙盒，返回带 MDG 的上下文。
 * 核心层不碰 DOM/window，所以在 Node 里 globalThis 即全局——完美直测。 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import vm from "vm";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");

export const CORE_FILES = ["js/rng.js", "js/grid.js", "js/data.js", "js/gen.js", "js/engine.js", "js/meta.js", "js/run.js"];

export function loadCore() {
  const ctx = { console };
  vm.createContext(ctx);
  for (const f of CORE_FILES) {
    vm.runInContext(readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  return ctx;
}

/* 断言小工具：计 fail 数，退出码非零即挂。 */
export function makeT(name) {
  let pass = 0, fail = 0;
  const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log(`  ✗ [${name}] ${msg}`); } };
  const eq = (a, b, msg) => ok(Object.is(a, b) || a === b, `${msg}（期待 ${b}，实得 ${a}）`);
  const done = () => { console.log(`${fail ? "✗" : "✓"} ${name}: ${pass} 过 / ${fail} 挂`); return fail; };
  return { ok, eq, done };
}

/* 找一块普通宫室地面（非特殊格），供摆放受控局面 */
export function findFloor(ctx, G, minDistFromPlayer = 0) {
  const { Grid } = ctx.MDG;
  for (let y = 1; y < G.map.h - 1; y++) for (let x = 1; x < G.map.w - 1; x++) {
    if (Grid.at(G.map, x, y) !== Grid.FLOOR) continue;
    if (ctx.MDG.Engine.unitAt(G, x, y)) continue;
    if (minDistFromPlayer && Math.abs(x - G.player.x) + Math.abs(y - G.player.y) < minDistFromPlayer) continue;
    return [x, y];
  }
  return null;
}

/* 造一个受控敌unit（纯数据对象，引擎只读写数据，无 realm 问题） */
export function placeEnemy(ctx, G, chId, x, y, opts = {}) {
  const ch = ctx.MDG.DATA.CH(chId);
  const unit = {
    uid: "t" + Math.random().toString(36).slice(2), chId,
    name: ch.name, glyph: ch.glyph, color: ch.color,
    side: "e", x, y, hp: ch.hp, maxHp: ch.hp, dmg: ch.dmg || 1,
    saw: ch.saw || 6, moveRange: (ch.passive && ch.passive.moveRange) || 1,
    passive: ch.passive || null, skills: [],
    st: { stun: 0, disarm: 0, poison: 0, shield: 0, emp: 0, grudge: 0, buffKnife: 0 },
    boss: !!opts.boss, elite: !!opts.elite, mob: !!ch.mob,
    aggro: !!opts.aggro, dead: false, lethalUsed: false, firstHitTaken: false, bossTag: null
  };
  if (ch.skill && ch.skill.kind !== "summon") unit.skills.push(Object.assign({ cdLeft: 0 }, ch.skill));
  (ch.skills || []).forEach(s => unit.skills.push(Object.assign({ cdLeft: 0 }, s)));
  G.enemies.push(unit);
  return unit;
}
