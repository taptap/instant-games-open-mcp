-- Maker NanoVG data adapter. No Lua source is stored in UI documents.
-- capture() is an explicit, synchronous development operation; hooks never survive it.
local M = {}
local unpack = table.unpack or unpack
local active = false
local signatures = {
    save = "", restore = "", beginPath = "", closePath = "", fill = "", stroke = "",
    moveTo = "nn", lineTo = "nn", bezierTo = "nnnnnn", quadTo = "nnnn", arcTo = "nnnnn",
    rect = "nnnn", roundedRect = "nnnnn", roundedRectVarying = "nnnnnnnn",
    circle = "nnn", ellipse = "nnnn", arc = "nnnnnn",
    translate = "nn", scale = "nn", rotate = "n", skewX = "n", skewY = "n", transform = "nnnnnn",
    scissor = "nnnn", intersectScissor = "nnnn",
    fillColor = "c", strokeColor = "c", fillPaint = "p", strokePaint = "p",
    strokeWidth = "n", miterLimit = "n", lineCap = "n", lineJoin = "n", globalAlpha = "n",
    fontSize = "n", fontFace = "s", textAlign = "n", textLetterSpacing = "n", text = "nns", textBox = "nnns",
}
local paints = { linearGradient = "nnnncc", radialGradient = "nnnncc", imagePattern = "nnnnnsn" }

local function finite(n) return type(n) == "number" and n == n and math.abs(n) < math.huge end
local function color(value)
    if type(value) == "string" then
        assert((#value == 7 or #value == 9) and value:match("^#%x+$"), "Invalid NanoVG color")
        return { tonumber(value:sub(2, 3), 16), tonumber(value:sub(4, 5), 16),
            tonumber(value:sub(6, 7), 16), #value == 9 and tonumber(value:sub(8, 9), 16) or 255 }
    end
    assert(type(value) == "table" and #value == 4, "Expected RGBA color")
    for i = 1, 4 do assert(finite(value[i]) and value[i] >= 0 and value[i] <= 255, "Invalid color channel") end
    return value
end

local function validateArgs(args, sig)
    assert(type(args) == "table" and #args == #sig, "Invalid NanoVG argument count")
    for i = 1, #sig do
        local kind, value = sig:sub(i, i), args[i]
        if kind == "n" then assert(finite(value), "Expected finite NanoVG number")
        elseif kind == "s" then assert(type(value) == "string", "Expected NanoVG string")
        elseif kind == "c" then color(value)
        else
            assert(type(value) == "table" and paints[value.kind], "Unsupported NanoVG paint")
            validateArgs(value.args, paints[value.kind])
        end
    end
end

local function validate(node)
    assert(type(node) == "table" and node.type == "NanoVG", "Expected NanoVG node")
    validateArgs(node.viewBox, "nnnn")
    assert(node.viewBox[3] > 0 and node.viewBox[4] > 0, "Invalid NanoVG viewBox")
    assert(type(node.commands) == "table" and #node.commands <= 20000, "Too many NanoVG commands")
    local depth = 0
    for _, cmd in ipairs(node.commands) do
        assert(type(cmd) == "table" and signatures[cmd[1]], "Unsupported NanoVG command: " .. tostring(cmd[1]))
        local args = {}; for i = 2, #cmd do args[#args + 1] = cmd[i] end
        validateArgs(args, signatures[cmd[1]])
        if cmd[1] == "textBox" then assert(args[3] > 0, "Text box width must be positive") end
        if cmd[1] == "save" then depth = depth + 1 end
        if cmd[1] == "restore" then depth = depth - 1 end
        assert(depth >= 0 and depth <= 32, "Unbalanced NanoVG state stack (layer limit: 32)")
    end
    assert(depth == 0, "Unbalanced NanoVG state stack")
end
M.validate = validate

-- opts.images maps existing native image handles to assets-relative resource paths.
-- opts.fonts maps existing font IDs to names. Unknown APIs/opaque paints fail capture.
function M.capture(ctx, opts, draw)
    assert(not active, "Nested NanoVG capture is not supported; capture separate named layers")
    assert(type(opts) == "table" and type(draw) == "function", "capture requires options and a draw function")
    local node = { type = "NanoVG", id = opts.id, position = "absolute", left = opts.left or 0,
        top = opts.top or 0, width = opts.width, height = opts.height,
        viewBox = opts.viewBox or { 0, 0, opts.width, opts.height }, commands = {} }
    local originals, colors, paintValues = {}, {}, {}
    local images, fonts = opts.images or {}, opts.fonts or {}
    local depth, failure = 0, nil
    local function remember(op, args)
        assert(#node.commands < 20000, "NanoVG command limit exceeded")
        local cmd = { op }; for _, value in ipairs(args) do cmd[#cmd + 1] = value end
        node.commands[#node.commands + 1] = cmd
    end
    local function capturedColor(value)
        assert(colors[value], "Color was created outside capture; create it inside the draw callback")
        return colors[value]
    end
    local function wrap(name, fn)
        if originals[name] then
            _G[name] = function(...)
                local result = { pcall(fn, ...) }
                if not result[1] then failure = tostring(result[2]); error(failure) end
                return unpack(result, 2)
            end
        end
    end
    for name, fn in pairs(_G) do
        if type(fn) == "function" and name:match("^nvg[A-Z]") then originals[name] = fn end
    end
    assert(originals.nvgSave and originals.nvgRestore and originals.nvgReset, "NanoVG context is unavailable")
    originals.nvgSave(ctx)
    active = true
    -- Refuse unrecorded drawing instead of returning a visually incomplete success.
    for name in pairs(originals) do
        local api = name
        _G[api] = function()
            failure = "Unsupported NanoVG capture API: " .. api
            error(failure)
        end
    end
    for op, sig in pairs(signatures) do
        local operation, signature = op, sig
        local name = "nvg" .. op:sub(1, 1):upper() .. op:sub(2)
        wrap(name, function(vg, ...)
            assert(vg == ctx, "A capture may only use its own NanoVG context")
            local args = { ... }
            for i = 1, #signature do
                local kind = signature:sub(i, i)
                if kind == "c" then args[i] = capturedColor(args[i])
                elseif kind == "p" then
                    assert(paintValues[args[i]], "Paint was created outside capture")
                    args[i] = paintValues[args[i]]
                end
            end
            validateArgs(args, signature)
            if operation == "save" then assert(depth < 32, "NanoVG stack limit") end
            if operation == "restore" then assert(depth > 0, "Unbalanced NanoVG restore") end
            remember(operation, args)
            local result = originals[name](vg, ...)
            if operation == "save" then depth = depth + 1 end
            if operation == "restore" then depth = depth - 1 end
            return result
        end)
    end
    for _, name in ipairs({ "nvgRGB", "nvgRGBA", "nvgRGBf", "nvgRGBAf" }) do
        local api = name
        wrap(api, function(...)
            local a = { ... }; local factor = api:sub(-1) == "f" and 255 or 1
            local rgba = { a[1] * factor, a[2] * factor, a[3] * factor, a[4] and a[4] * factor or 255 }
            color(rgba)
            local result = originals[api](...); colors[result] = rgba; return result
        end)
    end
    for kind, sig in pairs(paints) do
        local paintKind, signature = kind, sig
        local name = "nvg" .. kind:sub(1, 1):upper() .. kind:sub(2)
        wrap(name, function(vg, ...)
            assert(vg == ctx, "NanoVG context mismatch")
            local args = { ... }
            if paintKind == "imagePattern" then
                assert(images[args[6]], "Image handle requires opts.images mapping")
                args[6] = images[args[6]]
            else args[5] = capturedColor(args[5]); args[6] = capturedColor(args[6]) end
            validateArgs(args, signature)
            local result = originals[name](vg, ...)
            paintValues[result] = { kind = paintKind, args = args }
            return result
        end)
    end
    wrap("nvgFontFaceId", function(vg, id)
        assert(vg == ctx and fonts[id], "Font ID requires opts.fonts mapping")
        remember("fontFace", { fonts[id] }); return originals.nvgFontFaceId(vg, id)
    end)
    for _, name in ipairs({ "nvgImageSize", "nvgTextBounds", "nvgTextMetrics" }) do
        if originals[name] then _G[name] = originals[name] end
    end
    local ok, err = xpcall(function()
        originals.nvgReset(ctx)
        originals.nvgBeginPath(ctx)
        draw()
        assert(not failure, failure)
        validate(node)
    end, function(e) return tostring(e) end)
    for name, fn in pairs(originals) do _G[name] = fn end
    for _ = 1, depth do originals.nvgRestore(ctx) end
    originals.nvgRestore(ctx)
    active = false
    if not ok then error(err) end
    return node
end

local function nativeColor(value) return nvgRGBA(unpack(color(value))) end
local function multiply(a, b)
    return { a[1]*b[1]+a[3]*b[2], a[2]*b[1]+a[4]*b[2], a[1]*b[3]+a[3]*b[4],
        a[2]*b[3]+a[4]*b[4], a[1]*b[5]+a[3]*b[6]+a[5], a[2]*b[5]+a[4]*b[6]+a[6] }
end
local function inverse(m)
    local d = m[1]*m[4]-m[2]*m[3]
    if math.abs(d) < 1e-12 then return nil end
    return { m[4]/d, -m[2]/d, -m[3]/d, m[1]/d,
        (m[3]*m[6]-m[4]*m[5])/d, (m[2]*m[5]-m[1]*m[6])/d }
end

-- Draw a leaf inside the caller's active NanoVG frame. Layout belongs to the caller.
-- resolveImage(path, ctx) returns a cached native handle; this module owns no resources.
function M.draw(ctx, node, x, y, width, height, resolveImage, opacity)
    validate(node)
    local view, depth = node.viewBox, 0
    local matrix, clips, stack = { 1, 0, 0, 1, 0, 0 }, {}, {}
    nvgSave(ctx)
    local ok, err = xpcall(function()
        nvgTranslate(ctx, x or node.left or 0, y or node.top or 0)
        nvgScale(ctx, (width or node.width or view[3]) / view[3], (height or node.height or view[4]) / view[4])
        nvgTranslate(ctx, -view[1], -view[2])
        nvgFillColor(ctx, nvgRGBA(255, 255, 255, 255)); nvgStrokeColor(ctx, nvgRGBA(0, 0, 0, 255))
        nvgStrokeWidth(ctx, 1); nvgMiterLimit(ctx, 10); nvgLineCap(ctx, 0); nvgLineJoin(ctx, 4)
        nvgFontSize(ctx, 16); nvgFontFace(ctx, "sans"); nvgTextAlign(ctx, 65)
        nvgTextLetterSpacing(ctx, 0)
        if opacity then nvgGlobalAlpha(ctx, opacity) end
        nvgBeginPath(ctx)
        local function clipped(fn, args)
            if #clips == 0 then fn(ctx, unpack(args)); return end
            local inv = inverse(matrix)
            if not inv then return end
            -- Apply layer scissors at paint time so replacing a local scissor cannot
            -- discard an enclosing Widget/ScrollView clip.
            nvgSave(ctx)
            local painted, problem = pcall(function()
                nvgTransform(ctx, unpack(inv))
                for _, clip in ipairs(clips) do
                    local back = inverse(clip.matrix)
                    if not back then return end
                    nvgTransform(ctx, unpack(clip.matrix))
                    nvgIntersectScissor(ctx, unpack(clip.args))
                    nvgTransform(ctx, unpack(back))
                end
                nvgTransform(ctx, unpack(matrix))
                fn(ctx, unpack(args))
            end)
            nvgRestore(ctx)
            if not painted then error(problem) end
        end
        for _, cmd in ipairs(node.commands) do
            local op, args = cmd[1], {}
            for i = 2, #cmd do args[#args + 1] = cmd[i] end
            if op == "fillColor" or op == "strokeColor" then args[1] = nativeColor(args[1]) end
            if op == "globalAlpha" then args[1] = args[1] * (opacity or 1) end
            if op == "fillPaint" or op == "strokePaint" then
                local p, a = args[1], {}; for i, value in ipairs(args[1].args) do a[i] = value end
                if p.kind == "imagePattern" then
                    assert(resolveImage, "Image paint requires resolveImage(path, ctx)")
                    a[6] = resolveImage(a[6], ctx)
                    assert(type(a[6]) == "number" and a[6] > 0, "NanoVG image could not be resolved")
                else a[5] = nativeColor(a[5]); a[6] = nativeColor(a[6]) end
                args[1] = _G["nvg" .. p.kind:sub(1, 1):upper() .. p.kind:sub(2)](ctx, unpack(a))
            end
            local fn = _G["nvg" .. op:sub(1, 1):upper() .. op:sub(2)]
            assert(type(fn) == "function", "NanoVG runtime API missing: " .. op)
            if op == "scissor" or op == "intersectScissor" then
                local nextClips = {}
                if op == "intersectScissor" then for i, clip in ipairs(clips) do nextClips[i] = clip end end
                nextClips[#nextClips + 1] = { matrix = matrix, args = args }; clips = nextClips
            elseif op == "fill" or op == "stroke" or op == "text" or op == "textBox" then clipped(fn, args)
            else fn(ctx, unpack(args)) end
            if op == "save" then depth = depth + 1; stack[depth] = { matrix = matrix, clips = clips } end
            if op == "restore" then matrix = stack[depth].matrix; clips = stack[depth].clips; stack[depth] = nil; depth = depth - 1 end
            local t
            if op == "transform" then t = args
            elseif op == "translate" then t = { 1, 0, 0, 1, args[1], args[2] }
            elseif op == "scale" then t = { args[1], 0, 0, args[2], 0, 0 }
            elseif op == "rotate" then
                local c, s = math.cos(args[1]), math.sin(args[1]); t = { c, s, -s, c, 0, 0 }
            elseif op == "skewX" then t = { 1, 0, math.tan(args[1]), 1, 0, 0 }
            elseif op == "skewY" then t = { 1, math.tan(args[1]), 0, 1, 0, 0 } end
            if t then matrix = multiply(matrix, t) end
        end
    end, function(e) return tostring(e) end)
    for _ = 1, depth do nvgRestore(ctx) end
    nvgRestore(ctx)
    if not ok then error(err) end
end

-- Register the node before UI.LoadJSON; reuse the engine's layout, input and transforms.
function M.register(UI, resolveImage)
    assert(not UI.NanoVG, "UI.NanoVG is already registered")
    local Widget = require("urhox-libs/UI/Core/Widget")
    local Vector = Widget:Extend("NanoVG")
    function Vector:Render(ctx)
        local layout = self:GetAbsoluteLayout()
        local data = { type = "NanoVG", commands = self.props.commands, viewBox = self.props.viewBox }
        local opacity, widget = 1, self
        while widget do
            local a = widget.renderProps_ and widget.renderProps_.opacity or widget.props.opacity or 1
            opacity = opacity * math.max(0, math.min(1, a))
            widget = widget.parent
        end
        M.draw(ctx, data, layout.x, layout.y, layout.w, layout.h, resolveImage, opacity)
    end
    UI.NanoVG = Vector
    return Vector
end

return M
