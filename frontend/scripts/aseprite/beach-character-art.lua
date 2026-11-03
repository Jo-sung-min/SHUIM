-- SD pixel artwork for Aseprite. All contours are native pixels, never antialiased.
-- The pose/atlas contract lives in beach-character.lua; this file owns the drawing.
local function oval(r, x, y, w, h, color, edge)
  r:ellipse(x, y, w, h, function(nx, ny, d)
    return edge and d > 0.86 and edge or color
  end)
end

local function hand(r, p, x, y)
  r:poly({{1,0},{5,0},{6,2},{6,5},{4,7},{1,6},{0,4}}, p.skin.base, p.skin.ink, x, y)
  r:rect(x+1,y+1,3,3,p.skin.light)
  r:set(x+5,y+4,p.skin.shade)
end

local function shoe(r, p, x, y, side)
  r:poly({{2,0},{8,0},{10,3},{11,5},{10,7},{0,7},{0,4}}, p.shoe.base, p.shoe.ink, x, y)
  r:rect(x+1,y+6,9,1,p.accent.shade)
  r:rect(x+2,y+2,5,1,p.shoe.light)
  r:rect(x+3,y+3,4,1,p.shoe.shade)
  r:set(x+8,y+4,p.shoe.shade)
end

local function eye(r, p, x, y, blink, side)
  local w = side and 7 or 9
  if blink then
    r:line(x,y+6,x+2,y+7,p.eye.ink)
    r:line(x+2,y+7,x+w-1,y+7,p.eye.ink)
    r:set(x-1,y+5,p.eye.ink)
    return
  end
  -- A large, vertically readable iris; the small sclera stays at the outer corner.
  r:poly({{1,2},{w-2,2},{w-1,4},{w-1,8},{w-3,10},{2,10},{0,8},{0,4}}, p.eye.base, nil, x,y)
  r:rect(x+1,y+3,1,5,p.eyeWhite)
  r:rect(x+2,y+2,w-3,4,p.eye.dark)
  r:rect(x+3,y+3,w-4,3,p.eye.ink)
  r:rect(x+2,y+8,w-4,2,p.eye.light)
  r:rect(x+2,y+3,2,2,p.eyeWhite)
  r:set(x+w-3,y+8,p.eyeWhite)
  r:line(x,y+2,x+2,y+1,p.eye.ink)
  r:line(x+2,y+1,x+w-2,y+1,p.eye.ink)
  r:set(x-1,y+1,p.eye.ink)
  r:line(x+2,y+11,x+w-3,y+11,p.skin.shade)
end

local crown = {{12,27},{13,20},{17,14},{23,11},{27,11},{32,7},{34,10},{42,8},{48,12},{52,12},{57,19},{59,27},{57,43},{53,51},{19,51},{14,43}}

local function rearHair(r,p,b,s,back)
  if p.style == 0 then
    r:poly({{18,33},{52,33},{56,51},{55,63},{58,72},{50,70},{46,75},{41,70},{33,74},{26,70},{18,72},{21,63},{16,51}},p.hair.shade,p.hair.ink,s,b)
    r:poly({{21,44},{27,40},{25,65},{22,69},{23,57}},p.hair.base,nil,s,b)
    r:poly({{44,40},{50,44},{51,67},{48,70},{46,61}},p.hair.dark,nil,s,b)
  elseif p.style == 2 then
    local x = back and 31 or 48
    r:poly({{2,0},{9,1},{13,10},{11,21},{14,33},{10,39},{5,37},{1,32},{3,21},{0,11}},p.hair.base,p.hair.ink,x+s,31+b)
    r:poly({{4,4},{7,5},{7,20},{9,30},{7,34},{5,27}},p.hair.light,nil,x+s,31+b)
    r:rect(x+1+s,34+b,10,3,p.accent.base)
    r:rect(x+2+s,37+b,8,1,p.accent.dark)
  end
end

local function frontBody(r,p,pose,back)
  local b = pose.bob
  for i,x in ipairs({27,40}) do
    local lift = i == 1 and pose.legA or pose.legB
    -- Bare knee, little sock and rounded sneaker, rather than straight trouser sticks.
    r:poly({{0,0},{6,0},{6,12},{5,15},{1,15},{0,12}},p.skin.base,p.skin.ink,x,83+lift)
    r:rect(x+1,86+lift,3,6,p.skin.light)
    r:rect(x+1,92+lift,5,3,p.shoe.base)
    shoe(r,p,x-2,94+lift,false)
  end
  r:poly({{25,76},{47,76},{48,86},{39,88},{36,83},{33,88},{25,87},{24,83}},p.pants.base,p.pants.ink,0,b)
  r:rect(27,82+b,5,2,p.pants.light)
  r:rect(40,83+b,5,2,p.pants.shade)
  -- Soft shoulder slope and shaped cuffs. Arms counter-swing with the legs.
  for i,x in ipairs({18,44}) do
    local swing = i == 1 and pose.armA or pose.armB
    local sleeve = i == 1 and {{5,0},{10,3},{9,12},{7,19},{1,18},{0,13},{2,4}}
      or {{5,0},{0,3},{1,12},{3,19},{9,18},{10,13},{8,4}}
    r:poly(sleeve,p.shirt.base,p.shirt.ink,x,57+b+swing)
    r:poly({{3,4},{6,2},{5,11},{2,15}},p.shirt.light,nil,x,57+b+swing)
    r:rect(x+2,73+b+swing,6,2,p.accent.base)
    hand(r,p,x+2,75+b+swing)
  end
  r:poly({{29,55},{43,55},{49,60},{47,70},{49,79},{43,82},{35,81},{28,82},{24,79},{26,68},{24,60}},p.shirt.base,p.shirt.ink,0,b)
  r:poly({{28,60},{33,58},{32,71},{28,77},{26,74}},p.shirt.light,nil,0,b)
  r:poly({{44,60},{47,62},{45,71},{47,78},{41,79},{43,70}},p.shirt.shade,nil,0,b)
  r:line(27,79+b,44,79+b,p.shirt.dark)
  if back then
    r:poly({{28,55},{44,55},{44,61},{41,66},{35,68},{29,64},{27,60}},p.accent.base,p.accent.ink,0,b)
    r:poly({{30,58},{42,58},{40,63},{36,65},{32,63}},p.accent.light,nil,0,b)
    r:line(30,73+b,33,75+b,p.shirt.shade)
  else
    r:rect(33,52+b,7,7,p.skin.shade)
    r:poly({{29,55},{35,58},{42,55},{44,58},{40,63},{34,61},{30,63},{27,58}},p.accent.base,p.accent.ink,0,b)
    r:line(35,61+b,36,77+b,p.shirt.dark)
    r:line(37,62+b,38,77+b,p.shirt.light)
    r:line(30,69+b,28,73+b,p.shirt.shade)
    r:line(40,73+b,44,70+b,p.shirt.dark)
    r:set(36,66+b,p.accent.light)
  end
end

local function hairFront(r,p,b,s)
  -- Broad curved locks taper to asymmetric points; highlights follow these locks.
  r:poly({{15,21},{22,14},{34,12},{40,15},{35,22},{29,28},{24,32},{24,27},{19,33},{18,28},{14,32}},p.hair.base,p.hair.ink,0,b)
  r:poly({{36,13},{46,13},{53,19},{56,28},{53,34},{49,30},{47,25},{44,30},{40,26},{37,29},{32,27},{36,21}},p.hair.base,p.hair.ink,0,b)
  r:poly({{19,19},{24,16},{32,15},{29,19},{22,23},{18,25}},p.hair.light,nil,0,b)
  r:poly({{38,16},{44,16},{49,20},{50,24},{44,21},{40,22}},p.hair.light,nil,0,b)
  r:poly({{23,24},{31,20},{27,27},{24,29}},p.hair.shade,nil,0,b)
  r:poly({{47,26},{53,28},{53,32},{49,29}},p.hair.dark,nil,0,b)
  r:line(26,17+b,22,21+b,p.hair.base)
  r:line(29,22+b,26,25+b,p.hair.dark)
  r:line(44,18+b,47,21+b,p.hair.base)
  r:set(20,23+b,p.hair.light)
  local tip = p.style == 1 and 49 or 58
  r:poly({{14,26},{19,24},{21,34},{20,43},{23,tip},{18,tip-3},{16,tip},{13,44}},p.hair.base,p.hair.ink,-s,b)
  r:poly({{15,31},{18,29},{18,42},{20,tip-5},{17,tip-7}},p.hair.light,nil,-s,b)
  r:poly({{53,25},{57,29},{58,43},{55,tip},{52,tip-4},{49,tip-1},{52,43},{51,34}},p.hair.shade,p.hair.ink,s,b)
  r:line(55+s,32+b,54+s,44+b,p.hair.base)
  if p.style == 1 then
    r:line(48,25+b,53,27+b,p.accent.ink)
    r:line(48,24+b,53,26+b,p.accent.light)
  end
end

local function front(r,p,pose,back)
  local b,s = pose.bob,pose.sway
  rearHair(r,p,b,s,back)
  frontBody(r,p,pose,back)
  r:poly(crown,p.hair.base,p.hair.ink,0,b)
  r:poly({{42,12},{52,17},{57,27},{55,43},{50,49},{45,47},{50,29}},p.hair.shade,nil,0,b)
  if back then
    r:poly({{19,20},{25,15},{34,13},{31,18},{24,21},{20,29},{17,29}},p.hair.light,nil,0,b)
    r:poly({{36,13},{40,13},{47,18},{50,24},{45,22},{41,19}},p.hair.light,nil,0,b)
    r:poly({{16,33},{22,39},{25,47},{32,49},{38,47},{44,50},{52,43},{55,34},{56,49},{50,54},{43,53},{36,55},{27,53},{20,55},{16,49}},p.hair.shade,p.hair.ink,s,b)
    r:poly({{22,33},{25,39},{29,46},{26,47},{23,43}},p.hair.base,nil,s,b)
    r:line(36,30+b,38+s,45+b,p.hair.dark)
    r:line(41,31+b,44+s,45+b,p.hair.base)
    if p.style == 2 then
      r:poly({{31,29},{39,29},{44,39},{42,52},{44,64},{41,70},{34,66},{31,56},{33,44},{29,35}},p.hair.base,p.hair.ink,s,b)
      r:poly({{33,36},{36,35},{38,45},{36,54},{39,63},{36,61},{34,51}},p.hair.light,nil,s,b)
      r:rect(30+s,32+b,11,3,p.accent.base)
    end
  else
    -- A smooth cheek-to-chin silhouette and a low-contrast skin outline.
    r:poly({{20,27},{25,23},{46,23},{52,28},{53,42},{50,49},{44,54},{37,56},{29,54},{22,49},{19,42}},p.skin.base,p.skin.ink,0,b)
    r:poly({{21,29},{27,26},{45,26},{47,30},{43,32},{25,34},{21,40}},p.skin.light,nil,0,b)
    r:poly({{49,33},{52,32},{51,44},{48,49},{42,53},{34,54},{29,52},{41,51},{47,47}},p.skin.shade,nil,0,b)
    eye(r,p,23,35+b,pose.blink,false)
    eye(r,p,41,35+b,pose.blink,false)
    r:rect(21,47+b,4,1,p.blush); r:rect(49,47+b,3,1,p.blush)
    r:set(36,47+b,p.skin.shade)
    r:line(35,51+b,37,51+b,p.mouth)
    r:set(38,50+b,p.skin.shade)
    hairFront(r,p,b,s)
  end
end

local function side(r,p,pose)
  local b,s = pose.bob,pose.sway
  if p.style ~= 1 then
    local x = p.style == 0 and 40 or 48
    r:poly({{1,0},{10,1},{14,10},{12,28},{14,39},{9,45},{5,42},{0,44},{2,27},{0,15}},p.hair.base,p.hair.ink,x+s,28+b)
    r:poly({{4,6},{7,4},{8,20},{6,29},{9,39},{6,37},{4,28}},p.hair.light,nil,x+s,28+b)
    if p.style == 2 then r:rect(x+s,34+b,11,3,p.accent.base) end
  end
  -- Far limbs first; an articulated knee connects the boot to the small torso.
  for i,x in ipairs({36,29}) do
    local stride = i == 1 and pose.legB or pose.legA
    local shade = i == 1 and p.skin.shade or p.skin.base
    r:poly({{0,0},{6,0},{6+stride,8},{5+stride,14},{stride,14},{stride-1,8}},shade,p.skin.ink,x,84)
    r:rect(x+stride,92,5,3,p.shoe.base)
    shoe(r,p,x+stride-4,94,true)
  end
  r:poly({{28,77},{43,77},{44,86},{38,89},{34,86},{28,87},{26,82}},p.pants.base,p.pants.ink,0,b)
  r:line(29,83+b,32,85+b,p.pants.light)
  r:poly({{30,54},{41,55},{46,61},{44,72},{46,79},{39,82},{28,80},{26,73},{26,61}},p.shirt.base,p.shirt.ink,0,b)
  r:poly({{39,59},{44,61},{42,72},{44,78},{39,79}},p.shirt.shade,nil,0,b)
  r:poly({{34,55},{41,54},{45,59},{43,65},{39,63}},p.accent.base,p.accent.ink,0,b)
  r:line(39,57+b,42,60+b,p.accent.light)
  local a = pose.armA
  r:poly({{1,0},{7,0},{10,5},{8+a,16},{2+a,17},{a,13},{1,6}},p.shirt.base,p.shirt.ink,26,59+b)
  r:poly({{3,2},{6,2},{6+a,9},{3+a,12}},p.shirt.light,nil,26,59+b)
  r:rect(28+a,74+b,6,2,p.accent.base)
  hand(r,p,27+a,76+b)
  r:rect(29,51+b,7,6,p.skin.shade)
  r:poly({{13,26},{16,17},{22,13},{31,10},{36,7},{39,10},{45,11},{52,17},{56,27},{55,43},{50,52},{40,54},{29,51},{17,42}},p.hair.base,p.hair.ink,0,b)
  r:poly({{44,16},{51,21},{54,29},{52,43},{47,49},{41,48},{46,33}},p.hair.shade,nil,0,b)
  r:poly({{17,27},{28,24},{37,29},{37,45},{32,53},{25,55},{19,52},{15,47},{15,44},{12,42},{14,39},{14,31}},p.skin.base,p.skin.ink,0,b)
  r:poly({{16,29},{23,27},{29,28},{27,33},{17,35}},p.skin.light,nil,0,b)
  r:poly({{32,34},{36,34},{36,45},{31,52},{25,54},{21,51},{29,50},{32,45}},p.skin.shade,nil,0,b)
  eye(r,p,19,35+b,pose.blink,true)
  r:set(14,41+b,p.skin.light)
  r:rect(17,47+b,3,1,p.blush)
  r:rect(18,51+b,2,1,p.mouth)
  r:poly({{16,22},{22,16},{32,13},{39,15},{34,24},{28,29},{25,27},{21,33},{20,28},{15,31},{13,29}},p.hair.base,p.hair.ink,0,b)
  r:poly({{18,21},{24,17},{31,16},{28,20},{22,24},{16,26}},p.hair.light,nil,0,b)
  r:poly({{34,24},{41,21},{43,32},{40,41},{39,48},{35,45},{33,39}},p.hair.shade,p.hair.ink,s,b)
  r:poly({{36,27},{39,25},{39,35},{36,39}},p.hair.base,nil,s,b)
  oval(r,36+s,43+b,3,4,p.skin.base,p.skin.ink)
  r:line(36+s,42+b,37+s,44+b,p.skin.shade)
  if p.style == 1 then
    r:line(39,27+b,44,26+b,p.accent.ink)
    r:line(39,26+b,44,25+b,p.accent.light)
  end
end

return { front = front, side = side }
