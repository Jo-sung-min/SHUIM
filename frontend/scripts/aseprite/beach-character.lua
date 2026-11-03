--[[
  소로우 바닷가 도트 캐릭터 시트 생성 (Aseprite 배치 모드 Lua).
  실행: node scripts/gen-beach-character.mjs  →  aseprite -b --script-param config=… --script scripts/aseprite/beach-character.lua

  칸 72×104 에 2.5등신 치비 하나: 머리가 키의 절반, 머리카락 결·눈 하이라이트·옷 주름까지 픽셀 단위로 그린다.
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
local floor, sqrt, sin, cos, abs, max, min = math.floor, math.sqrt, math.sin, math.cos, math.abs, math.max, math.min
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
function Raster:has(x, y)
  if x < 0 or y < 0 or x >= self.w or y >= self.h then return false end
  return pc.rgbaA(self.img:getPixel(x, y)) > 0
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
local function rrInside(i, j, w, h, rad)
  if i < 0 or j < 0 or i >= w or j >= h then return false end
  local cx, cy
  if i < rad and j < rad then cx, cy = rad - 0.5, rad - 0.5
  elseif i >= w - rad and j < rad then cx, cy = w - rad - 0.5, rad - 0.5
  elseif i < rad and j >= h - rad then cx, cy = rad - 0.5, h - rad - 0.5
  elseif i >= w - rad and j >= h - rad then cx, cy = w - rad - 0.5, h - rad - 0.5 end
  if not cx then return true end
  local dx, dy = i - cx, j - cy
  return dx * dx + dy * dy <= (rad - 0.35) * (rad - 0.35)
end
--- 둥근 사각형. shader(u, v, edge) u,v 는 0~1, edge 는 윤곽 픽셀이면 true
function Raster:roundRect(x, y, w, h, rad, shader)
  for j = 0, h - 1 do for i = 0, w - 1 do
    if rrInside(i, j, w, h, rad) then
      local edge = not (rrInside(i - 1, j, w, h, rad) and rrInside(i + 1, j, w, h, rad) and rrInside(i, j - 1, w, h, rad) and rrInside(i, j + 1, w, h, rad))
      self:set(x + i, y + j, shader(i / max(w - 1, 1), j / max(h - 1, 1), edge, i, j))
    end
  end end
end
--- 아래로 갈수록 dx 만큼 기울어지는 사각형 (팔·다리 흔들기)
function Raster:shearRect(x, y, w, h, dx, shader)
  for j = 0, h - 1 do
    local off = round(dx * j / max(h - 1, 1))
    for i = 0, w - 1 do
      local edge = i == 0 or i == w - 1 or j == 0 or j == h - 1
      self:set(x + i + off, y + j, shader(i / max(w - 1, 1), j / max(h - 1, 1), edge, i, j))
    end
  end
end
function Raster:line(x0, y0, x1, y1, c)
  local n = max(abs(x1 - x0), abs(y1 - y0), 1)
  for i = 0, n do self:set(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c) end
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

-- ---------------------------------------------------------------- 셰이더
--- 구(머리) 음영: 왼쪽 위에서 빛. 가장자리는 윤곽선
local function sphere(t, rpx, opts)
  opts = opts or {}
  local edge, lx, ly = opts.edge or 1.3, opts.lx or -0.42, opts.ly or -0.78
  return function(nx, ny, r)
    if opts.clip and opts.clip(nx, ny) then return nil end
    if r > 1 - edge / rpx then return t.ink end
    local l = nx * lx + ny * ly
    if l > 0.52 then return t.light elseif l > -0.16 then return t.base elseif l > -0.56 then return t.shade else return t.dark end
  end
end
--- 옷·팔다리: 세로 그라데이션 + 윤곽선. 오른쪽(그늘) 가장자리 쪽은 한 단계 어둡게
local function cloth(t, opts)
  opts = opts or {}
  return function(u, v, edge)
    if edge then return t.ink end
    if opts.flat then return t.base end
    if v < 0.18 and u < 0.6 then return t.light end
    if u > 0.78 or v > 0.86 then return t.shade end
    return t.base
  end
end

-- ---------------------------------------------------------------- 캐릭터
local CX = 36 -- 칸 가운데

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

--- 머리카락 하이라이트 호: 머리 위 왼쪽에 결 두 가닥
local function hairShine(r, cx, cy, rx, ry, p, a0, a1)
  for _, arc in ipairs({ { r = 0.78, a = a0, b = a1, c = p.hair.light }, { r = 0.62, a = a0 + 0.25, b = a1 - 0.2, c = p.hair.light } }) do
    local n = 26
    for i = 0, n do
      local a = arc.a + (arc.b - arc.a) * i / n
      r:set(cx + cos(a) * rx * arc.r, cy + sin(a) * ry * arc.r, arc.c)
    end
  end
end

--- 앞머리: 이마 위에 뾰족뾰족한 가닥. bottom(x) 가 가닥 끝 y
local function bangs(r, p, x0, x1, top, bottom)
  for x = x0, x1 do
    local b = bottom(x)
    for y = top, b do
      local c = p.hair.base
      if y == b then c = p.hair.ink elseif y >= b - 2 then c = p.hair.dark elseif y <= top + 2 then c = p.hair.light end
      if (x == x0 or x == x1) then c = p.hair.ink end
      r:set(x, y, c)
    end
  end
end

--- 신발 (앞·뒤): 흰 운동화, 악센트 색 밑창
local function shoeFront(r, p, x, y, w)
  r:roundRect(x, y, w, 7, 2, function(u, v, edge) if edge then return p.shoe.ink elseif v > 0.7 then return p.accent.shade elseif v < 0.3 and u < 0.7 then return p.shoe.light else return p.shoe.base end end)
  r:rect(x + 2, y + 2, w - 4, 1, p.shoe.shade) -- 신발끈 자리
end

--- 다리 한 쪽 (앞·뒤). lift 는 들어 올린 픽셀(0 이하)
local function legFront(r, p, x, lift, bob)
  local y = 84 + bob
  r:roundRect(x, y + lift, 7, 12, 1, cloth(p.pants))
  shoeFront(r, p, x - 2, 95 + lift, 11)
end

--- 눈 (앞모습). MapleStory 식: 두꺼운 속눈썹 라인, 큰 홍채에 세로 그라데이션, 흰 하이라이트
local function eyeFront(r, p, x, y, blink)
  if blink then
    r:line(x, y + 6, x + 2, y + 7, p.eye.ink); r:line(x + 2, y + 7, x + 6, y + 7, p.eye.ink); r:line(x + 6, y + 7, x + 7, y + 6, p.eye.ink)
    return
  end
  -- 흰자
  r:rect(x + 1, y + 2, 6, 7, p.eyeWhite)
  r:rect(x, y + 3, 8, 5, p.eyeWhite)
  -- 홍채
  for j = 0, 6 do
    local c = j < 2 and p.eye.dark or (j < 4 and p.eye.base or p.eye.light)
    local w = (j == 0 or j == 6) and 4 or 6
    r:rect(x + 4 - w // 2, y + 2 + j, w, 1, c)
  end
  r:rect(x + 2, y + 3, 4, 2, p.eye.ink) -- 동공 위쪽
  r:rect(x + 2, y + 3, 2, 2, WHITE) -- 큰 하이라이트
  r:set(x + 5, y + 7, WHITE) -- 작은 하이라이트
  -- 속눈썹 라인과 아래 테두리
  r:rect(x, y + 1, 8, 1, p.eye.ink); r:rect(x + 1, y, 6, 1, p.eye.ink)
  r:set(x - 1, y + 2, p.eye.ink); r:set(x + 8, y + 2, p.eye.ink)
  r:rect(x + 1, y + 9, 6, 1, p.eye.ink)
end

--- 뒷머리(긴 머리·포니테일)는 몸보다 먼저, 그 위 몸, 머리 순으로 쌓는다
local function drawFront(r, p, pose, back)
  local bob, sway = pose.bob, pose.sway
  local hairTop = 7 + bob
  -- 1. 뒤로 흘러내린 머리 (몸 뒤)
  if p.style == 0 then
    r:roundRect(16, 34 + bob, 41, 44, 9, function(u, v, edge) if edge then return p.hair.ink elseif u < 0.22 then return p.hair.dark elseif v > 0.8 then return p.hair.dark else return p.hair.shade end end)
    for _, sx in ipairs({ 22, 30, 42, 50 }) do r:line(sx + sway, 50 + bob, sx + sway * 2, 74 + bob, p.hair.dark) end
  elseif p.style == 2 then
    local tx = back and CX or CX + 14
    r:roundRect(tx - 5 + sway, 30 + bob, 11, 40, 5, function(u, v, edge) if edge then return p.hair.ink elseif u < 0.3 then return p.hair.light elseif v > 0.75 then return p.hair.dark else return p.hair.base end end)
    r:rect(tx - 4 + sway, 36 + bob, 9, 3, p.accent.base); r:rect(tx - 4 + sway, 38 + bob, 9, 1, p.accent.shade)
  end
  -- 2. 다리·신발
  legFront(r, p, 26, pose.legA, bob)
  legFront(r, p, 40, pose.legB, bob)
  -- 3. 바지
  r:roundRect(25, 77 + bob, 23, 11, 3, cloth(p.pants))
  r:rect(36, 79 + bob, 1, 8, p.pants.dark)
  r:rect(26, 78 + bob, 21, 1, p.pants.dark) -- 허리선
  -- 4. 몸통 (후드티)
  r:roundRect(24, 54 + bob, 25, 26, 4, cloth(p.shirt))
  if back then
    r:roundRect(28, 54 + bob, 17, 13, 5, function(u, v, edge) if edge then return p.accent.ink elseif v > 0.7 then return p.accent.shade elseif u < 0.4 and v < 0.4 then return p.accent.light else return p.accent.base end end) -- 늘어진 후드
    r:line(32, 60 + bob, 36, 64 + bob, p.accent.shade); r:line(40, 60 + bob, 37, 64 + bob, p.accent.shade)
  else
    r:roundRect(29, 54 + bob, 15, 6, 3, function(u, v, edge) if edge then return p.accent.ink elseif v > 0.6 then return p.accent.shade else return p.accent.base end end) -- 목둘레
    r:rect(34, 60 + bob, 5, 1, p.accent.shade)
    r:roundRect(28, 68 + bob, 17, 9, 2, function(u, v, edge) if edge then return p.shirt.dark elseif v < 0.3 then return p.shirt.light else return p.shirt.base end end) -- 앞주머니
    r:line(31, 56 + bob, 31, 66 + bob, p.shirt.shade); r:line(41, 56 + bob, 41, 66 + bob, p.shirt.shade) -- 끈
  end
  -- 5. 팔
  for _, arm in ipairs({ { x = 18, sw = pose.armA }, { x = 49, sw = pose.armB } }) do
    r:roundRect(arm.x, 57 + bob + arm.sw, 6, 17, 2, cloth(p.shirt))
    r:roundRect(arm.x, 72 + bob + arm.sw, 6, 7, 2, function(u, v, edge) if edge then return p.skin.ink elseif u < 0.5 and v < 0.5 then return p.skin.light else return p.skin.base end end)
  end
  -- 6. 목
  r:rect(32, 49 + bob, 8, 7, p.skin.shade)
  -- 7. 머리: 머리카락 구 → 얼굴 → 앞머리 → 옆머리
  r:ellipse(CX, 28.5 + bob, 23.5, 22.5, sphere(p.hair, 23))
  if not back then
    r:ellipse(CX, 34 + bob, 18.5, 16.5, sphere(p.skin, 17, { edge = 1.1, clip = function(nx, ny) return ny < -0.55 end, lx = -0.3, ly = -0.6 }))
    bangs(r, p, 15, 57, hairTop + 3, function(x)
      local t = (x - 15) / 42
      return 27 + bob + round(2.8 * abs(sin(t * 15.5 + 0.4))) - (x < 24 and 1 or 0)
    end)
    -- 옆머리 가닥 (뺨 옆): 왼쪽 가닥은 빛을 받아 밝고, 끝은 안쪽으로 살짝 모인다
    for _, side in ipairs({ { x = 14, dir = 1 }, { x = 52, dir = -1 } }) do
      local len = p.style == 1 and 26 or 32
      r:roundRect(side.x - sway * side.dir, 22 + bob, 7, len, 3, function(u, v, edge) if edge then return p.hair.ink elseif v > 0.8 then return p.hair.dark elseif (side.dir > 0 and u < 0.45 and v < 0.6) then return p.hair.light elseif side.dir > 0 then return p.hair.base else return p.hair.shade end end)
      r:line(side.x + 3 - sway * side.dir, 30 + bob, side.x + 3 - sway * side.dir, 30 + bob + len * 0.55, side.dir > 0 and p.hair.light or p.hair.dark)
    end
    -- 눈·코·입·볼
    eyeFront(r, p, 24, 34 + bob, pose.blink)
    eyeFront(r, p, 40, 34 + bob, pose.blink)
    r:rect(21, 44 + bob, 3, 2, p.blush); r:rect(49, 44 + bob, 3, 2, p.blush)
    r:set(36, 43 + bob, p.skin.shade)
    r:set(35, 46 + bob, p.mouth); r:rect(36, 47 + bob, 1, 1, p.mouth); r:set(37, 46 + bob, p.mouth)
  else
    -- 뒷모습: 머리 결과 가르마
    for _, sx in ipairs({ 26, 32, 40, 46 }) do r:line(sx, 12 + bob, sx + (sx < CX and -3 or 3), 42 + bob, p.hair.dark) end
    if p.style == 0 then
      -- 긴 머리는 어깨 안쪽으로 모여 내려간다 (아래로 갈수록 좁게): 어깨와 팔이 양옆으로 보인다
      local flow = function(u, v, edge) if edge then return p.hair.ink elseif v > 0.84 then return p.hair.dark elseif u < 0.25 and v < 0.5 then return p.hair.light elseif u > 0.75 then return p.hair.shade else return p.hair.base end end
      r:roundRect(24 + sway, 52 + bob, 25, 26, 7, flow)
      r:roundRect(20, 32 + bob, 33, 26, 8, flow)
      for _, sx in ipairs({ 27, 33, 40, 46 }) do r:line(sx, 40 + bob, sx + sway, 72 + bob, p.hair.dark) end
      r:line(30, 36 + bob, 29 + sway, 60 + bob, p.hair.light)
    elseif p.style == 1 then
      r:roundRect(16 + sway, 30 + bob, 41, 22, 8, function(u, v, edge) if edge then return p.hair.ink elseif v > 0.78 then return p.hair.dark elseif u < 0.25 then return p.hair.light else return p.hair.base end end)
    end
  end
  hairShine(r, CX, 28.5 + bob, 23.5, 22.5, p, math.rad(198), math.rad(262))
  if back and p.style == 2 then
    r:roundRect(31 + sway, 24 + bob, 11, 46, 5, function(u, v, edge) if edge then return p.hair.ink elseif u < 0.3 then return p.hair.light elseif v > 0.8 then return p.hair.dark else return p.hair.base end end)
    r:rect(32 + sway, 30 + bob, 9, 3, p.accent.base); r:rect(32 + sway, 32 + bob, 9, 1, p.accent.shade)
  end
end

--- 옆모습 (왼쪽을 본다). 오른쪽은 좌우 반전
local function drawSide(r, p, pose)
  local bob, sway = pose.bob, pose.sway
  local hx = 34 -- 머리 중심
  -- 1. 뒤로 흘러내린 머리 (머리 뒤·등)
  if p.style == 0 then
    r:roundRect(37 + sway, 26 + bob, 19, 50, 8, function(u, v, edge) if edge then return p.hair.ink elseif v > 0.84 then return p.hair.dark elseif u > 0.7 then return p.hair.shade else return p.hair.base end end)
    for _, sx in ipairs({ 42, 48 }) do r:line(sx, 44 + bob, sx + sway, 72 + bob, p.hair.dark) end
  elseif p.style == 2 then
    r:roundRect(46 + sway, 28 + bob, 11, 42, 5, function(u, v, edge) if edge then return p.hair.ink elseif u < 0.3 then return p.hair.light elseif v > 0.78 then return p.hair.dark else return p.hair.base end end)
    r:rect(47 + sway, 33 + bob, 9, 3, p.accent.base); r:rect(47 + sway, 35 + bob, 9, 1, p.accent.shade)
  end
  -- 2. 먼 다리·팔 (몸 뒤)
  r:shearRect(35, 84 + bob, 7, 12, pose.legB, cloth(p.pants, { flat = true }))
  r:roundRect(29 + pose.legB, 95, 12, 7, 3, function(u, v, edge) if edge then return p.shoe.ink elseif v > 0.7 then return p.accent.shade else return p.shoe.shade end end)
  r:shearRect(41, 57 + bob, 5, 16, pose.armB, cloth(p.shirt, { flat = true }))
  -- 3. 바지·몸통
  r:roundRect(28, 77 + bob, 17, 11, 3, cloth(p.pants))
  r:roundRect(27, 54 + bob, 19, 26, 4, cloth(p.shirt))
  r:roundRect(30, 54 + bob, 13, 6, 3, function(u, v, edge) if edge then return p.accent.ink elseif v > 0.6 then return p.accent.shade else return p.accent.base end end)
  r:roundRect(29, 68 + bob, 9, 9, 2, function(u, v, edge) if edge then return p.shirt.dark elseif v < 0.3 then return p.shirt.light else return p.shirt.base end end)
  -- 4. 가까운 다리·신발
  r:shearRect(30, 84 + bob, 7, 12, pose.legA, cloth(p.pants))
  r:roundRect(24 + pose.legA, 95, 13, 7, 3, function(u, v, edge) if edge then return p.shoe.ink elseif v > 0.7 then return p.accent.shade elseif u < 0.5 and v < 0.35 then return p.shoe.light else return p.shoe.base end end)
  r:rect(27 + pose.legA, 97, 6, 1, p.shoe.shade)
  -- 5. 가까운 팔
  r:shearRect(25, 57 + bob, 7, 16, pose.armA, cloth(p.shirt))
  r:roundRect(25 + pose.armA, 72 + bob, 7, 7, 2, function(u, v, edge) if edge then return p.skin.ink elseif u < 0.5 and v < 0.5 then return p.skin.light else return p.skin.base end end)
  -- 6. 목
  r:rect(30, 49 + bob, 7, 7, p.skin.shade)
  -- 7. 머리
  r:ellipse(hx, 29 + bob, 21.5, 22.5, sphere(p.hair, 22, { lx = -0.5, ly = -0.7 }))
  r:ellipse(27, 34 + bob, 13.5, 15.5, sphere(p.skin, 14, { edge = 1.1, lx = -0.4, ly = -0.55, clip = function(nx, ny) return nx > 0.55 or ny < -0.5 end }))
  bangs(r, p, 14, 35, 10 + bob, function(x)
    local t = (x - 14) / 21
    return 26 + bob + round(2.6 * abs(sin(t * 9.0 + 0.6))) + (x > 30 and 2 or 0)
  end)
  -- 귀 앞 구레나룻 (짧게)
  r:roundRect(32 - sway, 26 + bob, 4, 11, 2, function(u, v, edge) if edge then return p.hair.ink elseif v > 0.7 then return p.hair.dark else return p.hair.shade end end)
  hairShine(r, hx, 29 + bob, 21.5, 22.5, p, math.rad(205), math.rad(258))
  -- 눈 (옆: 조금 좁다)
  if pose.blink then
    r:line(20, 41 + bob, 25, 41 + bob, p.eye.ink)
  else
    r:rect(20, 35 + bob, 6, 8, p.eyeWhite)
    for j = 0, 5 do r:rect(21, 36 + bob + j, 4, 1, j < 2 and p.eye.dark or (j < 4 and p.eye.base or p.eye.light)) end
    r:rect(21, 36 + bob, 2, 2, WHITE)
    r:rect(19, 34 + bob, 7, 1, p.eye.ink); r:set(18, 35 + bob, p.eye.ink)
    r:rect(20, 43 + bob, 6, 1, p.eye.ink)
  end
  -- 코·입·볼
  r:set(13, 40 + bob, p.skin.ink); r:set(14, 39 + bob, p.skin.light)
  r:set(17, 46 + bob, p.mouth); r:set(18, 47 + bob, p.mouth)
  r:rect(17, 43 + bob, 3, 2, p.blush)
end

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
