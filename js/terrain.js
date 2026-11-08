/* 地形材质与静态瓦片。只向传入的 Canvas 上下文绘图；缓存与迷雾由 UI 管理。 */
(function () {
  "use strict";
  const MDG = window.MDG;
  const GRID = () => MDG.Grid;
  const TILE = 42;

  const TERRAIN_THEMES = [
    { // 一至三层：冷蓝青石
      void: "#070b13", wall: "#111927", wallAlt: "#151f30", face: "#23324a",
      rim: "rgba(205,185,137,.58)", floor: "#2d3c58", floorAlt: "#293750",
      corridor: "#26364f", corridorAlt: "#2a3b56", rail: "#41536d",
      seam: "rgba(7,12,22,.62)", light: "rgba(222,230,235,.11)", shade: "rgba(2,6,13,.30)"
    },
    { // 四至六层：潮湿旧石
      void: "#07100f", wall: "#111d1d", wallAlt: "#162524", face: "#263a37",
      rim: "rgba(165,185,145,.50)", floor: "#314340", floorAlt: "#2c3d3b",
      corridor: "#293b3a", corridorAlt: "#304442", rail: "#4b625b",
      seam: "rgba(5,13,13,.64)", light: "rgba(220,232,211,.10)", shade: "rgba(2,8,8,.31)"
    },
    { // 七至九层：赤黑玄武岩
      void: "#10090d", wall: "#201319", wallAlt: "#28181e", face: "#3b2429",
      rim: "rgba(202,142,112,.52)", floor: "#49343a", floorAlt: "#423036",
      corridor: "#3b2c32", corridorAlt: "#433138", rail: "#68464a",
      seam: "rgba(17,7,10,.67)", light: "rgba(238,215,205,.09)", shade: "rgba(12,3,7,.34)"
    }
  ];

  function terrainTheme(G) { return TERRAIN_THEMES[Math.min(2, Math.floor((G.floorIdx || 0) / 3))]; }
  function tileHash(x, y, salt) {
    let n = Math.imul(x + 37, 374761393) + Math.imul(y + 71, 668265263) + Math.imul(salt || 0, 1442695041);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return (n ^ (n >>> 16)) >>> 0;
  }
  function isOpenTile(Gr, G, x, y) { return Gr.at(G.map, x, y) !== Gr.WALL; }

  function drawStoneCrack(t, px, py, x, y, color) {
    if (tileHash(x, y, 9) % 7 !== 0) return;
    const sx = 9 + tileHash(x, y, 3) % 20;
    const sy = 10 + tileHash(x, y, 5) % 16;
    t.strokeStyle = color;
    t.lineWidth = 1;
    t.beginPath();
    t.moveTo(px + sx, py + sy);
    t.lineTo(px + sx + 5, py + sy + 3);
    t.lineTo(px + sx + 2, py + sy + 8);
    t.lineTo(px + sx + 7, py + sy + 11);
    t.stroke();
  }

  function drawFloorStone(t, G, x, y, tile, pal) {
    const Gr = GRID();
    const px = x * TILE, py = y * TILE;
    if (tile === Gr.CORR) {
      const lc = Gr.at(G.map, x - 1, y) === Gr.CORR;
      const rc = Gr.at(G.map, x + 1, y) === Gr.CORR;
      const uc = Gr.at(G.map, x, y - 1) === Gr.CORR;
      const dc = Gr.at(G.map, x, y + 1) === Gr.CORR;
      const horizontal = (lc || rc) && !(uc || dc);
      const vertical = (uc || dc) && !(lc || rc);

      t.fillStyle = pal.seam;
      t.fillRect(px, py, TILE, TILE);
      t.fillStyle = tileHash(x, y, 2) % 3 ? pal.corridor : pal.corridorAlt;
      t.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
      t.fillStyle = pal.light;
      t.fillRect(px + 2, py + 2, TILE - 4, 1);
      t.fillRect(px + 2, py + 2, 1, TILE - 4);
      t.fillStyle = pal.shade;
      if (horizontal) {
        t.fillRect(px, py, TILE, 5); t.fillRect(px, py + TILE - 5, TILE, 5);
        t.fillStyle = pal.rail;
        t.fillRect(px, py + 5, TILE, 2); t.fillRect(px, py + TILE - 7, TILE, 2);
        t.fillStyle = pal.seam; t.fillRect(px + TILE - 1, py + 7, 1, TILE - 14);
      } else if (vertical) {
        t.fillRect(px, py, 5, TILE); t.fillRect(px + TILE - 5, py, 5, TILE);
        t.fillStyle = pal.rail;
        t.fillRect(px + 5, py, 2, TILE); t.fillRect(px + TILE - 7, py, 2, TILE);
        t.fillStyle = pal.seam; t.fillRect(px + 7, py + TILE - 1, TILE - 14, 1);
      } else {
        /* 转角、路口与房间门槛：方形铺石，四周都有收边。 */
        t.fillRect(px, py, TILE, 4); t.fillRect(px, py + TILE - 4, TILE, 4);
        t.fillRect(px, py, 4, TILE); t.fillRect(px + TILE - 4, py, 4, TILE);
        t.strokeStyle = pal.rail; t.lineWidth = 1;
        t.strokeRect(px + 5.5, py + 5.5, TILE - 11, TILE - 11);
      }
    } else {
      t.fillStyle = pal.seam;
      t.fillRect(px, py, TILE, TILE);
      t.fillStyle = tileHash(x, y, 1) % 3 ? pal.floor : pal.floorAlt;
      t.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
      /* 一格就是一块石板：不再在格内画十字，避免看起来像编辑器网格。 */
      t.fillStyle = pal.light;
      t.fillRect(px + 2, py + 2, TILE - 4, 1);
      t.fillRect(px + 2, py + 2, 1, TILE - 4);
      t.fillStyle = pal.shade;
      t.fillRect(px + 2, py + TILE - 3, TILE - 4, 1);
      t.fillRect(px + TILE - 3, py + 2, 1, TILE - 4);
    }
    drawStoneCrack(t, px, py, x, y, pal.seam);

    /* 可走区贴墙的一侧压一道门槛，保证贴图轮廓与碰撞轮廓完全一致。 */
    t.fillStyle = pal.rim;
    if (!isOpenTile(Gr, G, x - 1, y)) t.fillRect(px, py, 2, TILE);
    if (!isOpenTile(Gr, G, x + 1, y)) t.fillRect(px + TILE - 2, py, 2, TILE);
    if (!isOpenTile(Gr, G, x, y - 1)) t.fillRect(px, py, TILE, 2);
    if (!isOpenTile(Gr, G, x, y + 1)) t.fillRect(px, py + TILE - 2, TILE, 2);
  }

  function drawSpecialPad(t, px, py, color) {
    t.fillStyle = "rgba(4,8,14,.34)";
    t.beginPath(); t.arc(px + TILE / 2, py + TILE / 2 + 2, 16, 0, Math.PI * 2); t.fill();
    t.strokeStyle = color; t.lineWidth = 1;
    t.beginPath(); t.arc(px + TILE / 2, py + TILE / 2 + 2, 14.5, 0, Math.PI * 2); t.stroke();
  }

  /* ---- 静态瓦片（进地形层）——墙、房间、走廊使用不同材质语言 ---- */
  function drawTileStatic(t, G, x, y, tile, campfiresOut) {
    const Gr = GRID();
    const px = x * TILE, py = y * TILE;
    const pal = terrainTheme(G);
    if (tile === Gr.WALL) {
      const openL = isOpenTile(Gr, G, x - 1, y), openR = isOpenTile(Gr, G, x + 1, y);
      const openU = isOpenTile(Gr, G, x, y - 1), openD = isOpenTile(Gr, G, x, y + 1);
      const boundary = openL || openR || openU || openD;
      /* 深墙保持成整片暗面，只有挨着地面的墙才露出石砌立面。 */
      t.fillStyle = pal.void;
      t.fillRect(px, py, TILE, TILE);
      if (!boundary) {
        if (tileHash(x, y, 12) % 13 === 0) {
          t.fillStyle = "rgba(255,255,255,.018)";
          t.fillRect(px + 8, py + 11, 2, 2);
        }
        return;
      }
      t.fillStyle = tileHash(x, y, 4) % 3 ? pal.wall : pal.wallAlt;
      t.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
      t.fillStyle = pal.light;
      t.fillRect(px + 3, py + 3, TILE - 6, 2);
      t.fillRect(px + 3, py + 3, 2, TILE - 6);
      t.strokeStyle = pal.seam; t.lineWidth = 1;
      t.beginPath();
      t.moveTo(px + 3, py + TILE * .56); t.lineTo(px + TILE - 3, py + TILE * .56);
      if (tileHash(x, y, 6) % 2) {
        t.moveTo(px + TILE * .38, py + 4); t.lineTo(px + TILE * .38, py + TILE * .56);
      } else {
        t.moveTo(px + TILE * .63, py + TILE * .56); t.lineTo(px + TILE * .63, py + TILE - 4);
      }
      t.stroke();
      /* 朝向可走区域的厚墙面：暗影在内、亮边恰好落在碰撞边界上。 */
      if (openL) { t.fillStyle = pal.face; t.fillRect(px, py + 3, 8, TILE - 6); t.fillStyle = pal.rim; t.fillRect(px, py, 2, TILE); }
      if (openR) { t.fillStyle = pal.face; t.fillRect(px + TILE - 8, py + 3, 8, TILE - 6); t.fillStyle = pal.rim; t.fillRect(px + TILE - 2, py, 2, TILE); }
      if (openU) { t.fillStyle = pal.face; t.fillRect(px + 3, py, TILE - 6, 8); t.fillStyle = pal.rim; t.fillRect(px, py, TILE, 2); }
      if (openD) { t.fillStyle = pal.face; t.fillRect(px + 3, py + TILE - 8, TILE - 6, 8); t.fillStyle = pal.rim; t.fillRect(px, py + TILE - 2, TILE, 2); }
      return;
    }
    drawFloorStone(t, G, x, y, tile, pal);
    if (tile === Gr.TRAP) {
      const kind = (G.map.trapKinds || {})[x + "," + y] || "spike";
      if (kind === "poison") {
        /* 毒沼：不规则积液和亮泡，边缘仍露出原石板。 */
        t.fillStyle = "rgba(75,118,61,.72)";
        t.beginPath();
        t.moveTo(px + 6, py + 29); t.quadraticCurveTo(px + 8, py + 11, px + 21, py + 9);
        t.quadraticCurveTo(px + 36, py + 12, px + 35, py + 29);
        t.quadraticCurveTo(px + 24, py + 38, px + 6, py + 29); t.fill();
        t.strokeStyle = "rgba(166,205,115,.72)"; t.lineWidth = 1.5; t.stroke();
        t.fillStyle = "rgba(154,205,104,.78)";
        for (const [ox, oy, r] of [[14, 26, 4], [27, 20, 3.5], [22, 31, 2.5]]) {
          t.beginPath(); t.arc(px + ox, py + oy, r, 0, 7); t.fill();
        }
        t.fillStyle = "rgba(222,244,175,.86)";
        t.beginPath(); t.arc(px + 17, py + 23, 1.6, 0, 7); t.fill();
        t.beginPath(); t.arc(px + 28, py + 18, 1.3, 0, 7); t.fill();
      } else if (kind === "rock") {
        /* 落石：红色落点环 + 悬石，和尖刺的轮廓完全不同。 */
        drawSpecialPad(t, px, py, "rgba(211,103,77,.68)");
        t.strokeStyle = "rgba(224,112,95,.74)"; t.lineWidth = 2;
        t.beginPath(); t.arc(px + TILE / 2, py + TILE / 2 + 5, 10, 0, 7); t.stroke();
        t.fillStyle = "#858991";
        t.beginPath();
        t.moveTo(px + 12, py + 5); t.lineTo(px + TILE - 9, py + 9); t.lineTo(px + TILE - 14, py + 19); t.lineTo(px + 15, py + 17);
        t.closePath(); t.fill();
        t.fillStyle = "rgba(255,255,255,.16)";
        t.fillRect(px + 15, py + 8, 12, 2);
        t.strokeStyle = "#b95347"; t.lineWidth = 1.5;
        t.beginPath();
        t.moveTo(px + 20, py + 22); t.lineTo(px + 16, py + 30); t.lineTo(px + 22, py + 36);
        t.stroke();
      } else {
        /* 尖刺：金属底槽 + 四枚高亮锥刺。 */
        t.fillStyle = "rgba(120,42,41,.34)";
        t.fillRect(px + 4, py + 7, TILE - 8, TILE - 12);
        t.strokeStyle = "rgba(224,112,95,.72)"; t.lineWidth = 1;
        t.strokeRect(px + 4.5, py + 7.5, TILE - 9, TILE - 13);
        const hs = [8, 16, 24, 32];
        for (let i = 0; i < hs.length; i++) {
          const bx = hs[i];
          t.fillStyle = i % 2 ? "#d5c6b1" : "#aeb4bd";
          t.beginPath(); t.moveTo(px + bx - 4, py + 33); t.lineTo(px + bx, py + (i % 2 ? 11 : 16)); t.lineTo(px + bx + 4, py + 33); t.closePath(); t.fill();
          t.strokeStyle = "rgba(255,240,220,.38)"; t.stroke();
        }
        t.fillStyle = "#b94b43"; t.fillRect(px + 5, py + 33, TILE - 10, 3);
      }
      return;
    }
    if (tile === Gr.TREE) {
      /* 树：明确的堵路物（此前没有画出来，是字面意义的空气墙） */
      t.fillStyle = "rgba(0,0,0,.35)";
      t.beginPath(); t.ellipse(px + TILE / 2, py + TILE - 8, 11, 4.5, 0, 0, 7); t.fill();
      t.fillStyle = "#3d2c1a";
      t.fillRect(px + TILE / 2 - 3, py + TILE - 16, 6, 10);
      t.fillStyle = "#2f5232";
      t.beginPath(); t.arc(px + TILE / 2, py + TILE / 2 - 4, 13, 0, 7); t.fill();
      t.fillStyle = "#3c6a40";
      t.beginPath(); t.arc(px + TILE / 2 - 4, py + TILE / 2 - 7, 8, 0, 7); t.fill();
      return;
    }
    if (tile === Gr.CHEST) {
      drawSpecialPad(t, px, py, "rgba(201,164,95,.55)");
      t.fillStyle = "#6a4f2c"; t.fillRect(px + 7, py + 12, TILE - 14, TILE - 22);
      t.fillStyle = "#c9a45f"; t.fillRect(px + 7, py + 12, TILE - 14, 5);
      t.fillStyle = "#2c2014"; t.fillRect(px + TILE / 2 - 2, py + 19, 4, 7);
    } else if (tile === Gr.SCROLL) {
      drawSpecialPad(t, px, py, "rgba(216,203,168,.45)");
      t.fillStyle = "#d8cba8"; t.fillRect(px + 12, py + 10, TILE - 24, TILE - 20);
      t.fillStyle = "#8a3b3b"; t.fillRect(px + 12, py + 10, 4, TILE - 20);
      t.fillStyle = "#5a4a2c"; t.font = "12px serif"; t.textAlign = "center";
      t.fillText("史", px + TILE / 2 + 2, py + TILE / 2 + 4);
      t.textAlign = "left";
    } else if (tile === Gr.CAMPFIRE) {
      drawSpecialPad(t, px, py, "rgba(208,138,79,.48)");
      t.fillStyle = "#3a2c1c"; t.fillRect(px + 8, py + TILE - 14, TILE - 16, 6);
      campfiresOut.push([x, y]);
    } else if (tile === Gr.SHOP) {
      drawSpecialPad(t, px, py, "rgba(125,201,154,.48)");
      t.fillStyle = "#26402f"; t.fillRect(px + 5, py + 10, TILE - 10, TILE - 18);
      t.fillStyle = "#c9a45f"; t.font = "16px serif"; t.textAlign = "center";
      t.fillText("贾", px + TILE / 2, py + TILE / 2 + 5);
      t.textAlign = "left";
    }
  }

  MDG.Terrain = { TILE, drawTile: drawTileStatic };
})();
