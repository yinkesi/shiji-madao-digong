/* 角色字牌、血条与状态标记。位置与状态由引擎提供，渲染不修改角色。 */
(function () {
  "use strict";
  const MDG = window.MDG;
  const TILE = MDG.Terrain.TILE;

  function drawUnit(ctx, u, now, isPlayer) {
    const px = u.x * TILE, py = u.y * TILE;
    const motion = MDG.CombatFX.pose(u, now);
    const winding = !isPlayer && u.attackWarning && !u.st.stun;
    const angle = motion.angle ?? Math.atan2((u.aimY ?? u.y) - u.y, (u.aimX ?? u.x + 1) - u.x);
    const bob = winding || motion.flash || u.st.stun ? 0 : Math.sin(now / 300 + u.x * 3) * 1.2;
    ctx.fillStyle = "rgba(0,0,0,.4)";
    ctx.beginPath(); ctx.ellipse(px + TILE / 2, py + TILE - 6, 13, 5, 0, 0, 7); ctx.fill();
    ctx.save();
    ctx.translate(px + TILE / 2 + motion.x - (winding ? Math.cos(angle) * 2 : 0), py + TILE / 2 + motion.y);
    ctx.rotate(motion.tilt);
    ctx.translate(-px - TILE / 2, -py - TILE / 2);
    const r = 14;
    ctx.fillStyle = u.color;
    ctx.strokeStyle = isPlayer ? "#ecd39a" : (u.boss ? "#c14b3a" : "rgba(0,0,0,.4)");
    ctx.lineWidth = isPlayer ? 2.5 : (u.boss ? 2.5 : 1.5);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(px + TILE / 2 - r, py + 6 + bob, r * 2, r * 2, 7);
    else ctx.rect(px + TILE / 2 - r, py + 6 + bob, r * 2, r * 2);
    ctx.fill(); ctx.stroke();
    if (motion.flash > 0) { ctx.fillStyle = "rgba(255,245,221," + motion.flash * .8 + ")"; ctx.fill(); }
    ctx.fillStyle = "#fff";
    ctx.font = "bold 17px serif"; ctx.textAlign = "center";
    ctx.fillText(u.glyph, px + TILE / 2, py + 6 + bob + 23);
    if (winding || motion.attack) {
      ctx.save(); ctx.translate(px + TILE / 2, py + TILE / 2);
      ctx.rotate(angle + (winding ? -.85 : .35 * (1 - motion.attack)));
      ctx.strokeStyle = "#936b43"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(10, 5); ctx.lineTo(17, 5); ctx.stroke();
      ctx.fillStyle = winding ? (u.telegraph ? "#ffb2a0" : "#ffe1a0") : "#fff0d0";
      ctx.beginPath(); ctx.moveTo(16, 2); ctx.lineTo(31, 2); ctx.lineTo(27, 7); ctx.lineTo(16, 7); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    if (motion.guard > 0) {
      ctx.strokeStyle = "rgba(255,224,155," + motion.guard + ")"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px + TILE / 2, py + TILE / 2, 17, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    ctx.textAlign = "left";
    const w = TILE - 12, hpr = Math.max(0, u.hp / u.maxHp);
    ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(px + 6, py + TILE - 3, w, 3);
    ctx.fillStyle = "#f4bc78"; ctx.fillRect(px + 6, py + TILE - 3, w * Math.min(1, Math.max(u.hp, motion.trail) / u.maxHp), 3);
    ctx.fillStyle = hpr > .5 ? "#7dc99a" : (hpr > .25 ? "#d0a04f" : "#c14b3a");
    ctx.fillRect(px + 6, py + TILE - 3, w * hpr, 3);
    let ix = 0;
    ctx.font = "10px serif";
    const mark = (txt, color) => { ctx.fillStyle = color; ctx.fillText(txt, px + 4 + ix * 11, py + 12); ix++; };
    if (u.st.shield > 0) mark("盾", "#c9a45f");
    if (u.st.poison > 0) mark("毒", "#8aa04f");
    if (u.st.stun > 0) mark("晕", "#9aa7c4");
    if (u.st.disarm > 0) mark("缴", "#d0705f");
    if (u.st.emp > 0) mark("祭", "#c14b3a");
    if (isPlayer && u.st.buffKnife > 0) mark("棒", "#d0a04f");
  }

  MDG.Units = { draw: drawUnit };
})();
