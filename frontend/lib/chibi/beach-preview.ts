/**
 * 바닷가 같은 다른 3D 공간에 치비를 들일 때 쓰는 묶음.
 * 메싱은 한 번만 하고(결과 공유, 단계마다 브라우저에 양보), 캐릭터마다 재질·뼈대를 새로 만든다.
 */
import type * as THREE from "three";
import type { ChibiBuild } from "./build";
import { buildChibiAsync } from "./build";
import { ChibiCharacter, createChibiMaterials } from "./character";

export interface ChibiPreview {
  character: ChibiCharacter;
  dispose(): void;
}

let shared: Promise<ChibiBuild> | null = null;

/** height: 장면 단위의 키 (바닷가 사람 아바타는 1.8) */
export async function createChibiPreview(height = 1.35): Promise<ChibiPreview> {
  shared ??= buildChibiAsync().catch((error) => { shared = null; throw error; });
  const build = await shared;
  const materials = createChibiMaterials();
  const character = new ChibiCharacter(build, materials);
  character.object.scale.setScalar(height);
  character.object.name = "chibi-preview";
  return {
    character,
    dispose() {
      character.object.removeFromParent();
      for (const m of Object.values(materials)) m.dispose();
      character.shadow.geometry.dispose();
      (character.shadow.material as THREE.Material).dispose();
    },
  };
}


