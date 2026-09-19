/* ============================================================
 * 实验史记 · 马刀地宫 —— 引擎卷（回合制地宫战）
 * 走一步、世界走一步：玩家一动（移动/刀击/用技/用物/待机/撞格互动），
 * 尔后惊动之敌各动一步；回合始末结算各层特则与诸状态。
 * 本文件是全作的「规矩」：不碰 DOM，Node 可直测；所有随机经 G.r
 * （可播种、可存档续局）。挂载：MDG.Engine
 *
 * 【事件流】act() 返回事件数组 ev，表现层按事件播动画、测试按事件断言：
 *   move/die/hit/miss/learn/alert/tree/bottle/summon/chest/camp/scroll/
 *   shop/descend/stairsLocked/log/win/dead …
 * ============================================================ */
(function (ROOT) {
  "use strict";
  const MDG = ROOT.MDG = ROOT.MDG || {};
  const G3 = () => MDG.Grid, D2 = () => MDG.DATA, G4 = () => MDG.Gen;

  /* ---------------- 造人 ---------------- */
  let UID = 1;
  function makeUnit(chId, x, y, opts) {
    const ch = D2().CH(chId);
    opts = opts || {};
    const u = {
      uid: "u" + (UID++), chId, name: ch.name, glyph: ch.glyph, color: ch.color,
      side: opts.side || "e", x, y,
      hp: ch.hp, maxHp: ch.hp, dmg: ch.dmg || 1,
      saw: ch.saw || 6, moveRange: (ch.passive && ch.passive.moveRange) || 1,
      passive: ch.passive || null,
      skills: [],
      st: { stun: 0, disarm: 0, poison: 0, shield: 0, emp: 0, grudge: 0, buffKnife: 0 },
      /* boss 身份由入层时的落位显式给定（同一人可镇守一层、又为别层精英） */
      boss: !!opts.boss, elite: !!opts.elite, mob: !!ch.mob,
      aggro: false, dead: false, lethalUsed: false, firstHitTaken: false,
      telegraph: false, _parried: false, parryCd: 0,
      bossTag: opts.bossTag || null
    };
    return u;
  }
  function addSkill(u, skillDef) {
    if (!skillDef || skillDef.kind === "summon" && u.side === "p") return; // 种树不录
    if (u.skills.some(s => s.id === skillDef.id)) return;
    u.skills.push(Object.assign({ cdLeft: 0 }, skillDef));
  }

  /* ---------------- 开局 ---------------- */
  /* meta：修炼加成 {fist, body, purse, appetite, hearth, blood, guard, royalty} */
  function newRunState(opts) {
    const D = D2();
    const seed = opts.seed || ("gong-" + Date.now());
    const diff = D.DIFF_BY_V[opts.diffV] ? opts.diffV : "normal";
    const meta = opts.meta || {};
    const runner = D.CH(opts.runnerId || "yinkesi");
    if (!runner || !runner.runner) throw new Error("bad runner: " + opts.runnerId);
    const G = {
      v: 1, seed, diff, runnerId: runner.id, floorIdx: 0, round: 1,
      money: 12 + (meta.purse || 0) * 12,
      learned: {},          // chId -> true（本轮已录技）
      learnedSkills: [],    // 已录主动技 id
      relics: [], items: [{ id: "fantuan", n: 2 }],
      kills: 0, eliteKills: 0, bossKills: [], scrollsGot: [], scrollsTotal: 0,
      wemai: 0, firstClears: [], unlockedThisRun: [], achieveFlags: {},
      over: false, won: false, summary: null,
      map: null, player: null, enemies: [], floorDef: null, campUsed: false, key: false,
      ev: [],
      rs: { a: MDG.RNG.seedOf(seed) ^ 0x9e3779b9 }
    };
    G.r = MDG.RNG.from(G.rs);
    const p = makeUnit(runner.id, 0, 0, { side: "p" });
    p.maxHp = runner.hp + (meta.body || 0) * 4;
    p.hp = p.maxHp;
    p.dmg = runner.dmg || 2;
    addSkill(p, runner.skill);                 // 血祭（或该将本技）打底
    if (runner.id === "wonder") {
      /* 马刀之神亲传：血祭三连（置于技首，与被动「血祭后三次翻倍」配套） */
      p.skills.unshift({ id: "xueji", name: "血祭", kind: "self", cd: 5, blood: 3, cdLeft: 0,
        desc: "损当前半血（至少留1），接下来三次伤害翻倍。（马刀之神亲传）" });
    }
    if ((meta.blood || 0) > 0 && p.skills[0] && p.skills[0].id === "xueji") p.skills[0].blood += meta.blood; /* 血性修炼：凡血祭皆适用 */

    G._metaBonuses = meta; /* enterFloor 的每层加成从这里读 */
    G.player = p;
    enterFloor(G, 0);
    return G;
  }

  /* ---------------- 入层 ---------------- */
  function enterFloor(G, floorIdx) {
    const D = D2();
    const def = D.FLOORS[floorIdx];
    if (!def) throw new Error("no floor " + floorIdx);
    G.floorIdx = floorIdx; G.floorDef = def; G.round = 1; G.campUsed = false;
    G.bestFloor = Math.max(G.bestFloor || 0, floorIdx + 1);
    const built = G4().genFloor(G.seed + "@" + floorIdx, def);
    G.map = built.map;
    const places = built.places;
    const d = D.DIFF_BY_V[G.diff];
    const depth = 1 + 0.05 * floorIdx; /* 层深递增：越深越硬（第9层+40%） */
    const scaleHp = (v) => Math.max(1, Math.round(v * d.eHp * depth));
    const scaleDmg = (v) => Math.max(1, v + d.eDmg);
    G.enemies = [];
    if (places.boss) {
      const b = makeUnit(def.boss, places.boss[0], places.boss[1], { bossTag: def.bossTag || null, boss: true });
      b.maxHp = scaleHp(b.maxHp); b.hp = b.maxHp; b.dmg = scaleDmg(b.dmg); b.saw += d.saw;
      if (def.bossTag) b.name = def.bossTag + "·" + b.name;
      addSkill(b, D.CH(def.boss).skill);
      (D.CH(def.boss).skills || []).forEach(s => addSkill(b, s));
      b.aggro = false;
      G.enemies.push(b);
    }
    places.elites.forEach(([chId, x, y]) => {
      const e = makeUnit(chId, x, y, { elite: true });
      e.maxHp = scaleHp(e.maxHp); e.hp = e.maxHp; e.dmg = scaleDmg(e.dmg); e.saw += d.saw;
      addSkill(e, D.CH(chId).skill);
      G.enemies.push(e);
    });
    const mobN = def.mobs + (d.eHp >= 2 ? 2 : 0);
    for (let i = 0; i < mobN && i < places.mobs.length; i++) {
      const [x, y] = places.mobs[i];
      const m = makeUnit("mob", x, y, {});
      m.maxHp = scaleHp(m.maxHp); m.hp = m.maxHp; m.dmg = scaleDmg(m.dmg);
      G.enemies.push(m);
    }
    /* 噩梦之外的难档：目力增益已加，树等杂项不动 */
    G.scrollsTotal = places.scrolls.length;
    G.stairsOpen = false;
    G._stairsOpen = false; // 渲染用缓存：每次 act 末刷新
    G._floorKnifeUsed = false; // 锦绣夜行：每层首刀重置
    G.key = false;
    /* 史官落点：出生宫室正中 */
    G.player.x = G.map.spawn[0]; G.player.y = G.map.spawn[1];
    if ((G.relics || []).includes("shield3")) G.player.st.shield += 3;
    /* 修炼「护身」：每层开局护盾（细水长流） */
    if (G._metaBonuses && G._metaBonuses.guard) G.player.st.shield += G._metaBonuses.guard;
    /* 注意：不清 G.ev——下行时 enterFloor 在 act() 中途被调，事件流必须保住 */
    log(G, "入第" + CN_NUM[floorIdx] + "层 · " + def.name);
    if (def.rule) log(G, "〔" + def.rule + "〕" + def.ruleDesc);
    log(G, def.intro);
  }

  const CN_NUM = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];

  /* ---------------- 事件与小工具 ---------------- */
  function ev(G, e) { G.ev.push(e); }
  function log(G, text) { ev(G, { t: "log", text }); }
  function unitAt(G, x, y) {
    if (G.player && !G.player.dead && G.player.x === x && G.player.y === y) return G.player;
    return G.enemies.find(u => !u.dead && u.x === x && u.y === y) || null;
  }
  function occupied(G, x, y) { return !!unitAt(G, x, y); }
  function adj(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1; }
  function hasP(u, key) { return !!(u.passive && u.passive[key]); }
  function livingEnemies(G) { return G.enemies.filter(u => !u.dead && !(u.chId === "tree")); }
  function treeCount(G) {
    let n = 0; const Gr = G3();
    for (let i = 0; i < G.map.tiles.length; i++) if (G.map.tiles[i] === Gr.TREE) n++;
    return n;
  }
  function gateIds(G) {
    const def = G.floorDef;
    return [def.boss].concat(def.gateExtra || []);
  }
  function stairsOpenNow(G) {
    /* 渲染与下行判定读行动末刷新的缓存；引擎内部结算走 computeStairs */
    if (G._stairsOpen !== undefined) return G._stairsOpen;
    return computeStairs(G);
  }
  function computeStairs(G) {
    const dead = (chId) => !G.enemies.some(u => u.chId === chId && !u.dead);
    return gateIds(G).every(dead);
  }
  /* 噩梦等难档下的杂兵增量已在入层处理 */

  /* ---------------- 伤害管线 ---------------- */
  /* kind: 'knife' | 'skill' | 'item'；opt: {dmg, push, stun, poison, seal, heal, pierce, noRecur} */
  function strike(G, att, def, kind, opt) {
    opt = opt || {};
    const evs = G.ev;
    /* 闪避 */
    if (!opt.pierce && hasP(def, "dodge") && G.r.chance(def.passive.dodge)) {
      ev(G, { t: "miss", x: def.x, y: def.y, name: def.name });
      log(G, def.name + "闪过一击。");
      return 0;
    }
    let dmg = opt.dmg || 0;
    /* 弹反：亮刀之敌被迎击——加伤并令其失措（攻势尽消） */
    if (att.side === "p" && def.side === "e" && def.telegraph && !def.dead && !opt.noCleave) {
      dmg += 2;
      def._parried = true;
      def.parries = (def.parries || 0) + 1;
      def.parryCd = Math.min(4, 1 + def.parries); /* 戒备逐次加长：1→2→3 回合 */
      def.telegraph = false;
      ev(G, { t: "parry", x: def.x, y: def.y, name: def.name });
      log(G, "弹反！" + def.name + "的攻势被荡开——其本回合失措。");
    }
    /* 情比金坚：相邻之敌，其伤加一 */
    if (G.floorDef.rule === "dyad" && att.side === "e" && kind !== "item") {
      const buddy = livingEnemies(G).some(e => e !== att && !e.dead && G3().manh(e.x, e.y, att.x, att.y) === 1);
      if (buddy) dmg += 1;
    }
    if (kind === "knife") {
      if (hasP(att, "knifeMul")) dmg = (opt.base || dmg) * att.passive.knifeMul;
      /* 急击勿失：对未惊动之敌的先手一刀 +2（在倍率之后施加） */
      if (def.side === "e" && !def.aggro) {
        dmg += 2;
        ev(G, { t: "sneak", x: def.x, y: def.y });
      }
      if (hasP(att, "wallBonus")) {
        const Gr = G3();
        const nearWall = Gr.DIRS.some(([dx, dy]) => Gr.at(G.map, att.x + dx, att.y + dy) === Gr.WALL);
        if (nearWall) dmg += att.passive.wallBonus;
      }
      if (att.side === "p") {
        const R = G.relics || [];
        if (R.includes("firststrike") && !G._firstKnifeUsed) { dmg += 1; G._firstKnifeUsed = true; }
        if (R.includes("nightwalk") && !G._floorKnifeUsed) { dmg += 2; G._floorKnifeUsed = true; }
        if (R.includes("grudge") && att.st.grudge > 0) { dmg += 1; att.st.grudge--; }
        if (att.st.buffKnife > 0) dmg += 1;
      }
      if (hasP(att, "execBonus") && def.hp <= def.maxHp / 2) dmg += att.passive.execBonus;
      if (hasP(att, "lowHpBonus") && att.hp < (att.passive.lowHpAt || 5)) dmg += att.passive.lowHpBonus;
      if (hasP(att, "grudgeStack") && att.st.grudge > 0) { dmg += 1; att.st.grudge--; }
    }
    if (kind === "skill" && opt.evenBonus && def.hp % 2 === 0) dmg += opt.evenBonus;
    /* 血祭之力（溅射不消耗） */
    if (att.st.emp > 0 && !opt.noEmp) { dmg *= 2; att.st.emp--; ev(G, { t: "emp", x: att.x, y: att.y }); }
    /* 暴击（秒之） */
    let crit = false;
    if (hasP(att, "critChance") && G.r.chance(att.passive.critChance)) { dmg = Math.round(dmg * (att.passive.critMul || 2)); crit = true; }
    /* 防方减伤 */
    const pierce = opt.pierce || hasP(att, "pierce");
    if (!pierce) {
      if (def.st.shield > 0) {
        const absorb = Math.min(def.st.shield, dmg);
        def.st.shield -= absorb; dmg -= absorb;
        ev(G, { t: "shield", x: def.x, y: def.y, val: absorb });
      }
      if (dmg > 0 && hasP(def, "takenReduce")) dmg = Math.max(1, dmg - def.passive.takenReduce);
      if (dmg > 0 && hasP(def, "firstHitReduce") && !def.firstHitTaken) { dmg = Math.max(0, dmg - def.passive.firstHitReduce); def.firstHitTaken = true; }
      if (dmg > 0 && hasP(def, "auraReduce") && adj(att, def)) dmg = Math.max(1, dmg - def.passive.auraReduce);
    }
    if (dmg <= 0) { ev(G, { t: "hit", x: def.x, y: def.y, dmg: 0, crit, zero: true }); return 0; }
    def.hp -= dmg;
    ev(G, { t: "hit", x: def.x, y: def.y, dmg, crit });
    /* 卧薪尝胆（被打者积怨） */
    if (hasP(def, "grudgeStack")) def.st.grudge = Math.min(def.passive.grudgeCap || 2, def.st.grudge + def.passive.grudgeStack);
    /* 附加效果 */
    /* 反控制链：已晕者不可再被晕（晕完必须给一回合行动权） */
    if (opt.stun && !hasP(def, "immuneStun") && def.st.stun === 0) def.st.stun = opt.stun;
    if (opt.seal) def.st.disarm = Math.max(def.st.disarm, opt.seal);
    if (opt.poison) def.st.poison = Math.max(def.st.poison, opt.poison);
    if (opt.heal && !att.dead) heal(G, att, opt.heal);
    if (opt.push && !hasP(def, "immuneKnock") && G.floorDef.rule !== "suomen") {
      const Gr = G3();
      const dx = Math.sign(def.x - att.x), dy = Math.sign(def.y - att.y);
      const [px, py] = Gr.pushDest(G.map, def.x, def.y, dx, dy, opt.push, (x, y) => occupied(G, x, y));
      def.x = px; def.y = py;
    }
    log(G, hitLine(G, att, def, dmg, kind, crit));
    if (att.side === "e" && def.side === "e") log(G, "〔党争〕" + att.name + "误伤了" + def.name + "！");
    /* 卧薪尝胆（刀卡）：玩家受伤积怨，下次刀击+1（至多2层） */
    if (def.side === "p" && G.relics.includes("grudge")) def.st.grudge = Math.min(2, def.st.grudge + 1);
    if (def.hp <= 0) kill(G, att, def);
    else uprisingCheck(G);
    return dmg;
  }

  function hitLine(G, att, def, dmg, kind, crit) {
    const who = att.side === "p" ? "汝" : att.name;
    const target = def.side === "p" ? "汝" : def.name;
    if (att.side === "p") return "汝以" + (kind === "knife" ? "刀" : "技") + "击" + target + "，伤其" + dmg + (crit ? "（会心！）" : "");
    if (def.side === "p") return att.name + "击汝，汝损" + dmg + "血";
    return att.name + "击" + target + "，伤其" + dmg;
  }

  function heal(G, u, val) {
    if (u.dead) return;
    const before = u.hp;
    u.hp = Math.min(u.maxHp, u.hp + val);
    if (u.hp > before) ev(G, { t: "heal", x: u.x, y: u.y, val: u.hp - before });
  }

  function kill(G, att, def) {
    /* 免死（敌）：皇太子留1血 / 弃车保帅留血回气 */
    if (def.side === "e" && hasP(def, "lethalKeep") && !def.lethalUsed) {
      def.lethalUsed = true;
      def.hp = 1 + (def.passive.lethalKeep > 1 ? def.passive.lethalKeep : 0);
      ev(G, { t: "lethalkeep", x: def.x, y: def.y });
      log(G, def.name + "弃车保帅——致命伤下留得一命！");
      return;
    }
    def.dead = true; def.hp = 0;
    ev(G, { t: "die", x: def.x, y: def.y, glyph: def.glyph, color: def.color, boss: def.boss, chId: def.chId });
    log(G, def.side === "p" ? "汝倒于地下。" : def.name + "败。" + (def.boss ? "镇守已除！" : ""));
    if (def.side === "p") { playerDown(G); return; }
    if (att && att.side === "p") {
      G.kills++;
      /* 击破回血：卷八古法，击破一名敌人回复3血（「庆功之宴」升为5） */
      heal(G, att, G.relics.includes("killheal") ? 5 : 3);
      /* 战利品：杂兵2-3钱、精英6-9钱 */
      if (def.mob) { const m = 2 + G.r.int(0, 1); G.money += m; ev(G, { t: "coin", x: def.x, y: def.y, val: m }); }
      else if (def.elite) { const m = 6 + G.r.int(0, 3); G.money += m; ev(G, { t: "coin", x: def.x, y: def.y, val: m }); }
      if (def.boss) {
        G.bossKills.push(def.chId);
        G.wemai += 6;
        bossDrop(G, def);
        log(G, "第" + CN_NUM[G.floorIdx] + "层已定，楼梯开了。");
      } else if (def.elite) {
        G.eliteKills++; G.wemai += 2;
      }
      /* 录技：史官专属——首次斩有名之角色，录其技；图鉴记录 */
      if (!def.mob && !G.learned[def.chId] && G.player.chId === "yinkesi") {
        G.dexKills = G.dexKills || {};
        G.dexKills[def.chId] = (G.dexKills[def.chId] || 0) + 1;
        const ch = D2().CH(def.chId);
        const sk = ch.skill || (ch.skills || [])[0];
        if (sk && sk.kind !== "summon") {
          G.learned[def.chId] = true;
          if (!G.learnedSkills.includes(sk.id)) {
            G.learnedSkills.push(sk.id);
            addSkill(G.player, sk);
            ev(G, { t: "learn", name: sk.name, chId: def.chId });
            log(G, "录技：「" + sk.name + "」入谱。");
            const T = G.tut || (G.tut = {});
            if (!T.learn) { T.learn = true; ev(G, { t: "tut", k: "learn" }); }
          }
        }
        ev(G, { t: "dex", chId: def.chId });
      }
    }
    uprisingCheck(G);
  }

  function bossDrop(G, def) {
    const R = D2().RELICS;
    const pool = Object.keys(R).filter(id => !G.relics.includes(id));
    if (pool.length) {
      const id = G.r.pick(pool);
      G.relics.push(id);
      ev(G, { t: "relic", id, name: R[id].name });
      log(G, "得刀卡「" + R[id].name + "」——" + R[id].desc);
      const T = G.tut || (G.tut = {});
      if (!T.relic) { T.relic = true; ev(G, { t: "tut", k: "relic" }); }
    }
    G.money += 15 + G.r.int(0, 10);
  }

  function playerDown(G) {
    const p = G.player;
    if (hasP(p, "lethalKeep") && !p.lethalUsed) {
      p.lethalUsed = true; p.hp = 1;
      ev(G, { t: "lethalkeep", x: p.x, y: p.y });
      log(G, "皇太子之命硬——留了1血。");
      return;
    }
    p.dead = true;
    G.over = true; G.won = false;
    ev(G, { t: "dead" });
    log(G, "笔滞于此，且搁笔——此轮所想，皆成文脉。");
  }

  /* ---------------- 起义特则：琛半血召心腹 ---------------- */
  function uprisingCheck(G) {
    if (G.floorDef.rule !== "uprising" || G._uprisingDone) return;
    const boss = G.enemies.find(u => u.boss && !u.dead);
    if (boss && boss.hp <= boss.maxHp / 2) {
      G._uprisingDone = true;
      log(G, "琛夺话筒曰：凡有责任，在吾一人！——其二心腹入场。");
      let placed = 0;
      for (let r = 2; r <= 4 && placed < 2; r++) {
        for (let dy = -r; dy <= r && placed < 2; dy++) for (let dx = -r; dx <= r && placed < 2; dx++) {
          if (Math.abs(dx) + Math.abs(dy) !== r) continue;
          const x = boss.x + dx, y = boss.y + dy;
          const Gr = G3();
          const tt = Gr.at(G.map, x, y);
          if (Gr.inB(G.map, x, y) && (tt === Gr.FLOOR || tt === Gr.CORR) && !occupied(G, x, y)) {
            const d = D2().DIFF_BY_V[G.diff];
            const m = makeUnit("mob", x, y, {});
            m.maxHp = Math.max(1, Math.round(m.maxHp * d.eHp)); m.hp = m.maxHp; m.dmg = Math.max(1, m.dmg + d.eDmg);
            m.aggro = true; G.enemies.push(m);
            ev(G, { t: "summon", x, y, chId: "mob" });
            placed++;
          }
        }
      }
    }
  }

  /* ---------------- 回合开始（特则） ---------------- */
  /* 亮刀破绽的出现率：可遇不可求，弹反才有价值（测试可钉为 0/1） */
  let teleChance = 0.45;
  function roundStart(G) {
    G._firstKnifeUsed = false;
    G.enemies.forEach(u => { u.firstHitTaken = false; });
    const p = G.player;
    /* 弹反窗口：邻敌亮刀示警（红框「！」）。刚被弹反者下回合有戒备，不出窗。 */
    G.enemies.forEach(u => {
      if (u.parryCd > 0) u.parryCd--;
      const was = u.telegraph;
      u.telegraph = !u.dead && u.aggro && u.st.stun === 0 && !(u.parryCd > 0) && !p.dead &&
        G3().manh(u.x, u.y, p.x, p.y) === 1 && G.r.chance(teleChance);
      if (u.telegraph && !was) {
        ev(G, { t: "telegraph", x: u.x, y: u.y, name: u.name });
        const T = G.tut || (G.tut = {});
        if (!T.telegraph) { T.telegraph = true; ev(G, { t: "tut", k: "telegraph" }); }
      }
    });
    if (G.floorDef.rule === "cans" && !p.dead) {
      const lined = livingEnemies(G).some(e => e.x === p.x || e.y === p.y);
      if (lined) {
        p.hp -= 1;
        ev(G, { t: "bottle", x: p.x, y: p.y, dmg: 1 });
        log(G, "看台飞瓶坠下，砸汝1血——莫与敌同行同列。");
        if (p.hp <= 0) playerDown(G);
      }
    }
    if (G.floorDef.rule === "zhongshu") {
      if (treeCount(G) < 3) {
        for (let t = 0; t < 30; t++) {
          const x = G.r.int(1, G.map.w - 2), y = G.r.int(1, G.map.h - 2);
          const Gr = G3();
          if (Gr.at(G.map, x, y) === Gr.FLOOR && !occupied(G, x, y) &&
              (Math.abs(x - p.x) + Math.abs(y - p.y)) >= 3) {
            Gr.set(G.map, x, y, Gr.TREE);
            ev(G, { t: "tree", x, y });
            log(G, "崇国又种一树。（多种树木，树木皆死）");
            break;
          }
        }
      }
    }
  }

  /* ---------------- 敌人回合 ---------------- */
  function enemiesAct(G) {
    const p = G.player;
    for (const u of G.enemies) {
      if (u.dead || u.side !== "e" || u.chId === "tree") continue;
      if (G.over) break;
      /* 晕眩 */
      if (u.st.stun > 0) { u.st.stun--; ev(G, { t: "stunned", uid: u.uid }); continue; }
      /* 被弹反：失措，本回合全行动作 */
      if (u._parried) { u._parried = false; ev(G, { t: "stagger", x: u.x, y: u.y, name: u.name }); continue; }
      const Gr = G3();
      const dMan = Gr.manh(u.x, u.y, p.x, p.y);
      /* 惊动 */
      if (!u.aggro) {
        if (u.saw > 0 && dMan <= u.saw && Gr.los(G.map, u.x, u.y, p.x, p.y)) {
          u.aggro = true; u.loseT = 0;
          ev(G, { t: "alert", x: u.x, y: u.y, name: u.name, boss: u.boss });
          if (u.boss) log(G, u.name + "（镇守）惊起：" + bossTaunt(G, u.chId));
        } else {
          /* 闲置巡逻：未惊动者也会踱步——世界不因你静立而冻结 */
          const idleChance = u.boss ? 0 : (u.mob ? 0.4 : 0.25);
          if (idleChance > 0 && G.r.chance(idleChance)) {
            const [dx, dy] = G.r.pick(Gr.DIRS);
            const nx = u.x + dx, ny = u.y + dy;
            if (Gr.walkable(G.map, nx, ny) && !occupied(G, nx, ny) && !isSpecialTile(G, nx, ny)) {
              ev(G, { t: "emove", uid: u.uid, x0: u.x, y0: u.y, x1: nx, y1: ny });
              u.x = nx; u.y = ny;
              if (Gr.at(G.map, nx, ny) === Gr.TRAP) triggerTrap(G, nx, ny, u);
            }
          }
        }
      } else if (!u.boss) {
        /* 脱离仇恨：仅当连续 6 回合失去视线才弃追（镇守不弃——惊起必寻至）。
           （旧版「久追未近身也弃追」会让远程敌看得见你却隔轮行动并反复惊起——已废） */
        const seen = dMan <= u.saw + 4 && Gr.los(G.map, u.x, u.y, p.x, p.y);
        if (seen) u.loseT = 0;
        else {
          u.loseT = (u.loseT || 0) + 1;
          if (u.loseT >= 6) { u.aggro = false; u.loseT = 0; ev(G, { t: "lost", uid: u.uid }); }
        }
      }
      if (!u.aggro || p.dead) continue;
      /* 党争：二成机率误伤身边随机一人（含同门）——贴身混战时才可能打错 */
      let victim = p;
      if (G.floorDef.rule === "chaos" && adj(u, p) && G.r.chance(0.2)) {
        const cands = [p].concat(G.enemies).filter(o => o !== u && !o.dead && adj(u, o));
        if (cands.length) victim = G.r.pick(cands);
      }
      /* 用技（cd 好了且有合适目标，Boss 更积极） */
      if (u.st.disarm === 0 && u.skills.length && G.r.chance(u.boss ? 0.65 : 0.45)) {
        const sk = u.skills.find(s => s.cdLeft === 0 && aiSkillTarget(G, u, s));
        if (sk) { aiUseSkill(G, u, sk, aiSkillTarget(G, u, sk)); continue; }
      }
      /* 邻接则刀击 */
      if (adj(u, p)) {
        strike(G, u, victim, "knife", { dmg: u.dmg });
        continue;
      }
      /* 否则趋近（一步或两步） */
      let steps = u.moveRange || 1;
      while (steps-- > 0 && !adj(u, p) && !p.dead) {
        const blocked = (x, y) => occupied(G, x, y) || isSpecialTile(G, x, y);
        const nxt = Gr.stepToward(G.map, u.x, u.y, p.x, p.y, blocked);
        if (!nxt) break;
        ev(G, { t: "emove", uid: u.uid, x0: u.x, y0: u.y, x1: nxt[0], y1: nxt[1] });
        u.x = nxt[0]; u.y = nxt[1];
        if (Gr.at(G.map, u.x, u.y) === Gr.TRAP) triggerTrap(G, u.x, u.y, u);
        if (u.dead || G.over) break;
      }
      if (adj(u, p) && !u.dead) strike(G, u, p, "knife", { dmg: u.dmg });
    }
  }
  function isSpecialTile(G, x, y) {
    /* 敌人绕行：箱/商摊/灶间/楼梯皆不落脚——灶间曾把走廊堵成软锁，楼梯曾被敌占住堵死下行 */
    const Gr = G3(); const t = Gr.at(G.map, x, y);
    return t === Gr.CHEST || t === Gr.SHOP || t === Gr.CAMPFIRE || t === Gr.STAIRS;
  }
  function bossTaunt(G, chId) {
    const pool = {
      wanzhen: ["来。", "题？给我。", "刀者，如解方程。"],
      dage: ["来呀来呀。", "此不类高考乎？"],
      luhao: ["来呀来呀，重开重开。", "规矩是：活者为王。"],
      zichen: ["此为通知尔，非求建议也。", "号令两班，政由琛出。"],
      touge: ["三溴化氮。", "莫贴吾身。"],
      qinfa: ["此何课也？", "汝手拿出来。"],
      wonder: ["GBC，算不算。", "来呀来呀。"],
      chongguo: ["为师者，吾之属地也。", "此局未终。"]
    };
    const arr = pool[chId] || ["来呀来呀。"];
    return arr[Math.floor(G.r.next() * arr.length)];
  }
  /* AI 技能目标搜索：返回目标坐标或 null */
  function aiSkillTarget(G, u, sk) {
    const p = G.player;
    if (p.dead) return null;
    if (sk.kind === "global") return [p.x, p.y];
    if (sk.kind === "blink") return [p.x, p.y];
    if (sk.kind === "burst" || sk.kind === "unit") {
      if (sk.kind === "burst" && sk.range === 1) return adj(u, p) ? [p.x, p.y] : null;
      const d = G3().manh(u.x, u.y, p.x, p.y);
      if (d <= (sk.range || 1)) return [p.x, p.y];
      return null;
    }
    if (sk.kind === "self") return (sk.heal && u.hp < u.maxHp) ? [u.x, u.y] : null;
    return null;
  }
  function aiUseSkill(G, u, sk, target) {
    sk.cdLeft = sk.cd + (hasP(u, "cdCut") ? -1 : 0);
    const p = G.player;
    if (sk.kind === "global") {
      ev(G, { t: "skill", name: sk.name, who: u.name });
      log(G, u.name + "使出「" + sk.name + "」。");
      if (sk.dmg) strike(G, u, p, "skill", { dmg: sk.dmg, stun: sk.stun });
      else if (sk.seal) { p.st.disarm = Math.max(p.st.disarm, sk.seal); log(G, "汝之技被封一回合。（" + sk.name + "）"); }
    } else if (sk.kind === "blink") {
      /* 闪现贴脸 */
      const spot = G3().DIRS.map(([dx, dy]) => [p.x + dx, p.y + dy])
        .find(([x, y]) => G3().inB(G.map, x, y) && G3().walkable(G.map, x, y) && !occupied(G, x, y));
      if (spot) {
        ev(G, { t: "emove", uid: u.uid, x0: u.x, y0: u.y, x1: spot[0], y1: spot[1], blink: true });
        u.x = spot[0]; u.y = spot[1];
      }
      ev(G, { t: "skill", name: sk.name, who: u.name });
      strike(G, u, p, "skill", { dmg: sk.dmg, seal: sk.seal, pierce: true });
    } else if (sk.kind === "burst") {
      ev(G, { t: "skill", name: sk.name, who: u.name });
      log(G, u.name + "使出「" + sk.name + "」。");
      if (G3().manh(u.x, u.y, p.x, p.y) <= sk.range) {
        const opt = { dmg: sk.dmg, poison: sk.poison };
        if (sk.stunChance !== undefined) { if (G.r.chance(sk.stunChance)) opt.stun = sk.stun; } else opt.stun = sk.stun;
        strike(G, u, p, "skill", opt);
      }
    } else if (sk.kind === "unit") {
      ev(G, { t: "skill", name: sk.name, who: u.name });
      log(G, u.name + "使出「" + sk.name + "」。");
      strike(G, u, p, "skill", { dmg: sk.dmg, stun: sk.stun, seal: sk.seal, evenBonus: sk.evenBonus });
    } else if (sk.kind === "self") {
      if (sk.heal) { heal(G, u, sk.heal); log(G, u.name + "回复" + sk.heal + "血。（" + sk.name + "）"); }
    }
  }

  /* ---------------- 回合结束（状态与特则） ---------------- */
  function turnEnd(G) {
    const p = G.player;
    /* 毒 */
    [p].concat(G.enemies).forEach(u => {
      if (u.dead || !u.st.poison) return;
      u.hp -= 1; u.st.poison--;
      ev(G, { t: "poison", x: u.x, y: u.y });
      log(G, (u.side === "p" ? "汝" : u.name) + "中鸩毒，损1血。");
      if (u.hp <= 0) kill(G, null, u);
    });
    if (G.over) return;
    /* 鲍鱼之肆（层特则）与神人臭气（被动）同源处理 */
    const auraUnits = [];
    if (G.floorDef.rule === "stench") auraUnits.push(p);
    G.enemies.forEach(u => { if (!u.dead && hasP(u, "poisonAura")) auraUnits.push(u); });
    auraUnits.forEach(src => {
      const targets = src.side === "p" ? livingEnemies(G) : (p.dead ? [] : [p]);
      targets.forEach(t => {
        if (G3().manh(src.x, src.y, t.x, t.y) === 1) {
          t.hp -= 1;
          ev(G, { t: "hit", x: t.x, y: t.y, dmg: 1, aura: true });
          log(G, "〔鲍鱼之肆〕" + (t.side === "p" ? "汝" : t.name) + "被蚀1血。");
          if (t.hp <= 0) kill(G, src, t);
        }
      });
    });
    if (G.over) return;
    /* 验算 */
    if (G.floorDef.rule === "yansuan") {
      const w = G.enemies.find(u => u.chId === "wonder" && !u.dead);
      if (w && w.hp % 2 === 0 && w.hp < w.maxHp) { heal(G, w, 2); log(G, "〔验算〕wonder血量为偶，回2血。"); }
    }
    /* 神人等被动每回合自愈类：无 */
    /* 冷却与计时 */
    [p].concat(G.enemies).forEach(u => {
      u.skills.forEach(s => { if (s.cdLeft > 0) s.cdLeft--; });
      if (u.st.disarm > 0) u.st.disarm--;
      if (u.st.buffKnife > 0) u.st.buffKnife--;
    });
  }

  /* ---------------- 玩家动作 ---------------- */
  /* action: {t:'move',dx,dy} | {t:'skill',si,tx,ty} | {t:'item',ii,tx,ty} | {t:'wait'} */
  /* 动作预校验：无效动作不推进时间（撞墙/技无目标/掷无目标/梯封未开/血不敷祭） */
  function actionValid(G, action) {
    if (!action) return false;
    const p = G.player, Gr = G3();
    if (action.t === "wait") return true;
    if (action.t === "move") {
      const nx = p.x + action.dx, ny = p.y + action.dy;
      if (!Gr.inB(G.map, nx, ny)) return false;
      const foe = unitAt(G, nx, ny);
      if (foe && foe.side === "e") return true;
      const tile = Gr.at(G.map, nx, ny);
      if (tile === Gr.WALL) return false;
      if (tile === Gr.STAIRS && !computeStairs(G)) {
        const names = gateIds(G).filter(id => G.enemies.some(u => u.chId === id && !u.dead)).map(id => D2().CH(id).name);
        log(G, "梯封未开——尚有镇守：" + names.join("、"));
        return false;
      }
      return true;
    }
    if (action.t === "skill") {
      const sk = p.skills[action.si];
      if (!sk || sk.cdLeft > 0 || p.st.disarm > 0) return false;
      if (sk.id === "xueji" && p.hp < 2) return false; /* 血不敷祭 */
      return skillTargetOk(G, p, sk, action.tx, action.ty);
    }
    if (action.t === "item") {
      const it = G.items[action.ii];
      if (!it || it.n <= 0) return false;
      const def = D2().ITEMS[it.id];
      if (def.kind === "throw") {
        const foe = action.tx != null ? unitAt(G, action.tx, action.ty) : null;
        return !!(foe && foe.side === "e" && !foe.dead && Gr.manh(p.x, p.y, action.tx, action.ty) <= (def.range || 3));
      }
      return true;
    }
    return false;
  }

  function act(G, action) {
    if (G.over) return G.ev = [], [];
    G.ev = [];
    const evs = G.ev;
    if (!actionValid(G, action)) return evs.slice(); /* 时间不动 */
    roundStart(G);
    if (!G.over) {
      const p = G.player;
      if (p.st.stun > 0) {
        /* 被晕：任何行动都使不出，白白失一轮 */
        p.st.stun--;
        ev(G, { t: "stunned", x: p.x, y: p.y });
        log(G, "汝目眩神迷，动弹不得——此轮废了。");
      } else {
        if (action.t === "move") doMove(G, p, action.dx, action.dy);
        else if (action.t === "skill") doSkill(G, p, action.si, action.tx, action.ty);
        else if (action.t === "item") doItem(G, p, action.ii, action.tx, action.ty);
        else if (action.t === "wait") { if (!action.auto) log(G, "汝按刀不动。（待机）"); }
        /* 兜底 */
      }
    }
    if (!G.over && !G.won) enemiesAct(G);
    if (!G.over) turnEnd(G);
    /* 楼梯开了没有（镇守死绝）——现算并刷新渲染缓存 */
    const open = computeStairs(G);
    G._stairsOpen = open;
    if (open && !G.stairsOpen) {
      G.stairsOpen = true;
      ev(G, { t: "stairsOpen" });
    }
    if (!G.over && open && G.floorDef.rule === "suomen") G.key = true;
    /* 尸体清扫：亡者出列（存档与遍历都不再背负） */
    for (let i = G.enemies.length - 1; i >= 0; i--) if (G.enemies[i].dead) G.enemies.splice(i, 1);
    /* 教学事件：首次见闻各要素，各发一次（G.tut 见过即记） */
    tutorialEvents(G, action);
    G.round++;
    return evs.slice();
  }

  /* ---- 陷阱：尖刺一次性，无视护盾，敌我皆可触发 ---- */
  function triggerTrap(G, x, y, u) {
    G3().set(G.map, x, y, G3().FLOOR); /* 尖刺弹出后报废 */
    ev(G, { t: "trap", x, y, name: u.name, side: u.side });
    u.hp -= 3;
    if (u.side === "p") {
      log(G, "踩中陷阱！尖刺贯入，无视护盾损3血。");
      if (u.hp <= 0) playerDown(G);
    } else {
      log(G, u.name + "踩中陷阱，尖刺贯入损3血。");
      if (u.hp <= 0) kill(G, null, u);
    }
  }

  /* ---- 引导：首次见闻推送（表现层转 toast）---- */
  function tutorialEvents(G, action) {
    const T = G.tut || (G.tut = {});
    const once = (k) => { if (!T[k]) { T[k] = true; return true; } return false; };
    const p = G.player;
    const Gr = G3();
    /* 附近扫一眼（视野半径内找最要紧的一样，每动至多推一条，不刷屏） */
    if (once("move") && action.t === "move") ev(G, { t: "tut", k: "move" });
    const R = 8;
    let found = null, foundD = 99;
    for (let y = Math.max(0, p.y - R); y <= Math.min(G.map.h - 1, p.y + R); y++) {
      for (let x = Math.max(0, p.x - R); x <= Math.min(G.map.w - 1, p.x + R); x++) {
        if (!Gr.los(G.map, p.x, p.y, x, y)) continue;
        const tile = Gr.at(G.map, x, y);
        const d = Gr.manh(p.x, p.y, x, y);
        let kind = null;
        if (tile === Gr.CAMPFIRE && !G.campUsed) kind = "camp";
        else if (tile === Gr.CHEST) kind = "chest";
        else if (tile === Gr.SCROLL) kind = "scroll";
        else if (tile === Gr.SHOP) kind = "shop";
        else if (tile === Gr.TRAP) kind = "trap";
        else if (tile === Gr.STAIRS) kind = G._stairsOpen ? "stairsOpen" : "stairsLocked";
        if (kind && d < foundD) { found = kind; foundD = d; }
      }
    }
    if (found && once(found)) ev(G, { t: "tut", k: found });
  }

  function doMove(G, p, dx, dy) {
    const Gr = G3();
    const nx = p.x + dx, ny = p.y + dy;
    if (!Gr.inB(G.map, nx, ny)) return;
    const foe = unitAt(G, nx, ny);
    if (foe && foe.side === "e") {
      const dealt = strike(G, p, foe, "knife", { base: p.dmg, dmg: p.dmg });
      /* 刀扫一片：波及身旁另一敌（不连锁、不再触发弹反/蓄力） */
      if (G.relics.includes("cleave") && dealt > 0) {
        const other = G.enemies.find(u => u !== foe && !u.dead && u.side === "e" && u.chId !== "tree" && adj(u, p));
        if (other) strike(G, p, other, "skill", { dmg: dealt, noEmp: true, noCleave: true, pierce: true });
      }
      return;
    }
    if (foe && foe.side === "p") return;
    /* 长杆马刀：面前隔一格之敌可直刺（不移动） */
    if (G.relics.includes("reach")) {
      const mx = p.x + 2 * dx, my = p.y + 2 * dy;
      const far = Gr.inB(G.map, mx, my) ? unitAt(G, mx, my) : null;
      if (far && far.side === "e" && !far.dead && Gr.walkable(G.map, nx, ny) && !occupied(G, nx, ny)) {
        strike(G, p, far, "knife", { base: p.dmg, dmg: p.dmg });
        return;
      }
    }
    const t = Gr.at(G.map, nx, ny);
    if (t === Gr.WALL) return;
    if (t === Gr.TREE) { /* 树可击碎 */
      const tree = unitAt(G, nx, ny) || { chId: "tree" };
      Gr.set(G.map, nx, ny, Gr.FLOOR);
      ev(G, { t: "treebreak", x: nx, y: ny });
      log(G, "汝碎一树。（树木皆死）");
      return;
    }
    if (t === Gr.CHEST) return openChest(G, nx, ny);
    if (t === Gr.CAMPFIRE) return doCamp(G, nx, ny);
    if (t === Gr.SHOP) { ev(G, { t: "shop", x: nx, y: ny }); return; }
    if (t === Gr.STAIRS) return tryDescend(G);
    /* 正常走：moveRange 步（李默/大展类被动） */
    let steps = p.moveRange || 1;
    let cx = p.x, cy = p.y;
    ev(G, { t: "move", uid: p.uid, x0: p.x, y0: p.y });
    while (steps-- > 0) {
      const tx = cx + dx, ty = cy + dy;
      if (!Gr.inB(G.map, tx, ty)) break;
      if (occupied(G, tx, ty)) break;
      const tt = Gr.at(G.map, tx, ty);
      if (tt === Gr.WALL || tt === Gr.TREE || tt === Gr.CHEST || tt === Gr.CAMPFIRE || tt === Gr.SHOP) break;
      cx = tx; cy = ty;
      if (tt === Gr.TRAP) { triggerTrap(G, cx, cy, p); break; }
      if (tt === Gr.SCROLL) { pickScroll(G, cx, cy); break; }
      if (tt === Gr.STAIRS) break; // 走上梯格即视为「在梯上」，交互另行
    }
    p.x = cx; p.y = cy;
    ev(G, { t: "move", uid: p.uid, x1: p.x, y1: p.y });
  }

  function pickScroll(G, x, y) {
    const Gr = G3();
    const id = "f" + G.floorIdx + "@" + x + "," + y;
    Gr.set(G.map, x, y, Gr.FLOOR);
    G.scrollsGot.push(id);
    G.wemai += 1;
    ev(G, { t: "scroll", x, y, id });
    log(G, "拾史料一枚。（文脉+1）");
    if (G.scrollsGot.filter(s => s.startsWith("f" + G.floorIdx + "@")).length >= G.scrollsTotal && G.scrollsTotal > 0) {
      G.wemai += 3;
      log(G, "本层史料集齐——赏文脉3。");
    }
  }

  function openChest(G, x, y) {
    const Gr = G3();
    Gr.set(G.map, x, y, Gr.FLOOR);
    const roll = G.r.next();
    if (roll < 0.42) {
      const m = 8 + G.r.int(0, 8);
      G.money += m;
      ev(G, { t: "chest", what: "money", val: m, x, y });
      log(G, "开箱得零花钱" + m + "。");
    } else if (roll < 0.75) {
      const D = D2();
      const id = G.r.pick(["fantuan", "mantou", "hugoushuang", "yumi", "shuihu", "heibang"]);
      addItem(G, id);
      ev(G, { t: "chest", what: "item", id, x, y });
      log(G, "开箱得「" + D.ITEMS[id].name + "」。");
    } else {
      const R = D2().RELICS;
      const pool = Object.keys(R).filter(id => !G.relics.includes(id));
      if (pool.length) {
        const id = G.r.pick(pool);
        G.relics.push(id);
        ev(G, { t: "chest", what: "relic", id, x, y });
        log(G, "开箱得刀卡「" + R[id].name + "」。");
      } else {
        const m = 10 + G.r.int(0, 6);
        G.money += m;
        ev(G, { t: "chest", what: "money", val: m, x, y });
        log(G, "开箱得零花钱" + m + "。（刀卡已集齐）");
      }
    }
  }

  function addItem(G, id) {
    const slot = G.items.find(i => i.id === id);
    if (slot) slot.n++;
    else G.items.push({ id, n: 1 });
  }

  function doCamp(G, x, y) {
    if (G.campUsed) { log(G, "灶间已冷。"); return; }
    G.campUsed = true;
    const p = G.player;
    p.hp = p.maxHp;
    p.skills.forEach(s => s.cdLeft = 0);
    const meta = G._metaBonuses || {};
    if (meta.hearth) p.st.shield += 3;
    G3().set(G.map, x, y, G3().FLOOR);
    ev(G, { t: "camp", x, y });
    log(G, "灶间歇息——血满，技冷尽清。" + (meta.hearth ? "（灶膛余温，护盾+3）" : ""));
  }

  function tryDescend(G) {
    if (!stairsOpenNow(G)) {
      const left = gateIds(G).filter(id => G.enemies.some(u => u.chId === id && !u.dead)).map(id => D2().CH(id).name);
      ev(G, { t: "stairsLocked" });
      log(G, "梯封未开——尚有镇守：" + left.join("、"));
      return;
    }
    if (G.floorIdx >= D2().FLOORS.length - 1) {
      /* 第九层斩毕 → 收卷 */
      G.over = true; G.won = true;
      ev(G, { t: "win" });
      log(G, "梦将醒。最后一卷落笔——刀史收卷。");
      return;
    }
    G.wemai += 3;
    G.firstClears.push(G.floorIdx); // 记录（首次赏由 run 层判重）
    ev(G, { t: "descend" });
    enterFloor(G, G.floorIdx + 1);
    /* 下行喘息：回35%血 */
    const p = G.player;
    heal(G, p, Math.max(3, Math.round(p.maxHp * 0.35)));
  }

  /* ---------------- 用技 ---------------- */
  function skillTargetOk(G, p, sk, tx, ty) {
    const Gr = G3();
    if (sk.kind === "self") return true;
    if (sk.kind === "global") return true;
    if (tx == null || ty == null) return false;
    if (!Gr.inB(G.map, tx, ty)) return false;
    const d = Gr.manh(p.x, p.y, tx, ty);
    if (d > (sk.range || 1)) return false;
    const foe = unitAt(G, tx, ty);
    return !!(foe && foe.side === "e" && !foe.dead);
  }

  function doSkill(G, p, si, tx, ty) {
    if (p.st.disarm > 0) { log(G, "汝之技被封（当场抓获）——" + p.st.disarm + "回合后方可再用。"); return; }
    const sk = p.skills[si];
    if (!sk) return;
    if (sk.cdLeft > 0) { log(G, "「" + sk.name + "」尚在冷却（" + sk.cdLeft + "）。"); return; }
    if (!skillTargetOk(G, p, sk, tx, ty)) { log(G, "此处不可施「" + sk.name + "」。"); return; }
    sk.cdLeft = sk.cd;
    const foe = tx != null ? unitAt(G, tx, ty) : null;
    ev(G, { t: "skill", name: sk.name, who: "汝" });
    if (sk.id === "xueji") { /* 血祭：至多损半、至少留1；「以道代血」免损 */
      let pay = 0;
      if (!G.relics.includes("bloodfree")) { pay = Math.max(1, Math.min(Math.floor(p.hp / 2), p.hp - 1)); p.hp -= pay; }
      p.st.emp = Math.min(4, p.st.emp + (sk.blood || 2)); /* 蓄力封顶，不可无限囤 */
      ev(G, { t: "blood", x: p.x, y: p.y, pay, charges: p.st.emp });
      log(G, "血祭！" + (pay ? "损" + pay + "血，" : "") + "接下来" + p.st.emp + "次伤害翻倍。");
      return;
    }
    if (sk.kind === "self") {
      if (sk.heal) { heal(G, p, sk.heal); log(G, "汝使「" + sk.name + "」，回" + sk.heal + "血。"); }
      if (sk.apGain) { /* 提壶狂奔：清技冷+聚力 */
        p.skills.forEach(s => { if (s.id !== sk.id) s.cdLeft = 0; });
        p.st.emp += (sk.empower || 1);
        log(G, "汝提壶狂奔，技冷尽清，下次伤害+1。");
      }
      return;
    }
    if (sk.kind === "global") {
      log(G, "汝使「" + sk.name + "」——全场波动！");
      livingEnemies(G).forEach(e => strike(G, p, e, "skill", { dmg: sk.dmg, stun: sk.stun }));
      return;
    }
    if (sk.kind === "burst") {
      log(G, "汝使「" + sk.name + "」。");
      const r = sk.range || 1;
      livingEnemies(G).filter(e => G3().manh(p.x, p.y, e.x, e.y) <= r).forEach(e => {
        const opt = { dmg: sk.dmg, poison: sk.poison };
        if (sk.stunChance !== undefined) { if (G.r.chance(sk.stunChance)) opt.stun = sk.stun; } else opt.stun = sk.stun;
        strike(G, p, e, "skill", opt);
      });
      return;
    }
    /* unit 单体 */
    const opt = { dmg: sk.dmg || 0, push: sk.push, stun: sk.stun, seal: sk.seal, evenBonus: sk.evenBonus };
    strike(G, p, foe, "skill", opt);
    /* 技能伤害显示基准：knifeMul 不适用技能 */
  }

  /* ---------------- 用物 ---------------- */
  function doItem(G, p, ii, tx, ty) {
    const it = G.items[ii];
    if (!it || it.n <= 0) return;
    const D = D2();
    const def = D.ITEMS[it.id];
    const consume = () => { it.n--; if (it.n <= 0) G.items.splice(ii, 1); };
    if (def.kind === "heal") { heal(G, p, def.val + (G._metaBonuses && G._metaBonuses.appetite ? G._metaBonuses.appetite * 2 : 0)); log(G, "汝食「" + def.name + "」。"); consume(); }
    else if (def.kind === "shield") { p.st.shield += def.val; log(G, "汝抹「" + def.name + "」，护盾+" + def.val + "。"); consume(); }
    else if (def.kind === "empower") { p.st.emp += 1; log(G, "汝持「" + def.name + "」为刃——下次伤害翻倍。"); consume(); }
    else if (def.kind === "cdclear") { p.skills.forEach(s => s.cdLeft = 0); log(G, "汝举壶痛饮，技冷尽清。"); consume(); }
    else if (def.kind === "buff") { p.st.buffKnife = def.val; log(G, "汝执黑棒——" + def.val + "回合刀击+1。"); consume(); }
    else if (def.kind === "throw") {
      const foe = tx != null ? unitAt(G, tx, ty) : null;
      if (!foe || foe.side !== "e" || G3().manh(p.x, p.y, tx, ty) > (def.range || 3)) { log(G, "掷无可掷。"); return; }
      ev(G, { t: "skill", name: def.name, who: "汝" });
      strike(G, p, foe, "item", { dmg: def.dmg, stun: def.stun });
      consume();
    }
  }

  /* ---------------- 存取 ---------------- */
  function serialize(G) {
    const o = JSON.parse(JSON.stringify(G));
    delete o.ev; delete o.r; delete o._visible;
    o.rs = G.r ? { a: G.r.state.a } : { a: 0 };
    return o;
  }
  /* 存档串：一次 stringify（_visible 可由地图+出生点推导，不入库；ev 清空） */
  function saveString(G) {
    const vis = G._visible, ev = G.ev;
    G._visible = undefined; G.ev = [];
    try { return JSON.stringify(G); } finally { G._visible = vis; G.ev = ev; }
  }
  function deserialize(o) {
    const G = JSON.parse(JSON.stringify(o));
    G.r = MDG.RNG.from(G.rs);
    G.ev = [];
    /* uid 续号：新造单位不与存档单位撞号 */
    let mx = UID;
    [G.player].concat(G.enemies || []).forEach(u => {
      const m = /^u(\d+)$/.exec(String(u && u.uid));
      if (m) { const v = parseInt(m[1], 10) + 1; if (v > mx) mx = v; }
    });
    UID = mx;
    return G;
  }

  MDG.Engine = {
    newRunState, enterFloor, act, serialize, deserialize, saveString,
    unitAt, livingEnemies, stairsOpenNow, computeStairs, gateIds, strike, heal, addItem, log, ev,
    /* 供表现层查询 */
    tileAt: (G, x, y) => G3().at(G.map, x, y),
    setTeleChance: (v) => { teleChance = v; },
    getTeleChance: () => teleChance
  };
})(typeof window !== "undefined" ? window : globalThis);
