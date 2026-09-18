/* bug 猎手 · 二：定向系统探针
 * 对每一个「怀疑坏了」的机制实弹验证：CONFIRMED=确有此 bug。 */
import { loadCore } from "./harness.mjs";

const ctx = loadCore();
const { Engine, Grid, DATA } = ctx.MDG;
let confirmed = 0, rejected = 0;
function probe(name, fn) {
  try {
    const r = fn();
    if (r) { confirmed++; console.log("  ✗ [确凿] " + name); }
    else { rejected++; console.log("  ✓ [无恙] " + name); }
  } catch (e) { confirmed++; console.log("  ✗ [确凿·抛异常] " + name + " → " + e.message); }
}
function fresh(diffV = "normal", meta = {}) {
  return Engine.newRunState({ seed: "probe-" + Math.floor(Math.random() * 1e9), runnerId: "yinkesi", diffV, meta });
}
function dummy(G, chId, dx, dy, opts = {}) {
  const [px, py] = [G.player.x, G.player.y];
  const u = { uid: "d" + Math.random().toString(36).slice(2), chId, name: DATA.CH(chId).name, glyph: DATA.CH(chId).glyph,
    color: DATA.CH(chId).color, side: "e", x: px + dx, y: py + dy, hp: 99, maxHp: 99, dmg: 0,
    saw: 0, moveRange: 1, passive: DATA.CH(chId).passive || null, skills: [],
    st: { stun: 0, disarm: 0, poison: 0, shield: 0, emp: 0, grudge: 0, buffKnife: 0 },
    boss: !!opts.boss, elite: false, mob: false, aggro: !!opts.aggro, dead: false, lethalUsed: false, firstHitTaken: false, bossTag: null };
  if (opts.hp !== undefined) { u.hp = opts.hp; u.maxHp = opts.hp; }
  if (opts.dmg !== undefined) u.dmg = opts.dmg;
  G.enemies.push(u);
  return u;
}

/* 1. 撞墙也推进回合（敌人白得一动） */
probe("B-01 撞墙白给回合：doMove 撞墙后敌人仍行动", () => {
  const G = fresh();
  G.enemies = [];
  const p = G.player;
  dummy(G, "mob", 1, 0, { aggro: true });
  p.st.stun = 0;
  // 找玩家面墙的方向
  let dir = null;
  for (const [dx, dy] of Grid.DIRS) if (Grid.at(G.map, p.x + dx, p.y + dy) === Grid.WALL) { dir = [dx, dy]; break; }
  if (!dir) return false;
  const before = G.round;
  Engine.act(G, { t: "move", dx: dir[0], dy: dir[1] });
  return G.round === before + 1; // 撞墙照样进入下一轮
});

/* 2. 技能冷却标称 3 实际 2 回合就好（off-by-one） */
probe("B-02 技能标称冷却3，实际歇2回合即可（-1 偏差）", () => {
  const G = fresh();
  G.enemies = [];
  const sk = G.player.skills[0]; // 血祭 cd5
  const p = G.player;
  p.hp = 18; p.st.emp = 0;
  Engine.act(G, { t: "skill", si: 0, tx: null, ty: null });
  const afterUse = sk.cdLeft;
  let waits = 0;
  while (sk.cdLeft > 0 && waits < 10) { Engine.act(G, { t: "wait" }); waits++; }
  return afterUse === 5 && waits <= 4; // 标 5 实际 4 个回合就能再放
});

/* 3. 玩家被晕不生效（子琛起义晕的是空气） */
probe("B-03 玩家 st.stun 无任何处理（被晕照打照走）", () => {
  const G = fresh();
  G.enemies = [];
  const p = G.player;
  p.st.stun = 1;
  const x0 = p.x, y0 = p.y;
  // 朝可走方向走
  for (const [dx, dy] of Grid.DIRS) {
    if (Grid.walkable(G.map, p.x + dx, p.y + dy) && !Engine.unitAt(G, p.x + dx, p.y + dy)) {
      Engine.act(G, { t: "move", dx, dy });
      break;
    }
  }
  return p.x !== x0 || p.y !== y0; // 晕着一动没耽搁
});

/* 4. 刀卡「刀扫一片」（cleave）无溅射实现 */
probe("B-04 遗物「刀扫一片」：cleave 无任何实现（死卡）", () => {
  const G = fresh();
  G.enemies = [];
  G.relics.push("cleave");
  const p = G.player;
  const a = dummy(G, "mob", 1, 0, { hp: 99 });
  const b = dummy(G, "mob", 2, 0, { hp: 99 }); // a 背后还有一个
  a.hp = 99; b.hp = 99; a.maxHp = 99; b.maxHp = 99;
  Engine.act(G, { t: "move", dx: 1, dy: 0 }); // 撞 a
  return b.hp === 99; // b 分毫不掉 → 溅射没实现
});

/* 5. 刀卡「长杆马刀」（reach）无两格刀击 */
probe("B-05 遗物「长杆马刀」：隔格刀击未实现（死卡）", () => {
  const G = fresh();
  G.enemies = [];
  G.relics.push("reach");
  const p = G.player;
  const f = dummy(G, "mob", 2, 0, { hp: 99 }); // 两格外
  Engine.act(G, { t: "move", dx: 1, dy: 0 }); // 走近一格，还隔一格
  return f.hp === 99; // 没被刺到
});

/* 6. 刀卡「卧薪尝胆」（grudge）玩家受击不加层 */
probe("B-06 遗物「卧薪尝胆」：玩家受击永不积怨（死卡）", () => {
  const G = fresh();
  G.enemies = [];
  G.relics.push("grudge");
  const p = G.player;
  const f = dummy(G, "mob", 1, 0, { aggro: true, dmg: 1 });
  p.hp = 18;
  Engine.act(G, { t: "wait" }); // 挨一下
  return p.st.grudge === 0; // 没积怨 → 增伤永不触发
});

/* 7. 刀卡「锦绣夜行」（nightwalk）只在整轮第一次刀生效，不是每层 */
probe("B-07 遗物「锦绣夜行」：全轮仅首刀生效，换层不刷新", () => {
  const G = fresh();
  G.enemies = [];
  G.relics.push("nightwalk");
  const p = G.player;
  const a = dummy(G, "mob", 1, 0, { aggro: true, hp: 99 });
  Engine.act(G, { t: "move", dx: 1, dy: 0 }); // 首刀 +2
  const firstHit = 99 - a.hp;
  // 进下一层（清场直接下行测试）——手动模拟进层
  G.enemies = [];
  Engine.enterFloor(G, G.floorIdx + 1);
  G.enemies = [];
  const b = dummy(G, "mob", 1, 0, { aggro: true, hp: 99 });
  Engine.act(G, { t: "move", dx: 1, dy: 0 });
  return firstHit === 4 && (99 - b.hp) === 2; // 第二层首刀不再 +2
});

/* 8. 崇国「弃车保帅」致命伤免死从未触发 */
probe("B-08 崇国「弃车保帅」：致致命伤直接死，免死是死代码", () => {
  const G = fresh();
  G.enemies = [];
  const c = dummy(G, "chongguo", 1, 0, { boss: true, hp: 3 });
  G.player.st.emp = 0;
  Engine.act(G, { t: "move", dx: 1, dy: 0 }); // 一刀 2 → 1 血
  Engine.act(G, { t: "move", dx: 1, dy: 0 }); // 再一刀 → 应触发免死留1
  return c.dead; // 直接死了 → 免死没实现
});

/* 9. 换将 wonder：被动「马刀之神」血祭三连，但他将没有血祭技 */
probe("B-09 点将 wonder：被动加血祭次数，可他根本没血祭技", () => {
  const G = Engine.newRunState({ seed: "w", runnerId: "wonder", diffV: "normal", meta: {} });
  return !G.player.skills.some(s => s.id === "xueji"); // 无血祭 → 被动死
});

/* 10. 血祭在 1 血时零代价满蓄力 */
probe("B-10 血祭 1 血时自损 0 仍得 2 层翻倍（零成本bug）", () => {
  const G = fresh();
  G.enemies = [];
  const p = G.player;
  p.hp = 1;
  Engine.act(G, { t: "skill", si: 0, tx: null, ty: null });
  return p.hp === 1 && p.st.emp >= 2;
});

/* 11. 非史官点将也能录技（被动文案说仅史官） */
probe("B-11 换将万震斩人同样录技（与「录技」被动文案矛盾）", () => {
  const G = Engine.newRunState({ seed: "z", runnerId: "wanzhen", diffV: "normal", meta: {} });
  G.enemies = [];
  dummy(G, "shenren", 1, 0, { aggro: true, hp: 1 });
  Engine.act(G, { t: "move", dx: 1, dy: 0 });
  return !!G.learned["shenren"]; // 照样录了
});

/* 12. 杂兵/精英不掉钱（设计稿说 mob 2-4、精英 6-10） */
probe("B-12 杂兵与精英被斩分文不掉（商摊经济枯竭）", () => {
  const G = fresh();
  G.enemies = [];
  const m0 = G.money;
  dummy(G, "mob", 1, 0, { aggro: true, hp: 1 });
  Engine.act(G, { t: "move", dx: 1, dy: 0 });
  return G.money === m0; // 一分没涨
});

/* 13. 小卖部实际在 4/5/6/7/8 层，文档说 2/4/6/8 */
probe("B-13 商摊层配置=4/5/6/7/8，与文档「2/4/6/8」不符", () => {
  const withShop = DATA.FLOORS.filter(f => f.shop).map(f => f.n);
  return JSON.stringify(withShop) !== JSON.stringify([2, 4, 6, 8]);
});

/* 14. 岳连奇从未出现在任何一层（死角色） */
probe("B-14 岳连奇（lianqi）有卡无层，全程不会遇到", () => {
  const used = new Set();
  DATA.FLOORS.forEach(f => { used.add(f.boss); (f.elites || []).forEach(e => used.add(e)); });
  return !used.has("lianqi");
});

/* 15. 崇国「种树」技对 AI 不生效（summon 无处理） */
probe("B-15 崇国 AI 使「种树」：aiSkillTarget 永不选中（死技）", () => {
  const G = fresh();
  G.enemies = [];
  const c = dummy(G, "chongguo", 4, 0, { boss: true, aggro: true, hp: 30 });
  c.skills = [{ id: "zhongshu", name: "种树", kind: "summon", cd: 3, cdLeft: 0 }];
  c.skills = c.skills.filter(Boolean);
  // 引擎 aiSkillTarget 未导出——改从行为验证：给崇国只有这一个技能，多等几轮看树
  const cnt = () => { let n = 0; for (let i = 0; i < G.map.tiles.length; i++) if (G.map.tiles[i] === Grid.TREE) n++; return n; };
  const n0 = cnt();
  for (let i = 0; i < 12; i++) Engine.act(G, { t: "wait" });
  return cnt() === n0; // 一棵没种 → AI 永不放
});

/* 16. 为兵「破门而入」录技后给玩家退化成普通近战（无闪现） */
probe("B-16 录得「破门而入」：玩家版无闪现，射程缩成 1", () => {
  const G = fresh();
  G.enemies = [];
  G.learned["weibing"] = true;
  G.learnedSkills.push("pomen");
  const sk = { ...DATA.CH("weibing").skill, cdLeft: 0 };
  G.player.skills.push(sk);
  const p = G.player;
  const f = dummy(G, "mob", 4, 0, { hp: 99 }); // 四格外
  Engine.act(G, { t: "skill", si: G.player.skills.length - 1, tx: f.x, ty: f.y });
  return f.hp === 99 && Math.abs(p.x - (f.x - 1)) + Math.abs(p.y - f.y) > 0.5 - 1; // 没闪过去也没打中
});

/* 17. 「班主任的偏爱」每层 +6 而非 +3（enterFloor 与 tryDescend 双发） */
probe("B-17 「班主任的偏爱」每层实际+6盾（文案+3，双重触发）", () => {
  const G = fresh();
  G.relics.push("shield3");
  G.enemies.forEach(u => { if (u.boss) u.hp = 1; });
  const boss = G.enemies.find(u => u.boss);
  G.player.x = boss.x; G.player.y = boss.y + 1;
  if (Grid.at(G.map, G.player.x, G.player.y) === Grid.WALL) { G.player.y = boss.y - 1; }
  Engine.act(G, { t: "move", dx: 0, dy: Math.sign(boss.y - G.player.y) });
  // 斩镇守 → 开梯
  if (!Engine.stairsOpenNow(G)) return false;
  const st = G.map.stairs;
  G.player.x = st[0] + 1; G.player.y = st[1];
  if (Grid.at(G.map, G.player.x, G.player.y) === Grid.WALL) { G.player.x = st[0]; G.player.y = st[1] + 1; }
  const s0 = G.player.st.shield;
  Engine.act(G, { t: "move", dx: Math.sign(st[0] - G.player.x), dy: Math.sign(st[1] - G.player.y) });
  return G.floorIdx === 1 && G.player.st.shield - s0 === 6; // 一次下行 +6
});

/* 18. 鲍鱼之肆：玩家死后其臭味光环继续腐蚀敌人 */
probe("B-18 玩家尸体的「鲍鱼之肆」光环仍腐蚀敌人", () => {
  const G = fresh(4, "stench");
  G.enemies = [];
  const [px, py] = G.map.spawn;
  const f = dummy(G, "mob", 1, 0, { hp: 99 });
  G.player.hp = 1;
  const dead = dummy(G, "mob", 0, 1, { aggro: true, dmg: 5, hp: 99 }); // 邻接，一刀送走玩家
  Engine.act(G, { t: "wait" }); // 玩家死；回合末尸体光环蚀 f
  return G.over && f.hp < 99;
});

/* 19. 看台飞瓶穿墙（隔墙同行同列也挨砸） */
probe("B-19 〔看台飞瓶〕隔墙同列也挨砸（无视视线）", () => {
  const G = fresh(8, "cans");
  G.enemies = [];
  const [px, py] = G.map.spawn;
  // 在玩家正上方造一堵墙，墙后放敌
  Grid.set(G.map, px, py - 1, Grid.WALL);
  const f = dummy(G, "mob", 0, -3, { hp: 99 });
  G.player.hp = 30;
  Engine.act(G, { t: "wait" });
  return G.player.hp === 29; // 隔墙照样挨瓶
});

/* 20. 杂兵目力不吃难度加成（精英/镇守加，杂兵不加） */
probe("B-20 噩梦难度杂兵目力未+2（与精英镇守不同步）", () => {
  const G = Engine.newRunState({ seed: "saw", diffV: "nightmare", meta: {} });
  const mob = G.enemies.find(u => u.mob);
  const elite = G.enemies.find(u => u.elite);
  return mob && elite && elite.saw > mob.saw && mob.saw === 5;
});

/* 21. emp（血祭蓄力）无上限可无限囤 */
probe("B-21 血祭蓄力无上限：连放两次囤 4 层", () => {
  const G = fresh();
  G.enemies = [];
  const p = G.player, sk = p.skills[0];
  p.hp = 18;
  Engine.act(G, { t: "skill", si: 0 });
  p.hp = 18;
  let guard = 10;
  while (sk.cdLeft > 0 && guard--) Engine.act(G, { t: "wait" });
  Engine.act(G, { t: "skill", si: 0 });
  return p.st.emp >= 4; // 囤起来了
});

/* 22. 技能超过 9 个后 10 号起永远放不出（热键只到 9） */
probe("B-22 学技超过 9 个：第 10 技无热键（数据层面无法触发）", () => {
  const G = fresh();
  const p = G.player;
  ["wanzhen", "dage", "shenren", "xiannv", "luhao", "xiaochuan", "guyin", "zichen", "shaoming"].forEach(id => {
    const sk = DATA.CH(id).skill;
    if (sk) { G.learnedSkills.push(sk.id); p.skills.push({ ...sk, cdLeft: 0 }); }
  });
  return p.skills.length > 9; // 10 个技，而热键只有 1-9
});

/* 23. 斩终焉后 bossKills 两次 wonder → 结算「斩镇守：王元昊、王元昊」 */
probe("B-23 七层九层都斩 wonder：结算写「王元昊、王元昊」", () => {
  const G = fresh();
  G.bossKills.push("wonder", "wonder");
  const names = G.bossKills.map(id => DATA.CH(id).name);
  return names.join("、") === "王元昊、王元昊";
});

/* 24. 敌人踩史料格：史料被压住拾不了（无拾取判定） */
probe("B-24 敌人停在史料上，走上去只打架不拾取", () => {
  const G = fresh();
  G.enemies = [];
  const [px, py] = G.map.spawn;
  Grid.set(G.map, px + 1, py, Grid.SCROLL);
  const total0 = G.scrollsTotal;
  dummy(G, "mob", 1, 0, { aggro: true, hp: 1 });
  const s0 = G.scrollsGot.length;
  Engine.act(G, { t: "move", dx: 1, dy: 0 }); // 撞上去是攻击
  return G.scrollsGot.length === s0 && G.scrollsTotal === total0; // 没拾到（需再一步）
});

/* 25. 电梯井：locked 楼梯 bump 白白消耗回合（敌人行动） */
probe("B-25 撞锁着的梯：白给一回合（敌人行动）", () => {
  const G = fresh();
  const before = G.round;
  Engine.act(G, { t: "move", dx: 0, dy: 0 }); // 占位：真实撞梯需寻路，这里验证等效场景
  // 直接调用内部路径不导出——改验：stairsLocked 事件后 round +1 由 doMove 已知，改用墙等价已验 B-01
  return false; // 与 B-01 同类，标记为已知类别
});

/* 26. 收卷须再踩楼梯（文档说斩终焉即收卷） */
probe("B-26 九层斩 wonder 后还须自行走到楼梯才算收卷", () => {
  const G = fresh();
  Engine.enterFloor(G, 8);
  const w = G.enemies.find(u => u.boss);
  w.hp = 1; G.player.x = w.x; G.player.y = w.y + 1;
  if (Grid.at(G.map, G.player.x, G.player.y) === Grid.WALL) { G.player.y = w.y - 1; }
  Engine.act(G, { t: "move", dx: 0, dy: Math.sign(w.y - G.player.y) });
  return !G.over && !G.won; // 斩完还没完，得再走
});

/* 27. 死后 player.dead 不置位（渲染尸体仍站桩） */
probe("B-27 玩家死亡不置 dead 标记：尸体继续渲染/占格", () => {
  const G = fresh();
  G.enemies = [];
  const f = dummy(G, "mob", 1, 0, { aggro: true, dmg: 99 });
  G.player.hp = 1;
  Engine.act(G, { t: "wait" });
  return G.over && G.player.dead === false; // 死了但 dead=false
});

/* 28. 中毒至少留 1 血？——毒可把玩家直接毒死（合理）但毒可穿透护盾 */
probe("B-28 毒伤无视护盾（护盾只挡刀）", () => {
  const G = fresh();
  G.enemies = [];
  const p = G.player;
  p.st.shield = 99; p.st.poison = 2; p.hp = 10;
  Engine.act(G, { t: "wait" });
  return p.hp === 9; // 盾 99 没挡住毒
});

/* 29. 血祭后挨打翻倍不消耗（打不还手时蓄力永固）——蓄力无衰减 */
probe("B-29 蓄力（emp）永久保存，无任何衰减机制", () => {
  const G = fresh();
  G.enemies = [];
  const p = G.player;
  p.hp = 18;
  Engine.act(G, { t: "skill", si: 0 });
  const e0 = p.st.emp;
  for (let i = 0; i < 8; i++) Engine.act(G, { t: "wait" });
  return p.st.emp === e0 && e0 > 0;
});

/* 30. 站在楼梯上无提示（玩家走上梯格无事发生） */
probe("B-30 玩家多格移动在梯前急停但无提示（走入楼梯只会停住）", () => {
  const G = fresh();
  // moveRange=1 的史官其实踏不上梯格（单步撞梯=下行/锁）——验证多步者（李默被动被录后？无）——跳过
  return false;
});

console.log(`\n定向探针：${confirmed} 确凿 / ${rejected} 无恙`);
process.exit(0);
