/* RNG 检查：可播种、可续局、边界正确。 */
import { loadCore, makeT } from "./harness.mjs";

const ctx = loadCore();
const { RNG } = ctx.MDG;
const t = makeT("rng");

/* 同种子同序列 */
const a = RNG.make("seed-A"), b = RNG.make("seed-A");
let same = true;
for (let i = 0; i < 100; i++) if (a.next() !== b.next()) { same = false; break; }
t.ok(same, "同种子必同序列");

/* 异种子异序列 */
const c = RNG.make("seed-B"), d = RNG.make("seed-C");
let diff = false;
for (let i = 0; i < 20; i++) if (c.next() !== d.next()) { diff = true; break; }
t.ok(diff, "异种子应异序列");

/* int 边界 */
const e = RNG.make(42);
let inRange = true;
for (let i = 0; i < 500; i++) { const v = e.int(3, 7); if (v < 3 || v > 7 || !Number.isInteger(v)) inRange = false; }
t.ok(inRange, "int(3,7) 全在界内且为整数");

/* state 续局：from(state) 与原序列无缝相接 */
const f = RNG.make("continue-me");
f.next(); f.next(); f.next();
const g = RNG.from({ a: f.state.a });
t.ok(g.next() === f.next(), "from(state) 续上随机序列");

/* shuffle 保元素 */
const arr = [1, 2, 3, 4, 5, 6, 7];
const sh = RNG.make("sh").shuffle(arr);
t.ok(sh.slice().sort((x, y) => x - y).join() === arr.join(), "shuffle 不丢元素");
t.ok(arr.join() === "1,2,3,4,5,6,7", "shuffle 不改原数组");

process.exit(t.done());
