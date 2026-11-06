# Spring water garden generated assets

Generated with the **built-in image_gen tool**, not a CLI or paid API fallback.
Date: 2026-11-06. Project assets are copied originals; default generated originals remain in place.

## Runtime assets

The originals were converted with Sharp to WebP (quality 88, alpha quality 100), without semantic image edits or upscaling:

- `frontend/public/garden/art/spring-hills-panorama-v1.webp` — 2172 × 724, 289,848 bytes.
- `frontend/public/garden/art/willow-canopy-v1.webp` — 1254 × 1254, 766,906 bytes, alpha preserved.

Both files are shipped at same-origin `/garden/art/` URLs in the web and Apps-in-Toss public output. They are explicitly included in Git so deployment does not require a separate CDN upload. The panorama blends into the procedural upper sky and receives day/night/rain tinting. Willow imagery is shared by all instanced trees.

## spring-hills-panorama-v1.png

- Size: 2172 × 724 pixels (3:1).
- Original generated path: `C:/Users/pc/.codex/generated_images/01a1af04-5e4a-7a43-a9a9-4576d34373ca/exec-ca35ab52-fc5c-40af-bba9-42d11db98b48.png`
- Workspace path: `C:/Users/pc/Desktop/project/SHUIM/.claude/worktrees/gracious-poitras-11d8c6/output/imagegen/spring-water-garden/spring-hills-panorama-v1.png`
- Visual inspection: photographic layered rounded hills, faint blush blossoms, after-rain mist, pale open sky, continuous green lower edge. No buildings, people, or foreground lake.
- Wrap note: similar edge tone and treeline height, but not a mathematically seamless panorama; blend or mirror at the wrap seam.

### Exact prompt

```text
Use case: photorealistic-natural
Asset type: ultra-wide high-resolution distant landscape panorama texture for an immersive Korean spring water garden game environment, 3:1 landscape aspect ratio.
Primary request: Create an exquisite, completely photographic panoramic view of serene surrounding Korean spring hills after rain. Rounded forested mountains overlap into pale atmospheric mist. Fresh sage and jade foliage, a few naturally scattered pale blush cherry blossoms among the trees, and subtle slate rock outcrops. No dominant giant central peak.
Composition/framing: Camera looks horizontally from an open valley toward distant forested hills, all land far away. Bottom half detailed distant foothills and continuous treeline, middle third layered misty far hills, top open pearl and pale blue sky with a few thin soft clouds. Both horizontal image edges have similar treeline heights and color, making the landscape wrap naturally; no conspicuous focal feature at either edge. No foreground branches or large nearby objects.
Lighting/mood: Peaceful poetic morning after rain, gentle warm highlights, cool soft shadows, delicate haze and realistic depth, luxurious but entirely natural.
Style/medium: High-end large-format landscape photography, finely resolved individual foliage textures, natural tonal range, richly nuanced greens and luminous pearl mist, realistic optical atmospheric perspective.
Constraints: No foreground lake, water surface, buildings, boats, people, paths, signs, text or watermark. No illustration, watercolor, ink painting, CG polygons, geometric low-poly hills, fantasy neon colors, artificial vignette or border. Photorealism throughout.
```

## willow-canopy-v1.png

- Size: 1254 × 1254 pixels, RGBA PNG with genuine alpha.
- Original generated path: `C:/Users/pc/.codex/generated_images/01a1af04-5e4a-7a43-a9a9-4576d34373ca/exec-69188bba-2d74-4b2a-8ec0-dfb8ee27de7b.png`
- Workspace path: `C:/Users/pc/Desktop/project/SHUIM/.claude/worktrees/gracious-poitras-11d8c6/output/imagegen/spring-water-garden/willow-canopy-v1.png`
- Visual inspection: narrow natural leaves, arching small branches at crown, hanging fringe fits within margins, transparent gaps, no trunk or ground.
- Alpha validation: 686,278 fully transparent pixels; 886,142 partial-alpha pixels; 96 fully opaque pixels. 385,254 pixels have alpha from 240 to 255. Keep alpha when producing runtime WebP.
- Original image was not semantically post-processed.

### Exact prompt

```text
Use case: photorealistic-natural
Asset type: isolated transparent PNG foliage texture for crossed-plane hanging willow canopies in a photorealistic garden game; square composition.
Primary request: One beautiful natural cluster of weeping willow canopy, isolated on a GENUINELY TRANSPARENT background with an alpha channel. A small warm brown branching crown at upper center spreads into softly arched cascading leafy fronds. The whole canopy cluster fits comfortably inside the image with empty transparent margins on all sides. The canopy widens across its upper third and the long dangling leafy fringe tapers naturally toward the bottom. No trunk.
Subject details: Hundreds of individually resolved, delicate narrow curved willow leaves in fresh jade, sage green, and a little soft sunlit gold. Numerous fine curving twigs, varied organic leaf density, irregular tips and many little transparent gaps between hanging strands. Detailed realistic leaf silhouettes with no broad opaque blobs. Quiet elegant supple foliage photographed from the side, suitable to hang down from a branch anchor.
Lighting/mood: Soft natural overcast illumination, finely nuanced green leaf texture, no harsh shadows or broad specular glare.
Style/medium: High-resolution botanical photography, completely photographic real foliage rather than illustration or CGI.
Constraints: Genuinely transparent background and transparent gaps through the leaves; preserve alpha. No backdrop, no white background, no green background, no colored background, no checkerboard graphic. No tree trunk, ground, pot, container, landscape, text, logos or watermark. No foliage cut off at frame edges.
```
