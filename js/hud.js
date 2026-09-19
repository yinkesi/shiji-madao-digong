/* ============================================================
 * 实验史记 · 马刀地宫 —— 窗牖卷（HUD 与诸面板）
 * 顶栏 / 技能栏 / 史官记事 / 行囊 / 刀谱 / 图鉴 / 修炼 / 名册 /
 * 商摊 / 设置 / 帮助 / 终局结算。挂载：MDG.HUD
 * ============================================================ */
(function () {
  "use strict";
  const MDG = window.MDG;
  const { $, el, toast } = MDG.APP;

  let game = null; // 由 main.js 注入 {G, meta, onAct, onShopBuy...}

  function bind(g) { game = g; }

  /* ---------------- 引导：教学 toast 与目标提示条 ---------------- */
  const TUT_TEXT = {
    move: "方向键 / WASD 走一格；J 只攻击/互动不移动——有敌攻击，遇箱灶梯商互动",
    camp: "前方有【灶间】——走近按 J：血满、技冷尽清，进镇守房前必歇",
    chest: "前方有【木箱】——朝它按 J 开箱：钱、吃食或刀卡",
    scroll: "前方有【史料】——走过即拾，文脉+1",
    shop: "前方有【小卖部】——按 J 进店，零花钱购物（↑↓ 选、Enter 买）",
    trap: "前方有【陷阱】——尖刺无视护盾，踩上损3血且报废；也可以引敌人踩上去",
    stairsLocked: "前方是【楼梯】——被镇守封着；先寻镇守斩之，梯方开",
    stairsOpen: "【楼梯已开】——站上楼梯按 J，下行下一层",
    learn: "录技成功！按 U/I/O/P（或数字键）施放，详见刀谱（C）",
    telegraph: "敌露出亮刀破绽（红框）！本回合内按 J 迎击＝弹反：抵消其攻势+2伤（破绽可遇不可求）",
    relic: "得刀卡【遗物】——本轮全程有效，详见行囊（B）"
  };
  function pushTut(evs) {
    evs.forEach(e => {
      if (e.t !== "tut") return;
      const msg = TUT_TEXT[e.k];
      if (msg) toast(msg, 3600);
    });
  }
  /* 目标提示条：按局势给一句话 + 键位提示 */
  function refreshObjective() {
    const G = game.G;
    if (!G || G.over) return;
    const bar = document.getElementById("objective-bar");
    if (!bar) return;
    const key = (k) => "<kbd>" + k + "</kbd>";
    let html = "";
    if (MDG.Engine.stairsOpenNow(G)) {
      html = "楼梯已开——寻梯按 " + key("J") + " 下行（小地图金点）";
    } else {
      const foes = MDG.Engine.livingEnemies(G).filter(u => u.chId !== "tree");
      const hunters = foes.filter(u => u.aggro);
      const boss = foes.find(u => u.boss);
      if (G.player.hp < G.player.maxHp * 0.4 && G.items.some(i => i.id === "fantuan" || i.id === "mantou")) {
        html = "血量告急——按 " + key("B") + " 开行囊吃口饭";
      } else if (foes.some(u => u.telegraph)) {
        html = "敌已亮刀（红框！）——" + key("J") + " 迎击＝弹反：抵消攻势+2伤";
      } else if (hunters.length) {
        html = hunters[0].name + "追上来了——" + key("J") + " 迎击，或走位甩开";
      } else if (G.player.st.disarm > 0) {
        html = "技被封" + G.player.st.disarm + "回合——" + key("J") + " 用刀，稳住";
      } else if (boss && !boss.aggro) {
        html = "镇守【" + boss.name + "】未惊动——绕后 " + key("J") + " 先手+2（急击勿失）";
      } else if (boss) {
        html = "与【" + boss.name + "】缠斗——半血先歇灶间，血祭留给精英";
      } else if (foes.length) {
        html = "寻敌而战——" + key("J") + " 攻击；" + key("U/I/O/P") + " 用技";
      } else {
        html = "清完此层了？找找镇守在哪（小地图找金点）";
      }
    }
    const t = document.getElementById("obj-text");
    if (t && t.dataset.last !== html) { t.innerHTML = html; t.dataset.last = html; }
    bar.style.display = "";
  }

  /* ---------------- 顶栏 ---------------- */
  function refreshHUD() {
    const G = game.G, M = game.meta;
    const def = G.floorDef;
    $("hud-floor-num").textContent = "第" + ["一", "二", "三", "四", "五", "六", "七", "八", "九"][G.floorIdx] + "层 ·";
    $("hud-floor-name").textContent = def.name + (G.player.bossTag ? "" : "");
    const rule = $("hud-rule");
    rule.textContent = def.rule ? "〔" + def.rule + "〕" : "";
    rule.title = def.ruleDesc || "";
    rule.style.display = def.rule ? "" : "none";
    $("bar-hp").style.width = Math.max(0, G.player.hp / G.player.maxHp * 100) + "%";
    $("bar-hp-text").textContent = Math.max(0, G.player.hp) + " / " + G.player.maxHp;
    $("bar-emp").style.width = (G.player.st.emp > 0 ? Math.min(100, G.player.st.emp * 50) : 0) + "%";
    $("bar-shield").textContent = (G.player.st.shield > 0 ? "盾 " + G.player.st.shield : "") + (G.player.st.buffKnife > 0 ? "　黑棒 " + G.player.st.buffKnife : "") + (G.player.lethalUsed ? "　命硬已用" : "");
    $("hud-cash").textContent = G.money;
    $("hud-wemai").textContent = G.wemai;
    $("hud-kills").textContent = "斩 " + G.kills;
  }

  /* ---------------- 技能栏 ---------------- */
  function refreshSkillbar() {
    const G = game.G;
    const bar = $("skillbar");
    bar.innerHTML = "";
    const HOT = ["U", "I", "O", "P"];
    G.player.skills.forEach((sk, i) => {
      const d = el("div", "skill" + (MDG.UI.armed.get() === i ? " armed" : ""));
      const hot = i < 4 ? HOT[i] : (i <= 8 ? String(i + 1) : "·"); /* 4-8 走数字键，更多靠鼠标 */
      d.innerHTML = `<span class="key">${hot}</span><b>${sk.name}</b><i>${sk.kind === "self" ? "自身" : sk.kind === "global" ? "全场" : "距" + (sk.range || 1)}</i>`;
      if (sk.cdLeft > 0) {
        const cd = el("div", "cd", String(sk.cdLeft));
        d.appendChild(cd);
      }
      d.onclick = () => window.MDG.Input.onSkillKey(i);
      bar.appendChild(d);
    });
    const wait = el("div", "skill");
    wait.innerHTML = `<span class="key">空格</span><b>待机</b><i>回合一</i>`;
    void 0;
    wait.onclick = () => MDG.Input.act({ t: "wait" });
    bar.appendChild(wait);
  }

  /* ---------------- 史官记事 ---------------- */
  function pushLog(evs) {
    const box = $("log");
    if (!box) return;
    evs.forEach(e => {
      if (e.t !== "log") return;
      const ln = el("div", "ln", e.text);
      if (e.text.includes("镇守") || e.text.includes("录技") || e.text.includes("刀卡") || e.text.includes("灶间")) ln.classList.add("hot");
      if (e.text.includes("汝损") || e.text.includes("折于") || e.text.includes("蚀")) ln.classList.add("bad");
      box.appendChild(ln);
      while (box.children.length > 9) box.firstChild.remove();
    });
  }

  /* ---------------- 通用面板 ---------------- */
  function openPanel(title, render) {
    $("panel-title").textContent = title;
    const body = $("panel-body");
    body.innerHTML = "";
    render(body);
    $("panel-mask").classList.remove("hidden");
    MDG.APP.sfx.ui();
  }
  function closePanel() { $("panel-mask").classList.add("hidden"); }
  const panelOpen = () => !$("panel-mask").classList.contains("hidden");

  function row(body) { return el("div", "row"); }

  /* ---------------- 行囊 ---------------- */
  function openBag() {
    const G = game.G;
    openPanel("行囊", body => {
      if (!G.items.length) body.appendChild(el("div", "muted", "行囊空空。（小卖部在 2/4/6/8 层）"));
      G.items.forEach((it, i) => {
        const def = MDG.DATA.ITEMS[it.id];
        const r = row(body);
        r.innerHTML = `<div class="grow"><b>${def.name}</b>×${it.n}<div class="muted">${def.desc}</div></div>`;
        const use = el("button", "pbtn", "用");
        use.onclick = () => {
          if (def.kind === "throw") { window.MDG.Input.armItem(i); closePanel(); return; }
          MDG.Input.act({ t: "item", ii: i });
          closePanel();
        };
        r.appendChild(use);
        body.appendChild(r);
      });
      const relics = el("div");
      relics.innerHTML = "<h5>刀卡（本轮有效）</h5>";
      if (!G.relics.length) relics.appendChild(el("div", "muted", "尚无刀卡。镇守与木箱有出。"));
      G.relics.forEach(id => {
        const d = MDG.DATA.RELICS[id];
        relics.appendChild(el("div", "row", `<div class="grow"><b>${d.name}</b><div class="muted">${d.desc}</div></div>`));
      });
      body.appendChild(relics);
    });
  }

  /* ---------------- 刀谱 ---------------- */
  function openBlades() {
    const G = game.G, M = game.meta;
    openPanel("刀谱", body => {
      const ch = MDG.DATA.CH(G.player.chId);
      body.appendChild(el("div", "row", `<div class="face" style="background:${ch.color}">${ch.glyph}</div>
        <div class="grow"><b>${ch.name}</b><em> ${ch.hao}</em><div class="muted">${ch.passive ? ch.passive.name + "：" + ch.passive.desc : ""}</div></div>`));
      body.appendChild(el("h5", "", "身怀之技"));
      G.player.skills.forEach((sk, i) => {
        body.appendChild(el("div", "row", `<div class="grow"><b>${sk.name}</b>${sk.cdLeft ? ' <span class="cin">冷却' + sk.cdLeft + "</span>" : ""}<div class="muted">${sk.desc}</div></div>`));
      });
      const learned = Object.keys(G.learned);
      body.appendChild(el("h5", "", "本轮录技（" + learned.length + "）"));
      if (!learned.length) body.appendChild(el("div", "muted", "白板之身。首次斩杀有名之角色，即录其技。（胜一场，录一技）"));
      learned.forEach(id => {
        const c = MDG.DATA.CH(id);
        body.appendChild(el("div", "row", `<div class="face" style="background:${c.color}">${c.glyph}</div>
          <div class="grow"><b>${c.name}</b><em> ${c.hao}</em><div class="muted">${c.bio}</div></div>`));
      });
    });
  }

  /* ---------------- 图鉴 ---------------- */
  function openDex() {
    const M = game.meta;
    openPanel("图鉴 · 地宫见闻", body => {
      body.appendChild(el("div", "muted", "斩杀过的角色入册；史料拾取入藏。"));
      const names = Object.keys(M.dex).sort();
      body.appendChild(el("h5", "", "已斩名录（" + names.length + "）"));
      names.forEach(id => {
        const c = MDG.DATA.CH(id);
        if (c) body.appendChild(el("div", "row", `<div class="face" style="background:${c.color}">${c.glyph}</div>
          <div class="grow"><b>${c.name}</b><em> ${c.hao}</em> ×${M.dex[id]}<div class="muted">${c.quote}</div></div>`));
      });
      if (!names.length) body.appendChild(el("div", "muted", "尚无。"));
      body.appendChild(el("h5", "", "史料（" + M.scrolls + "）"));
      body.appendChild(el("div", "muted", "每层藏史料二至三枚，拾之入藏，各值文脉一；集齐一层另赏三。"));
    });
  }

  /* ---------------- 修炼 ---------------- */
  function openCult(fromTitle) {
    const M = game.meta;
    openPanel("修炼 · 文脉 " + M.wemai, body => {
      body.appendChild(el("div", "muted", "文脉乃史官立言之利——每轮终局折算，可于此购永久之强。"));
      MDG.DATA.META_TREE.forEach(node => {
        const lv = MDG.Meta.treeLevel(M, node.id);
        const cost = MDG.Meta.nextCost(M, node.id);
        const r = row(body);
        r.innerHTML = `<div class="grow"><b>${node.name}</b> <span class="gold">${lv}/${node.max}</span><div class="muted">${node.desc}</div></div>`;
        const b = el("button", "pbtn", cost == null ? "已满" : "购 · " + cost);
        b.disabled = cost == null || M.wemai < cost;
        b.onclick = () => { if (MDG.Meta.buy(M, node.id)) { toast(node.name + "精进"); game.applyMetaBonuses(); openCult(fromTitle); } };
        r.appendChild(b);
        body.appendChild(r);
      });
    });
  }

  /* ---------------- 名册（选默认出战） ---------------- */
  function openRoster(cb) {
    const M = game.meta;
    openPanel("点将名册", body => {
      body.appendChild(el("div", "muted", "首次斩杀某层镇守，其人入册。点将出征——换将即换整套身法。"));
      M.runners.forEach(id => {
        const c = MDG.DATA.CH(id);
        if (!c) return;
        const sel = M.settings.runner === id;
        const r = row(body);
        r.style.cursor = "pointer";
        if (sel) r.style.borderColor = "var(--gold-bright)";
        r.innerHTML = `<div class="face" style="background:${c.color}">${c.glyph}</div>
          <div class="grow"><b>${c.name}</b><em> ${c.hao}</em>　血 ${c.hp} · 刀 ${c.dmg}<div class="muted">${c.passive ? "「" + c.passive.name + "」" + c.passive.desc : ""}${c.skill ? " · 技「" + c.skill.name + "」" : ""}</div></div>
          ${sel ? '<span class="gold">当前</span>' : "<span class='muted'>点选</span>"}`;
        r.onclick = () => { M.settings.runner = id; MDG.Meta.save(M); toast("下次入宫：" + c.name); closePanel(); if (cb) cb(); };
        body.appendChild(r);
      });
    });
  }

  /* ---------------- 商摊 ---------------- */
  function openShop() {
    const G = game.G, M = game.meta;
    openPanel("小卖部 · 地下分号", body => {
      body.appendChild(el("div", "muted", "沉在地下的小卖部还开着——零花钱：" + `<b class="gold">${G.money}</b>`));
      MDG.DATA.SHOP_STOCK.forEach(id => {
        const d = MDG.DATA.ITEMS[id];
        const r = row(body);
        r.innerHTML = `<div class="grow"><b>${d.name}</b> · ${d.price} 钱<div class="muted">${d.desc}</div></div>`;
        const b = el("button", "pbtn", "买");
        b.disabled = G.money < d.price;
        b.onclick = () => {
          if (G.money < d.price) return;
          G.money -= d.price;
          MDG.Engine.addItem(G, id);
          toast("购得「" + d.name + "」");
          MDG.APP.sfx.coin();
          openShop();
        };
        r.appendChild(b);
        body.appendChild(r);
      });
    });
  }

  /* ---------------- 设置 ---------------- */
  function openSys() {
    const M = game.meta;
    openPanel("系统", body => {
      const mute = el("button", "pbtn", M.settings.muted ? "音效：静" : "音效：响");
      mute.onclick = () => { M.settings.muted = !M.settings.muted; MDG.Meta.save(M); MDG.APP.setMuted(M.settings.muted); openSys(); };
      body.appendChild(mute);
      body.appendChild(el("div", "", "<div style='height:10px'></div>"));
      const exp = el("button", "pbtn", "导出存档");
      exp.onclick = () => {
        const data = btoa(unescape(encodeURIComponent(JSON.stringify(M))));
        prompt("存档代码（复制保存）：", data);
      };
      body.appendChild(exp);
      const imp = el("button", "pbtn", "导入存档");
      imp.onclick = () => {
        const code = prompt("粘贴存档代码：");
        if (!code) return;
        try {
          const m = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
          MDG.Meta.save(Object.assign(MDG.Meta.fresh(), m));
          toast("存档已导入");
          location.reload();
        } catch (e) { toast("存档代码无效"); }
      };
      body.appendChild(imp);
      body.appendChild(el("div", "", "<div style='height:10px'></div>"));
      const reset = el("button", "pbtn", "焚稿重开（清空局外进度）");
      reset.style.borderColor = "var(--cinnabar)"; reset.style.color = "var(--cinnabar)";
      reset.onclick = () => { if (confirm("焚稿重开：文脉、修炼、名册、图鉴皆清，且不可复元。确定？")) { MDG.Meta.save(MDG.Meta.fresh()); MDG.Store.del("shiji_digong_run_v1"); location.reload(); } };
      body.appendChild(reset);
      body.appendChild(el("div", "muted", "存档于 localStorage：shiji_digong_v1 / shiji_digong_run_v1"));
    });
  }

  /* ---------------- 帮助 ---------------- */
  function openHelp() {
    openPanel("观卷 · 玩法", body => {
      body.innerHTML = `
        <div style="line-height:2">
        <h5>目标</h5>深入地宫九层，斩各层镇守，第九层收卷。<br>
        <h5>操作</h5>
        · 方向键 / WASD：走一格；撞敌即刀击，撞箱/灶/梯/商摊即互动<br>
        · 数字键 1-9：用技（部分技需再点目标）　· 空格：待机　· I：行囊　· M：静音　· Esc：关面板<br>
        · 鼠标：点邻格互动；点远处自动走（见敌即停）
        <h5>规矩</h5>
        · 走一步、世界走一步。<b>急击勿失</b>：对未惊动之敌先手一刀 +2。<br>
        · <b>击破回血2</b>。胜一场，录一技——首杀有名之角色，录其技入谱。<br>
        · 每层有<b>特则</b>（顶栏红签，悬停可读）：难在机制，不在数值。<br>
        · <b>灶间</b>：血满、技冷清——进镇守房前必歇。<b>史料</b>：拾之得文脉。<br>
        · 阵亡不白死：折算<b>文脉</b>，于「修炼」购永久之强；首斩镇守者入点将名册。
        <h5>九层</h5>
        跑道之下 → 异能之窟 → 三国刀廊 → 协会堂 → 合流渊 → 禁令厅 → 神算之间 → 崇国庭 → 终焉之庭
        </div>`;
    });
  }

  /* ---------------- 终局结算 ---------------- */
  function showEnd(res, holdHidden) {
    const s = res.summary, r = res.result;
    const box = $("end-box");
    box.innerHTML = "";
    const h2 = el("h2", s.won ? "" : "lost", s.won ? "刀史收卷" : "搁笔");
    box.appendChild(h2);
    const add = (k, v) => box.appendChild(el("div", "line", `<span>${k}</span><b>${v}</b>`));
    add("所至", "第" + ["一", "二", "三", "四", "五", "六", "七", "八", "九"][Math.min(8, s.bestFloor - 1)] + "层 · " + s.floorName);
    add("难度", { easy: "简单", normal: "普通", hard: "困难", extreme: "极难", nightmare: "噩梦" }[s.diff] || s.diff);
    add("斩杀", s.kills + "（精英 " + s.eliteKills + "）");
    if (s.bossKills.length) add("斩镇守", s.bossKills.join("、"));
    if (s.learned.length) add("录技", s.learned.join("、"));
    if (s.relics.length) add("刀卡", s.relics.join("、"));
    add("史料", s.scrolls + " 枚");
    box.appendChild(el("div", "line", `<span>文脉入账</span><b class="gold">+${r.earned}</b>`));
    if (r.newUnlocks.length) {
      const u = el("div", "unlocks");
      r.newUnlocks.forEach(c => u.appendChild(el("div", "row", `<div class="face" style="background:${c.color}">${c.glyph}</div><div class="grow"><b>${c.name}</b><em> ${c.hao}</em> 入点将名册！</div>`)));
      box.appendChild(u);
    }
    if (r.newAchs.length) {
      const u = el("div", "unlocks");
      r.newAchs.forEach(a => u.appendChild(el("div", "row", `<div class="grow">成就 <b>「${a.name}」</b>——${a.desc}</div>`)));
      box.appendChild(u);
    }
    box.appendChild(el("div", "yueks", s.won
      ? "音克思曰：梦醒天将亮，最后一卷落笔。不写刀，写刀后面的人——写进书里的，这次真的不会消了。"
      : "音克思曰：写不动，不是忘得快，是想得深。此轮所想皆成文脉——明日再往下想。重开重开。"));
    const btns = el("div", "s-btns");
    const again = el("button", "t-btn primary", "再入宫");
    again.onclick = () => { location.hash = ""; window.MDG.Main.showSetup(); };
    const cult = el("button", "t-btn", "修炼");
    cult.onclick = () => { openCult(); };
    const back = el("button", "t-btn", "回题名");
    back.onclick = () => window.MDG.Main.showTitle();
    btns.appendChild(again); btns.appendChild(cult); btns.appendChild(back);
    box.appendChild(btns);
    if (!holdHidden) $("end-screen").classList.remove("hidden");
  }

  MDG.HUD = { bind, refreshHUD, refreshSkillbar, pushLog, pushTut, refreshObjective, openBag, openBlades, openDex, openCult, openRoster, openShop, openSys, openHelp, openPanel, closePanel, panelOpen, showEnd };
})();
