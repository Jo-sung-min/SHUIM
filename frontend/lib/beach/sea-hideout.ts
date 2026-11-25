import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { Daylight } from "./daylight";
import { HideoutWater } from "./sea-hideout-water";

type Point = [number, number, number];
type Size = [number, number, number];

function grainTexture(stone: boolean) {
  const w = 256, h = 128, pixels = new Uint8Array(w * h * 4);
  let seed = 713;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const speckle = seed / 4294967296;
    const bend = Math.sin(x * Math.PI / 128) + .35 * Math.sin(x * Math.PI / 32 + y * .07);
    const grain = stone ? Math.sin(y * .39 + bend * 2) * 9 + Math.sin(y * .8 + x * .10) * 5
      : Math.sin(y * .79 + bend * 2) * 15 + Math.sin(y * 2.65 + bend * 5) * 10;
    const shade = Math.round(211 + grain + (speckle - .5) * (stone ? 28 : 16));
    pixels.set([shade, shade, shade, 255], (y * w + x) * 4);
  }
  const texture = new THREE.DataTexture(pixels, w, h, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true;
  return texture;
}

export class SeaHideoutWorld {
  private readonly water: HideoutWater;
  private readonly skyLight = new THREE.HemisphereLight(0xd4e4e6, 0x57505a, 1.1);
  private readonly sun = new THREE.DirectionalLight(0xffe9cb, 1.2);
  private readonly hearth = new THREE.PointLight(0xffa453, 20, 8, 2);

  constructor(scene: THREE.Scene) {
    this.water = new HideoutWater(scene);
    scene.add(this.skyLight, this.sun, this.hearth);
    this.sun.position.set(-25, 40, -16);
    this.hearth.position.set(1.1, 1.15, -1.45);
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const surface = (map?: THREE.Texture) => new THREE.MeshStandardMaterial({ map: map ?? null, roughness: .94, vertexColors: true });
    const stone = surface(grainTexture(true)), wood = surface(grainTexture(false)), plain = surface();
    const ember = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    let seed = 1147;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const shade = new THREE.Color();
    function place(geometry: THREE.BufferGeometry, mat: THREE.Material, color: number, at: Point, size: Size, rotation: Point = [0, 0, 0]) {
      const g = geometry.index ? geometry.toNonIndexed() : geometry;
      g.scale(...size); g.rotateX(rotation[0]); g.rotateY(rotation[1]); g.rotateZ(rotation[2]); g.translate(...at);
      const pos = g.getAttribute("position"), colors = new Float32Array(pos.count * 3);
      shade.setHex(color);
      for (let i = 0; i < pos.count; i++) shade.toArray(colors, i * 3);
      g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const batch = batches.get(mat);
      if (batch) batch.push(g); else batches.set(mat, [g]);
      if (geometry !== g) geometry.dispose();
    }
    const box = (at: Point, size: Size, color: number, mat: THREE.Material = wood, rotation?: Point) =>
      place(new THREE.BoxGeometry(), mat, color, at, size, rotation);
    const soft = (at: Point, size: Size, color: number) =>
      place(new RoundedBoxGeometry(...size, 2, .09), plain, color, at, [1, 1, 1]);
    const cylinder = (at: Point, top: number, bottom: number, height: number, color: number, mat: THREE.Material = plain, n = 12) =>
      place(new THREE.CylinderGeometry(top, bottom, height, n), mat, color, at, [1, 1, 1]);
    function line(from: Point, to: Point, r: number, color: number, mat = wood) {
      const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), dir = b.clone().sub(a);
      const g = new THREE.CylinderGeometry(r, r, dir.length(), 7);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
      place(g, mat, color, a.lerp(b, .5).toArray(), [1, 1, 1]);
    }
    function rock(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number) {
      const g = new THREE.IcosahedronGeometry(1, 1), p = g.getAttribute("position");
      for (let i = 0; i < p.count; i++) {
        const a = p.getX(i), b = p.getY(i), c = p.getZ(i);
        const k = 1 + .115 * Math.sin(a * 9 + x + c * 4) * Math.cos(b * 7 - z);
        p.setXYZ(i, a * k + .13*b, b*k, c*k);
      }
      g.computeVertexNormals();
      place(g, stone, color, [x,y,z], [sx,sy,sz], [0, random()*.48-.24, 0]);
    }
    function lamp(x: number, y: number, z: number, scale = 1) {
      const s=scale;
      cylinder([x,y+.035*s,z], .19*s,.23*s,.08*s,0x3d3630);
      cylinder([x,y+.26*s,z], .13*s,.15*s,.39*s,0xffc276,ember);
      cylinder([x,y+.49*s,z], .13*s,.23*s,.13*s,0x514032);
      for (const a of [0,2.1,4.2]) {
        const dx=.156*s*Math.cos(a), dz=.156*s*Math.sin(a);
        line([x+dx,y+.08*s,z+dz],[x+dx,y+.46*s,z+dz],.014*s,0x43382d,plain);
      }
      place(new THREE.TorusGeometry(.09*s,.016*s,5,14), plain,0x4f4133,[x,y+.61*s,z],[1,1,1]);
    }

    // Windward strata, a broken sea arch and a distant beacon frame the small north window.
    const slate = [0x535f64,0x657072,0x454f58,0x798180,0x5e6a6c];
    for (const [x,z,w,h,d] of [[-19,-30,6,11,5],[-10,-31,4,9,4],[-32,-45,7,16,6],
      [13,-66,8,11,6],[31,-54,5,13,5],[48,-19,7,12,6],[42,26,9,18,9],
      [31,36,7,12,8],[-48,-18,13,22,11],[70,59,18,24,12],[-77,-76,21,26,15]]) {
      // Continuous fractured basalt face. The rings share edges from the surf to the grassy cap.
      const sides=11, layers=8, vertices: number[] = [], uvs: number[] = [];
      const radii=Array.from({length:sides},()=>.82+.29*random());
      const outline=(k: number, j: number): Point => {
        const t=j/layers, a=2*Math.PI*k/sides, variation=radii[k]*(1-.43*t+.07*Math.sin(j*1.65+k));
        return [x+Math.cos(a)*w*variation+1.1*t,
          -5+h*t+(j===0?0:.51*Math.sin(k*2.8+x+j*.16)),z+Math.sin(a)*d*variation+.55*t];
      };
      for(let j=0;j<layers;j++) for(let k=0;k<sides;k++) {
        const next=(k+1)%sides, a=outline(k,j), b=outline(next,j), c=outline(k,j+1), e=outline(next,j+1);
        vertices.push(...a,...c,...b,...b,...c,...e);
        uvs.push(k/sides,j*.28,k/sides,(j+1)*.28,(k+1)/sides,j*.28,
          (k+1)/sides,j*.28,k/sides,(j+1)*.28,(k+1)/sides,(j+1)*.28);
      }
      const face=new THREE.BufferGeometry();
      face.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
      face.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2)); face.computeVertexNormals();
      place(face,stone,0x929591,[0,0,0],[1,1,1]);
      rock(x+1.1,-5+h-.44,z+.55,w*.65,1.12,d*.67,0x7c876a);
      for (let i=0; i<3; i++) rock(x+w*(random()-.5)*2,-4.3,z+d*(random()-.5)*2,w*.55,1.3,d*.7,0x697675);
    }
    rock(-14.5,2.4,-31,6.1,2.1,3.5,0x818a85);
    cylinder([14,8.1,-66],.5,.81,4.8,0xd3c7a8);
    cylinder([14,9.0,-66],.57,.61,.9,0x8b4838);
    cylinder([14,10.75,-66],.58,.58,.65,0xffdd9d,ember);
    cylinder([14,11.24,-66],.1,.84,.34,0x44535a);
    // The sheer cliff continues under the floor, but never fills the window or the entry tunnel.
    for (let i=0; i<20; i++) {
      const x=-39+i*2.55;
      rock(x,-4.75,1.2,3.5,4.15,5.2,slate[i%5]);
      rock(x,3.5,11.8+Math.sin(i)*.55,4.5,7+random()*3,3.3,slate[(i+2)%5]);
      rock(x,5.3,2.4,4.0,1.85,5.8,slate[(i+1)%5]);
      if (x < -7.6) rock(x-.9,1.5,-.9,2.6,4.2,4.5,slate[i%5]);
    }
    // A tall spur hides the door until the walkway bends behind it.
    for (let i=0; i<4; i++) rock(9.3, -2+i*1.6, .5, 2.8-.2*i, 2.8, 4.8-.3*i,slate[i]);
    for (let i=0; i<12; i++) {
      const z=-20+i*2;
      rock(10.2,-3.6,z,2.7,3.2,3.1,slate[i%5]);
    }

    const planks = [0xb89570,0xc5a27b,0xa78165,0xb49274,0x9d795c];
    const timber=0x694e3e;
    // Raised, rope-lined catwalk; each board and timber is batched once.
    for (let i=0; i<45; i++) box([14,-.1,-9.8+i*.415],[3.8,.19,.4],planks[i%5]);
    for (let i=0; i<15; i++) box([6.45+i*.395,-.1,7.21],[.38,.19,2.82],planks[i%5]);
    box([7.63,-.12,5.76],[2.75,.24,3.0],0x92705b);
    for (let i=0; i<9; i++) box([4.08+i*.37,-.095,4.91],[.36,.19,2.65],planks[i%5]);
    function rail(points: Point[]) {
      for (const [x,y,z] of points) {
        line([x,y-.34,z],[x,y+1.15,z],.075,0x6c5342);
        for (let i=0;i<3;i++) cylinder([x,y+.88+i*.042,z],.094,.094,.038,0xb09978);
      }
      for (let i=1; i<points.length; i++) {
        const a=points[i-1],b=points[i],mid: Point=[(a[0]+b[0])/2,.78,(a[2]+b[2])/2];
        line([a[0],.95,a[2]],mid,.033,0xc5ab83,plain); line(mid,[b[0],.95,b[2]],.033,0xc5ab83,plain);
      }
    }
    rail([-9.7,-6.2,-2.7,.8,4.3,8.55].map(z=>[15.78,0,z]));
    rail([[15.78,0,8.55],[12.7,0,8.55],[9.6,0,8.55],[6.35,0,8.55]]);
    rail([[12.22,0,-9.7],[12.22,0,-5.8],[12.22,0,-2.0],[12.22,0,1.9],[12.22,0,5.8]]);
    for(const [x,z] of [[15.78,-6.2],[15.78,4.3],[9.6,8.55],[5.25,5.97]]) lamp(x,1.17,z,.73);
    for (const z of [-8,-3,2,7.5]) {
      line([15.4,-4.7,z],[15.4,-.12,z],.15,timber); line([12,-3.4,z],[15.4,-.15,z],.11,timber);
    }

    // The room is a true hollow shell. Four pieces of rock leave the only sea-facing aperture open.
    for (let i=0;i<25;i++) box([-1.03,-.085,-3.30+i*.404],[11.15,.17,.393],planks[(i*3)%5]);
    box([-5.30,1.6,-3.43],[2.54,3.5,.78],0x746b63,stone);
    box([1.68,1.6,-3.43],[5.88,3.5,.78],0x736961,stone);
    box([-2.65,.425,-3.43],[2.80,.85,.78],0x8c7d69,stone);
    box([-2.65,2.94,-3.43],[2.80,1.30,.78],0x6c6560,stone);
    box([-6.58,1.52,1.62],[.46,3.5,10.42],0x807064,stone);
    box([-1.05,1.52,6.60],[11.35,3.5,.52],0x73665e,stone);
    box([4.51,1.52,.03],[.52,3.5,6.92],0x72695f,stone);
    box([4.51,2.98,5.1],[.54,.75,3.54],0x665c53,stone);
    box([-.65,3.43,1.58],[12.1,.55,10.7],0x776d64,stone);
    for (const z of [-2.84,.20,3.32,6.18]) {
      box([-1.02,2.97,z],[11.1,.27,.26],timber);
      for (const x of [-6.16,4.12]) {
        if (x>4 && z>3.4) continue;
        box([x,1.46,z],[.21,2.92,.25],timber);
        const dx=x<0?.57:-.57;
        line([x,2.42,z],[x+dx,2.9,z],.105,timber);
      }
    }
    for (const x of [-4.03,-1.25]) box([x,1.58,-2.98],[.13,1.64,.22],0x84694e);
    for (const y of [.85,2.31]) box([-2.64,y,-3.02],[2.98,.15,.36],0x8e6d50);
    box([-2.64,.83,-2.84],[3.22,.16,.73],0xc09b6d);
    // Shallow shale courses merge into the cliff. Leave clear reveals around the opening.
    for(let row=0;row<10;row++) {
      let left=-6.44;
      while(left<4.27) {
        const width=Math.min(4.27-left,.72+random()*.92);
        const y=.15+row*.318, right=left+width;
        if ((y<.59 || y>2.60 || right < -4.17 || left > -1.09) && width>.20) {
          rock(left+width/2,y,-3.08,width*.65,.23+random()*.07,.14+random()*.09,
            [0x89847b,0x81796d,0x948776,0x776f68][Math.floor(random()*4)]);
        }
        left=right;
      }
    }
    // Window bench, patched wool cover and a narrow back bolster below the player's eye line.
    box([-2.7,.34,-.87],[3.12,.18,.90],timber);
    for(const x of [-4,-1.4]) for(const z of [-1.19,-.54]) box([x,.16,z],[.12,.33,.12],timber);
    soft([-2.7,.48,-.87],[3.04,.17,.86],0xb47856);
    soft([-2.7,.63,-.44],[3.02,.28,.13],0x87735a);
    // A folded plaid and a bolster soften the narrow bench.
    soft([-3.67,.592,-.88],[.75,.075,.80],0x4f7271);
    for(const x of [-3.90,-3.84,-3.49]) box([x,.635,-.88],[.026,.009,.73],0xdcc39c,plain);
    // Hand-sewn curtains are gathered at the edges, leaving the water line open.
    for(const side of [-1,1]){
      const anchor=side===-1?-4.11:-1.14;
      const geo=new THREE.PlaneGeometry(.55,1.61,10,14), pos=geo.getAttribute("position");
      for(let i=0;i<pos.count;i++){
        const u=pos.getX(i)/.55+.5,v=pos.getY(i)/1.61+.5;
        const gather=.49+.50*Math.abs(v-.32);
        pos.setXYZ(i,(u-.5)*.55*gather+side*.07*Math.sin(v*Math.PI),
          (v-.5)*1.61+.035*Math.cos(u*16)*(1-v),.055*Math.cos(u*Math.PI*6));
      }
      geo.computeVertexNormals(); place(geo,plain,0xa0aaa0,[anchor,1.55,-2.69],[1,1,1]);
      line([anchor-.15,1.28,-2.6],[anchor+.15,1.3,-2.6],.024,0xbe9a66);
    }
    // Heavy blankets and a paper journal give the place the scale of an inhabited shelter.
    box([-5.56,.33,2.33],[1.37,.53,3.83],0x6b503d);
    soft([-5.54,.67,2.32],[1.43,.26,3.75],0xe2cfad);
    soft([-5.53,.84,2.8],[1.47,.18,2.46],0x456f70);
    for(const z of [1.77,1.86,3.62,3.71]) box([-5.53,.936,z],[1.38,.012,.04],0xc2ab80,plain);
    soft([-5.53,.90,.94],[1.12,.24,.66],0xe9dac0);
    box([-1.03,.011,2.4],[3.1,.022,2.25],0x925546,plain);
    for(const z of [1.40,1.52,3.28,3.40]) box([-1.03,.025,z],[2.99,.012,.042],0xdbb784,plain);
    for(let i=0;i<8;i++) {
      const x=-2.36+i*.38;
      box([x,.027,2.4],[.24,.014,.24],i%2?0xe1bd87:0x4d7673,plain,[0,.785,0]);
      for (const z of [1.2,3.6]) box([x,.014,z],[.035,.022,.16],0xd6bf9b,plain);
    }
    // Woodstove and flue, fire split into lit slots, stacked logs and kettle.
    box([1.3,.10,-2.23],[1.66,.2,1.21],0x827364,stone);
    box([1.3,.63,-2.22],[1.08,.90,.79],0x3a4040,plain);
    box([1.3,.63,-1.808],[.75,.48,.04],0xb86a35,plain);
    box([1.3,.63,-1.778],[.61,.34,.036],0xffad5a,ember);
    for(const x of [1.08,1.29,1.50]) box([x,.63,-1.75],[.035,.36,.02],0x453c37,plain);
    cylinder([1.61,2.04,-2.39],.12,.14,2.05,0x414647);
    cylinder([1.07,1.22,-2.15],.16,.22,.29,0x51605a);
    place(new THREE.TorusGeometry(.14,.023,6,16),plain,0x383c39,[1.07,1.48,-2.15],[1,1,1]);
    for(let i=0;i<7;i++) line([2.25+(i%3)*.23,.15+Math.floor(i/3)*.19,-2.87],[2.34+(i%3)*.23,.15+Math.floor(i/3)*.19,-2.11],.116,planks[i%5]);
    for(const y of [1.14,1.88]) box([-.01,y,-2.86],[1.84,.09,.51],0xb18c63);
    for(let i=0;i<6;i++) box([-.73+i*.13,1.43,-2.72],[.10,.48+random()*.12,.26],[0x536962,0x9c6957,0xa48c5c][i%3],plain,[0,0,i===5?-.13:0]);
    lamp(-.55,1.94,-2.77,.75);
    lamp(-4.0,.92,-2.7,.57);
    const lampLight=new THREE.PointLight(0xffbe78,14,8,2);
    lampLight.position.set(-3.95,1.36,-2.35); scene.add(lampLight);
    const entryLight=new THREE.PointLight(0xffbf80,19,9,2);
    entryLight.position.set(3.7,2.0,5.0); scene.add(entryLight);
    lamp(4.06,1.46,5.96);
    box([4.10,1.42,5.97],[.52,.09,.59],timber);
    // A terracotta cup and waxed chart kept by the bed.
    cylinder([-4.92,.44,-1.18],.45,.45,.10,0x9f7d5b,wood);
    for(const dx of [-.21,.21]) box([-4.92+dx,.21,-1.18],[.09,.42,.17],timber);
    box([-4.89,.505,-1.16],[.32,.035,.24],0xe6ceb0,plain,[0,.3,0]);
    cylinder([-5.12,.58,-1.38],.09,.07,.16,0xa96749);
    cylinder([-5.12,.662,-1.38],.072,.072,.008,0x49382f);
    // Angled timber portal and hanging fishing floats mark the turn back to the shore.
    for(const x of [4.75,6.02]) {
      for(const z of [3.57,6.25]) box([x,1.32,z],[.24,2.64,.23],timber);
      box([x,2.66,4.91],[.28,.22,2.93],timber);
    }
    box([5.3,2.92,4.9],[2.3,.3,3.18],0x786c5b);
    const cubby=[-2.7,1.65,6.22] as Point;
    for(let i=0;i<4;i++) {
      const x=cubby[0]+i*.34;
      line([x,2.32,6.2],[x,1.65-i*.09,6.13],.02,0xb49c79,plain);
      place(new THREE.SphereGeometry(.14,10,7),plain,i%2?0x77918b:0xae684c,[x,1.57-i*.09,6.13],[1,1.25,1]);
    }
    for (const [mat, parts] of batches) {
      const merged=mergeGeometries(parts);
      scene.add(new THREE.Mesh(merged,mat));
      for (const part of parts) part.dispose();
    }
  }
  applyDaylight(d: Daylight) {
    this.water.applyDaylight(d);
    this.skyLight.intensity = 1.25 - .86 * d.stars;
    this.sun.intensity = 1.5 - 1.23 * d.stars;
    this.sun.position.set(...d.sun).multiplyScalar(60);
  }
  update(time: number) {
    this.water.material.uniforms.time.value = time;
    this.hearth.intensity = 20 + Math.sin(time*3.1) * .8 + Math.sin(time*7.3) * .43;
  }
}
