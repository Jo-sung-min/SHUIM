# Baikal snow and ice — v1

Mode: built-in image_gen (two separate generations).

Snow: `frontend/public/baikal/art/snow-natural-v1.webp` (1254 square), `snow-natural-mobile-v1.webp` (768 square).
Ice: `frontend/public/baikal/art/lake-ice-v1.webp` (1254 square), `lake-ice-mobile-v1.webp` (768 square).
Original PNG sources: `output/imagegen/baikal/snow-natural-source-v1.png`, `lake-ice-source-v1.png`.

The supplied Baikal ice photo was a material reference only. Both final images were inspected. Sharp was used only to create WebP delivery sizes; the native generated images are kept unchanged.

These files are committed to Git. Baikal art stays on the app's local public path until a later, explicitly requested AWS migration. No S3 upload was attempted.

## Snow prompt

Use case: photorealistic-natural
Asset type: seamless square physically believable ground albedo texture for an immersive real-time Lake Baikal snow world.
Primary request: a high resolution, directly overhead orthographic photograph of untouched wind-packed white snow. Fine powder grains and delicate compacted crystalline detail, broad extremely shallow soft wind ripples and small naturally uneven snow ridges, subtle blue-grey micro cavities. Luxurious soft dry snow, convincingly photographic rather than sand or foam.
Composition: only the snow surface filling the entire square, consistent scale and focus edge to edge, no horizon, no perspective, no border. Roughly a 4 meter wide patch of ground. Seamlessly tileable left to right and top to bottom with no obvious repeating feature.
Lighting: neutral soft evenly overcast diffuse light, no baked directional lighting or deep shadows. Warm-neutral white midtones (not glaring clipped white), very subtle cool cavities. Keep contrast gentle so the game can light it at night and daylight.
Avoid: footprints, rocks, trees, buildings, sky, text, logos, glitter bokeh, blue objects, checkerboard, dramatic black cracks, large pits. Output one square texture image.

## Ice prompt

Use case: photorealistic-natural
Asset type: square seamless overhead texture for the ice surface of a real-time Lake Baikal walking scene.
Input image: reference image only for material quality, deep blue transparent ice and layered white fractures. Do NOT copy its perspective, landscape or sky.
Primary request: create a directly overhead orthographic photograph of clear thick frozen Lake Baikal ice, a roughly 12 meter wide patch. Extremely realistic dark petrol blue / deep teal transparent ice with sweeping long intersecting white milky fracture ribbons trapped at different depths. Broad translucent feather-edged sheets of fissures and many fine hairline cracks cross at irregular shallow and diagonal angles, leaving large dark clear areas. A few tiny frozen bubble threads within the ice; crystalline depth. Glassy but solid and safe ice, cracks inside, not open holes.
Composition: flat material only filling every pixel, no horizon, sky, landscape, mountains, reflections of clouds, people or objects. Consistent focus, square tile, edges seamlessly join when repeated both axes. Avoid a single central focal point or regular polygon/Voronoi cells.
Lighting: neutral soft diffuse light with minimal baked gloss, no strong shadows. The white cracks are bright ice-white with translucent light cyan feathers, dark areas rich deep teal, NOT electric neon blue. Real photographic surface detail at high resolution.
Avoid: text, grid, border, logos, snow-covered patches, foam, rocky ground, waves, chunks standing above surface. One square texture image.
