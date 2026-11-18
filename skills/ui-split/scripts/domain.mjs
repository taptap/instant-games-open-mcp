// scripts/ui-split-domain.ts
import { readFileSync } from "node:fs";

// packages/maker-canvas/src/contracts/ui.ts
var UI_CUT_TYPES = ["icon", "frame", "panel", "button", "tab", "title"];

// packages/maker-canvas/src/features/uiBbox.ts
function validateBboxRect(value, width, height) {
  if (!Array.isArray(value) || value.length !== 4 || !value.every((entry) => typeof entry === "number" && Number.isFinite(entry)))
    throw new Error("\u8BC6\u56FE bbox \u5FC5\u987B\u662F\u50CF\u7D20 [x,y,w,h]\u3002");
  const [left, top, rectWidth, rectHeight] = value;
  if (left < 0 || top < 0 || rectWidth <= 0 || rectHeight <= 0 || left + rectWidth > width || top + rectHeight > height)
    throw new Error("\u8BC6\u56FE bbox \u8D85\u51FA\u56FE\u7247\u8303\u56F4\u3002");
  return [left, top, rectWidth, rectHeight];
}
function validateBboxImageStructure(value) {
  if (!value || typeof value.path !== "string" || !value.path.trim() || !/^[a-f0-9]{64}$/.test(value.sha256) || ![value.width, value.height].every(
    (entry) => Number.isInteger(entry) && entry > 0 && entry <= 16384
  ))
    throw new Error("\u8BC6\u56FE\u56FE\u7247\u8EAB\u4EFD\u6216\u5C3A\u5BF8\u65E0\u6548\u3002");
  return { path: value.path, sha256: value.sha256, width: value.width, height: value.height };
}
function validateCutElements(value, width, height) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 500)
    throw new Error("\u8BC6\u56FE\u5207\u56FE\u6E05\u5355\u5FC5\u987B\u5305\u542B 1\uFF5E500 \u4E2A\u5143\u7D20\u3002");
  const ids = /* @__PURE__ */ new Set();
  const elements = value.map((entry) => {
    if (!entry || !/^E[0-9]{3,}$/.test(entry.id) || ids.has(entry.id) || typeof entry.name !== "string" || !entry.name.trim() || entry.name.length > 200 || !UI_CUT_TYPES.includes(entry.type) || entry.parent !== null && typeof entry.parent !== "string")
      throw new Error("\u8BC6\u56FE\u5207\u56FE\u5143\u7D20\u7F16\u53F7\u3001\u7C7B\u578B\u6216\u7236\u7EA7\u65E0\u6548\u3002");
    ids.add(entry.id);
    return {
      id: entry.id,
      name: entry.name,
      type: entry.type,
      bbox: validateBboxRect(entry.bbox, width, height),
      parent: entry.parent,
      ...entry.duplicateOf === void 0 ? {} : { duplicateOf: entry.duplicateOf }
    };
  });
  const byId = new Map(elements.map((entry) => [entry.id, entry]));
  for (const entry of elements) {
    const visited = /* @__PURE__ */ new Set([entry.id]);
    let parent = entry.parent;
    while (parent !== null) {
      if (visited.has(parent) || !byId.has(parent)) throw new Error("\u8BC6\u56FE\u5207\u56FE\u7236\u7EA7\u7F3A\u5931\u6216\u5B58\u5728\u5FAA\u73AF\u3002");
      visited.add(parent);
      parent = byId.get(parent).parent;
    }
    if (entry.duplicateOf === void 0) continue;
    if (!/^E[0-9]{3,}$/.test(entry.duplicateOf) || entry.duplicateOf === entry.id)
      throw new Error("\u91CD\u590D\u7D20\u6750\u5F15\u7528\u65E0\u6548\u3002");
    const source = byId.get(entry.duplicateOf);
    if (!source || source.duplicateOf || source.type !== entry.type)
      throw new Error("\u91CD\u590D\u7D20\u6750\u5FC5\u987B\u5F15\u7528\u540C\u7C7B\u578B\u7684\u539F\u59CB\u5143\u7D20\u3002");
  }
  return elements;
}
function validateBboxTexts(value, width, height, elements) {
  if (!Array.isArray(value) || value.length > 1e3) throw new Error("\u8BC6\u56FE\u6587\u5B57\u6E05\u5355\u65E0\u6548\u3002");
  const ids = /* @__PURE__ */ new Set();
  const elementIds = new Set(elements.map((entry) => entry.id));
  return value.map((entry) => {
    const color = typeof entry?.color === "string" ? entry.color.replace(/\s/g, "") : "";
    if (entry && !/^#[a-f0-9]{6}$/i.test(color))
      throw new Error("\u8BC6\u56FE\u6587\u5B57 " + String(entry.id) + " \u7684 color \u65E0\u6548\uFF0C\u5FC5\u987B\u4E3A #RRGGBB\u3002");
    if (!entry || !/^T[0-9]{3,}$/.test(entry.id) || ids.has(entry.id) || typeof entry.text !== "string" || !entry.text.trim() || entry.text.length > 2e3 || entry.parentId !== null && !elementIds.has(entry.parentId) || ![
      "title",
      "tab",
      "button",
      "slot_name",
      "stat_name",
      "stat_value",
      "currency",
      "count",
      "caption",
      "other"
    ].includes(entry.role) || !["left", "center", "right"].includes(entry.align) || typeof entry.bold !== "boolean" || entry.cutout !== false)
      throw new Error("\u8BC6\u56FE\u6587\u5B57\u7F16\u53F7\u3001\u7236\u7EA7\u3001\u6837\u5F0F\u6216 cutout \u65E0\u6548\uFF1B\u6587\u5B57\u53EA\u8FD8\u539F\u4E3A Label\u3002");
    ids.add(entry.id);
    return {
      id: entry.id,
      text: entry.text,
      bbox: validateBboxRect(entry.bbox, width, height),
      parentId: entry.parentId,
      role: entry.role,
      align: entry.align,
      color,
      bold: entry.bold,
      cutout: false
    };
  });
}
function parseUiScreenName(value) {
  if (!value || typeof value !== "object") return void 0;
  const { name, key } = value;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 80 || typeof key !== "string" || key.length > 64 || !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(key) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/.test(key))
    return void 0;
  return { name: name.trim(), key };
}
function validateUiBboxStructure(value) {
  if (!value || value.version !== 1 || value.coordinateSpace !== "design-pixels" || value.bboxFormat !== "xywh")
    throw new Error("\u8BC6\u56FE Bbox JSON \u7248\u672C\u6216\u5750\u6807\u683C\u5F0F\u65E0\u6548\u3002");
  const design = validateBboxImageStructure(value.design);
  const cutSource = validateBboxImageStructure(value.cutSource);
  const elements = validateCutElements(value.elements, design.width, design.height);
  const screen = parseUiScreenName(value.screen);
  return {
    version: 1,
    coordinateSpace: "design-pixels",
    bboxFormat: "xywh",
    ...screen ? { screen } : {},
    design,
    cutSource,
    elements,
    texts: validateBboxTexts(value.texts, design.width, design.height, elements)
  };
}

// packages/maker-canvas/src/features/atlasContent.ts
function validateAtlasCrops(width, height, input2) {
  if (![width, height].every((value) => Number.isInteger(value) && value > 0 && value <= 4096))
    throw new Error("\u56FE\u96C6\u5C3A\u5BF8\u5FC5\u987B\u4E3A 1\uFF5E4096 \u50CF\u7D20\u3002");
  if (!Array.isArray(input2) || !input2.length || input2.length > 120)
    throw new Error("\u88C1\u5207\u533A\u57DF\u5FC5\u987B\u4E3A 1\uFF5E120 \u4E2A\u3002");
  let pixels = 0;
  return input2.map((region, index) => {
    if (!region || typeof region !== "object" || Object.keys(region).some(
      (key) => ![
        "name",
        "x",
        "y",
        "width",
        "height",
        "outputWidth",
        "outputHeight",
        "offsetX",
        "offsetY",
        "blank"
      ].includes(key)
    ) || region.name !== "item_" + String(index + 1).padStart(3, "0") || ![region.x, region.y, region.width, region.height].every(Number.isInteger) || region.x < 0 || region.y < 0 || region.width < 1 || region.height < 1 || region.x + region.width > width || region.y + region.height > height)
      throw new Error("\u88C1\u5207\u533A\u57DF\u540D\u79F0\u3001\u5750\u6807\u6216\u5C3A\u5BF8\u65E0\u6548\u3002");
    const outputWidth = region.outputWidth ?? region.width;
    const outputHeight = region.outputHeight ?? region.height;
    const offsetX = region.offsetX ?? 0;
    const offsetY = region.offsetY ?? 0;
    if (![outputWidth, outputHeight, offsetX, offsetY].every(Number.isInteger) || outputWidth > 4096 || outputHeight > 4096 || offsetX < 0 || offsetY < 0 || region.width + offsetX > outputWidth || region.height + offsetY > outputHeight)
      throw new Error("\u88C1\u5207\u8F93\u51FA\u5C3A\u5BF8\u6216\u504F\u79FB\u65E0\u6548\u3002");
    pixels += outputWidth * outputHeight;
    if (pixels > 4096 * 4096) throw new Error("\u88C1\u5207\u8F93\u51FA\u603B\u50CF\u7D20\u8D85\u8FC7\u9650\u5236\u3002");
    if (region.blank) return { ...region, blank: true };
    for (const previous of input2.slice(0, index)) {
      if (previous.blank) continue;
      if (region.x < previous.x + previous.width && previous.x < region.x + region.width && region.y < previous.y + previous.height && previous.y < region.y + region.height)
        throw new Error("\u88C1\u5207\u533A\u57DF\u91CD\u53E0\uFF0C\u8BF7\u5148\u5408\u5E76\u6216\u8C03\u6574\u3002");
    }
    return { ...region };
  });
}

// packages/maker-canvas/src/features/imageAtlas.ts
function imageAtlasRegions(width, height, grid) {
  if (![width, height].every((value) => Number.isInteger(value) && value > 0 && value <= 4096))
    throw new Error("\u56FE\u96C6\u5C3A\u5BF8\u5FC5\u987B\u4E3A 1\uFF5E4096 \u50CF\u7D20\u3002");
  if (![grid.columns, grid.rows].every((value) => Number.isInteger(value) && value > 0) || grid.columns * grid.rows > 120)
    throw new Error("\u884C\u5217\u5FC5\u987B\u4E3A\u6B63\u6574\u6570\uFF0C\u6700\u591A\u5BFC\u51FA 120 \u4E2A\u7269\u54C1\u3002");
  if (![grid.marginX, grid.marginY, grid.gapX, grid.gapY].every(
    (value) => Number.isInteger(value) && value >= 0
  ))
    throw new Error("\u8FB9\u8DDD\u548C\u95F4\u8DDD\u5FC5\u987B\u4E3A\u975E\u8D1F\u6574\u6570\u50CF\u7D20\u3002");
  const usableWidth = width - 2 * grid.marginX - (grid.columns - 1) * grid.gapX;
  const usableHeight = height - 2 * grid.marginY - (grid.rows - 1) * grid.gapY;
  if (usableWidth < grid.columns || usableHeight < grid.rows)
    throw new Error("\u8FB9\u8DDD\u6216\u95F4\u8DDD\u8FC7\u5927\uFF0C\u6BCF\u683C\u81F3\u5C11\u9700\u8981 1 \u50CF\u7D20\u3002");
  return Array.from({ length: grid.columns * grid.rows }, (_, index) => {
    const column = index % grid.columns;
    const row = Math.floor(index / grid.columns);
    const left = Math.floor(column * usableWidth / grid.columns);
    const top = Math.floor(row * usableHeight / grid.rows);
    return {
      name: "item_" + String(index + 1).padStart(3, "0"),
      x: grid.marginX + left + column * grid.gapX,
      y: grid.marginY + top + row * grid.gapY,
      width: Math.floor((column + 1) * usableWidth / grid.columns) - left,
      height: Math.floor((row + 1) * usableHeight / grid.rows) - top
    };
  });
}

// packages/maker-canvas/src/features/uiAssetBindings.ts
function uiAtlasElementGroup(element, bbox) {
  const [left, top, width, height] = element.bbox;
  if (element.type === "panel")
    return left === 0 && top === 0 && width >= bbox.design.width * 0.95 && height >= bbox.design.height * 0.95 ? "background" : "panels";
  if (element.type === "icon") {
    if (/头像|人物|角色|立绘|插画|portrait|character|illustration/i.test(element.name))
      return "artwork";
    if (/装备|武器|头盔|胸甲|护臂|靴子|项链|戒指|weapon|equipment|armor/i.test(element.name) && !/星|star/i.test(element.name))
      return "equipment";
    return "icons";
  }
  if (element.type === "frame")
    return width / height > 3 || height / width > 3 ? "controls" : "equipment";
  return "controls";
}
var UI_ATLAS_MAX_EDGE = 5;
var UI_ATLAS_MAX_CELLS = UI_ATLAS_MAX_EDGE * UI_ATLAS_MAX_EDGE;
function uiAtlasElementSlots(bbox, group) {
  return bbox.elements.filter((element) => !element.duplicateOf && uiAtlasElementGroup(element, bbox) === group).flatMap((element) => {
    const states = ["button", "tab"].includes(element.type) ? ["normal", "pressed"] : ["normal"];
    const elementIds = [
      element.id,
      ...bbox.elements.filter((item) => item.duplicateOf === element.id).map((item) => item.id)
    ];
    return states.map((state) => ({
      elementIds: [...elementIds],
      state,
      role: "element"
    }));
  });
}
function uiAtlasSheet(count, aspect = 1) {
  const size = Math.max(1, Math.min(UI_ATLAS_MAX_CELLS, count));
  let best = { columns: 1, rows: 1 };
  let score = Infinity;
  for (let columns = 1; columns <= UI_ATLAS_MAX_EDGE; columns++) {
    const rows = Math.ceil(size / columns);
    if (rows > UI_ATLAS_MAX_EDGE) continue;
    const candidate = Math.abs(Math.log(rows / columns / aspect)) + (columns * rows - size) / size;
    if (candidate < score) {
      best = { columns, rows };
      score = candidate;
    }
  }
  return best;
}
function uiBatchAtlasPlans(bbox, group) {
  const slots = uiAtlasElementSlots(bbox, group);
  if (slots.length > 120) throw new Error("\u6B64\u5206\u7C7B\u8D85\u8FC7 120 \u683C\u4E0A\u9650\uFF0C\u8BF7\u5148\u62C6\u5206\u6E05\u5355\u3002");
  if (group === "background" && !slots.length)
    return [
      validateUiAtlasPlanStructure({
        version: 1,
        bbox,
        grid: { columns: 1, rows: 1, marginX: 0, marginY: 0, gapX: 0, gapY: 0 },
        slots: [{ elementIds: [], state: "normal", role: "background" }]
      })
    ];
  const dimensions = (slot) => {
    const element = bbox.elements.find((item) => item.id === slot.elementIds[0]);
    const width = element.bbox[2], height = element.bbox[3];
    return {
      width,
      height,
      shape: width / height >= 3 ? "wide" : height / width >= 3 ? "tall" : "regular"
    };
  };
  const chunks = [];
  for (const slot of [...slots].sort((a, b) => {
    const first = dimensions(a), second = dimensions(b);
    return second.width * second.height - first.width * first.height;
  })) {
    const current = dimensions(slot);
    const chunk = chunks.find(
      (items) => items.length < (current.shape === "regular" ? UI_ATLAS_MAX_CELLS : UI_ATLAS_MAX_EDGE) && items.every((item) => {
        const other = dimensions(item);
        const widthRatio = Math.max(current.width, other.width) / Math.min(current.width, other.width);
        const heightRatio = Math.max(current.height, other.height) / Math.min(current.height, other.height);
        const aspectRatio = current.width / current.height / (other.width / other.height);
        return current.shape === other.shape && widthRatio <= 4 && heightRatio <= 4 && aspectRatio >= 1 / 3 && aspectRatio <= 3;
      })
    );
    if (chunk) chunk.push(slot);
    else chunks.push([slot]);
  }
  if (!chunks.length) chunks.push([]);
  return chunks.map((chunk) => {
    const aspects = chunk.map((slot) => {
      const size = dimensions(slot);
      return size.width / size.height;
    }).sort((a, b) => a - b);
    const grid = uiAtlasSheet(
      Math.max(1, chunk.length),
      aspects[Math.floor(aspects.length / 2)] || 1
    );
    const sheet = [...chunk];
    while (sheet.length < grid.columns * grid.rows)
      sheet.push({ elementIds: [], state: "normal", role: "reserve" });
    return validateUiAtlasPlanStructure({
      version: 1,
      bbox,
      grid: { ...grid, marginX: 0, marginY: 0, gapX: 0, gapY: 0 },
      slots: sheet
    });
  });
}
function uiBatchAtlasPrompt(group, prelayout = false) {
  const lines = group === "background" ? [
    "\u6E38\u620F\u7D20\u6750\u7EA6\u675F\uFF1A\u8F93\u51FA\u4E00\u5F20\u5B8C\u6574\u73AF\u5883\u80CC\u666F\uFF0C\u7528\u6765\u66FF\u6362\u754C\u9762\u80CC\u540E\u7684\u573A\u666F\u3002",
    "\u4FDD\u7559\uFF1A\u53EF\u89C1\u573A\u666F\u7684\u6784\u56FE\u3001\u900F\u89C6\u3001\u914D\u8272\u3001\u5149\u5F71\u4E0E\u6750\u8D28\u3002",
    "\u8865\u5168\uFF1A\u80CC\u666F\u88AB\u754C\u9762\u5927\u9762\u79EF\u906E\u6321\u65F6\uFF0C\u6839\u636E\u5468\u56F4\u53EF\u89C1\u573A\u666F\u81EA\u52A8\u5EF6\u5C55\u3001\u8865\u7ED8\u88AB\u906E\u6321\u533A\u57DF\uFF0C\u5F62\u6210\u8FDE\u7EED\u5B8C\u6574\u7684\u73AF\u5883\uFF1B\u4E0D\u8981\u53EA\u4FDD\u7559\u53EF\u89C1\u788E\u7247\u3002",
    "\u8F93\u51FA\uFF1A\u4FDD\u6301\u539F\u7A3F\u6BD4\u4F8B\uFF0C\u80CC\u666F\u8FDE\u7EED\u94FA\u6EE1\u6574\u5F20\u753B\u9762\u76F4\u5230\u56DB\u8FB9\uFF0C\u4E0D\u7559\u900F\u660E\u6D1E\u3001\u900F\u660E\u8FB9\u6216\u7A7A\u767D\uFF0C\u4E0D\u628A\u573A\u666F\u7F29\u5C0F\u5C45\u4E2D\u3002",
    "\u4E0D\u8981\u753B\u754C\u9762\u3001\u6309\u94AE\u3001\u56FE\u6807\u3001\u4EBA\u7269\u6216\u6587\u5B57\u3002"
  ] : [
    "\u4EFB\u52A1\uFF1A\u6309\u69FD\u4F4D\u6E05\u5355\u628A\u7D20\u6750\u753B\u6210\u53EF\u76F4\u63A5\u5207\u56FE\u7684\u7B49\u5206\u7F51\u683C\u3002",
    "\u6E38\u620F\u7D20\u6750\u7EA6\u675F\uFF1A\u672C\u5F20\u6700\u591A 5 \u5217 \xD7 5 \u884C\u3002\u6BCF\u683C\u53EA\u653E\u6E05\u5355\u4E2D\u7684\u4E00\u4E2A\u7D20\u6750\uFF0C\u4E2D\u5FC3\u5BF9\u51C6\u683C\u5B50\u4E2D\u5FC3\u3002",
    "\u7D20\u6750\u5916\u63A5\u6846\u7559\u5728\u672C\u683C\u5185\uFF0C\u56DB\u5468\u81F3\u5C11\u7559 10% \u7A7A\u767D\u3002\u5907\u7528\u683C\u7559\u7A7A\u3002",
    "\u6BCF\u4E2A\u7D20\u6750\u72EC\u7ACB\u7B49\u6BD4\u7F29\u653E\u5230\u672C\u683C\u53EF\u7528\u533A\u57DF\uFF0C\u5141\u8BB8\u5404\u683C\u7F29\u653E\u500D\u7387\u4E0D\u540C\uFF1B\u957F\u6761\u7F29\u5C0F\u5230\u6574\u6761\u653E\u5165\u4E00\u683C\uFF0C\u4EBA\u7269\u7F29\u5C0F\u5230\u5168\u8EAB\u653E\u5165\u4E00\u683C\u3002\u4E0D\u8981\u4FDD\u7559\u7D20\u6750\u4E4B\u95F4\u5728\u539F\u754C\u9762\u7684\u76F8\u5BF9\u5927\u5C0F\u3002",
    "\u6B63\u5E38\u6001\u4FDD\u7559\u539F\u8F6E\u5ED3\u548C\u914D\u8272\u3002\u6309\u4E0B\u6001\u53EA\u538B\u6697\u5185\u5E95\u3001\u6536\u7D27\u9AD8\u5149\uFF0C\u8F6E\u5ED3\u548C\u951A\u70B9\u4E0E\u6B63\u5E38\u6001\u4E00\u81F4\u3002",
    "\u4FDD\u7559\uFF1A\u6BCF\u4E2A\u7D20\u6750\u81EA\u8EAB\u7684\u8F6E\u5ED3\u3001\u957F\u5BBD\u6BD4\u4F8B\u3001\u914D\u8272\u548C\u7EC6\u8282\uFF1B\u957F\u6761\u4E0E\u4EBA\u7269\u4FDD\u6301\u539F\u6BD4\u4F8B\uFF0C\u4E0D\u62C9\u4F38\u586B\u6EE1\u65B9\u683C\u3002",
    "\u5206\u5C42\uFF1A\u4E25\u683C\u6309\u6BCF\u683C\u6307\u5B9A\u7684\u7D20\u6750\u7C7B\u578B\u63D0\u53D6\uFF1B\u524D\u666F\u548C\u5E95\u677F\u5206\u522B\u8F93\u51FA\uFF0C\u4E0D\u628A\u53C2\u8003\u56FE\u540E\u9762\u7684\u5E95\u6846\u5408\u5165\u524D\u666F\u3002",
    "\u8F93\u51FA\u5E26\u771F\u5B9E Alpha \u901A\u9053\u7684\u900F\u660E\u80CC\u666F PNG\uFF0C\u6240\u6709\u4E3B\u4F53\u5916\u80CC\u666F\u3001\u7D20\u6750\u95F4\u9694\u548C\u5907\u7528\u683C\u5747\u4E3A Alpha=0\uFF1B\u4FDD\u7559\u534A\u900F\u660E\u8FB9\u7F18\uFF0C\u4E0D\u586B\u5145\u7EAF\u8272\u5E95\u6216\u7ED8\u5236\u68CB\u76D8\u683C\u3002",
    group === "panels" ? "\u53EA\u63D0\u53D6\u7A7A\u9762\u677F\u5E95\u677F\u3002\u4E0D\u8981\u753B\u89D2\u8272\u3001\u56FE\u6807\u6216\u9053\u5177\uFF0C\u4E0D\u8981\u91CD\u7ED8\u6574\u5F20\u754C\u9762\uFF0C\u4E0D\u8981\u8DE8\u683C\u3002" : (prelayout ? "\u4FDD\u6301\u9884\u6392\u53C2\u8003\u56FE\u4E2D\u5404\u7D20\u6750\u7684\u683C\u4F4D\u548C\u4E2D\u5FC3\u3002" : "\u4E0D\u8981\u6309\u53C2\u8003\u56FE\u7684\u754C\u9762\u4F4D\u7F6E\u6446\u653E\uFF0C") + "\u4E0D\u8981\u91CD\u7ED8\u6574\u5F20\u754C\u9762\uFF0C\u4E0D\u8981\u8DE8\u683C\uFF0C\u4E0D\u8981\u6DFB\u52A0\u6E05\u5355\u4E4B\u5916\u7684\u88C5\u9970\u3001\u7F16\u53F7\u6216\u7F51\u683C\u7EBF\u3002\u6E05\u5355\u6307\u5B9A\u7684\u88C5\u9970\u672C\u8EAB\u5E94\u5B8C\u6574\u63D0\u53D6\u3002\u5E95\u677F\u4E0D\u8981\u5E26\u56FE\u6807\u3001\u4EBA\u7269\u6216\u7269\u54C1\u3002"
  ];
  return lines.join("\n");
}
function validateUiAtlasPlanStructure(value) {
  const plan = value;
  if (!plan || plan.version !== 1 || !plan.grid || !Array.isArray(plan.slots))
    throw new Error("UI \u56FE\u96C6\u987A\u5E8F\u6E05\u5355\u65E0\u6548\u3002");
  const bbox = validateUiBboxStructure(plan.bbox);
  const grid = plan.grid;
  imageAtlasRegions(4096, 4096, grid);
  if (plan.slots.length !== grid.columns * grid.rows)
    throw new Error("UI \u987A\u5E8F\u6E05\u5355\u6570\u91CF\u4E0E\u56FE\u96C6\u683C\u6570\u4E0D\u4E00\u81F4\u3002");
  const ids = new Set(bbox.elements.map((element) => element.id));
  const textIds = new Set(bbox.texts.map((text) => text.id));
  const assigned = /* @__PURE__ */ new Set();
  const slots = plan.slots.map((slot) => {
    if (!slot || !["normal", "pressed"].includes(slot.state) || !["element", "text", "background", "reserve"].includes(slot.role) || !Array.isArray(slot.elementIds) || (["element", "text"].includes(slot.role) ? !slot.elementIds.length : slot.elementIds.length > 0) || slot.role === "text" && (!plan.nativeLayout || slot.state !== "normal" || slot.elementIds.length !== 1))
      throw new Error("UI \u69FD\u4F4D\u7528\u9014\u6216\u72B6\u6001\u65E0\u6548\u3002");
    for (const id of slot.elementIds) {
      const key = id + ":" + slot.state;
      if (!(slot.role === "text" ? textIds : ids).has(id) || assigned.has(key))
        throw new Error("UI \u7EC4\u4EF6\u7ED1\u5B9A\u91CD\u590D\u6216\u4E0D\u5B58\u5728\uFF1A" + id);
      assigned.add(key);
    }
    return { elementIds: [...slot.elementIds], state: slot.state, role: slot.role };
  });
  const nativeLayout = plan.nativeLayout;
  if (nativeLayout) {
    if (![nativeLayout.width, nativeLayout.height].every(
      (value2) => Number.isSafeInteger(value2) && value2 > 0 && value2 <= 2048
    ))
      throw new Error("\u539F\u5C3A\u5BF8\u9884\u6392\u56FE\u96C6\u6BCF\u8FB9\u5FC5\u987B\u4E3A 1 \u5230 2048 \u50CF\u7D20\u3002");
    const regions = validateAtlasCrops(
      nativeLayout.width,
      nativeLayout.height,
      nativeLayout.regions
    );
    if (regions.length !== slots.length) throw new Error("\u539F\u5C3A\u5BF8\u5750\u6807\u4E0E\u7D20\u6750\u6570\u91CF\u4E0D\u4E00\u81F4\u3002");
    regions.forEach((region, index) => {
      const element = (slots[index].role === "text" ? bbox.texts : bbox.elements).find(
        (item) => item.id === slots[index].elementIds[0]
      );
      if (slots[index].role === "reserve" || region.blank || region.outputWidth !== void 0 || region.outputHeight !== void 0 || region.offsetX !== void 0 || region.offsetY !== void 0 || region.width !== Math.max(1, Math.round(element?.bbox[2] ?? bbox.design.width)) || region.height !== Math.max(1, Math.round(element?.bbox[3] ?? bbox.design.height)))
        throw new Error("\u539F\u5C3A\u5BF8\u533A\u57DF\u4E0E Bbox \u5C3A\u5BF8\u4E0D\u4E00\u81F4\uFF0C\u4E0D\u80FD\u7F29\u653E\u6216\u8865\u9F50\u8F93\u51FA\u3002");
    });
    return {
      version: 1,
      bbox,
      grid: { ...grid },
      slots,
      nativeLayout: { width: nativeLayout.width, height: nativeLayout.height, regions }
    };
  }
  return { version: 1, bbox, grid: { ...grid }, slots };
}
function uiAtlasOrderPrompt(plan, outputAspect = 1, prelayout = false) {
  const bbox = plan.bbox;
  if (!plan.nativeLayout && plan.slots.length === 1 && plan.slots[0].role === "background")
    return [
      "UI \u69FD\u4F4D\u7ED1\u5B9A\uFF1A",
      "\u672C\u5F20\u53EA\u8F93\u51FA\u5B8C\u6574\u73AF\u5883\u80CC\u666F\uFF0C\u8986\u76D6\u6574\u5F20\u8F93\u51FA\u56FE\u3002\u53C2\u8003\u56FE\u4E2D\u7684\u900F\u660E\u7559\u767D\u4E5F\u987B\u6309\u573A\u666F\u81EA\u7136\u5EF6\u5C55\u8865\u9F50\uFF0C\u4E0D\u6CBF\u7528\u7D20\u6750\u7F51\u683C\u7684\u5C45\u4E2D\u3001\u7F29\u5C0F\u548C\u7559\u767D\u8981\u6C42\u3002"
    ].join("\n");
  if (plan.nativeLayout)
    return [
      "UI \u69FD\u4F4D\u7ED1\u5B9A\uFF1A",
      "\u539F\u5C3A\u5BF8\u56FE\u96C6\u4E3A " + plan.nativeLayout.width + "\xD7" + plan.nativeLayout.height + "\uFF1B\u4EE5\u4E0B\u4E3A\u8F93\u51FA\u50CF\u7D20\u77E9\u5F62 [x,y,w,h]\uFF0C\u4E0D\u662F\u539F\u7A3F\u4F4D\u7F6E\u3002\u4FDD\u6301\u6BCF\u4E2A\u77E9\u5F62\u5185\u7684\u4E3B\u4F53\u4F4D\u7F6E\u4E0E\u5C3A\u5BF8\u3002",
      "\u6BCF\u4E2A\u77E9\u5F62\u53EA\u8F93\u51FA\u6E05\u5355\u6307\u5B9A\u7684\u5C42\u3002\u540C\u4E00\u56FE\u96C6\u53EF\u540C\u65F6\u5305\u542B\u7A7A\u5E95\u677F\u548C\u524D\u666F\u7269\u54C1\uFF1B\u4E0D\u80FD\u56E0\u4E3A\u88C1\u7247\u4E2D\u7269\u54C1\u9192\u76EE\u5C31\u628A\u5E95\u677F\u4EFB\u52A1\u6539\u6210\u7269\u54C1\u4EFB\u52A1\u3002\u4E0D\u8981\u653E\u5927\u3001\u5C45\u4E2D\u91CD\u6392\u6216\u88C1\u65AD\u4E3B\u4F53\u3002",
      ...plan.slots.map((slot, index) => {
        const element = bbox.elements.find((item) => item.id === slot.elementIds[0]);
        const region = plan.nativeLayout.regions[index];
        if (slot.role === "text") {
          const text = bbox.texts.find((item) => item.id === slot.elementIds[0]);
          return text.id + " \u7F8E\u672F\u5B57\u201C" + text.text + "\u201D [" + [region.x, region.y, region.width, region.height].join(",") + "]\uFF1B\u4EC5\u4FDD\u7559\u6B64\u6587\u5B57\u7684\u5B8C\u6574\u5B57\u5F62\u3001\u914D\u8272\u3001\u63CF\u8FB9\u548C\u5B57\u6548\uFF1B\u79FB\u9664\u5E95\u677F\u3001\u82B1\u53F6\u88C5\u9970\u3001\u5176\u5B83\u56FE\u6848\u4E0E\u80CC\u666F\u3002\u4FDD\u6301\u5B57\u5F62\u539F\u5C3A\u5BF8\u3001\u4F4D\u7F6E\uFF0C\u4E0D\u653E\u5927\u3001\u4E0D\u7F29\u5C0F\u3001\u4E0D\u5C45\u4E2D\u91CD\u6392\u3002";
        }
        const children = element && bbox.elements.filter((item) => item.parent === element.id);
        return (element ? element.id + " " + element.name + "\uFF08type=" + element.type + "\uFF09" : "\u73AF\u5883\u80CC\u666F") + " " + slot.state + (slot.state === "pressed" ? "\uFF08\u6309\u4E0B\u6001\uFF1A\u76F8\u5BF9\u540C ID \u7684 normal \u5185\u5E95\u660E\u663E\u538B\u6697\u7EA6 20%\uFF0C\u6536\u7D27\u9AD8\u5149\uFF1B\u4E0D\u8981\u539F\u6837\u590D\u5236 normal\uFF0C\u4E0D\u79FB\u52A8\u8F6E\u5ED3\uFF09" : "") + " [" + [region.x, region.y, region.width, region.height].join(",") + "]\uFF1B" + (slot.role === "background" || element && uiAtlasElementGroup(element, bbox) === "background" ? "\u4EC5\u4FDD\u7559\u73AF\u5883\u573A\u666F\u4E0E\u5916\u56F4\u88C5\u9970\uFF1B\u79FB\u9664\u5168\u90E8 UI \u9762\u677F\u3001\u8FB9\u6846\u3001\u6309\u94AE\u3001\u69FD\u6846\u3001\u56FE\u6807\u3001\u4EBA\u7269\u548C\u6587\u5B57\u3002\u5927\u9762\u79EF\u906E\u6321\u5904\u6309\u5468\u56F4\u573A\u666F\u7684\u900F\u89C6\u3001\u914D\u8272\u3001\u5149\u5F71\u4E0E\u6750\u8D28\u81EA\u52A8\u5EF6\u5C55\u8865\u7ED8\uFF0C\u8FDE\u7EED\u94FA\u6EE1\u6307\u5B9A\u80CC\u666F\u77E9\u5F62\uFF0C\u4E0D\u7559\u900F\u660E\u6D1E\u6216\u900F\u660E\u8FB9\u3002" : element && /填充|分隔线|横线|fill|separator|divider/i.test(element.name) ? "\u6B64\u9879\u662F\u524D\u666F\u586B\u5145\u6216\u7EBF\u6761\uFF0C\u4E0D\u662F\u7A7A\u5E95\u677F\u3002\u5B8C\u6574\u4FDD\u7559\u53C2\u8003\u56FE\u4E2D\u7684\u989C\u8272\u3001\u6E10\u53D8\u3001\u7EC6\u7EBF\u548C\u957F\u5EA6\uFF1B\u6DF1\u7070\u8272\u7EC6\u7EBF\u4E5F\u5FC5\u987B\u8F93\u51FA\uFF0C\u4E0D\u5F97\u6E05\u7A7A\u3001\u589E\u7C97\u6216\u6539\u8272\u3002\u53EA\u79FB\u9664\u5B83\u80CC\u540E\u7684\u9762\u677F\uFF0C\u4E0D\u8981\u79FB\u9664\u6B64\u9879\u672C\u8EAB\u3002" : element && /覆盖层|选中.*描边|角标/i.test(element.name) ? "\u4EC5\u4FDD\u7559\u540D\u79F0\u6307\u5B9A\u7684\u524D\u666F\u6807\u8BB0\uFF08\u89D2\u6807\u8272\u5E26\u6216\u9009\u4E2D\u63CF\u8FB9\uFF09\uFF0C\u4E0D\u662F\u6574\u4E2A\u88C1\u7247\u5E95\u677F\u3002\u79FB\u9664\u540E\u65B9\u5361\u7247\u3001\u7269\u54C1\u548C\u5176\u5B83\u80CC\u666F\uFF0C\u6807\u8BB0\u5916\u4FA7\u4E0E\u5185\u90E8\u5B54\u6D1E\u4F7F\u7528\u62A0\u56FE\u5E95\u8272\uFF1B\u4E0D\u8981\u4FDD\u7559\u88C1\u6846\u5E26\u5165\u7684\u77E9\u5F62\u5E95\u8272\u6216\u7269\u54C1\u788E\u7247\u3002" : element?.type === "icon" ? "\u4EC5\u4FDD\u7559\u540D\u79F0\u6307\u5B9A\u7684\u524D\u666F\u56FE\u6848\uFF1B\u4E25\u683C\u4FDD\u6301\u539F\u6709\u989C\u8272\u4E0E\u5F62\u72B6\uFF0C\u79FB\u9664\u540E\u65B9\u5E95\u6846\u3001\u5E95\u677F\u548C\u80CC\u666F\u3002\u5916\u6846\u82E5\u5355\u5217\u5219\u4E0D\u5F97\u7C98\u5728\u56FE\u6848\u4E0A\u3002" : element && /轨道|底槽|track/i.test(element.name) ? "\u4EC5\u4FDD\u7559\u5168\u957F\u7684\u7A7A\u8F68\u9053\u53CA\u8FB9\u6846\u3002\u8F68\u9053\u5185\u90E8\u4ECE\u5DE6\u5230\u53F3\u5747\u4E3A\u7A7A\u69FD\u7684\u5E95\u8272\u548C\u7EB9\u7406\uFF0C\u4E0D\u5F97\u51FA\u73B0\u4EFB\u4F55\u5F69\u8272\u8FDB\u5EA6\u586B\u5145\u3002\u5F7B\u5E95\u79FB\u9664\u8986\u76D6\u5176\u4E0A\u7684\u5F69\u8272\u586B\u5145\u3001\u6570\u503C\u548C\u56FE\u6807\uFF1B\u586B\u5145\u5DF2\u5728\u5176\u5B83\u77E9\u5F62\u5355\u72EC\u8F93\u51FA\uFF0C\u4E0D\u80FD\u518D\u70D8\u7119\u5230\u5E95\u69FD\u91CC\u3002" : region.height <= 16 || region.width <= 16 ? "\u4FDD\u7559\u6B64\u9879\u5B8C\u6574\u7684\u7EC6\u7EBF\u6216\u88C5\u9970\uFF0C\u5305\u62EC\u6DF1\u8272\u7EC6\u7EBF\uFF1B\u4E0D\u8981\u5C06\u5B83\u5F53\u4F5C\u80CC\u666F\u5220\u9664\u3002" : "\u6B64\u9879\u8981\u7684\u662F\u7A7A\u5E95\u677F\uFF0C\u4E0D\u662F\u5176\u4E0A\u7684\u7269\u54C1\u3002\u4FDD\u7559\u5B8C\u6574\u5916\u8FB9\u6846\u548C\u5185\u90E8\u5E95\u8272\u3001\u5E95\u7EB9\u4E3A\u4E00\u4F53\uFF1B\u6E05\u7A7A\u8986\u76D6\u5176\u4E0A\u7684\u5B50\u63A7\u4EF6\u3001\u69FD\u6846\u3001\u6309\u94AE\u3001\u56FE\u6807\u3001\u4EBA\u7269\u3001\u7269\u54C1\u548C\u6587\u5B57\uFF0C\u8865\u9F50\u88AB\u906E\u4F4F\u7684\u5E95\u677F\u3002\u7981\u6B62\u7528\u524D\u666F\u7269\u54C1\u4EE3\u66FF\u7A7A\u5E95\u677F\u3002") + (children?.length ? "\u5FC5\u987B\u5220\u9664\u7684\u72EC\u7ACB\u5B50\u5C42\uFF1A" + children.map((child) => child.id + " " + child.name).join("\u3001") + "\u3002\u8FD9\u4E9B\u5B50\u5C42\u4F1A\u53E6\u884C\u63D0\u53D6\uFF0C\u672C\u69FD\u4E0D\u5F97\u4FDD\u7559\u3002" : "");
      })
    ].join("\n");
  return [
    "UI \u69FD\u4F4D\u7ED1\u5B9A\uFF1A",
    ...prelayout ? [
      "\u53C2\u8003\u56FE\u5DF2\u7ECF\u6309 Bbox \u88C1\u7247\u5E76\u9884\u6392\u5230\u8F93\u51FA\u683C\u4F4D\u3002\u76F4\u63A5\u9010\u683C\u7F16\u8F91\uFF0C\u4E0D\u8981\u91CD\u65B0\u67E5\u627E\u539F\u754C\u9762\u4F4D\u7F6E\u6216\u91CD\u65B0\u6392\u5217\u3002",
      "\u4FDD\u7559\uFF1A\u6BCF\u683C\u6307\u5B9A\u4E3B\u4F53\u7684\u4E2D\u5FC3\u3001\u6BD4\u4F8B\u3001\u8F6E\u5ED3\u3001\u989C\u8272\u548C\u7EC6\u8282\u3002\u88C1\u7247\u4ECD\u5305\u542B\u539F\u56FE\u80CC\u666F\u548C\u906E\u6321\u7269\uFF0C\u4E0D\u662F\u5DF2\u5B8C\u6210\u7684\u5207\u56FE\u3002",
      "\u79FB\u9664\uFF1A\u6309\u4E0B\u5217\u9010\u683C\u8981\u6C42\u6E05\u7406\u975E\u4E3B\u4F53\u5185\u5BB9\uFF0C\u5E76\u8865\u9F50\u88AB\u906E\u6321\u7684\u4E3B\u4F53\u3002\u8F93\u51FA\u4FDD\u6301\u540C\u6837\u7F51\u683C\u548C\u7EAF\u8272\u5E95\uFF0C\u4E0D\u753B\u7F16\u53F7\u3001\u5206\u5272\u7EBF\u3002"
    ] : [],
    "\u6309\u4E0B\u9762\u7684\u884C\u5217\u653E\u5165\u7B49\u5206\u683C\u5B50\u3002\u4E00\u683C\u4E00\u4E2A\uFF0C\u4E2D\u5FC3\u5BF9\u9F50\uFF0C\u4E0D\u8DE8\u683C\u3002",
    "\u8F93\u51FA\u533A\u57DF\u4EE5\u6574\u5F20\u8F93\u51FA\u56FE\u5DE6\u4E0A\u89D2\u4E3A\u539F\u70B9\uFF0C\u7528\u5BBD\u9AD8\u767E\u5206\u6BD4\u8868\u793A\uFF1B\u8FD9\u662F\u8F93\u51FA\u4F4D\u7F6E\uFF0C\u548C\u540E\u9762\u7684\u53C2\u8003\u56FE\u50CF\u7D20\u6846\u5206\u5F00\u4F7F\u7528\u3002\u6BCF\u683C\u53EF\u7528\u533A\u57DF\u4E4B\u5916\u5168\u90E8\u4FDD\u7559\u7EAF\u5E95\u8272\uFF0C\u4E0D\u80FD\u5408\u5E76\u683C\u5B50\u6216\u8BA9\u957F\u6761\u8D2F\u7A7F\u6574\u884C\u3002",
    "\u6E05\u5355\u5DF2\u5408\u5E76\u91CD\u590D\u7D20\u6750\uFF1A\u6BCF\u683C\u53EA\u753B\u4EE3\u8868\u5B9E\u4F8B\u4E00\u6B21\uFF0C\u4E0D\u6309\u5B83\u5728\u539F\u7A3F\u4E2D\u7684\u51FA\u73B0\u6B21\u6570\u590D\u5236\u3002\u540D\u79F0\u53EA\u7528\u4E8E\u5B9A\u4F4D\uFF0C\u6846\u5185\u4E3B\u4F53\u624D\u662F\u63D0\u53D6\u5BF9\u8C61\uFF1B\u661F\u661F\u6240\u5728\u88C5\u5907\u3001\u56FE\u6807\u6240\u5728\u5E95\u6846\u4E0D\u5C5E\u4E8E\u8BE5\u4E3B\u4F53\u3002",
    "\u672C\u5F20\u662F " + plan.grid.columns + " \u5217 \xD7 " + plan.grid.rows + (prelayout ? " \u884C\uFF0C\u4E0D\u8D85\u8FC7 5\xD75\u3002\u53C2\u8003\u56FE\u4E0E\u8F93\u51FA\u7684\u683C\u4F4D\u4E00\u4E00\u5BF9\u5E94\u3002" : " \u884C\uFF0C\u4E0D\u8D85\u8FC7 5\xD75\u3002\u5750\u6807\u53EA\u7528\u6765\u8FA8\u8BA4\u53C2\u8003\u56FE\u4E0A\u7684\u7D20\u6750\uFF0C\u4E0D\u662F\u8F93\u51FA\u4F4D\u7F6E\u3002"),
    ...plan.slots.map((slot, index) => {
      const column = index % plan.grid.columns;
      const row = Math.floor(index / plan.grid.columns);
      const area = [
        (column + 0.1) / plan.grid.columns,
        (row + 0.1) / plan.grid.rows,
        (column + 0.9) / plan.grid.columns,
        (row + 0.9) / plan.grid.rows
      ].map((value) => (value * 100).toFixed(2) + "%");
      const element = bbox.elements.find((item) => item.id === slot.elementIds[0]);
      const aspect = element ? element.bbox[2] / element.bbox[3] : 1;
      const fitWidth = Math.min(
        0.8 / plan.grid.columns,
        0.8 / plan.grid.rows * aspect / outputAspect
      );
      const fitHeight = fitWidth * outputAspect / aspect;
      const rect = element?.bbox.map(
        (value, axis) => Math.round(
          value * (axis % 2 ? bbox.cutSource.height / bbox.design.height : bbox.cutSource.width / bbox.design.width)
        )
      );
      return "\u7B2C" + (Math.floor(index / plan.grid.columns) + 1) + "\u884C\u7B2C" + (index % plan.grid.columns + 1) + "\u5217\uFF08\u8F93\u51FA\u53EF\u7528\u533A\u57DF\uFF1A\u5DE6 " + area[0] + "\uFF0C\u4E0A " + area[1] + "\uFF0C\u53F3 " + area[2] + "\uFF0C\u4E0B " + area[3] + "\uFF09\uFF1A" + (element ? element.id + " " + element.name + (prelayout ? "\uFF08\u53C2\u8003\u56FE\u540C\u4E00\u683C\uFF09 " : " [" + rect.join(",") + "] ") + slot.state + "\uFF1B\u4E3B\u4F53\u76EE\u6807\u5BBD " + (fitWidth * 100).toFixed(2) + "%\u3001\u9AD8 " + (fitHeight * 100).toFixed(2) + "%\uFF0C\u4E2D\u5FC3\u4F4D\u4E8E\u6574\u56FE (" + ((column + 0.5) / plan.grid.columns * 100).toFixed(2) + "%," + ((row + 0.5) / plan.grid.rows * 100).toFixed(2) + "%)\uFF0C\u4FDD\u6301\u539F\u5BBD\u9AD8\u6BD4 " + aspect.toFixed(2) + ":1\uFF0C\u4E0D\u52A0\u539A\u957F\u6761\u3001\u4E0D\u653E\u5927\u586B\u6EE1\u683C\u5B50" + (element.type === "icon" ? "\uFF1B\u4EC5\u4FDD\u7559\u524D\u666F\u4E3B\u4F53\uFF0C\u79FB\u9664\u80CC\u540E\u7684\u9762\u677F\u3001\u69FD\u6846\u3001\u5E95\u8272\u548C\u6587\u5B57\uFF1B\u4E0D\u6DFB\u52A0\u4EFB\u4F55\u5916\u6846\u3002" : element.bbox[2] >= bbox.design.width * 0.95 && element.bbox[3] >= bbox.design.height * 0.95 ? "\uFF1B\u4EC5\u4FDD\u7559\u73AF\u5883\u80CC\u666F\u3002" : "\uFF1B\u4EC5\u4FDD\u7559\u5E95\u677F\u672C\u4F53\u3001\u8FB9\u6846\u548C\u5E95\u7EB9\uFF0C\u79FB\u9664\u8986\u76D6\u7684\u56FE\u6807\u3001\u4EBA\u7269\u3001\u7269\u54C1\u548C\u6587\u5B57\u3002") : slot.role === "background" ? "\u5B8C\u6574\u73AF\u5883\u80CC\u666F" : "\u5907\u7528\u683C\uFF0C\u4E0D\u7ED1\u5B9A UI \u7EC4\u4EF6");
    })
  ].join("\n");
}

// scripts/ui-split-domain.ts
var input = JSON.parse(readFileSync(0, "utf8"));
var result;
if (input.operation === "cut") result = validateCutElements(input.elements, input.width, input.height);
else if (input.operation === "text") result = validateBboxTexts(input.texts, input.width, input.height, input.elements);
else if (input.operation === "plans") {
  const bbox = validateUiBboxStructure(input.bbox);
  result = ["controls", "icons", "equipment", "panels", "artwork", "background"].flatMap((group) => {
    const plans = uiBatchAtlasPlans(bbox, group);
    return plans.filter((plan) => plan.slots.some((slot) => slot.role !== "reserve" && slot.role !== "background")).map((plan) => ({
      columns: plan.grid.columns,
      rows: plan.grid.rows,
      slots: plan.slots.map((slot) => ({ elementId: slot.elementIds[0], state: slot.state, reserve: slot.role === "reserve" })),
      prompt: uiBatchAtlasPrompt(group, true) + "\n" + uiAtlasOrderPrompt(plan, 1, true)
    }));
  });
} else throw new Error("Unsupported UI domain operation");
process.stdout.write(JSON.stringify(result));
