/* 战斗表现：只消费事件，不改变格子、血量、回合或输入。
 * 每个单位保留有限短动画；地图切换清空，隐藏目标不绘制。 */
(function () {
  "use strict";
  const MDG = window.MDG, TILE = MDG.Terrain.TILE;
  const poses = new Map();
  let strikes = [], impacts = [], fallen = [];
  const seen = (G, x, y) => !!(G._visible && G._visible[x + "," + y]);
  const clamp = n => Math.max(0, Math.min(1, n));
  function direction(x, y, tx, ty) {
    const d = Math.hypot(tx - x, ty - y) || 1;
    return { dx: (tx - x) / d, dy: (ty - y) / d };
  }
  function reset() { poses.clear(); strikes = []; impacts = []; fallen = []; }
  function remember(uid, key, value) {
    if (!uid) return;
    if (!poses.has(uid)) poses.set(uid, {});
    poses.get(uid)[key] = value;
    if (poses.size > 128) poses.delete(poses.keys().next().value);
  }
  function consume(G, events, now) {
    for (const e of events) {
      if (e.t === "swing") {
        if (!seen(G, e.x, e.y) || !seen(G, e.tx, e.ty)) continue;
        const motion = { ...e, ...direction(e.x, e.y, e.tx, e.ty), start: now };
        remember(e.uid, "attack", motion); strikes.push(motion);
      } else if (e.t === "push") {
        if (seen(G, e.x1, e.y1)) remember(e.uid, "push", { ...e, start: now });
      } else if (["hit", "shield", "miss", "parry"].includes(e.t)) {
        if (!seen(G, e.x, e.y)) continue;
        const motion = { ...e, ...direction(e.fromX ?? e.x - 1, e.fromY ?? e.y, e.x, e.y), start: now };
        const type = e.t === "hit" && e.zero ? "block" : e.t;
        remember(e.uid, type, motion);
        if (type !== "miss") impacts.push({ ...motion, type });
      } else if (e.t === "die" && seen(G, e.x, e.y)) fallen.push({ ...e, start: now });
    }
    strikes = strikes.slice(-24); impacts = impacts.slice(-40); fallen = fallen.slice(-24);
  }
  function pose(u, now) {
    const result = { x: 0, y: 0, tilt: 0, flash: 0, guard: 0, trail: 0, angle: null, attack: 0 };
    const state = poses.get(u.uid);
    if (!state) return result;
    for (const [type, e] of Object.entries(state)) {
      const age = now - e.start;
      if (age >= 520) { delete state[type]; continue; }
      if (age < 0) continue;
      if (type === "attack") {
        /* 预警阶段已抬刀：此处直接进冲刺撞击，短停顿后收势。 */
        const amount = age < 65 ? 1 : Math.max(0, 1 - (age - 65) / 155);
        if (amount > 0) { result.angle = Math.atan2(e.dy, e.dx); result.attack = amount; }
        result.x += e.dx * 7 * amount; result.y += e.dy * 7 * amount;
        result.tilt += .1 * (e.dx || 1) * amount;
      } else if (type === "hit" || type === "parry") {
        const amount = age < 60 ? 1 : Math.max(0, 1 - (age - 60) / 190);
        result.x += e.dx * 5 * amount; result.y += e.dy * 5 * amount;
        result.tilt += .14 * (e.dx || 1) * amount;
        result.flash = Math.max(result.flash, Math.max(0, 1 - age / 150));
        if (type === "hit") result.trail = Math.max(result.trail, (e.hpBefore || 0) * (1 - clamp((age - 100) / 380)));
      } else if (type === "shield" || type === "block") result.guard = Math.max(result.guard, Math.max(0, 1 - age / 240));
      else if (type === "miss") {
        const amount = Math.sin(clamp(age / 240) * Math.PI);
        result.x += -e.dy * 7 * amount; result.y += e.dx * 7 * amount;
      } else if (type === "push") {
        const amount = (1 - clamp(age / 170)) ** 2;
        result.x += (e.x0 - e.x1) * TILE * amount;
        result.y += (e.y0 - e.y1) * TILE * amount;
      }
    }
    if (!Object.keys(state).length) poses.delete(u.uid);
    return result;
  }
  function draw(ctx, G, now) {
    strikes = strikes.filter(e => now - e.start < 220);
    impacts = impacts.filter(e => now - e.start < 300);
    fallen = fallen.filter(e => now - e.start < 360);
    for (const [uid, state] of poses) {
      if (Object.values(state).every(e => now - e.start >= 520)) poses.delete(uid);
    }
    ctx.save();
    for (const e of strikes) {
      if (!seen(G, e.x, e.y) || !seen(G, e.tx, e.ty)) continue;
      const k = clamp((now - e.start) / 220), angle = Math.atan2(e.dy, e.dx);
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = e.side === "p" ? "#f3d6a0" : "#ed8775";
      ctx.lineWidth = 4 * (1 - k) + 1;
      ctx.beginPath();
      if (e.kind === "knife") {
        ctx.arc((e.x + .5) * TILE, (e.y + .5) * TILE, TILE * .78, angle - .7 + k * .8, angle + .65 + k * .8);
      } else {
        ctx.moveTo((e.x + .5) * TILE, (e.y + .5) * TILE);
        ctx.lineTo((e.tx + .5) * TILE, (e.ty + .5) * TILE);
      }
      ctx.stroke();
    }
    for (const e of impacts) {
      if (!seen(G, e.x, e.y)) continue;
      const k = clamp((now - e.start) / 300);
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = ["parry", "shield", "block"].includes(e.type) ? "#ffe4a3" : e.crit ? "#fff2d2" : "#ed927d";
      ctx.lineWidth = 2;
      const cx = (e.x + .5) * TILE - e.dx * 9, cy = (e.y + .5) * TILE - e.dy * 9;
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3 + .25, r = 3 + k * 15;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        ctx.lineTo(cx + Math.cos(a) * (r + 5 * (1 - k)), cy + Math.sin(a) * (r + 5 * (1 - k))); ctx.stroke();
      }
    }
    for (const e of fallen) {
      if (!seen(G, e.x, e.y)) continue;
      const k = clamp((now - e.start) / 360);
      ctx.save();ctx.translate((e.x + .5) * TILE, (e.y + .5) * TILE + 6 * k);
      ctx.rotate(.5 * k);ctx.scale(1, 1 - .45 * k);ctx.globalAlpha = .8 * (1 - k);
      ctx.fillStyle = e.color;ctx.fillRect(-13, -13, 26, 26);
      ctx.fillStyle = "#f0dfc8";ctx.font = "bold 17px serif";ctx.textAlign = "center";ctx.fillText(e.glyph, 0, 6);ctx.restore();
    }
    ctx.restore();
  }
  MDG.CombatFX = { reset, consume, pose, draw };
})();
