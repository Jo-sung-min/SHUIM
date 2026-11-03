-- Approved pixel artwork -> native direction sheets and restrained integer-pixel animation.
-- Front idle 0 is copied exactly. Clothing authoring lives in base-characters/*/front.aseprite.
local p=app.params
local root=assert(p.root)
local f=assert(io.open(assert(p.config),'rb'));local cfg=json.decode(f:read('a'));f:close()
local pc=app.pixelColor
local W,H=cfg.cell.width,cfg.cell.height
local N=cfg.anims.idle+cfg.anims.walk
local sourceRoot=root..'/scripts/aseprite/base-characters'
local function blank(w,h) return Image(w or W,h or H,ColorMode.RGB) end
local function opaque(c) return pc.rgba(pc.rgbaR(c),pc.rgbaG(c),pc.rgbaB(c),255) end
local function fringe(c)
 local r,g,b=pc.rgbaR(c),pc.rgbaG(c),pc.rgbaB(c)
 return (r>175 and g<100 and b<100 and r>g*1.9) or (r>160 and g>150 and b<105 and math.min(r,g)>b*1.6)
end
local function copy(img) local o=blank();o:drawImage(img,Point(0,0));return o end
local function mirror(img)
 local out=blank();for y=0,H-1 do for x=0,W-1 do out:drawPixel(W-1-x,y,img:getPixel(x,y)) end end;return out
end
local function enlarged(src,n)
 local out=blank(src.width*n,src.height*n)
 for y=0,src.height-1 do for x=0,src.width-1 do local c=src:getPixel(x,y)
  for yy=0,n-1 do for xx=0,n-1 do out:drawPixel(x*n+xx,y*n+yy,c) end end
 end end;return out
end
local function normalize(sheet,half)
 local lo,hi=math.floor(sheet.width*half/2),math.floor(sheet.width*(half+1)/2)-1
 local x0,y0,x1,y1=hi,sheet.height,lo,0
 for y=0,sheet.height-1 do for x=lo,hi do local c=sheet:getPixel(x,y)
  if pc.rgbaA(c)>=128 and not fringe(c) then x0=math.min(x0,x);x1=math.max(x1,x);y0=math.min(y0,y);y1=math.max(y1,y) end
 end end
 assert(x1>x0 and y1>y0,'Missing turn artwork alpha')
 local sw,sh=x1-x0+1,y1-y0+1;local nh=96;local nw=math.floor(sw*nh/sh+0.5)
 assert(nw<W-4,'Turn artwork does not fit native cell')
 local out=blank();local dx,dy=math.floor((W-nw)/2),102-nh
 for y=0,nh-1 do for x=0,nw-1 do
  local c=sheet:getPixel(x0+math.min(sw-1,math.floor((x+0.5)*sw/nw)),y0+math.min(sh-1,math.floor((y+0.5)*sh/nh)))
  if pc.rgbaA(c)>=128 and not fringe(c) then out:drawPixel(dx+x,dy+y,opaque(c)) end
 end end
 -- Anchor shoes rather than the asymmetric profile's hair bounding box.
 local footMin,footMax=W,0
 for y=94,101 do for x=0,W-1 do if pc.rgbaA(out:getPixel(x,y))>0 then footMin=math.min(footMin,x);footMax=math.max(footMax,x) end end end
 local offset=math.floor(35.5-(footMin+footMax)/2+0.5)
 if offset~=0 then local shifted=blank();shifted:drawImage(out,Point(offset,0));out=shifted end
 return out
end
local function split(source,view,v)
 local parts={body=blank(),armA=blank(),armB=blank(),legA=blank(),legB=blank(),joints=blank()}
 local side=view=='left'
 for y=0,H-1 do for x=0,W-1 do
  local c=source:getPixel(x,y)
  if pc.rgbaA(c)>0 then
   local id='body'
   if y>=v.legStart then id=x<36 and 'legA' or 'legB'
   elseif y>=v.armStart and y<v.legStart then
    -- The side forearm overlaps the garment. Keep it with the torso until
    -- a fully painted side clothing/body layer is available; do not tear its occlusion.
    if not side then
     if x<27 then id='armA' elseif x>44 then id='armB' end
    end
   end
   parts[id]:drawPixel(x,y,c)
   if (id=='armA' or id=='armB') and y<v.armStart+3 then parts.joints:drawPixel(x,y,c) end
   if id=='body' and y>=v.legStart-2 then parts.joints:drawPixel(x,y,c) end
  end
 end end
 if side then
  -- The neutral profile occludes its far leg. Uncover a source-pixel duplicate during a step.
  local leg=blank();leg:drawImage(parts.legA,Point(0,0));leg:drawImage(parts.legB,Point(0,0))
  parts.legA=leg;parts.legB=copy(leg)
  -- A small depth shade distinguishes the uncovered far leg during a step.
  -- At rest the unmodified near leg covers it completely.
  for y=0,H-1 do for x=0,W-1 do local c=parts.legB:getPixel(x,y)
   if pc.rgbaA(c)>0 then parts.legB:drawPixel(x,y,pc.rgba(math.floor(pc.rgbaR(c)*0.94),math.floor(pc.rgbaG(c)*0.94),math.floor(pc.rgbaB(c)*0.94),255)) end
  end end
 end
 return parts
end
local function blink(source,v)
 local out=copy(source)
 -- Close only the authored eye areas, preserving nearby hair, nose, cheeks and mouth.
 for _,range in ipairs({v.eyeLeft,v.eyeRight}) do
  for x=range[1],range[2] do
   local skin=source:getPixel(x,v.eyeY+5)
   if pc.rgbaA(skin)>0 then
    for y=v.eyeY,v.eyeY+3 do out:drawPixel(x,y,skin) end
    local eyelid=source:getPixel(x,v.eyeY)
    if pc.rgbaR(eyelid)<170 then out:drawPixel(x,v.eyeY+1,eyelid) end
   end
  end
 end
 return out
end
local function render(source,view,v,anim,index)
 if anim=='idle' and (index==0 or index==3 and view~='front') then return copy(source) end
 if anim=='idle' and index==3 then return blink(source,v) end
 local parts=split(source,view,v);local out=blank()
 local bodyY,armAX,armAY,armBX,armBY,legAX,legAY,legBX,legBY=0,0,0,0,0,0,0,0,0
 if anim=='idle' then
  bodyY=index==1 and -1 or 0
  armAY=-1;armBY=-1
 else
  local n=index+1;local side=view=='left'
  local stride={-1,0,1,1,0,-1};local liftA={0,-2,-1,0,0,0};local liftB={0,0,0,0,-2,-1}
  bodyY=({0,-1,0,0,-1,0})[n]
  legAX=stride[n]*(side and 2 or 1);legBX=-legAX;legAY=liftA[n];legBY=liftB[n]
  armAX=side and -stride[n] or 0;armBX=side and stride[n] or 0
  armAY=({1,0,-1,-1,0,1})[n]+bodyY;armBY=-(({1,0,-1,-1,0,1})[n])+bodyY
 end
 out:drawImage(parts.legB,Point(legBX,legBY));out:drawImage(parts.legA,Point(legAX,legAY))
 out:drawImage(parts.joints,Point(0,0))
 if view=='left' then
  out:drawImage(parts.body,Point(0,bodyY));out:drawImage(parts.armB,Point(armBX,armBY));out:drawImage(parts.armA,Point(armAX,armAY))
 else
  out:drawImage(parts.armB,Point(armBX,armBY));out:drawImage(parts.armA,Point(armAX,armAY));out:drawImage(parts.body,Point(0,bodyY))
 end
 return out
end
local function validate(img)
 for y=0,H-1 do for x=0,W-1 do
  local a=pc.rgbaA(img:getPixel(x,y));assert(a==0 or a==255,'Non-binary alpha')
  if x==0 or x==W-1 or y==0 or y==H-1 then assert(a==0,'Sprite touched atlas gutter') end
 end end
end
local sheet=blank(W*N*#cfg.views,H*#cfg.variants)
local directions=blank(W*4,H*#cfg.variants)
local fronts=blank(W*2,H)
local metadata={cell=cfg.cell,columns=N,rows=#cfg.variants,width=sheet.width,height=sheet.height,views={},anims={idle={from=0,length=4},walk={from=4,length=6}},characters={},generator='scripts/aseprite/beach-character.lua',asset='chars-v2.png'}
for vi,view in ipairs(cfg.views) do metadata.views[view]=(vi-1)*N end
for row,v in ipairs(cfg.variants) do
 local dir=sourceRoot..'/'..v.id
 local front=Image{fromFile=dir..'/front.png'};assert(front.width==W and front.height==H,'Unexpected approved front dimensions')
 local turns=Image{fromFile=dir..'/turns-source.png'}
 local sources={front=front,left=normalize(turns,0),back=normalize(turns,1)};sources.right=mirror(sources.left)
 for _,view in ipairs({'left','back','right'}) do sources[view]:saveAs(dir..'/'..view..'.png') end
 local sprite=Sprite(W,H,ColorMode.RGB);local layer=sprite.layers[1];layer.name='animated-source-pixels'
 local cached={}
 for vi,view in ipairs(cfg.views) do
  directions:drawImage(sources[view],Point((vi-1)*W,(row-1)*H))
  cached[view]={}
  for col=0,N-1 do
   local anim=col<cfg.anims.idle and 'idle' or 'walk';local i=col<cfg.anims.idle and col or col-cfg.anims.idle
   local img=view=='right' and mirror(cached.left[col+1]) or render(sources[view],view,v,anim,i)
   cached[view][col+1]=img;validate(img)
   sheet:drawImage(img,Point(((vi-1)*N+col)*W,(row-1)*H))
   local frameIndex=(vi-1)*N+col+1;if frameIndex>1 then sprite:newEmptyFrame() end
   sprite.frames[frameIndex].duration=anim=='walk' and 0.12 or (col==3 and 0.1 or 0.3)
   sprite:newCel(layer,frameIndex,img,Point(0,0))
  end
 end
 -- Add tags after every frame exists: Aseprite extends a trailing tag when frames are appended.
 for vi,view in ipairs(cfg.views) do
  local base=(vi-1)*N
  sprite:newTag(base+1,base+cfg.anims.idle).name=view..'-idle'
  sprite:newTag(base+cfg.anims.idle+1,base+N).name=view..'-walk'
 end
 sprite:saveAs(dir..'/animated.aseprite');sprite:close()
 fronts:drawImage(front,Point((row-1)*W,0))
 metadata.characters[#metadata.characters+1]={id=v.id,label=v.label,row=row-1,source='scripts/aseprite/base-characters/'..v.id..'/front.aseprite'}
end
sheet:saveAs(root..'/public/beach/chars-v2.png')
local file=assert(io.open(root..'/public/beach/chars.json','wb'));file:write(json.encode(metadata));file:close()
enlarged(directions,3):saveAs(sourceRoot..'/directions-preview.png')
enlarged(fronts,4):saveAs(root..'/scripts/aseprite/beach-character-preview.png')
print(string.format('Approved character atlas: %dx%d; 2 characters, 4 directions, %d frames',sheet.width,sheet.height,N))
