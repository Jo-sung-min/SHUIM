# 몽실 캐릭터 원화

Mode: built-in `image_gen` tool, new image generation.

Reference: user-supplied `KakaoTalk_20261109_151643910.mp4`. The final rendering follows the user's correction: the side profile retains a plump body, using camera-facing directional illustrations. The artwork itself is original.

Source: `turnaround-source-v1.png` (1536 × 1024, original alpha preserved).

Additional side-profile source and exact edit prompt: [SIDES.md](SIDES.md).

Runtime assets: `frontend/public/characters/mongsil/front-v1.webp`, `back-v1.webp`, `left-v1.webp`, and `right-v1.webp`. Local Git assets; no S3/CDN dependency. The initial front/back prompt below is preserved exactly; its requested thin rendering is superseded by the final four-direction renderer.

## Exact prompt

```text
Use case: stylized-concept
Asset type: production 2D game character turnaround sheet, TWO isolated cutout sprites on a genuinely transparent background.
Primary request: Create one original adorable hand-drawn cozy mascot for the Korean social relaxation game Sorow, called Mongsil. A tiny round cloud-bear with TWO little rounded bear ears, large round head, compact plump body, tiny arms and short legs, approximately two-head-tall proportions. Warm ivory fur, simple dark cocoa dot eyes with NO large irises, a very small relaxed w-shaped smile, soft peach blush, one simple sage-green scarf with a short loose scarf tail on the front. Original silhouette, not a known licensed character. Warm gentle dark cocoa thick clean hand-drawn outline, flat creamy color with only very subtle soft shading, high-quality storybook sticker illustration. Not pixel art, not 3D plastic.
Composition: wide landscape canvas 1536x1024, exactly TWO complete equal-sized figures side by side separated by generous transparent space. LEFT is perfectly straight FRONT VIEW, RIGHT is perfectly straight BACK VIEW of the EXACT SAME character in EXACT SAME pose and scale, with identical outline silhouette. Both are standing relaxed with arms slightly separated from their sides and feet separated. Back view has no face, no eyes and no cheek blush; show the scarf band around the neck and a tiny round tail at the lower back. No text labels. The body outline and ear, arm, and foot positions must be matched front and back. Each complete character fits fully within its own half of the canvas with at least 8% transparent padding around it. Neutral orthographic view with no perspective, no ground, no shadows.
Lighting/mood: calm, comforting, soft and lovely.
Constraints: Exactly two views of ONE character, no extra accessories, no hearts, no stars, no props, no lettering, no watermarks, no panels, no checkered background; actual alpha transparency. Crisp edges suitable for a thin paper-cutout character in a Three.js scene.
```
