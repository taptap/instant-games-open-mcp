-- lua nanovg.test.lua <adapter> [game-root output-json]
local calls, depth = {}, 0
local function log(name, ...)
    calls[#calls + 1] = { name, ... }
end
local names = {
    "Save", "Restore", "Reset", "BeginPath", "ClosePath", "Fill", "Stroke", "MoveTo", "LineTo",
    "BezierTo", "QuadTo", "ArcTo", "Rect", "RoundedRect", "RoundedRectVarying", "Circle", "Ellipse", "Arc",
    "Translate", "Scale", "Rotate", "SkewX", "SkewY", "Transform", "Scissor", "IntersectScissor",
    "FillColor", "StrokeColor", "FillPaint", "StrokePaint", "StrokeWidth", "MiterLimit", "LineCap", "LineJoin",
    "GlobalAlpha", "FontSize", "FontFace", "FontFaceId", "TextAlign", "TextLetterSpacing", "Text", "TextBox", "BoxGradient",
}
for _, suffix in ipairs(names) do
    local name = "nvg" .. suffix
    _G[name] = function(_, ...)
        log(name, ...)
        if name == "nvgSave" then depth = depth + 1 end
        if name == "nvgRestore" then depth = depth - 1; assert(depth >= 0, "Leaked restore") end
    end
end
function nvgRGBA(...) return { ... } end
function nvgRGB(r, g, b) return { r, g, b, 255 } end
function nvgRGBAf(r, g, b, a) return { r * 255, g * 255, b * 255, a * 255 } end
function nvgRGBf(r, g, b) return { r * 255, g * 255, b * 255, 255 } end
function nvgLinearGradient(_, ...) return { kind = "linearGradient", args = { ... } } end
function nvgRadialGradient(_, ...) return { kind = "radialGradient", args = { ... } } end
function nvgImagePattern(_, ...) return { kind = "imagePattern", args = { ... } } end
local M = dofile(assert(arg[1]))
local ctx, originals = {}, {}
for name, fn in pairs(_G) do if name:match("^nvg") then originals[name] = fn end end
local function restored()
    assert(depth == 0, "Unbalanced native state")
    for name, fn in pairs(originals) do assert(_G[name] == fn, "Leaked hook: " .. name) end
end
local opts = { id = "panel", width = 240, height = 160 }
local node = M.capture(ctx, opts, function()
    nvgSave(ctx); nvgTranslate(ctx, 8, 9)
    nvgBeginPath(ctx); nvgRoundedRect(ctx, 0, 0, 220, 140, 12)
    nvgFillPaint(ctx, nvgLinearGradient(ctx, 0, 0, 220, 140, nvgRGBA(245, 156, 184, 64), nvgRGBA(20, 18, 30, 10)))
    nvgFill(ctx); nvgRestore(ctx)
end)
restored()
assert(node.commands[5][2].args[5][1] == 245, "Gradient color lost")
local before = #calls
M.draw(ctx, node, 20, 30, 480, 320)
restored()
assert(#calls > before, "Replay drew nothing")
local found = false
for i = before + 1, #calls do
    if calls[i][1] == "nvgFillPaint" then
        assert(calls[i][2].kind == "linearGradient" and calls[i][2].args[5][1] == 245)
        found = true
    end
end
assert(found, "Gradient replay missing")
local paragraph = M.capture(ctx, opts, function()
    nvgScissor(ctx, 0, 0, 100, 50)
    nvgTextBox(ctx, 12, 20, 200, "line one\nline two")
end)
before = #calls
M.draw(ctx, paragraph)
assert(paragraph.commands[2][1] == "textBox", "Multiline text was lost")
local clippedParagraph = false
for i = before + 1, #calls do if calls[i][1] == "nvgIntersectScissor" then clippedParagraph = true end end
assert(clippedParagraph, "Multiline text escaped the layer clip")
restored()
local clipped = M.capture(ctx, opts, function()
    nvgSave(ctx); nvgTranslate(ctx, 10, 15); nvgScissor(ctx, 0, 0, 100, 50)
    nvgBeginPath(ctx); nvgRect(ctx, 0, 0, 200, 100); nvgFill(ctx)
    nvgScissor(ctx, 10, 10, 80, 30); nvgFill(ctx); nvgRestore(ctx)
end)
before = #calls
M.draw(ctx, clipped)
restored()
local intersections = 0
for i = before + 1, #calls do
    assert(calls[i][1] ~= "nvgScissor", "Replay discarded an enclosing widget clip")
    if calls[i][1] == "nvgIntersectScissor" then intersections = intersections + 1 end
end
assert(intersections == 2, "Local scissor replacement accumulated stale clips")
local imageLayer = M.capture(ctx, { width = 100, height = 100, images = { [7] = "image/tile.png" }, fonts = { [9] = "sans" } }, function()
    nvgBeginPath(ctx); nvgRect(ctx, 0, 0, 100, 100)
    nvgFillPaint(ctx, nvgImagePattern(ctx, 0, 0, 100, 100, 0, 7, 0.5)); nvgFill(ctx)
    nvgFontFaceId(ctx, 9); nvgText(ctx, 0, 20, "hello")
end)
assert(imageLayer.commands[3][2].args[6] == "image/tile.png", "Native image handle leaked into data")
assert(imageLayer.commands[5][1] == "fontFace" and imageLayer.commands[5][2] == "sans")
local resolved
M.draw(ctx, imageLayer, nil, nil, nil, nil, function(ref) resolved = ref; return 11 end)
assert(resolved == "image/tile.png")
restored()
local originalReset = nvgReset
nvgReset = function() error("reset failed") end
assert(not pcall(M.capture, ctx, opts, function() end))
nvgReset = originalReset
restored()
for _, bad in ipairs({
    function() nvgSave(ctx); error("callback failed") end,
    function() nvgRestore(ctx) end,
    function() nvgBoxGradient(ctx, 1, 2, 3, 4) end,
    function() pcall(nvgBoxGradient, ctx, 1, 2, 3, 4) end,
    function() for _ = 1, 129 do nvgSave(ctx) end end,
}) do
    assert(not pcall(M.capture, ctx, opts, bad), "Invalid capture accepted")
    restored()
end
local savedFill = nvgFill
nvgFill = function() error("native draw failure") end
assert(not pcall(M.draw, ctx, node), "Native failure swallowed")
nvgFill = savedFill
restored()
package.loaded["urhox-libs/UI/Core/Widget"] = { Extend = function() return {} end }
local UI = {}
local Widget = M.register(UI)
local widget = setmetatable({ props = { commands = node.commands, viewBox = node.viewBox, opacity = 0.4 },
    parent = { props = { opacity = 0.5 } }, GetAbsoluteLayout = function() return { x = 10, y = 20, w = 240, h = 160 } end }, { __index = Widget })
before = #calls
widget:Render(ctx)
local alpha
for i = before + 1, #calls do if calls[i][1] == "nvgGlobalAlpha" then alpha = calls[i][2] end end
assert(alpha == 0.2, "Widget opacity did not include its parents")
assert(not pcall(M.register, UI), "Overwrote existing NanoVG registration")
restored()
if not arg[2] then print("NanoVG capture/replay tests passed"); return end

-- Exercise actual, reviewed pure drawing functions without starting game state or save I/O.
package.loaded["data.save"] = {}
local Draw = dofile(arg[2] .. "/scripts/ui/draw.lua")
package.loaded["ui.draw"] = Draw
Draw.vg = ctx
NVG_ROUND = 1
NVG_ALIGN_LEFT, NVG_ALIGN_CENTER, NVG_ALIGN_RIGHT = 1, 2, 4
NVG_ALIGN_TOP, NVG_ALIGN_MIDDLE, NVG_ALIGN_BOTTOM, NVG_ALIGN_BASELINE = 8, 16, 32, 64
local Theme = dofile(arg[2] .. "/scripts/ui/sakura_theme.lua")
local panel = M.capture(ctx, { id = "sakura_gothic_panel", left = 210, top = 170, width = 780, height = 470 }, function()
    Theme.DrawPanel(ctx, 12, 12, 746, 432, 0.9)
end)
local flower = M.capture(ctx, { id = "sakura_flower", left = 118, top = 85, width = 96, height = 96 }, function()
    Theme.DrawFlower(48, 48, 34, 0.9)
end)
local crystal = M.capture(ctx, { id = "sakura_crystal", left = 992, top = 570, width = 96, height = 96 }, function()
    Theme.DrawCrystal(48, 48, 34, nil, 0.9)
end)
local title = M.capture(ctx, { id = "sakura_title", left = 245, top = 290, width = 680, height = 80 }, function()
    Theme.Text(340, 40, "校园怪谈与遗失之物", 36, Theme.colors.ink, NVG_ALIGN_CENTER + NVG_ALIGN_MIDDLE, 1)
end)
for _, item in ipairs({ panel, flower, crystal, title }) do M.draw(ctx, item); restored() end
local tree = { type = "Panel", id = "nanovg_demo", width = 1200, height = 800, backgroundColor = "#100f18",
    children = { panel, flower, crystal, title,
        { type = "Label", id = "subtitle", position = "absolute", left = 270, top = 400, width = 660, height = 50,
          text = "NanoVG · 曲线 / 渐变 / 可编辑图层", fontSize = 23, fontColor = "#dbb87a", textAlign = "center" } } }
local function json(value)
    if type(value) == "string" then return '"' .. value:gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('\n', '\\n') .. '"' end
    if type(value) == "number" then return tostring(value) end
    if type(value) == "boolean" then return tostring(value) end
    local list, out = #value > 0, {}
    if list then for _, item in ipairs(value) do out[#out + 1] = json(item) end
    else for key, item in pairs(value) do out[#out + 1] = json(key) .. ":" .. json(item) end end
    return (list and "[" or "{") .. table.concat(out, ",") .. (list and "]" or "}")
end
local output = assert(io.open(assert(arg[3]), "w")); output:write(json(tree)); output:close()
print("Actual Sakura theme captured and replayed: " .. #panel.commands .. " panel commands")
