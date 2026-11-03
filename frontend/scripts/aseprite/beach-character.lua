--[[
  소로우 바닷가 도트 캐릭터 시트 생성 (Aseprite 배치 모드 Lua).
  실행: node scripts/gen-beach-character.mjs  →  aseprite -b --script-param config=… --script scripts/aseprite/beach-character.lua

  칸 72×104 에 SD 캐릭터 하나: 손으로 정한 계단형 실루엣, 덩어리진 머릿결, 큰 눈과 작은 몸.
  방향 4개(앞·뒤·왼·오른쪽은 왼쪽을 좌우 반전) × 프레임 10개(서있기 4: 숨쉬기·깜빡임, 걷기 6) × 색 변형 8줄.
  모든 픽셀은 불투명 아니면 투명(안티앨리어싱 없음), 칸 가장자리 1px 는 비워 둔다 (아틀라스 번짐 방지).
  결과: chars.png(시트) · chars.json(배치) · beach-character.aseprite(변형 0, 태그 붙은 편집용 원본)
]]
local params = app.params
assert(params.config, "--script-param config=<json 경로> 가 필요해요")

local function readFile(path)
  local f = assert(io.open(path, "rb"), "설정 파일을 열 수 없어요: " .. path)
  local s = f:read("a")
  f:close()
  return s
end
local cfg = json.decode(readFile(params.config))
local CW, CH = cfg.cell.width, cfg.cell.height
local IDLE, WALK = cfg.anims.idle, cfg.anims.walk
local COLS = IDLE + WALK

-- ---------------------------------------------------------------- 색
local pc = app.pixelColor
local floor, sqrt, abs, max, min = math.floor, math.sqrt, math.abs, math.max, math.min
local function round(v) return floor(v + 0.5) end
local function hex(h)
  local n = tonumber(h:sub(2), 16)
  return { r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255 }
end
local function mix(a, b, k)
  return { r = round(a.r + (b.r - a.r) * k), g = round(a.g + (b.g - a.g) * k), b = round(a.b + (b.b - a.b) * k) }
end
local function px(c) return pc.rgba(c.r, c.g, c.b, 255) end
local WHITE, INK, SHADOW_TINT = hex("#fff8f0"), hex("#2a1d2c"), hex("#6d4b6e")
--- 한 재질의 5단계 톤: 하이라이트·기본·그늘·어두움·윤곽선
local function tones(h, shadeTint)
  local base = hex(h)
  return {
    light = mix(base, WHITE, 0.34), base = base,
    shade = mix(base, shadeTint or SHADOW_TINT, 0.3), dark = mix(base, INK, 0.5), ink = mix(base, INK, 0.74),
  }
end

-- ---------------------------------------------------------------- 래스터
local Raster = {}
Raster.__index = Raster
function Raster.new(w, h) return setmetatable({ w = w, h = h, img = Image(w, h, ColorMode.RGB) }, Raster) end
function Raster:set(x, y, c)
  if not c then return end
  x, y = round(x), round(y)
  if x < 0 or y < 0 or x >= self.w or y >= self.h then return end
  self.img:drawPixel(x, y, px(c))
end
function Raster:rect(x, y, w, h, c)
  for j = 0, h - 1 do for i = 0, w - 1 do self:set(x + i, y + j, c) end end
end
--- 타원. shader(nx, ny, r) 가 색을 돌려준다 (nil 이면 비움). nx, ny 는 -1~1, r 은 중심에서 거리
function Raster:ellipse(cx, cy, rx, ry, shader)
  for y = floor(cy - ry) - 1, floor(cy + ry) + 1 do
    for x = floor(cx - rx) - 1, floor(cx + rx) + 1 do
      local nx, ny = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
      local r = sqrt(nx * nx + ny * ny)
      if r <= 1 then self:set(x, y, shader(nx, ny, r, x, y)) end
    end
  end
end
function Raster:line(x0, y0, x1, y1, c)
  local n = max(abs(x1 - x0), abs(y1 - y0), 1)
  for i = 0, n do self:set(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c) end
end
-- 손으로 배치한 픽셀 클러스터. 둥근 사각형을 겹치는 대신 외곽선과 면을 각각 설계한다.
function Raster:poly(points, fill, outline, dx, dy)
  dx, dy = dx or 0, dy or 0
  local lo, hi = self.h, 0
  for _, v in ipairs(points) do lo = min(lo, v[2]); hi = max(hi, v[2]) end
  for y = lo, hi do
    local cuts = {}
    for i, a in ipairs(points) do
      local b = points[i % #points + 1]
      if (a[2] <= y and b[2] > y) or (b[2] <= y and a[2] > y) then
        cuts[#cuts + 1] = a[1] + (y - a[2]) * (b[1] - a[1]) / (b[2] - a[2])
      end
    end
    table.sort(cuts)
    for i = 1, #cuts - 1, 2 do
      for x = math.ceil(cuts[i]), floor(cuts[i + 1]) do self:set(x + dx, y + dy, fill) end
    end
  end
  if outline then
    for i, a in ipairs(points) do
      local b = points[i % #points + 1]
      self:line(a[1] + dx, a[2] + dy, b[1] + dx, b[2] + dy, outline)
    end
  end
end
--- 다른 래스터를 찍는다 (mirror 면 좌우 반전)
function Raster:blit(src, dx, dy, mirror)
  for y = 0, src.h - 1 do for x = 0, src.w - 1 do
    local p = src.img:getPixel(x, y)
    if pc.rgbaA(p) > 0 then
      local tx = mirror and (src.w - 1 - x) or x
      local X, Y = dx + tx, dy + y
      if X >= 0 and Y >= 0 and X < self.w and Y < self.h then self.img:drawPixel(X, Y, p) end
    end
  end end
end

-- ---------------------------------------------------------------- 캐릭터
--- 변형 하나의 톤 묶음
local function palette(v)
  local p = {
    skin = tones(v.skin, hex("#b86b63")), hair = tones(v.hair), shirt = tones(v.shirt), pants = tones(v.pants),
    accent = tones(v.accent), shoe = tones("#fbf6ee", hex("#9e8f95")), eye = tones(v.eyes), style = v.style % 3,
  }
  p.skin.ink = mix(hex(v.skin), INK, 0.6)
  p.blush = mix(hex(v.skin), hex("#e8788f"), 0.5)
  p.mouth = mix(hex(v.skin), hex("#8a3a4a"), 0.75)
  p.eyeWhite = hex("#fdfbff")
  return p
end

local artwork = dofile(assert(params.art, "--script-param art=<renderer.lua> is required"))
local drawFront, drawSide = artwork.front, artwork.side
--- 걷기 6프레임: 디딤 → 들어 올림(가장 높이, 몸이 살짝 뜬다) → 내려놓음, 반대쪽 반복. 프레임마다 모두 다르게
local WALK_FRONT = { -- legA/legB 는 들어 올린 픽셀(0 이하), armA/armB 는 팔 흔들림(세로), sway 는 머리 결
  { legA = -1, legB = 0, bob = 0, armA = -1, armB = 1, sway = 0 },
  { legA = -3, legB = 0, bob = -1, armA = -2, armB = 2, sway = 1 },
  { legA = -2, legB = 0, bob = 0, armA = -1, armB = 1, sway = 1 },
  { legA = 0, legB = -1, bob = 0, armA = 1, armB = -1, sway = 0 },
  { legA = 0, legB = -3, bob = -1, armA = 2, armB = -2, sway = -1 },
  { legA = 0, legB = -2, bob = 0, armA = 1, armB = -1, sway = -1 },
}
local WALK_SIDE = { -- legA/legB 는 앞뒤 보폭(픽셀), armA/armB 는 팔 앞뒤
  { legA = 2, legB = -2, bob = 0, armA = -2, armB = 2, sway = 0 },
  { legA = 4, legB = -4, bob = -1, armA = -3, armB = 3, sway = 1 },
  { legA = 2, legB = -2, bob = 0, armA = -2, armB = 2, sway = 1 },
  { legA = -2, legB = 2, bob = 0, armA = 2, armB = -2, sway = 0 },
  { legA = -4, legB = 4, bob = -1, armA = 3, armB = -3, sway = -1 },
  { legA = -2, legB = 2, bob = 0, armA = 2, armB = -2, sway = -1 },
}
--- 프레임 포즈: 서있기(숨쉬기·깜빡임) 와 걷기
local function poseFor(anim, f, side)
  if anim == "idle" then
    -- 숨쉬기: 머리가 내려앉고(1·2), 어깨가 한 박자 늦게 따라온다(2·3). 뒷모습·단발처럼 머리 결이 안 흔들리는 조합도 매 프레임 달라진다
    local breathe = (f == 1 or f == 2) and 1 or 0
    local shoulder = ({ 0, 0, 1, 1 })[f + 1] or 0
    return { bob = breathe, legA = 0, legB = 0, armA = shoulder, armB = shoulder, sway = ({ 0, 1, 0, -1 })[f + 1] or 0, blink = (f == IDLE - 1) }
  end
  local table_ = side and WALK_SIDE or WALK_FRONT
  local pose = table_[(f % #table_) + 1]
  return { bob = pose.bob, legA = pose.legA, legB = pose.legB, armA = pose.armA, armB = pose.armB, sway = pose.sway, blink = false }
end

--- 칸 하나를 그린다 (왼쪽 옆모습을 반전해 오른쪽을 만든다)
local function drawCell(p, view, anim, f)
  local r = Raster.new(CW, CH)
  if view == "front" then drawFront(r, p, poseFor(anim, f, false), false)
  elseif view == "back" then drawFront(r, p, poseFor(anim, f, false), true)
  elseif view == "left" then drawSide(r, p, poseFor(anim, f, true))
  else
    local left = Raster.new(CW, CH)
    drawSide(left, p, poseFor(anim, f, true))
    r:blit(left, 0, 0, true)
  end
  -- 가장자리 1px 는 비운다 (아틀라스 번짐 방지)
  for x = 0, CW - 1 do r:set(x, 0, nil) end
  local clear = pc.rgba(0, 0, 0, 0)
  for x = 0, CW - 1 do r.img:drawPixel(x, 0, clear); r.img:drawPixel(x, CH - 1, clear) end
  for y = 0, CH - 1 do r.img:drawPixel(0, y, clear); r.img:drawPixel(CW - 1, y, clear) end
  return r
end

-- ---------------------------------------------------------------- 시트 조립
local views = cfg.views
local sheet = Image(CW * COLS * #views, CH * #cfg.variants, ColorMode.RGB)
local cells = {} -- 변형 0 의 칸들 (편집용 .aseprite)
for row, variant in ipairs(cfg.variants) do
  local p = palette(variant)
  for vi, view in ipairs(views) do
    for col = 0, COLS - 1 do
      local anim, f = "idle", col
      if col >= IDLE then anim, f = "walk", col - IDLE end
      local cell = drawCell(p, view, anim, f)
      sheet:drawImage(cell.img, Point(((vi - 1) * COLS + col) * CW, (row - 1) * CH))
      if row == 1 then cells[#cells + 1] = { img = cell.img, view = view, anim = anim } end
    end
  end
end
sheet:saveAs(params.out)

if params.json then
  local f = assert(io.open(params.json, "wb"))
  local viewsOut = {}
  for vi, view in ipairs(views) do viewsOut[view] = (vi - 1) * COLS end
  f:write(json.encode({
    cell = { width = CW, height = CH }, columns = COLS, rows = #cfg.variants, width = sheet.width, height = sheet.height,
    views = viewsOut, anims = { idle = { from = 0, length = IDLE }, walk = { from = IDLE, length = WALK } },
    generator = "scripts/aseprite/beach-character.lua",
  }))
  f:close()
end

if params.ase then
  local sprite = Sprite(CW, CH, ColorMode.RGB)
  sprite.filename = params.ase
  local layer = sprite.layers[1]
  layer.name = "character"
  for i, cell in ipairs(cells) do
    if i > 1 then sprite:newEmptyFrame() end
    local frame = sprite.frames[i]
    frame.duration = cell.anim == "idle" and 0.18 or 0.1
    sprite:newCel(layer, frame, cell.img, Point(0, 0))
  end
  for vi, view in ipairs(views) do
    local base = (vi - 1) * COLS
    local idle = sprite:newTag(base + 1, base + IDLE); idle.name = view .. "-idle"
    local walk = sprite:newTag(base + IDLE + 1, base + COLS); walk.name = view .. "-walk"
  end
  sprite:saveAs(params.ase)
  sprite:close()
end
print(string.format("chars.png %dx%d (%d views x %d frames x %d variants)", sheet.width, sheet.height, #views, COLS, #cfg.variants))
