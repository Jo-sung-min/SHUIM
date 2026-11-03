-- Review the exported atlas at integer zoom in Aseprite, without filtering pixels.
local p = app.params
local sheet = Image{ fromFile = assert(p.sheet) }
local cw, ch, zoom = 72, 104, 3
local image = Image(cw * 4 * zoom, ch * 2 * zoom, ColorMode.RGB)
local function cell(src, col, row, x, y)
  for cy = 0, ch-1 do for cx = 0, cw-1 do
    local color = src:getPixel(col*cw+cx,row*ch+cy)
    for yy = 0, zoom-1 do for xx = 0, zoom-1 do
      image:drawPixel(x+cx*zoom+xx,y+cy*zoom+yy,color)
    end end
  end end
end
for i = 0, 7 do
  local col = p.views and (i%4)*10 or 0
  local row = p.views and i//4 or i
  cell(sheet,col,row,(i%4)*cw*zoom,(i//4)*ch*zoom)
end
image:saveAs(assert(p.out))
