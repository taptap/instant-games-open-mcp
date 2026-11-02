export const uiMotionScript = String.raw`
const effects = [
  [
    "main",
    "主界面入场",
    "页面与切换",
    "标题、侧栏、底栏分组出现",
    "PlayMainEnter",
    "主界面首次打开或返回",
    "背景、标题、中心区域、左右按钮、底栏",
    "先淡入，再分组错峰；只对缩放等允许回弹的属性使用 outBack。",
    "▤",
    "▥",
  ],
  [
    "banner",
    "横幅通知",
    "提示与弹窗",
    "从右进入，停留，再向左离开",
    "PlayBanner",
    "活动通知、完成提示",
    "通知容器与文本",
    "完整保留进入、停留、离开三段；新通知到来时明确替换或排队。",
    "━",
    "›",
  ],
  [
    "bubble",
    "气泡提示",
    "提示与弹窗",
    "轻轻弹出，指向提示对象",
    "PlayBubble",
    "角色对话、按钮说明",
    "气泡容器与锚点",
    "跟随目标位置；目标隐藏或移除时一起关闭。",
    "◌",
    "…",
  ],
  [
    "dialog",
    "轻量对话框",
    "提示与弹窗",
    "小幅滑入并缩放",
    "PlayDialog",
    "非全屏说明、确认信息",
    "面板、正文与操作按钮",
    "以实际布局为基准做相对位移，不照搬 demo 的固定 x 坐标。",
    "▣",
    "›",
  ],
  [
    "list",
    "列表入场",
    "列表与卡片",
    "列表整体滑入，内容错峰出现",
    "PlayList",
    "背包、任务、排行",
    "列表容器与当前可见行",
    "只处理可见项；长列表与复用行需要重置状态。",
    "☷",
    "☷",
  ],
  [
    "side",
    "右侧快捷列表",
    "列表与卡片",
    "抽屉打开，条目依次滑入",
    "PlaySideList",
    "快捷菜单、侧边功能",
    "侧栏容器与功能项",
    "容器与条目分别处理；对齐项使用 outCubic，关闭时取消未完成项。",
    "☰",
    "‹",
  ],
  [
    "cards",
    "卡片入场",
    "列表与卡片",
    "多张卡片依次弹出",
    "PlayCards",
    "商品、装备、奖励展示",
    "卡片容器与可见卡片",
    "按实际数量错峰；装饰旋转以不影响阅读为限。",
    "▯",
    "▯",
  ],
  [
    "modal",
    "遮罩弹窗",
    "提示与弹窗",
    "背景变暗，面板弹出",
    "PlayModal / HideModal",
    "需要确认的独立操作",
    "遮罩、弹窗和关闭按钮",
    "提供关闭入口；按业务要求拦截背景点击，关闭后恢复。",
    "▣",
    "×",
  ],
  [
    "wipe",
    "横条刷屏",
    "页面与切换",
    "横条覆盖后揭示新界面",
    "PlayColorWipe",
    "场景或大页面切换",
    "独立覆盖层与切换事件",
    "完全遮盖时才切内容；保护输入并在失败时恢复，不能出现视觉缝隙。",
    "═",
    "═",
  ],
  [
    "reward",
    "奖励飞入与计数",
    "反馈与引导",
    "道具飞向目标，数字滚动",
    "PlayRewardBurst",
    "领取、掉落、结算反馈",
    "起点、目标图标、计数 Label",
    "收到成功回执后演出；数字只做显示插值，不重复修改资产。",
    "✦",
    "+",
  ],
  [
    "magnet",
    "磁吸列表",
    "列表与卡片",
    "条目滑入槽位并轻轻吸附",
    "PlayMagnetList",
    "任务整理、物品排列",
    "条目和目标槽位",
    "根据实际槽位定位；避免把循环复用项保留在中间状态。",
    "≡",
    "→",
  ],
  [
    "flip",
    "2D 翻牌",
    "列表与卡片",
    "横向压缩，中点换面后展开",
    "PlayFlipCards",
    "卡牌揭晓、抽取结果",
    "卡牌正面、背面、横向缩放层",
    "这是 2D 模拟翻牌；结果提前确定，换面不能再次请求随机结果。",
    "◇",
    "◆",
  ],
  [
    "ripple",
    "按钮冲击波",
    "反馈与引导",
    "已有按钮依次缩放、高亮",
    "PlayRipple",
    "核心操作的视觉反馈",
    "触发按钮与附近现有控件",
    "复用已有按钮，避免叠加第二份点击区；重复点击可重置当前演出。",
    "◎",
    "◉",
  ],
  [
    "spotlight",
    "聚光引导",
    "反馈与引导",
    "聚光依次移动到关键功能",
    "PlaySpotlight",
    "新手引导、功能介绍",
    "目标节点、挖孔遮罩、说明与退出",
    "视觉挖孔与允许点击的区域一致；节点不存在时可退出，不能困住用户。",
    "◯",
    "↗",
  ],
];

("use strict");
const $ = (id) => document.getElementById(id),
  chosen = new Set();
const names = {
  main: "打开界面，分组出现",
  banner: "消息横幅，来去不打扰",
  bubble: "角色说话，气泡弹出",
  dialog: "小提示，轻轻展开",
  list: "打开背包，逐行出现",
  side: "快捷菜单，从右展开",
  cards: "商品卡片，依次登场",
  modal: "确认弹窗，聚焦操作",
  wipe: "切换场景，横条过渡",
  reward: "领取奖励，飞入钱包",
  magnet: "任务条目，滑入归位",
  flip: "卡牌翻面，揭晓结果",
  ripple: "点击按钮，扩散反馈",
  spotlight: "新手引导，聚焦目标",
};
const groups = ["全部", "页面与切换", "提示与弹窗", "列表与卡片", "反馈与引导"];
const order = [
  "reward",
  "list",
  "flip",
  "modal",
  "main",
  "banner",
  "bubble",
  "dialog",
  "side",
  "cards",
  "magnet",
  "ripple",
  "wipe",
  "spotlight",
];
const list = order.map((id) => effects.find((e) => e[0] === id));
const duration = {
  main: 2,
  banner: 2.6,
  bubble: 1.8,
  dialog: 1.8,
  list: 2.3,
  side: 2.2,
  cards: 2.2,
  modal: 2,
  wipe: 2.6,
  reward: 2.4,
  magnet: 2.3,
  flip: 2.5,
  ripple: 2,
  spotlight: 4.5,
};
const previews = {
  main: 0.8,
  banner: 0.9,
  bubble: 0.65,
  dialog: 0.65,
  list: 0.8,
  side: 0.65,
  cards: 0.65,
  modal: 0.65,
  wipe: 0.7,
  reward: 0.9,
  magnet: 0.55,
  flip: 0.72,
  ripple: 0.38,
  spotlight: 0.5,
};
let category = "全部",
  heroId = "main",
  viewerId = null,
  active = null,
  raf = 0,
  autoplay = false,
  autoIndex = 0;
const clamp = (x) => Math.max(0, Math.min(1, x)),
  ease = (x) => 1 - Math.pow(1 - clamp(x), 3),
  back = (x) => {
    x = clamp(x) - 1;
    return 1 + 2.70158 * x * x * x + 1.70158 * x * x;
  };
function rounded(c, x, y, w, h, r = 12, fill = "#fff", stroke) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = 1;
    c.stroke();
  }
}
function txt(
  c,
  s,
  x,
  y,
  size = 14,
  color = "#284b3c",
  align = "left",
  weight = 500,
) {
  c.fillStyle = color;
  c.font =
    weight + " " + size + 'px "PingFang SC","Microsoft YaHei",sans-serif';
  c.textAlign = align;
  c.textBaseline = "middle";
  c.fillText(s, x, y);
}
function circle(c, x, y, r, fill) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
}
function line(c, points, color, width = 2) {
  c.beginPath();
  points.forEach((p, i) => (i ? c.lineTo(...p) : c.moveTo(...p)));
  c.strokeStyle = color;
  c.lineWidth = width;
  c.stroke();
}
function coin(c, x, y, r = 12) {
  circle(c, x, y, r, "#d39c37");
  circle(c, x, y - 1, r - 2, "#ffe095");
  txt(c, "✦", x, y, Math.max(10, r), "#bd8533", "center", 700);
}
function gem(c, x, y, s = 20, color = "#57a89a") {
  c.save();
  c.translate(x, y);
  c.beginPath();
  c.moveTo(0, -s);
  c.lineTo(s * 0.8, -s * 0.35);
  c.lineTo(s * 0.55, s * 0.55);
  c.lineTo(0, s);
  c.lineTo(-s * 0.7, 0);
  c.closePath();
  c.fillStyle = color;
  c.fill();
  line(
    c,
    [
      [0, -s],
      [0, s],
      [s * 0.8, -s * 0.35],
      [-s * 0.7, 0],
    ],
    "#ffffff65",
    1,
  );
  c.restore();
}
function star(c, x, y, r = 9, color = "#d8a24f") {
  c.save();
  c.translate(x, y);
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2,
      v = i % 2 ? r * 0.42 : r;
    c.lineTo(Math.cos(a) * v, Math.sin(a) * v);
  }
  c.closePath();
  c.fillStyle = color;
  c.fill();
  c.restore();
}
function button(c, s, x, y, w = 100, fill = "#367e66", scale = 1) {
  c.save();
  c.translate(x + w / 2, y + 17);
  c.scale(scale, scale);
  rounded(c, -w / 2, -17, w, 34, 9, fill);
  txt(c, s, 0, 0, 12, "#fff", "center", 600);
  c.restore();
}
function pose(c, p, x, y, draw, scale = true) {
  if (p <= 0) return;
  c.save();
  c.globalAlpha = clamp(p);
  c.translate(x, y + (1 - p) * 24);
  if (scale) c.scale(0.86 + 0.14 * p, 0.86 + 0.14 * p);
  draw();
  c.restore();
}
function island(c) {
  c.fillStyle = "#d9e7db";
  c.beginPath();
  c.ellipse(280, 243, 145, 30, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#a6c4ad";
  c.beginPath();
  c.ellipse(280, 225, 130, 38, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#bcd5b3";
  c.beginPath();
  c.ellipse(280, 216, 130, 32, 0, 0, Math.PI * 2);
  c.fill();
  for (const [x, y, s] of [
    [190, 184, 1],
    [360, 180, 1.15],
    [325, 200, 0.8],
  ]) {
    rounded(c, x - 3, y, 6, 27, 2, "#9c8b68");
    circle(c, x, y - 8, 23 * s, "#83a987");
    circle(c, x + 8, y - 16, 14 * s, "#a6c28e");
  }
  rounded(c, 248, 167, 62, 45, 7, "#faf0d7");
  c.beginPath();
  c.moveTo(240, 171);
  c.lineTo(280, 137);
  c.lineTo(317, 171);
  c.closePath();
  c.fillStyle = "#c27e5d";
  c.fill();
  rounded(c, 271, 184, 15, 28, 3, "#836953");
  circle(c, 250, 239, 11, "#e1b66c");
  rounded(c, 242, 247, 17, 19, 5, "#4d7e77");
  circle(c, 250, 237, 7, "#ffe1af");
}
function base(c, night = false) {
  const g = c.createLinearGradient(0, 0, 0, 315);
  g.addColorStop(0, night ? "#d4dce9" : "#e5eee1");
  g.addColorStop(1, night ? "#b2bfcf" : "#d5e6dc");
  c.fillStyle = g;
  c.fillRect(0, 0, 560, 315);
  for (let i = 0; i < 7; i++) {
    circle(c, 45 + i * 85, 67 + (i % 3) * 27, 20, "#ffffff33");
  }
  c.strokeStyle = "#ffffff26";
  for (let x = 0; x < 560; x += 28) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, 315);
    c.stroke();
  }
}
function screen(c, t = 10) {
  base(c);
  pose(c, ease((t - 0.1) / 0.6), 0, 0, () => island(c), false);
  pose(
    c,
    ease(t / 0.35),
    28,
    63,
    () => {
      txt(c, "星屿冒险", 0, 0, 21, "#315441", "left", 700);
      txt(c, "STAR ISLAND", 1, 20, 8, "#799381");
    },
    false,
  );
  pose(
    c,
    ease((t - 0.1) / 0.35),
    410,
    62,
    () => {
      rounded(c, 0, -17, 122, 33, 18, "#ffffffe8");
      coin(c, 20, 0, 10);
      txt(c, "1,280", 96, 0, 14, "#6d5734", "right", 650);
    },
    false,
  );
  pose(c, back((t - 0.22) / 0.6), 23, 135, () => {
    for (let i = 0; i < 3; i++) {
      rounded(c, 0, i * 40, 42, 32, 9, "#ffffffe6");
      txt(
        c,
        ["任务", "商店", "活动"][i],
        21,
        i * 40 + 16,
        11,
        "#476c56",
        "center",
      );
    }
  });
  pose(
    c,
    ease((t - 0.35) / 0.45),
    160,
    265,
    () => {
      button(c, "背包", 0, 0, 75, "#729a7a");
      button(c, "开始冒险", 86, 0, 122);
      button(c, "领取", 219, 0, 65, "#be9457");
    },
    false,
  );
}
function row(c, x, y, w, title, sub, index) {
  rounded(c, x, y, w, 44, 8, "#ffffffee", "#d7e1d5");
  rounded(
    c,
    x + 7,
    y + 7,
    30,
    30,
    7,
    ["#dbe8d5", "#f4e4c8", "#dae7e8"][index % 3],
  );
  if (index % 3 === 1) coin(c, x + 22, y + 22, 9);
  else gem(c, x + 22, y + 22, 10, index % 3 ? "#8e9cc1" : "#71a084");
  txt(c, title, x + 48, y + 16, 12, "#3b5544", "left", 600);
  txt(c, sub, x + 48, y + 32, 9, "#8a9788");
  txt(c, "›", x + w - 16, y + 22, 20, "#91a18e", "center");
}
function panel(c, title, x = 135, y = 65, w = 290, h = 218) {
  rounded(c, x, y, w, h, 13, "#f9faf1", "#c6d5c4");
  txt(c, title, x + 18, y + 24, 16, "#3d5e46", "left", 650);
  txt(c, "×", x + w - 18, y + 24, 18, "#81917d", "center");
}
function draw(canvas, id, t) {
  const c = canvas.getContext("2d");
  c.setTransform(2, 0, 0, 2, 0, 0);
  c.clearRect(0, 0, 560, 315);
  c.save();
  if (id === "main") {
    screen(c, t);
    c.restore();
    return;
  }
  if (canvas.id === "hero-canvas") screen(c);
  else if (
    ["cards", "flip", "magnet", "ripple", "bubble", "dialog", "list"].includes(
      id,
    )
  )
    base(c);
  else screen(c);
  switch (id) {
    case "reward": {
      const p = ease((t - 0.5) / 0.85);
      rounded(c, 410, 45, 122, 33, 18, "#fff6da");
      coin(c, 430, 62, 10);
      txt(
        c,
        (1280 + Math.round(360 * p)).toLocaleString(),
        506,
        62,
        14,
        "#866127",
        "right",
        650,
      );
      rounded(c, 188, 122, 184, 112, 14, "#fff9e7", "#e7d5a6");
      txt(c, "每日奖励", 280, 145, 16, "#775a32", "center", 650);
      coin(c, 280, 180, 23);
      txt(c, "+360", 280, 213, 16, "#a67d38", "center", 650);
      for (let i = 0; i < 11; i++) {
        const q = clamp((t - 0.2 - i * 0.045) / 0.92);
        if (q > 0 && q < 1) {
          const x = 280 + (430 - 280) * q + Math.sin(q * Math.PI) * (i - 5) * 8,
            y = 180 - 118 * q - Math.sin(q * Math.PI) * 80;
          coin(c, x, y, 8 + (i % 3));
        }
      }
      if (t > 1.35) txt(c, "已存入钱包", 280, 252, 12, "#4c8062", "center");
      break;
    }
    case "list": {
      const p = ease(t / 0.35);
      pose(
        c,
        p,
        135,
        49,
        () => {
          panel(c, "我的背包", 0, 0, 290, 225);
          ["森林钥匙", "星光结晶", "冒险补给"].forEach((s, i) =>
            pose(
              c,
              ease((t - 0.18 - i * 0.14) / 0.35),
              15,
              48 + i * 51,
              () =>
                row(
                  c,
                  0,
                  0,
                  260,
                  s,
                  ["可开启森林宝箱", "稀有材料 · 12 个", "恢复 30 点体力"][i],
                  i,
                ),
              false,
            ),
          );
        },
        false,
      );
      break;
    }
    case "side": {
      const p = ease(t / 0.42);
      c.save();
      c.translate((1 - p) * 200, 0);
      rounded(c, 342, 30, 218, 285, 0, "#fafbf2");
      txt(c, "快捷菜单", 364, 62, 17, "#375744", "left", 650);
      ["每日任务", "好友排行", "游戏设置", "帮助中心"].forEach((s, i) =>
        pose(
          c,
          ease((t - 0.15 - i * 0.08) / 0.38),
          355,
          88 + i * 49,
          () => row(c, 0, 0, 190, s, "轻点查看", i),
          false,
        ),
      );
      c.restore();
      break;
    }
    case "cards": {
      txt(c, "旅行商人的小铺", 280, 65, 18, "#45644b", "center", 650);
      ["风之石", "金色种子", "星光药剂"].forEach((s, i) =>
        pose(c, back((t - i * 0.15) / 0.5), 125 + i * 155, 178, () => {
          c.rotate((i - 1) * 0.035);
          rounded(c, -64, -77, 128, 154, 12, "#fffaf0", "#dbddc8");
          rounded(
            c,
            -54,
            -67,
            108,
            89,
            8,
            ["#e0eddf", "#f4e8c7", "#dce8ed"][i],
          );
          gem(c, 0, -24, 26, ["#7eaa8f", "#ceab59", "#7d9cac"][i]);
          txt(c, s, 0, 42, 13, "#526546", "center", 600);
          txt(
            c,
            ["120 金币", "80 金币", "240 金币"][i],
            0,
            63,
            10,
            "#a18b5d",
            "center",
          );
        }),
      );
      break;
    }
    case "flip": {
      txt(c, "冒险奖励 · 翻开看看", 280, 62, 18, "#45644b", "center", 650);
      for (let i = 0; i < 3; i++) {
        const q = clamp((t - 0.2 - i * 0.22) / 0.7),
          front = q >= 0.5,
          scale = Math.max(0.015, Math.abs(Math.cos(q * Math.PI)));
        c.save();
        c.translate(125 + i * 155, 178);
        c.scale(scale, 1);
        rounded(
          c,
          -61,
          -78,
          122,
          156,
          11,
          front ? "#fff8e4" : "#4c7469",
          "#a8be9f",
        );
        rounded(
          c,
          -53,
          -70,
          106,
          140,
          8,
          front ? "#fff6de" : "#588376",
          front ? "#e5d49d" : "#9bb6a0",
        );
        if (front) {
          gem(c, 0, -18, 29, ["#d6ab51", "#769cb4", "#83a26b"][i]);
          txt(
            c,
            ["曙光之石", "冰晶护符", "森林之心"][i],
            0,
            37,
            12,
            "#7c693d",
            "center",
            650,
          );
          for (let j = 0; j < 3; j++) star(c, -18 + j * 18, 59, 6);
        } else {
          gem(c, 0, 0, 30, "#b8cba6");
          txt(c, "?", 0, 0, 25, "#4d7668", "center", 700);
        }
        c.restore();
      }
      break;
    }
    case "modal": {
      const p = back(t / 0.28);
      c.fillStyle = "rgba(24,45,37," + clamp(t / 0.2) * 0.48 + ")";
      c.fillRect(0, 0, 560, 315);
      pose(c, p, 280, 170, () => {
        panel(c, "准备好出发了吗？", -143, -90, 286, 172);
        txt(c, "开始新的冒险，探索星屿森林。", 0, -25, 12, "#7b8976", "center");
        button(c, "再等等", -118, 20, 106, "#9cae94");
        button(c, "出发", 12, 20, 106);
      });
      break;
    }
    case "dialog": {
      txt(c, "冒险途中", 280, 60, 18, "#517053", "center");
      island(c);
      pose(c, ease(t / 0.34), 350 + (1 - ease(t / 0.34)) * 20, 154, () => {
        rounded(c, -123, -63, 246, 126, 12, "#fffdf0", "#c8d7bd");
        txt(c, "发现新的传送点", 0, -32, 16, "#466647", "center", 650);
        txt(c, "下次可以直接回到这里。", 0, -6, 12, "#87927e", "center");
        button(c, "知道了", -44, 14, 88);
      });
      break;
    }
    case "bubble": {
      txt(c, "旅途中的一句提醒", 280, 64, 18, "#536d50", "center");
      circle(c, 154, 197, 43, "#d1dfc6");
      rounded(c, 131, 211, 46, 38, 16, "#658a77");
      circle(c, 154, 188, 26, "#f4d8a6");
      c.fillStyle = "#866b50";
      c.beginPath();
      c.arc(154, 183, 27, Math.PI, Math.PI * 2);
      c.fill();
      circle(c, 146, 189, 2, "#5a5746");
      circle(c, 162, 189, 2, "#5a5746");
      pose(c, back(t / 0.32), 344, 160, () => {
        rounded(c, -130, -45, 260, 90, 16, "#fffef2", "#d0dbc3");
        c.beginPath();
        c.moveTo(-130, 5);
        c.lineTo(-149, 20);
        c.lineTo(-130, 23);
        c.fillStyle = "#fffef2";
        c.fill();
        txt(c, "欢迎回来，小冒险家！", 0, -12, 16, "#506947", "center", 650);
        txt(c, "今天也一起探索新的岛屿吧。", 0, 15, 12, "#8b967e", "center");
      });
      break;
    }
    case "banner": {
      const x =
        t < 0.32
          ? 560 + (100 - 560) * ease(t / 0.32)
          : t < 1.8
            ? 100
            : 100 - 550 * ease((t - 1.8) / 0.28);
      rounded(c, x, 91, 360, 58, 12, "#fff7dc", "#ddcc93");
      coin(c, x + 32, 120, 17);
      txt(c, "任务完成：第一次冒险", x + 62, 111, 15, "#78612e", "left", 650);
      txt(c, "奖励已解锁，稍后可前往领取", x + 62, 132, 11, "#a38d5d");
      if (t > 2.1)
        txt(c, "提示已离开，继续你的冒险", 280, 110, 13, "#5a7c62", "center");
      break;
    }
    case "magnet": {
      txt(c, "今日任务 · 自动整理", 280, 53, 18, "#516a4a", "center", 650);
      for (let i = 0; i < 3; i++) {
        rounded(c, 133, 86 + i * 59, 294, 48, 9, "#b8cdb33b", "#b8cdb3");
        const p = back((t - i * 0.12) / 0.5);
        c.save();
        c.globalAlpha = clamp(t * 4 - i * 0.4);
        c.translate((1 - p) * (-130 + i * 30), 0);
        row(
          c,
          135,
          88 + i * 59,
          290,
          ["收集 5 颗星星", "探索森林营地", "完成一次冒险"][i],
          ["已完成 · 可领取", "进行中 · 2 / 3", "进行中 · 0 / 1"][i],
          i,
        );
        c.restore();
      }
      break;
    }
    case "ripple": {
      txt(
        c,
        "点击核心按钮，周围轻轻回应",
        280,
        70,
        17,
        "#4f6a4d",
        "center",
        650,
      );
      for (let i = 0; i < 3; i++) {
        const q = clamp((t - i * 0.16) / 0.5),
          s = 1 + 0.12 * Math.sin(q * Math.PI);
        button(
          c,
          ["背包", "开始冒险", "任务"][i],
          83 + i * 140,
          144,
          114,
          i === 1 ? "#347b62" : "#88a182",
          s,
        );
        if (q > 0 && q < 1) {
          c.globalAlpha = (1 - q) * 0.5;
          c.strokeStyle = "#659d7c";
          c.lineWidth = 2;
          c.beginPath();
          c.roundRect(
            83 + i * 140 - q * 14,
            144 - q * 14,
            114 + q * 28,
            34 + q * 28,
            12,
          );
          c.stroke();
          c.globalAlpha = 1;
        }
      }
      txt(
        c,
        "按钮仍是原来的按钮，不新增点击区域",
        280,
        230,
        11,
        "#87967d",
        "center",
      );
      break;
    }
    case "wipe": {
      const first = t < 0.9;
      if (!first) {
        base(c, true);
        txt(c, "月光港湾", 280, 134, 29, "#566984", "center", 650);
        txt(c, "新的旅程，从这里开始", 280, 171, 13, "#718399", "center");
        for (let i = 0; i < 7; i++)
          star(c, 85 + i * 65, 215 + (i % 2) * 10, 8, "#faf1c8");
      }
      for (let i = 0; i < 16; i++) {
        const enter = ease((t - i * 0.012) / 0.6),
          leave = ease((t - 0.95 - i * 0.012) / 0.6),
          w = 560 * enter,
          x = 560 * leave;
        c.fillStyle = ["#648d77", "#7b9e7d", "#9ab58a", "#bdd0a4"][i % 4];
        c.fillRect(x, (i * 315) / 16, w, 315 / 16 + 0.6);
      }
      break;
    }
    case "spotlight": {
      const targets = [
        [197, 282, 55, "① 这里打开背包"],
        [269, 282, 75, "② 从这里开始冒险"],
        [411, 62, 67, "③ 在这里查看资产"],
      ];
      const n = Math.min(2, Math.floor(t / 1.3));
      const current = targets[n],
        prev = targets[Math.max(0, n - 1)],
        q = ease((t - n * 1.3) / 0.45),
        x = prev[0] + (current[0] - prev[0]) * q,
        y = prev[1] + (current[1] - prev[1]) * q,
        r = prev[2] + (current[2] - prev[2]) * q;
      c.fillStyle = "#19382bbb";
      c.beginPath();
      c.rect(0, 0, 560, 315);
      c.arc(x, y, r, 0, Math.PI * 2, true);
      c.fill("evenodd");
      rounded(c, 135, 139, 290, 52, 12, "#fffaf0");
      txt(c, current[3], 280, 165, 17, "#4f714c", "center", 650);
      break;
    }
  }
  c.restore();
}
function stop() {
  cancelAnimationFrame(raf);
  raf = 0;
  if (active?.button) active.button.textContent = "↻ 重播";
  active = null;
}
function play(canvas, id, button, progress, onEnd) {
  stop();
  const start = performance.now();
  active = { canvas, id, button };
  if (button) button.textContent = "■ 停止";
  draw(canvas, id, 0);
  canvas.dataset.time = "0";
  function frame(now) {
    const t = (now - start) / 1000;
    draw(canvas, id, t);
    canvas.dataset.time = t.toFixed(3);
    if (progress) progress.style.width = 100 * clamp(t / duration[id]) + "%";
    if (t < duration[id]) raf = requestAnimationFrame(frame);
    else {
      stop();
      onEnd?.();
    }
  }
  raf = requestAnimationFrame(frame);
}
function cancelAuto() {
  autoplay = false;
  $("autoplay").textContent = "顺序演示";
}
function hero(id, automatic = false) {
  if (!automatic) cancelAuto();
  heroId = id;
  $("hero-status").textContent = names[id] + (automatic ? " · 顺序演示中" : "");
  sync();
  play($("hero-canvas"), id, null, null, automatic ? nextAuto : null);
}
function nextAuto() {
  if (!autoplay) return;
  const sequence = [
    "main",
    "list",
    "reward",
    "cards",
    "flip",
    "banner",
    "spotlight",
  ];
  autoIndex++;
  if (autoIndex >= sequence.length) {
    cancelAuto();
    return;
  }
  hero(sequence[autoIndex], true);
}
function pick(id) {
  chosen.has(id) ? chosen.delete(id) : chosen.add(id);
  sync();
}
function sync() {
  const picked = list.filter((e) => chosen.has(e[0]));
  $("count").textContent = picked.length
    ? "已选 " + picked.length + " 个动效"
    : "尚未选择动效";
  $("selected-label").textContent = picked.length
    ? picked.map((e) => names[e[0]].split("，")[0]).join("、")
    : "点「播放」看效果，点「选用」加入清单。";
  $("generate").disabled = !picked.length;
  $("clear").disabled = !picked.length;
  document.querySelectorAll(".pick").forEach((b) => {
    const yes = chosen.has(b.dataset.id);
    b.textContent = yes ? "✓ 已选用" : "+ 选用";
    b.setAttribute("aria-pressed", yes);
    b.closest(".card").classList.toggle("chosen", yes);
  });
  $("hero-pick").textContent = chosen.has(heroId)
    ? "✓ 已选用 · 点击移除"
    : "选用当前效果";
  $("viewer-pick").textContent = chosen.has(viewerId)
    ? "✓ 已选用 · 点击移除"
    : "选用这个效果";
  if ($("handoff").open) prompt();
}
function openViewer(e) {
  cancelAuto();
  viewerId = e[0];
  $("viewer-title").textContent = names[viewerId];
  $("viewer-desc").textContent = "适合：" + e[5] + "。" + e[3] + "。";
  $("recipe").textContent = e[4] + " · " + e[7];
  $("viewer-dismiss").hidden = ![
    "modal",
    "dialog",
    "side",
    "list",
    "spotlight",
  ].includes(viewerId);
  $("viewer-canvas").setAttribute("aria-label", names[viewerId] + "放大演示");
  $("viewer").showModal();
  sync();
  play($("viewer-canvas"), viewerId);
}
function renderCards() {
  cancelAuto();
  stop();
  $("cards").replaceChildren();
  const filtered = list.filter((e) => category === "全部" || e[2] === category);
  $("visible-count").textContent = filtered.length + " 个效果";
  for (const e of filtered) {
    const article = document.createElement("article");
    article.className = "card";
    article.dataset.effect = e[0];
    article.innerHTML =
      '<div class="card-media"><canvas width="1120" height="630"></canvas><span class="stage-label"></span><button class="expand">放大体验 ↗</button></div><div class="progress"><i></i></div><div class="card-body"><div class="card-title"><h3></h3><span class="card-number"></span></div><p></p><div class="card-actions"><button class="play">▶ 播放效果</button><button class="pick"></button></div></div>';
    $("cards").append(article);
    article.querySelector("h3").textContent = names[e[0]];
    article.querySelector(".stage-label").textContent = e[2];
    article.querySelector(".card-number").textContent = String(
      effects.indexOf(e) + 1,
    ).padStart(2, "0");
    article.querySelector("p").textContent = "适合：" + e[5];
    const canvas = article.querySelector("canvas");
    canvas.setAttribute("aria-label", names[e[0]] + "演示");
    draw(canvas, e[0], previews[e[0]]);
    const btn = article.querySelector(".play");
    btn.setAttribute("aria-label", "播放" + names[e[0]]);
    btn.onclick = () => {
      cancelAuto();
      if (active?.canvas === canvas) {
        stop();
        return;
      }
      play(canvas, e[0], btn, article.querySelector(".progress i"));
    };
    article.querySelector(".expand").onclick = () => openViewer(e);
    const select = article.querySelector(".pick");
    select.dataset.id = e[0];
    select.setAttribute("aria-label", "选用" + names[e[0]]);
    select.onclick = () => pick(e[0]);
  }
  sync();
}
function filters() {
  const root = $("filters");
  root.replaceChildren();
  for (const group of groups) {
    const b = document.createElement("button");
    b.textContent = group;
    b.setAttribute("aria-pressed", group === category);
    b.onclick = () => {
      category = group;
      filters();
      renderCards();
    };
    root.append(b);
  }
}
function prompt() {
  const target = $("target").value.trim() || "请先与我确认的目标界面";
  const lines = [
    "请为「" + target + "」实现以下 UI 动效与交互。",
    "先读取真实 .ui.json、节点和业务事件。按用途匹配实际节点；不适用的效果请说明，不要添加无关控件。",
    "",
  ];
  for (const e of list.filter((e) => chosen.has(e[0]))) {
    lines.push(
      names[e[0]] + "：",
      "- 场景：" + e[5] + "；对象：" + e[6] + "。",
      "- 表现：" + e[3] + "。",
      "- 要求：" + e[7],
      "- 配方：" + e[4] + "。",
      "",
    );
  }
  lines.push(
    "参考：Lua-Tween/demo/ui_motion_recipes.lua 与 LuaTween.lua。先查找本机源码或询问其位置，不要假定配方函数已存在于项目中。",
    "UrhoX 负责布局、输入和按钮状态；多节点编排按需使用 LuaTween。同一属性只由一个机制控制。",
    "关闭、切页与重复触发时只取消当前 UI 实例的动画，不调用全局 Clear。",
    "奖励、购买与存档由真实业务回执决定，动画只改变表现。不使用含 AppendCallback 的 Sequence:Goto 反复预览业务动作。",
    "验收打开关闭、连续点击、重新进入、失败恢复，以及不同分辨率下的布局与点击命中。",
  );
  $("prompt").value = lines.join(String.fromCharCode(10));
  $("copy-status").textContent = "复制后交给开发 AI；本页不修改游戏文件。";
}
document
  .querySelectorAll("[data-scene]")
  .forEach((b) => (b.onclick = () => hero(b.dataset.scene)));
$("hero-home").onclick = () => hero("main");
$("hero-pick").onclick = () => pick(heroId);
$("autoplay").onclick = () => {
  if (autoplay) {
    cancelAuto();
    stop();
    return;
  }
  autoplay = true;
  autoIndex = 0;
  $("autoplay").textContent = "停止演示";
  hero("main", true);
};
$("close-viewer").onclick = () => $("viewer").close();
$("viewer").addEventListener("close", () => {
  stop();
  viewerId = null;
});
$("viewer-play").onclick = () => play($("viewer-canvas"), viewerId);
$("viewer-pick").onclick = () => pick(viewerId);
$("viewer-dismiss").onclick = () => {
  stop();
  draw($("viewer-canvas"), "main", 10);
  $("viewer-desc").textContent = "已退出演示，主界面恢复。可重播或关闭预览。";
};
$("clear").onclick = () => {
  chosen.clear();
  sync();
};
$("generate").onclick = () => {
  cancelAuto();
  stop();
  prompt();
  $("handoff").showModal();
};
$("close-handoff").onclick = () => $("handoff").close();
$("target").oninput = prompt;
$("copy").onclick = async () => {
  let ok = false;
  try {
    await navigator.clipboard.writeText($("prompt").value);
    ok = true;
  } catch {
    $("prompt").focus();
    $("prompt").select();
    try {
      ok = document.execCommand("copy");
    } catch {}
  }
  $("copy-status").textContent = ok
    ? "已复制，可以交给开发 AI。"
    : "浏览器未允许自动复制；文本已选中，请按 ⌘C / Ctrl+C。";
};
function suspend() {
  cancelAuto();
  stop();
}
window.addEventListener("pagehide", suspend);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) suspend();
});
window.addEventListener("message", (event) => {
  if (
    event.source === window.parent &&
    event.origin === location.origin &&
    event.data?.type === "maker:motion-visibility" &&
    !event.data.visible
  )
    suspend();
});
// Single playback owner: browsing, expanded preview and the showcase never compete.
new IntersectionObserver(
  (entries) => {
    for (const e of entries)
      if (!e.isIntersecting && active?.canvas === e.target) {
        cancelAuto();
        stop();
      }
  },
  { threshold: 0.08 },
).observe($("hero-canvas"));
filters();
renderCards();
draw($("hero-canvas"), "main", 10);

// The illustrated controls and the adjacent accessible buttons share the same actions.
$("hero-canvas").addEventListener("click", (event) => {
  const r = event.currentTarget.getBoundingClientRect(),
    x = ((event.clientX - r.left) * 560) / r.width,
    y = ((event.clientY - r.top) * 315) / r.height;
  if (heroId === "modal") {
    if ((x > 396 && y > 63 && y < 100) || (y > 186 && y < 226)) {
      hero("main");
    }
    return;
  }
  if (["list", "dialog", "side", "spotlight"].includes(heroId)) {
    hero("main");
    return;
  }
  if (y > 263) {
    if (x > 155 && x < 239) hero("list");
    else if (x > 245 && x < 369) hero("wipe");
    else if (x > 375 && x < 450) hero("reward");
  } else if (x < 72 && y > 130 && y < 250)
    hero(y < 174 ? "magnet" : y < 214 ? "cards" : "banner");
});
`;
