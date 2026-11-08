import * as THREE from "three";

/** One photographic cloud texture follows horizontal terraces and vertical cloud faces without stretched UVs. */
export function createCloudSpaCloudMaterial(kind: "floor" | "cloud" | "storm", texture: THREE.Texture, vertexColors = false) {
  const material = new THREE.MeshStandardMaterial({
    color: kind === "storm" ? 0x535c74 : kind === "floor" ? 0xe8eaf1 : 0xf1f0f5,
    roughness: 1, metalness: 0, vertexColors, fog: false,
  });
  material.name = `cloud-spa-photographic-${kind}`;
  material.onBeforeCompile = shader => {
    shader.uniforms.uCloudSurface = { value: texture };
    shader.vertexShader = "varying vec3 vCloudSurfacePosition;\nvarying vec3 vCloudSurfaceNormal;\n" + shader.vertexShader
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nvCloudSurfaceNormal=normalize(mat3(modelMatrix)*objectNormal);")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCloudSurfacePosition=(modelMatrix*vec4(transformed,1.0)).xyz;");
    shader.fragmentShader = `
      uniform sampler2D uCloudSurface;
      varying vec3 vCloudSurfacePosition;
      varying vec3 vCloudSurfaceNormal;
    ` + shader.fragmentShader
      .replace("#include <map_fragment>", `#include <map_fragment>
        vec3 cloudBlend=pow(abs(normalize(vCloudSurfaceNormal)),vec3(4.0));
        cloudBlend/=max(.001,cloudBlend.x+cloudBlend.y+cloudBlend.z);
        vec3 cloudP=vCloudSurfacePosition*.095;
        vec3 cloudDetail=texture2D(uCloudSurface,cloudP.yz).rgb*cloudBlend.x
          +texture2D(uCloudSurface,cloudP.xz).rgb*cloudBlend.y
          +texture2D(uCloudSurface,cloudP.xy).rgb*cloudBlend.z;
        diffuseColor.rgb*=vec3(.66)+cloudDetail*.44;
        float cloudRelief=dot(cloudDetail,vec3(.299,.587,.114))*.03;
      `)
      .replace("#include <normal_fragment_begin>", `#include <normal_fragment_begin>
        vec3 cloudSurface=-vViewPosition;
        vec3 cloudDx=dFdx(cloudSurface), cloudDy=dFdy(cloudSurface);
        vec3 cloudR1=cross(cloudDy,normal), cloudR2=cross(normal,cloudDx);
        float cloudDet=dot(cloudDx,cloudR1)*faceDirection;
        vec3 cloudGrad=sign(cloudDet)*(dFdx(cloudRelief)*cloudR1+dFdy(cloudRelief)*cloudR2);
        normal=normalize(abs(cloudDet)*normal-cloudGrad);
      `);
  };
  material.customProgramCacheKey = () => "cloud-spa-photographic-surface-v1";
  return material;
}
