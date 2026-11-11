import styles from "./MoruPet.module.css";

export type MoruMood = "idle" | "happy" | "eat" | "sleep" | "pet";
/** Hand-drawn 128px pixel grid; flat palette, no blur or raster upscaling. */
export default function MoruSprite({ mood, level = 1 }: { mood: MoruMood; level?: number }) {
  const happy = mood === "happy" || mood === "pet" || mood === "eat";
  return <svg viewBox="0 0 128 122" className={styles.sprite} data-mood={mood} shapeRendering="crispEdges" aria-hidden="true">
    <path fill="#211b35" opacity=".2" d="M23 108h82v2h7v4h-7v2H23v-2h-7v-4h7z" />
    <path fill="#211b35" opacity=".16" d="M33 109h62v4H33z" />
    <g className={styles.body}>
      <g className={styles.sprout}>
        <path fill="#79608f" d="M62 39V25h-4v-6h4v5h4v-7h4v11h-4v11z" />
        <path fill="#9575b3" d="M58 24H48v-3h-8v-4h-5v-5h-3V6h12v3h8v4h5v4h5v7zM68 22v-6h5v-4h8V9h14v3h6v5h-5v4h-9v3H74v-2z" />
        <path fill="#b99bd4" d="M36 8h8v3h8v4h5v4h-9v-3h-8v-4h-4zM73 17h7v-4h15v2h3v2h-9v3H73z" />
        <path fill="#dbc2ec" d="M37 8h7v2h-7zM44 11h7v2h-7zM81 12h13v2H81z" />
        <path fill="#83639f" d="M49 19h8v3h-8zM73 21h13v2H73z" />
        {level >= 10 && <g><path fill="#c586b1" d="M61 3h7v3h5v7h-5v4h-7v-4h-4V6h4z" /><path fill="#f3cee0" d="M62 4h5v4h5v4h-5v4h-5v-4h-4V8h4z" /><path fill="#ffe7b9" d="M63 8h4v4h-4z" /></g>}
      </g>
      {/* Rounded silhouette built from small, deliberate stair steps. */}
      <path fill="#79658f" d="M47 35h34v2h10v3h7v4h6v5h5v7h4v9h3v12h2v16h-2v8h-5v6h-8v4H88v-3H42v3H27v-4h-8v-6h-4v-9h-2V78h2V66h3V56h4v-7h5v-5h6v-4h7v-3h7z" />
      <path fill="#ab94be" d="M46 38h35v2h10v3h7v4h5v6h5v8h3v11h3v20h-2v8h-5v5h-8v3H88v-4H41v4H28v-4h-7v-6h-3V78h2V65h3v-9h5v-7h6v-5h12z" />
      <path fill="#cfbbdc" d="M45 39h35v2h10v3h7v5h6v7h4v10h3v24h-3v9h-7v5H85v-3H42v4H29v-5h-7v-8h-2V75h3V62h4v-9h6v-7h12z" />
      <path fill="#ebe0ec" d="M45 40h34v2h10v4h8v6h5v9h4v26h-3v10h-7v4H38v-3H27v-7h-4V73h4V59h6v-9h12z" />
      <path fill="#faf3ef" d="M46 40h30v3h12v4h8v7h5v11h2v20h-5v8H87v3H42v-3H31v-6h-5V70h4V58h6v-9h10z" />
      <path fill="#fffaf1" d="M47 41h28v3h12v4h7v7h4v7h-6v-8h-9v-4H46v4H36v9h-5v-8h6v-8h10z" />
      <path fill="#f2e8ee" d="M29 83h5v9h10v4h42v-3h12v-8h5v12h-8v3H39v-4H29z" />
      <path fill="#dac9e1" d="M23 84h3v10h6v5h8v3h46v-3h13v-5h5v-9h4v13h-7v5H88v3H39v-3H29v-5h-6z" />
      {/* Small feet and resting paws remain distinct from the body shading. */}
      <path fill="#b59cc7" d="M29 101h16v8H28v-4h-3v-5h4zM84 101h16v8H84z" />
      <path fill="#f9eff0" d="M30 100h13v7H29v-4h1zM86 100h12v7H85v-4h1z" />
      <path fill="#fffaf3" d="M31 100h10v3H31zM87 100h9v3h-9z" />
      <path fill="#ded0e5" d="M22 79h3v13h-3zM106 79h3v12h-3z" />
      {level >= 3 && (mood === "happy" || mood === "pet") && <g className={styles.wave}><path fill="#9175a8" d="M101 74h5v-8h4v-4h7v4h3v14h-4v7h-7v4h-8z" /><path fill="#f5ebef" d="M104 76h5v-9h4v-3h3v14h-4v7h-8z" /><path fill="#fff9f0" d="M110 68h3v9h-3z" /></g>}
      <g className={styles.face}>
        {happy && <path fill="#fff7ce" d="M31 64h2v-2h2v2h2v2h-2v2h-2v-2h-2zM95 64h2v-2h2v2h2v2h-2v2h-2v-2h-2z" />}
        {mood === "sleep" ? <path fill="#66516f" d="M37 74h3v4h7v2h8v-3h3v5H46v-2h-9zM73 77h3v3h8v-2h7v-4h3v6h-9v2H73z" />
          : happy ? <g><path fill="#5c4768" d="M35 75v-6h4v-4h12v3h5v5h3v6h-5v-5h-4v-5h-9v5h-3v5h-3zM73 75v-6h4v-4h12v3h5v5h3v6h-5v-5h-4v-5h-9v5h-3v5h-3z" /><path fill="#93769d" d="M39 65h12v2H39zM77 65h12v2H77z" /></g>
          : <g className={styles.blink}><path fill="#594661" d="M38 67h17v3h3v13h-4v4H40v-3h-5V73h3zM74 67h17v6h3v11h-5v3H76v-4h-4V70h2z" /><path fill="#715a7b" d="M38 80h5v3h11v3H41v-2h-3zM75 83h12v-3h5v4h-5v2H76z" /><path fill="#d7c4df" d="M36 65h19v2H36zM74 65h19v2H74z" /></g>}
        <path fill={happy ? "#e7bfd4" : "#e0cfe3"} d="M29 83h12v2h3v4H30v-2h-1zM91 85h3v-2h11v4h-2v2H91z" />
        <path fill={happy ? "#f2d5e2" : "#eee0eb"} d="M31 83h8v2h-8zM96 83h7v2h-7z" />
        {mood === "eat" ? <g><path fill="#80617f" d="M61 86h9v8h-9z" /><path fill="#c28da8" d="M63 91h5v3h-5z" /></g> : happy ? <path fill="#a282a2" d="M60 87h3v3h5v-3h3v5h-3v2h-5v-2h-3z" /> : <path fill="#ba9fbc" d="M63 90h5v2h-5z" />}
      </g>
      {mood === "eat" && <g className={styles.rice}><path fill="#a87f9f" d="M48 96h35v10h-5v4H54v-4h-6z" /><path fill="#ddb4c9" d="M50 97h31v7h-5v3H56v-3h-6z" /><path fill="#fff8e9" d="M52 90h6v-4h15v4h6v8H52z" /><path fill="#e6d9cb" d="M57 93h3v2h-3zM69 89h3v2h-3zM73 95h4v2h-4z" /><path fill="#f8eef0" d="M44 97h8v7h-8zM80 97h8v7h-8z" /></g>}
      {mood === "sleep" && level >= 5 && <g><path fill="#967cad" d="M26 92h13v4h58v-4h13v13H26z" /><path fill="#bfa6d1" d="M28 93h10v5h61v-5h8v7H28z" /><path fill="#d5c0e0" d="M42 99h3v5h-3zM68 99h3v5h-3zM94 99h3v5h-3z" /></g>}
    </g>
    {(mood === "pet" || mood === "happy") && <g className={styles.heart}><path fill="#a77aab" d="M106 37h6v3h3v-3h6v3h3v7h-4v4h-4v4h-4v-4h-4v-4h-4v-7h2z" /><path fill="#f0bad7" d="M107 39h4v4h5v-4h5v7h-4v4h-4v-3h-3v-3h-3z" /><path fill="#ffdeeb" d="M108 40h2v4h-2z" /></g>}
    {mood === "sleep" && <g fill="#c7b2df" className={styles.heart}><path d="M94 37h10v3h-3v3h-3v3h6v3H94v-3h3v-3h3v-3h-6zM109 23h9v2h-3v3h-3v3h6v2h-9v-3h3v-3h3v-2h-6z" /></g>}
  </svg>;
}
