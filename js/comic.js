/* ============================================================
 * 实验史记 · 马刀地宫 —— 连环画卷（四格漫画）
 * 纯 Canvas 简笔画：火柴人史官 + 大字格言，无任何外部资源。
 * 每格 = 一个静态场景绘制函数 + 一段台词；翻页时逐格翻入。
 * 挂载：MDG.Comic
 * ============================================================ */
(function () {
  "use strict";
  const MDG = window.MDG = window.MDG || {};

  /* ---------- 简笔画基础 ---------- */
  /* 火柴人：头 + 脊 + 双臂 + 双腿。pose 决定四肢角度。 */
  function stickman(t, x, y, h, pose, opts) {
    opts = opts || {};
    const lw = opts.lw || 3;
    t.strokeStyle = opts.color || "#ece6d7";
    t.lineWidth = lw;
    t.lineCap = "round";
    const head = h * 0.16;
    /* 头 */
    t.beginPath(); t.arc(x, y - h + head, head, 0, 7); t.stroke();
    const neckY = y - h + head * 2;
    const hipY = y - h * 0.45;
    /* 脊 */
    t.beginPath(); t.moveTo(x, neckY); t.lineTo(x, hipY); t.stroke();
    /* 臂：肩点向 pose.armL/armR 方向（弧度，从水平起算，正=向下） */
    const armL = pose.armL !== undefined ? pose.armL : 0.3;
    const armR = pose.armR !== undefined ? pose.armR : -0.3;
    const armLen = h * 0.32;
    t.beginPath();
    t.moveTo(x, neckY + h * 0.06);
    t.lineTo(x - Math.cos(armL) * armLen, neckY + h * 0.06 + Math.sin(armL) * armLen);
    t.moveTo(x, neckY + h * 0.06);
    t.lineTo(x + Math.cos(armR) * armLen, neckY + h * 0.06 + Math.sin(armR) * armLen);
    t.stroke();
    /* 腿 */
    const legL = pose.legL !== undefined ? pose.legL : 0.15;
    const legR = pose.legR !== undefined ? pose.legR : -0.15;
    const legLen = h * 0.45;
    t.beginPath();
    t.moveTo(x, hipY);
    t.lineTo(x - Math.cos(legL) * legLen, hipY + Math.sin(legL) * legLen * 0.9 + legLen * 0.35);
    t.moveTo(x, hipY);
    t.lineTo(x + Math.cos(legR) * legLen, hipY + Math.sin(legR) * legLen * 0.9 + legLen * 0.35);
    t.stroke();
    /* 刀（可选）：从右手向外的一条亮线 */
    if (pose.blade) {
      t.strokeStyle = "#c9a45f";
      t.lineWidth = lw * 0.8;
      t.beginPath();
      const bx = x + Math.cos(armR) * armLen, by = neckY + h * 0.06 + Math.sin(armR) * armLen;
      t.moveTo(bx, by);
      t.lineTo(bx + Math.cos(pose.blade) * h * 0.5, by + Math.sin(pose.blade) * h * 0.5);
      t.stroke();
      t.strokeStyle = opts.color || "#ece6d7";
      t.lineWidth = lw;
    }
    return { head: [x, y - h + head], handR: [x + Math.cos(armR) * armLen, neckY + h * 0.06 + Math.sin(armR) * armLen] };
  }

  /* 大字（格言），居中 */
  function caption(t, text, x, y, size, color) {
    t.fillStyle = color || "#ecd39a";
    t.font = "bold " + size + "px 'Noto Serif SC','SimSun',serif";
    t.textAlign = "center";
    t.textBaseline = "middle";
    t.fillText(text, x, y);
    t.textBaseline = "alphabetic";
    t.textAlign = "left";
  }

  /* 背景微纹（地平线 + 月） */
  function backdrop(t, w, h, night) {
    if (night) {
      t.fillStyle = "rgba(201,164,95,.14)";
      t.beginPath(); t.arc(w * 0.78, h * 0.2, h * 0.09, 0, 7); t.fill();
      t.fillStyle = "rgba(236,230,215,.5)";
      t.beginPath(); t.arc(w * 0.78, h * 0.2, h * 0.055, 0, 7); t.fill();
    }
    t.strokeStyle = "rgba(125,138,165,.4)";
    t.lineWidth = 1.5;
    t.beginPath(); t.moveTo(w * 0.08, h * 0.82); t.lineTo(w * 0.92, h * 0.82); t.stroke();
  }

  /* ---------- 四格场景 ---------- */
  /* 每格：draw(t, w, h) + line（台词）+ seal（右上角小印文字） */

  /* 序章四格 */
  const PRO = [
    { /* 第一格：毕业那天，wonder 躺在校门口 */
      seal: "前尘",
      draw(t, w, h) {
        backdrop(t, w, h, true);
        /* 铁门 */
        t.strokeStyle = "rgba(125,138,165,.7)"; t.lineWidth = 3;
        t.strokeRect(w * 0.12, h * 0.38, w * 0.2, h * 0.44);
        t.beginPath(); t.moveTo(w * 0.22, h * 0.38); t.lineTo(w * 0.22, h * 0.82); t.stroke();
        /* 躺着的 wonder（简化：横置火柴人） */
        t.strokeStyle = "#8c5a3c"; t.lineWidth = 3; t.lineCap = "round";
        t.beginPath();
        t.moveTo(w * 0.5, h * 0.79); t.lineTo(w * 0.62, h * 0.79);
        t.moveTo(w * 0.5, h * 0.79); t.lineTo(w * 0.46, h * 0.73);
        t.moveTo(w * 0.5, h * 0.79); t.lineTo(w * 0.46, h * 0.85);
        t.moveTo(w * 0.62, h * 0.79); t.lineTo(w * 0.66, h * 0.73);
        t.moveTo(w * 0.62, h * 0.79); t.lineTo(w * 0.66, h * 0.85);
        t.stroke();
        t.beginPath(); t.arc(w * 0.44, h * 0.79, h * 0.035, 0, 7); t.stroke();
        /* 站着的史官 */
        stickman(t, w * 0.78, h * 0.82, h * 0.34, { armR: 1.2 });
        /* 梧桐叶 */
        t.fillStyle = "rgba(201,164,95,.55)";
        for (let i = 0; i < 5; i++) {
          t.beginPath();
          t.ellipse(w * (0.3 + i * 0.11), h * (0.18 + (i % 2) * 0.05), 5, 2.4, i, 0, 7);
          t.fill();
        }
        caption(t, "毕业了", w * 0.5, h * 0.14, h * 0.1);
      },
      line: "毕业那天，wonder 躺在校门口：「写完这一场，你就毕业了。」"
    },
    { /* 第二格：写进书里的刀，不会消 */
      seal: "立言",
      draw(t, w, h) {
        backdrop(t, w, h, true);
        /* 一本书 + 一把插着的刀 */
        t.strokeStyle = "#ece6d7"; t.lineWidth = 3; t.lineCap = "round";
        t.beginPath(); t.moveTo(w * 0.3, h * 0.8); t.lineTo(w * 0.46, h * 0.8); t.stroke();
        t.beginPath(); t.moveTo(w * 0.3, h * 0.8); t.lineTo(w * 0.3, h * 0.72); t.stroke();
        t.beginPath(); t.moveTo(w * 0.46, h * 0.8); t.lineTo(w * 0.46, h * 0.72); t.stroke();
        /* 刀：竖插 */
        t.strokeStyle = "#c9a45f"; t.lineWidth = 4;
        t.beginPath(); t.moveTo(w * 0.62, h * 0.44); t.lineTo(w * 0.62, h * 0.8); t.stroke();
        t.strokeStyle = "#8a3b3b"; t.lineWidth = 5;
        t.beginPath(); t.moveTo(w * 0.62, h * 0.8); t.lineTo(w * 0.62, h * 0.86); t.stroke();
        /* 史官按卷 */
        stickman(t, w * 0.78, h * 0.82, h * 0.34, { armL: 0.9, armR: -0.2 });
        caption(t, "写进书里的刀", w * 0.5, h * 0.14, h * 0.085);
        caption(t, "不会消", w * 0.5, h * 0.24, h * 0.085);
      },
      line: "我答：「写进书里的刀，不会消。」——话，是说满了。"
    },
    { /* 第三格：旧稿摊开，写不出第十卷 */
      seal: "搁笔",
      draw(t, w, h) {
        backdrop(t, w, h, true);
        /* 摊开的九卷 */
        t.strokeStyle = "#ece6d7"; t.lineWidth = 2.5; t.lineCap = "round";
        for (let i = 0; i < 4; i++) {
          const bx = w * (0.24 + i * 0.14);
          t.beginPath(); t.moveTo(bx, h * 0.68); t.lineTo(bx + w * 0.09, h * 0.68); t.stroke();
          t.beginPath(); t.moveTo(bx, h * 0.72); t.lineTo(bx + w * 0.09, h * 0.72); t.stroke();
        }
        t.fillStyle = "rgba(125,138,165,.8)";
        t.font = "bold " + h * 0.05 + "px 'SimSun',serif";
        t.fillText("九卷", w * 0.24, h * 0.66);
        /* 第十卷：虚线空框 */
        t.strokeStyle = "rgba(201,164,95,.6)";
        t.setLineDash([5, 5]);
        t.strokeRect(w * 0.62, h * 0.56, w * 0.2, h * 0.18);
        t.setLineDash([]);
        t.fillStyle = "rgba(201,164,95,.8)";
        t.font = "bold " + h * 0.055 + "px 'SimSun',serif";
        t.fillText("第十卷？", w * 0.66, h * 0.68);
        /* 伏案的史官（垂头） */
        stickman(t, w * 0.5, h * 0.86, h * 0.3, { armL: 1.15, armR: -1.15 });
        caption(t, "写不出", w * 0.5, h * 0.14, h * 0.1);
      },
      line: "回来重翻九卷旧稿——写了三年的事，竟记不清刀后面的人。隔着的纸，终究不是人。"
    },
    { /* 第四格：夜宿旧教室，梦入卷底 */
      seal: "入梦",
      draw(t, w, h) {
        backdrop(t, w, h, true);
        /* 课桌小山 */
        t.strokeStyle = "#ece6d7"; t.lineWidth = 2.5;
        for (let i = 0; i < 3; i++) {
          const bx = w * (0.18 + i * 0.16), by = h * (0.72 - i * 0.07);
          t.strokeRect(bx, by, w * 0.12, h * 0.07);
        }
        /* 蜷睡的史官（Zzz） */
        t.strokeStyle = "#ece6d7"; t.lineWidth = 3; t.lineCap = "round";
        t.beginPath();
        t.moveTo(w * 0.66, h * 0.8); t.lineTo(w * 0.76, h * 0.8);
        t.moveTo(w * 0.66, h * 0.8); t.lineTo(w * 0.63, h * 0.84);
        t.stroke();
        t.beginPath(); t.arc(w * 0.79, h * 0.8, h * 0.03, 0, 7); t.stroke();
        t.fillStyle = "rgba(154,167,196,.9)";
        t.font = h * 0.05 + "px serif";
        t.fillText("Z", w * 0.8, h * 0.72);
        t.font = h * 0.04 + "px serif";
        t.fillText("z", w * 0.83, h * 0.68);
        /* 沉降的校园（地平线下露出倒置屋檐） */
        t.strokeStyle = "rgba(201,164,95,.55)";
        t.lineWidth = 2;
        t.beginPath(); t.moveTo(w * 0.14, h * 0.86); t.lineTo(w * 0.2, h * 0.9); t.lineTo(w * 0.26, h * 0.86); t.stroke();
        t.beginPath(); t.moveTo(w * 0.3, h * 0.88); t.lineTo(w * 0.36, h * 0.92); t.lineTo(w * 0.42, h * 0.88); t.stroke();
        caption(t, "梦入卷底", w * 0.5, h * 0.14, h * 0.1);
      },
      line: "夜宿旧教室，梦见校园一层层往下沉——记忆化作九层地宫，人人还在原地。提刀，入梦。"
    }
  ];

  /* 尾声四格（收卷） */
  const EPI = [
    { /* 梦醒：晨光擦掉粉笔题 */
      seal: "梦醒",
      draw(t, w, h) {
        backdrop(t, w, h, false);
        /* 粉笔字被擦去一半 */
        t.strokeStyle = "rgba(236,230,215,.75)"; t.lineWidth = 2.5;
        t.beginPath(); t.moveTo(w * 0.4, h * 0.42); t.lineTo(w * 0.48, h * 0.42); t.lineTo(w * 0.52, h * 0.5); t.stroke();
        t.strokeStyle = "rgba(236,230,215,.2)";
        t.beginPath(); t.moveTo(w * 0.56, h * 0.5); t.lineTo(w * 0.64, h * 0.42); t.stroke();
        /* 板擦 */
        t.fillStyle = "#3f4a5c";
        t.fillRect(w * 0.66, h * 0.52, w * 0.06, h * 0.035);
        caption(t, "梦醒", w * 0.5, h * 0.14, h * 0.1);
      },
      line: "梦醒天将亮。粉笔题被晨光擦得干干净净——人也是题，这一道，解完了。"
    },
    { /* 旧稿落笔 */
      seal: "落笔",
      draw(t, w, h) {
        backdrop(t, w, h, false);
        /* 摊开的第十卷 + 笔 */
        t.strokeStyle = "#ece6d7"; t.lineWidth = 2.5; t.lineCap = "round";
        t.beginPath(); t.moveTo(w * 0.32, h * 0.72); t.lineTo(w * 0.52, h * 0.72); t.stroke();
        t.beginPath(); t.moveTo(w * 0.32, h * 0.72); t.lineTo(w * 0.32, h * 0.62); t.stroke();
        t.beginPath(); t.moveTo(w * 0.52, h * 0.72); t.lineTo(w * 0.52, h * 0.62); t.stroke();
        t.strokeStyle = "#c9a45f"; t.lineWidth = 3;
        t.beginPath();
        t.moveTo(w * 0.6, h * 0.56); t.lineTo(w * 0.46, h * 0.68);
        t.stroke();
        /* 捱着的墨点 */
        t.fillStyle = "rgba(236,211,154,.85)";
        t.beginPath(); t.arc(w * 0.45, h * 0.69, 2.5, 0, 7); t.fill();
        caption(t, "第十卷 · 成", w * 0.5, h * 0.14, h * 0.09);
      },
      line: "旧稿摊开，最后一卷恰好落笔：「wonder 者，最早讲规则之人也。」"
    },
    { /* 刀后面的人，写清楚了 */
      seal: "合卷",
      draw(t, w, h) {
        backdrop(t, w, h, false);
        /* 一摞十卷，最上一卷新 */
        t.strokeStyle = "#ece6d7"; t.lineWidth = 2.5;
        for (let i = 0; i < 5; i++) {
          t.strokeRect(w * (0.34 + (i % 2) * 0.04), h * (0.72 - i * 0.055), w * 0.24, h * 0.045);
        }
        t.fillStyle = "#c9a45f";
        t.fillRect(w * 0.36, h * 0.635, w * 0.24, h * 0.045);
        /* 封题 */
        t.fillStyle = "#0c1220";
        t.font = "bold " + h * 0.045 + "px 'SimSun',serif";
        t.fillText("实验史记", w * 0.4, h * 0.665);
        caption(t, "刀后面的人", w * 0.5, h * 0.14, h * 0.09);
        caption(t, "写清楚了", w * 0.5, h * 0.24, h * 0.075, "#ece6d7");
      },
      line: "不写事，写人；不写刀，写刀后面的人——写进书里的，这次真的不会消了。"
    },
    { /* 重开重开 */
      seal: "重开",
      draw(t, w, h) {
        backdrop(t, w, h, true);
        /* 楼梯向下延伸，尽头一点灯火 */
        t.strokeStyle = "#ece6d7"; t.lineWidth = 2.5; t.lineCap = "round";
        for (let i = 0; i < 5; i++) {
          t.beginPath();
          t.moveTo(w * (0.3 + i * 0.06), h * (0.6 + i * 0.055));
          t.lineTo(w * (0.4 + i * 0.06), h * (0.6 + i * 0.055));
          t.stroke();
        }
        /* 灯火 */
        const f = 3 + Math.sin(Date.now() / 180) * 1.2;
        t.fillStyle = "rgba(230,140,60,.9)";
        t.beginPath(); t.arc(w * 0.78, h * 0.86, 4 + f, 0, 7); t.fill();
        /* 史官立于梯口 */
        stickman(t, w * 0.24, h * 0.6, h * 0.26, { armR: -0.4, blade: -1.1 });
        caption(t, "九层之下", w * 0.5, h * 0.14, h * 0.09);
        caption(t, "重开重开", w * 0.5, h * 0.24, h * 0.075, "#ece6d7");
      },
      line: "记忆九层，来日可重走。刀已收，卷已合——重开重开。"
    }
  ];

  /* ---------- 播放器 ---------- */
  let panels = null, cb = null, idx = 0;
  let host = null, cvs = null, anim = null;

  function drawPanel(tc, panel, w, h, reveal) {
    tc.clearRect(0, 0, w, h);
    /* 格框 */
    tc.fillStyle = "rgba(12,18,32,.9)";
    tc.fillRect(0, 0, w, h);
    panel.draw(tc, w, h);
    /* 右上角小印 */
    tc.fillStyle = "rgba(193,75,58,.85)";
    tc.fillRect(w - h * 0.16, h * 0.05, h * 0.11, h * 0.11);
    tc.fillStyle = "#ece6d7";
    tc.font = "bold " + h * 0.055 + "px 'SimSun',serif";
    tc.textAlign = "center";
    tc.fillText(panel.seal, w - h * 0.105, h * 0.105 + h * 0.03);
    tc.textAlign = "left";
    /* 揭示动画：从左到右扫出的白幕 */
    if (reveal < 1) {
      tc.fillStyle = "#05080f";
      tc.fillRect(w * reveal, 0, w * (1 - reveal) + 2, h);
    }
  }

  /* 建四格 DOM：2×2 画布 + 台词区 */
  function mount(container, page, onDone) {
    const box = document.createElement("div");
    box.className = "comic-page";
    const grid = document.createElement("div");
    grid.className = "comic-grid";
    const canvases = [];
    for (let i = 0; i < 4; i++) {
      const c = document.createElement("canvas");
      c.className = "comic-cell";
      c.width = 300; c.height = 210;
      grid.appendChild(c);
      canvases.push(c);
    }
    const line = document.createElement("div");
    line.className = "comic-line";
    box.appendChild(grid);
    box.appendChild(line);
    container.innerHTML = "";
    container.appendChild(box);
    /* 逐格翻入：揭示动画 + 台词随格出 */
    const dur = 420;
    canvases.forEach((c, i) => {
      const tc = c.getContext("2d");
      const start = i * 260;
      const t0 = performance.now() + start;
      function step(now) {
        if (now < t0) { requestAnimationFrame(step); return; }
        const k = Math.min(1, (now - t0) / dur);
        drawPanel(tc, page[i], c.width, c.height, k);
        if (k < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
    /* 台词即时序：每格翻出时更新台词 */
    for (let i = 0; i < 4; i++) {
      setTimeout(() => { line.textContent = page[i].line; }, i * 260 + dur);
    }
    if (onDone) setTimeout(onDone, 4 * 260 + dur + 200);
  }

  MDG.Comic = { PRO, EPI, mount };
})();
