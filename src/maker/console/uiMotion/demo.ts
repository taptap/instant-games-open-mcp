/** Shared verbatim by the gallery and the downloadable offline HTML. */
export const motionDemoScript = String.raw`
const MotionDemo = (() => {
  const W = 1280,
    H = 720,
    clamp = (n) => Math.max(0, Math.min(1, n));
  const palettes = [
    {
      accent: '#ee654e',
      light: '#f8be9a',
      dark: '#242f36',
      name: 'NOVA',
      role: '先锋 / 突进',
      power: 86,
    },
    {
      accent: '#3c9b96',
      light: '#b1d8cd',
      dark: '#183b43',
      name: 'MOSS',
      role: '守卫 / 防御',
      power: 72,
    },
    {
      accent: '#e3af4a',
      light: '#f4df9a',
      dark: '#4b3a26',
      name: 'SOL',
      role: '游侠 / 远程',
      power: 91,
    },
  ];
  const dialogue = [
    '港口的灯亮了。准备好了吗？今晚，我们会找到那座藏在雾里的剧院。',
    '听，钟声正在引路。带上你的勇气，接下来的舞台属于我们。',
  ];
  function sample(clip, time) {
    return LuaMotion.sample(clip, time);
  }
  function render(canvas, example, clip, time, state = {}) {
    const c = canvas.getContext('2d'),
      poses = sample(clip, time),
      controls = [],
      character = palettes[state.character || 0];
    const active = (id) => clip.id === id;
    function rect(x, y, w, h, color, r = 0) {
      c.fillStyle = color;
      c.beginPath();
      c.roundRect(x, y, w, h, r);
      c.fill();
    }
    function poly(points, color, stroke) {
      c.beginPath();
      c.moveTo(...points[0]);
      points.slice(1).forEach((p) => c.lineTo(...p));
      c.closePath();
      c.fillStyle = color;
      c.fill();
      if (stroke) {
        c.strokeStyle = stroke;
        c.lineWidth = 2;
        c.stroke();
      }
    }
    function line(points, color, width = 2) {
      c.beginPath();
      c.moveTo(...points[0]);
      points.slice(1).forEach((p) => c.lineTo(...p));
      c.strokeStyle = color;
      c.lineWidth = width;
      c.lineCap = 'round';
      c.stroke();
    }
    function circle(x, y, r, color, stroke) {
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fillStyle = color;
      c.fill();
      if (stroke) {
        c.strokeStyle = stroke;
        c.lineWidth = 2;
        c.stroke();
      }
    }
    function text(
      value,
      x,
      y,
      size = 24,
      color = '#202a2e',
      weight = 600,
      align = 'left',
      serif = false,
    ) {
      c.font =
        weight +
        ' ' +
        size +
        'px ' +
        (serif ? 'Georgia, serif' : 'PingFang SC, Microsoft YaHei, sans-serif');
      c.fillStyle = color;
      c.textAlign = align;
      c.textBaseline = 'middle';
      c.fillText(value, x, y);
    }
    function part(id, x, y, w, h, paint) {
      const p = {
        dx: 0,
        dy: 0,
        scale: 1,
        rotation: 0,
        opacity: 1,
        reveal: 1,
        revealY: 1,
        ...poses[id],
      };
      c.save();
      c.globalAlpha *= clamp(p.opacity);
      c.translate(x + w / 2 + p.dx, y + h / 2 + p.dy);
      c.rotate((p.rotation * Math.PI) / 180);
      c.scale(p.scale, p.scale);
      c.translate(-w / 2, -h / 2);
      if (p.reveal !== 1 || p.revealY !== 1) {
        c.beginPath();
        c.rect(0, 0, w * clamp(p.reveal), h * clamp(p.revealY));
        c.clip();
      }
      paint(p);
      c.restore();
    }
    function control(action, label, x, y, w, h, disabled = false) {
      controls.push({ action, label, x, y, w, h, disabled });
    }
    function star(x, y, r, color) {
      poly(
        [
          [x, y - r],
          [x + r * 0.26, y - r * 0.26],
          [x + r, y],
          [x + r * 0.26, y + r * 0.26],
          [x, y + r],
          [x - r * 0.26, y + r * 0.26],
          [x - r, y],
          [x - r * 0.26, y - r * 0.26],
        ],
        color,
      );
    }
    function runner(x, y, s, p = character) {
      c.save();
      c.translate(x, y);
      c.scale(s, s);
      circle(2, 10, 173, p.light);
      for (let i = 0; i < 7; i++)
        line(
          [
            [-150 + i * 50, -148],
            [-205 + i * 50, 165],
          ],
          '#f8f1df',
          1,
        );
      poly(
        [
          [-92, 110],
          [-17, 104],
          [-2, 335],
          [-61, 339],
        ],
        p.dark,
      );
      poly(
        [
          [1, 106],
          [72, 99],
          [131, 307],
          [67, 331],
        ],
        p.dark,
      );
      poly(
        [
          [-65, 325],
          [-1, 325],
          [2, 357],
          [-87, 357],
        ],
        '#f9f2df',
      );
      poly(
        [
          [69, 316],
          [130, 296],
          [159, 326],
          [84, 350],
        ],
        '#f9f2df',
      );
      poly(
        [
          [-97, -84],
          [53, -102],
          [108, 102],
          [-102, 145],
          [-132, 36],
        ],
        p.accent,
        p.dark,
      );
      poly(
        [
          [-97, -84],
          [-58, -96],
          [-34, 58],
          [-104, 88],
        ],
        '#f8f1df',
      );
      poly(
        [
          [-20, -105],
          [52, -101],
          [54, -39],
          [-20, -29],
        ],
        '#f8f1df',
      );
      poly(
        [
          [-102, -54],
          [-141, -46],
          [-180, 91],
          [-131, 115],
          [-86, 13],
        ],
        p.dark,
      );
      poly(
        [
          [55, -77],
          [88, -76],
          [168, -4],
          [143, 37],
          [64, -3],
        ],
        p.dark,
      );
      circle(155, 25, 25, p.light);
      circle(-155, 103, 24, p.light);
      rect(-89, 82, 180, 23, p.dark);
      rect(-12, 83, 33, 22, '#f1c96b');
      c.save();
      c.translate(-9, -154);
      c.rotate(-0.08);
      rect(-76, -84, 155, 139, p.dark, 48);
      rect(-66, -77, 142, 107, '#faf3df', 40);
      rect(-55, -56, 123, 58, p.dark, 25);
      rect(-34, -41, 44, 14, '#a5ddd1', 7);
      rect(20, -41, 23, 14, p.accent, 7);
      line(
        [
          [-46, 28],
          [26, 28],
        ],
        p.accent,
        5,
      );
      c.restore();
      line(
        [
          [87, -125],
          [131, -158],
          [172, -142],
        ],
        p.accent,
        7,
      );
      text('07', -28, -4, 35, '#fff8e8', 800);
      c.restore();
    }
    function signalBackdrop(city = false) {
      rect(0, 0, W, H, '#f4efdf');
      poly(
        [
          [680, 0],
          [1280, 0],
          [1280, 720],
          [475, 720],
        ],
        '#e8dfca',
      );
      for (let i = 0; i < 11; i++)
        line(
          [
            [750 + i * 70, 0],
            [360 + i * 70, 720],
          ],
          '#d7cdb8',
          1,
        );
      if (city) {
        rect(0, 0, W, H, '#c6d8d0');
        circle(1040, 150, 92, '#f8e6b4');
        for (let i = 0; i < 14; i++) {
          const h = 90 + ((i * 79) % 220),
            x = i * 110 - 20;
          rect(x, 390 - h, 90, h + 280, i % 2 ? '#56766c' : '#43645f');
          for (let j = 0; j < 4; j++) rect(x + 17, 410 - h + j * 50, 14, 20, '#a5beb0');
        }
        poly(
          [
            [0, 490],
            [1280, 440],
            [1280, 720],
            [0, 720],
          ],
          '#28463f',
        );
      }
      text('FIELD NOTES / 07', 54, 42, 16, city ? '#f4efdf' : '#6c7268', 500);
      text('SIGNAL RUNNER', 1226, 42, 17, city ? '#f4efdf' : '#6c7268', 700, 'right');
    }
    function menu(interactive) {
      signalBackdrop();
      part('actor', 680, 117, 470, 575, () => runner(230, 255, 1.05, palettes[0]));
      part('logo', 78, 112, 620, 190, () => {
        text('SIGNAL', 0, 57, 98, '#243334', 800, 'left', true);
        text('RUNNER', 0, 151, 98, '#243334', 800, 'left', true);
        rect(9, 183, 116, 5, '#ee654e');
      });
      ['开始旅程', '旅程设置', '旅行档案'].forEach((label, i) => {
        part('menu' + i, 90, 350 + i * 80, 435, 64, () => {
          const selected = (state.focus || 0) === i;
          poly(
            [
              [12, 0],
              [435, 0],
              [420, 64],
              [0, 64],
            ],
            selected ? '#ed654d' : '#243334',
          );
          text(label, 43, 31, 25, selected ? '#212f31' : '#f7f0df');
          text('0' + (i + 1), 389, 32, 17, selected ? '#212f31' : '#a9b6a6', 500, 'right');
          if (selected)
            part('cursor', 9, 20, 20, 24, () =>
              poly(
                [
                  [0, 0],
                  [16, 12],
                  [0, 24],
                ],
                '#f9f3e3',
              ),
            );
        });
        if (interactive) control('menu:' + i, label, 90, 350 + i * 80, 435, 64, active('confirm'));
      });
      if (active('confirm'))
        part('sweep', 90, 350 + (state.focus || 0) * 80, 1000, 64, () =>
          rect(0, 0, 1000, 64, '#fbf5e4'),
        );
      text('FOLLOW THE LIGHT. FIND YOUR STAGE.', 91, 657, 16, '#6b756b', 500);
    }
    function select(interactive) {
      signalBackdrop();
      text('选择你的同行者', 67, 114, 38);
      text('THE CREW', 69, 163, 18, '#717c72', 500);
      palettes.forEach((p, i) => {
        part('avatar' + i, 69, 225 + i * 116, 113, 95, () => {
          part('selection', 0, 0, 113, 95, () =>
            rect(0, 0, 113, 95, (state.character || 0) === i ? p.accent : '#ddd6c5', 8),
          );
          c.save();
          c.beginPath();
          c.roundRect(5, 5, 103, 85, 5);
          c.clip();
          runner(55, 111, 0.3, p);
          c.restore();
          text('0' + (i + 1), 10, 16, 14, p.dark, 700);
        });
        if (interactive) control('avatar:' + i, '选择 ' + p.name, 69, 225 + i * 116, 113, 95);
      });
      part('actor', 204, 120, 540, 568, () => runner(260, 255, 0.99));
      part('stats', 790, 175, 395, 292, () => {
        text(character.name, 0, 40, 76, character.dark, 800, 'left', true);
        text(character.role, 3, 102, 22, character.accent);
        ['攻击', '机动', '防御'].forEach((label, i) => {
          text(label, 2, 162 + i * 43, 17, '#687269');
          rect(77, 155 + i * 43, 285, 10, '#d5ccba', 5);
          rect(77, 155 + i * 43, 180 + ((character.power + i * 19) % 100), 10, character.accent, 5);
        });
      });
      ['疾风', '闪光', '破空'].forEach((label, i) => {
        part('skill' + i, 796 + i * 124, 499, 104, 96, () => {
          rect(0, 0, 104, 96, character.dark, 12);
          star(52, 31, 14, character.light);
          text(label, 52, 70, 19, '#faf3e3', 600, 'center');
        });
        if (interactive) control('attack:' + i, label + '攻击预览', 796 + i * 124, 499, 104, 96);
      });
      rect(1005, 633, 205, 51, character.accent, 6);
      text('进入剧情  →', 1108, 658, 20, character.dark, 700, 'center');
      text('点击技能，试试攻击预览', 795, 614, 16, '#6b756b', 500);
      if (active('attack')) {
        if (time >= 0.08)
          part('arc', 350, 120, 580, 450, () => {
            c.beginPath();
            c.arc(280, 240, 160 + (state.skill || 0) * 20, -1.7, 1.5);
            c.strokeStyle = character.accent;
            c.lineWidth = 28;
            c.stroke();
            c.strokeStyle = '#fffbed';
            c.lineWidth = 8;
            c.stroke();
          });
        if (time >= 0.22)
          part('slash', 200, 215 + (state.skill || 0) * 30, 930, 180, () => {
            poly(
              [
                [0, 170],
                [850, 0],
                [930, 0],
                [100, 180],
              ],
              character.accent,
            );
            poly(
              [
                [0, 170],
                [873, 3],
                [903, 3],
                [50, 180],
              ],
              '#fffdf1',
            );
          });
      }
      if (interactive) control('next', '进入剧情', 1005, 633, 205, 51);
    }
    function dialogueScene(interactive) {
      signalBackdrop(true);
      part('actor', 30, 100, 520, 620, () => runner(260, 270, 1.14));
      part('dialog', 430, 356, 790, 302, () => {
        poly(
          [
            [20, 0],
            [790, 0],
            [770, 302],
            [0, 302],
          ],
          '#f8f1de',
        );
        rect(24, 20, 6, 252, '#ee654e');
        const progress = poses.text?.textProgress ?? 1,
          chars = Array.from(dialogue[state.line || 0]),
          visible = chars.slice(0, Math.floor(chars.length * clamp(progress))).join('');
        for (let i = 0; i < Math.ceil(visible.length / 22); i++)
          text(visible.slice(i * 22, (i + 1) * 22), 57, 104 + i * 43, 27, '#283d39', 500);
        if (progress >= 1)
          part('hint', 680, 225, 52, 44, () =>
            poly(
              [
                [8, 4],
                [36, 22],
                [8, 40],
              ],
              '#ee654e',
            ),
          );
        text('0' + ((state.line || 0) + 1) + ' / 02', 56, 258, 15, '#718277', 500);
      });
      part('nameplate', 460, 322, 220, 66, () => {
        rect(0, 0, 220, 66, '#ee654e', 4);
        text(character.name, 27, 32, 27, '#293a35', 800, 'left', true);
      });
      text('THE LIGHTHOUSE / 第一幕', 69, 102, 17, '#e9f0df', 500);
      if (interactive)
        control(
          'dialogue',
          '继续对话',
          1090,
          573,
          100,
          70,
          (poses.text?.textProgress ?? 1) < 1 || active('exit'),
        );
    }
    function theaterBackdrop() {
      rect(0, 0, W, H, '#173f3b');
      const glow = c.createRadialGradient(740, 330, 20, 740, 330, 640);
      glow.addColorStop(0, '#547b62');
      glow.addColorStop(1, '#123c38');
      rect(0, 0, W, H, glow);
      for (let i = 0; i < 18; i++)
        line(
          [
            [i * 90, 0],
            [590 + i * 18, 720],
          ],
          '#2a5147',
          1,
        );
      circle(799, 302, 263, '#56755b', '#b69b5d');
      circle(799, 302, 242, '#365e50', '#a28d59');
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        star(799 + Math.cos(a) * 250, 302 + Math.sin(a) * 250, 8, '#d7be7d');
      }
      rect(0, 619, W, 101, '#173831');
      for (let i = 0; i < 8; i++)
        line(
          [
            [i * 200, 619],
            [i * 220 - 160, 720],
          ],
          '#52705a',
          1,
        );
      poly(
        [
          [0, 0],
          [165, 0],
          [110, 550],
          [0, 619],
        ],
        '#8e4a38',
      );
      poly(
        [
          [1280, 0],
          [1160, 0],
          [1190, 540],
          [1280, 619],
        ],
        '#8e4a38',
      );
      for (let i = 0; i < 5; i++)
        line(
          [
            [20 + i * 27, 0],
            [13 + i * 18, 555 - i * 14],
          ],
          '#b16a4a',
          3,
        );
      text('MIDNIGHT / SEASON 01', 52, 41, 16, '#d9c68e', 500);
    }
    function magician() {
      part('actor', 625, 137, 380, 535, () => {
        poly(
          [
            [132, 250],
            [240, 247],
            [271, 500],
            [206, 500],
            [173, 325],
            [151, 500],
            [86, 500],
          ],
          '#e1cc92',
        );
        poly(
          [
            [110, 110],
            [211, 115],
            [260, 324],
            [169, 287],
            [87, 327],
          ],
          '#f5e8c4',
        );
        poly(
          [
            [128, 105],
            [191, 104],
            [194, 214],
            [142, 204],
          ],
          '#a65a41',
        );
        poly(
          [
            [106, 122],
            [58, 175],
            [75, 280],
            [106, 260],
            [98, 188],
            [141, 155],
          ],
          '#d0ab66',
        );
        circle(79, 273, 18, '#ecc79a');
        c.save();
        c.translate(212, 135);
        c.rotate(((poses.arm?.rotation || 0) * Math.PI) / 180);
        poly(
          [
            [0, -15],
            [38, 9],
            [101, 84],
            [77, 105],
            [17, 57],
            [-14, 18],
          ],
          '#d5b571',
        );
        circle(89, 100, 19, '#ecc79a');
        line(
          [
            [101, 94],
            [149, 40],
          ],
          '#e7d89e',
          7,
        );
        star(155, 30, 21, '#f2db9a');
        c.restore();
        circle(161, 47, 54, '#2b2828');
        circle(164, 58, 41, '#e9bc8e');
        poly(
          [
            [114, 27],
            [172, -4],
            [209, 30],
            [187, 47],
            [153, 24],
            [124, 51],
          ],
          '#342b2b',
        );
        line(
          [
            [141, 58],
            [150, 60],
          ],
          '#513c31',
          3,
        );
        line(
          [
            [174, 60],
            [183, 58],
          ],
          '#513c31',
          3,
        );
        line(
          [
            [158, 81],
            [168, 81],
          ],
          '#ac6149',
          3,
        );
        poly(
          [
            [104, 10],
            [214, 10],
            [194, -38],
            [132, -38],
          ],
          '#274237',
        );
        rect(95, 4, 127, 13, '#d1b46b', 6);
        poly(
          [
            [146, 111],
            [165, 128],
            [145, 146],
            [130, 126],
          ],
          '#496b51',
        );
        circle(164, 236, 14, '#aa8e54');
        star(164, 236, 7, '#f0dda3');
        rect(79, 492, 83, 22, '#aa6448', 5);
        rect(203, 492, 83, 22, '#aa6448', 5);
      });
    }
    function theater(interactive) {
      theaterBackdrop();
      magician();
      part('logo', 95, 92, 530, 185, () => {
        text('THE CLOCKWORK', 0, 26, 22, '#dac68a', 500, 'left', true);
        text('发条剧院', 0, 102, 82, '#f2e5bb', 700);
        text('每一次开场，都是新的奇遇。', 6, 167, 20, '#c7cba7', 400);
      });
      ['章节演出', '往日回顾', '剧院轶事'].forEach((label, i) => {
        part('menu' + i, 100, 338 + i * 83, 345, 63, () => {
          poly(
            [
              [0, 7],
              [325, 0],
              [345, 56],
              [17, 63],
            ],
            i === 0 ? '#d8bf7d' : '#2e5547',
            '#c2ad73',
          );
          text(label, 38, 31, 27, i === 0 ? '#25473b' : '#eadfb5');
          star(304, 30, 10, i === 0 ? '#527057' : '#c0aa72');
        });
        if (interactive) control('theater:' + i, label, 100, 338 + i * 83, 345, 63);
      });
      rect(1025, 525, 133, 110, '#172d29', 12);
      part('rabbit', 1041, 447, 100, 100, () => {
        c.save();
        c.translate(50, 47);
        c.rotate(-0.15);
        c.fillStyle = '#f0e3bf';
        c.beginPath();
        c.ellipse(-15, -31, 10, 36, -0.15, 0, Math.PI * 2);
        c.ellipse(13, -32, 10, 37, 0.15, 0, Math.PI * 2);
        c.fill();
        circle(0, 15, 34, '#f0e3bf');
        circle(-11, 10, 3, '#2b4034');
        circle(12, 10, 3, '#2b4034');
        poly(
          [
            [-3, 20],
            [5, 20],
            [1, 25],
          ],
          '#b97057',
        );
        c.restore();
      });
      rect(1009, 538, 166, 15, '#d0ae63', 7);
      rect(1042, 610, 100, 16, '#bf9557', 6);
      part('clap', 844, 589, 308, 113, () => {
        rect(0, 7, 308, 98, '#eadfbc', 8);
        rect(10, 19, 288, 76, '#234b3d', 3);
        text('ACT 01  /  TAKE 01', 154, 57, 20, '#e4d39c', 600, 'center');
        c.save();
        c.translate(0, 2);
        c.rotate(((poses.hinge?.rotation || 0) * Math.PI) / 180);
        rect(0, 0, 308, 25, '#183c32', 3);
        for (let i = 0; i < 8; i++)
          poly(
            [
              [i * 44, 0],
              [i * 44 + 26, 0],
              [i * 44 + 10, 25],
              [i * 44 - 16, 25],
            ],
            '#d3ba79',
          );
        c.restore();
      });
      if (active('clap') && time >= 0.6)
        part('flash', 810, 553, 380, 167, () => rect(0, 0, 380, 167, '#fff3ce', 25));
      if (interactive) {
        control('clap', '打场记板', 844, 589, 308, 113);
        control('rabbit', '兔子跃出', 1005, 410, 170, 155);
      }
    }
    function destination(id) {
      if (id === 'map') {
        signalBackdrop();
        text('雾港航线', 83, 124, 48);
        text('NEXT DESTINATION', 86, 177, 18, '#7a7f6b', 500);
        const pts = [
          [170, 500],
          [370, 390],
          [650, 470],
          [850, 260],
          [1100, 330],
        ];
        line(pts, '#9da897', 4);
        pts.forEach(([x, y], i) => {
          circle(x, y, i === 3 ? 34 : 22, i === 3 ? '#ee654e' : '#304c43');
          circle(x, y, 7, '#f8efda');
          text('0' + (i + 1), x, y + 61, 18, '#51675b', 600, 'center');
        });
        text('航线已展开', 88, 650, 21, '#6a7867');
      } else if (id === 'chapter') {
        theaterBackdrop();
        rect(350, 90, 580, 530, '#e8dbb3', 18);
        text('ACT I', 640, 202, 27, '#927747', 500, 'center', true);
        text('钟声与来信', 640, 289, 58, '#285043', 700, 'center');
        star(640, 410, 75, '#a55c43');
        circle(640, 410, 35, '#e8dbb3');
        text('新的故事，即将开场', 640, 554, 23, '#758069', 500, 'center');
      } else {
        signalBackdrop(true);
        runner(420, 350, 0.7);
        text('BREAK THROUGH', 670, 232, 58, '#f7efda', 800, 'left', true);
        rect(730, 430, 370, 22, '#e46a4c', 11);
        text('蓄力完成', 919, 493, 22, '#f7efda', 600, 'center');
      }
    }
    function scene(id, interactive) {
      if (id === 'S01') menu(interactive);
      else if (id === 'S02') select(interactive);
      else if (id === 'S03') dialogueScene(interactive);
      else if (id === 'S04') theater(interactive);
      else destination(id);
    }
    c.save();
    c.scale(canvas.width / W, canvas.height / H);
    c.clearRect(0, 0, W, H);
    if (example.kind === 'transition') {
      const p = clamp(time / clip.duration);
      scene(p < 0.5 ? example.from : example.to, false);
      if (p > 0 && p < 1) {
        const cover = poses.cover,
          dx = cover.dx || 0,
          extent = cover.reveal;
        c.save();
        c.translate(dx, 0);
        if (example.id === 'T03') {
          // Foreground cards overscan all edges before the host swaps content.
          const cards = LuaMotion.named('BuiltinCards', null, p);
          for (let i = 0; i < 5; i++) {
            const card = cards['card' + i];
            c.save();
            c.translate(190 + i * 235, 390 - i * 28);
            c.rotate(card.rotation);
            c.scale(card.scale, card.scale);
            rect(-86, -126, 172, 252, '#f1dfb0', 10);
            rect(-76, -116, 152, 232, '#315647', 7);
            text('A', -61, -92, 28, '#e4c77e', 700);
            star(0, 0, 28, '#e4c77e');
            c.restore();
          }
        } else if (example.id === 'T01') {
          poly(
            [
              [1280 - extent * 1640, 0],
              [1340, 0],
              [1340, 720],
              [1570 - extent * 1640, 720],
            ],
            '#ee654e',
          );
          if (p < 0.45)
            for (let i = 0; i < 3; i++)
              rect(100 + extent * 900 + i * 40, 290 + i * 48, 250, 12, '#f9ddbd');
        } else {
          poly(
            [
              [-260, 880 - extent * 1500],
              [1540, -160 - extent * 1500],
              [1540, -160 + extent * 1500],
              [-260, 880 + extent * 1500],
            ],
            '#ee654e',
          );
          poly(
            [
              [-260, 880 - extent * 1470],
              [1540, -160 - extent * 1470],
              [1540, -160 + extent * 1470],
              [-260, 880 + extent * 1470],
            ],
            '#fff8e6',
          );
        }
        c.restore();
      }
    } else scene(example.id, true);
    if (state.notice) {
      rect(400, 44, 480, 54, '#203a32', 27);
      text(state.notice, 640, 71, 20, '#f7edcf', 500, 'center');
    }
    c.restore();
    return controls;
  }
  return { render, sample, palettes, dialogue };
})();
`;
