-- Preview current native character rows at integer zoom (works with the 2-row atlas).
local p=app.params
local sheet=Image{fromFile=assert(p.sheet)}
local cw,ch,zoom=72,104,3
local rows=sheet.height//ch
local columns=p.views and 4 or rows
local image=Image(cw*columns*zoom,ch*(p.views and rows or 1)*zoom,ColorMode.RGB)
for row=0,rows-1 do
 for vi=0,(p.views and 3 or 0) do
  local tx,ty=p.views and vi or row,p.views and row or 0
  for y=0,ch-1 do for x=0,cw-1 do local color=sheet:getPixel(vi*10*cw+x,row*ch+y)
   for yy=0,zoom-1 do for xx=0,zoom-1 do image:drawPixel((tx*cw+x)*zoom+xx,(ty*ch+y)*zoom+yy,color) end end
  end end
 end
end
image:saveAs(assert(p.out))
