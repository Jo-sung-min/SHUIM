import { DEFAULT_SKY, Outside, Stage, type Sky } from "./MoruScene";
import styles from "./MoruRoom.module.css";

/** 초 하나: 몸통과 불꽃, 둘레의 빛 */
function Candle({ x, y, h = 14 }: { x: number; y: number; h?: number }) {
  return <g>
    <circle cx={x} cy={y - h - 5} r="16" fill="#ffd98a" opacity=".3" stroke="none" />
    <path fill="#fff3dc" d={`M${x - 5} ${y - h}H${x + 5}V${y}H${x - 5}Z`} />
    <path fill="#ffc46b" strokeWidth="1.4" d={`M${x} ${y - h - 1}C${x - 5} ${y - h - 5} ${x - 2} ${y - h - 10} ${x} ${y - h - 13}C${x + 2} ${y - h - 10} ${x + 5} ${y - h - 5} ${x} ${y - h - 1}Z`} />
  </g>;
}
const BOOKS: [number, number, number, string][] = [[362, 10, 22, "#b5694f"], [372, 8, 28, "#e5b65f"], [380, 11, 24, "#7f9d78"], [391, 9, 20, "#fff3dc"], [400, 10, 26, "#cfbdf2"], [410, 12, 22, "#b5694f"], [422, 9, 28, "#8fa3bd"], [431, 10, 22, "#e5b65f"], [441, 11, 25, "#fff3dc"], [452, 9, 21, "#7f9d78"], [461, 12, 27, "#b5694f"]];

/** 창가 침대방: 천장까지 닿는 큰 창 옆에 붙인 침대, 창턱의 책과 촛불. 창밖은 멈춰 있고 비·눈만 내린다 */
export default function MoruWindowBedScene({ sky = DEFAULT_SKY }: { sky?: Sky }) {
  return <Stage view={<Outside sky={sky} width={330} height={352} className={styles.viewBed} />}>{(glow) => <>
    {/* 벽과 천장: 큰 창 자리만 비운다 */}
    <path stroke="none" fill="#667089" fillRule="evenodd" d="M-10-10H490V710H-10ZM158 128H490V468H158Z" />
    <path stroke="none" fill="#535c73" d="M-10-10H490V96H-10Z" />
    <path fill="none" stroke="#454d62" strokeWidth="4" d="M-10 96C120 94 320 99 490 96" />
    <path fill="none" stroke="#586179" strokeWidth="1.6" opacity=".8" d="M44 100C46 220 42 340 44 474M112 100C110 220 114 340 112 474" />
    {[90, 210, 330].map((x) => <g key={x}><circle cx={x} cy="60" r="20" fill="#ffd98a" opacity=".2" stroke="none" /><ellipse cx={x} cy="58" rx="9" ry="4" fill="#ffe9b0" strokeWidth="1.6" /></g>)}
    {/* 창틀과 창살, 창턱 */}
    <path fill="#3f4759" d="M148 118H490V130H160V470H148Z" /><path fill="#3f4759" d="M350 130H357V468H350Z" />
    <path stroke="none" fill="#ffffff" opacity=".06" d="M170 440L300 140H340L210 460Z" /><path stroke="none" fill="#ffffff" opacity=".04" d="M372 460L470 220V320L410 460Z" />
    <path fill="#9aa3b8" d="M144 468H490V481H144Z" />
    {/* 창턱에 세워 둔 책과 촛불 */}
    {BOOKS.map(([x, w, h, fill]) => <path key={x} fill={fill} d={`M${x} ${468 - h}H${x + w}V468H${x}Z`} />)}
    <Candle x={338} y={468} /><Candle x={396} y={448} h={10} />
    {/* 왼쪽 벽의 액자들 */}
    <path fill="#d9a55e" d="M86 248H140V318H86Z" /><path fill="#fff3dc" d="M92 254H134V312H92Z" /><path stroke="none" fill="#a9c6d6" d="M95 257H131V309H95Z" /><path stroke="none" fill="#f4f8fa" d="M95 309L108 286L116 296L122 289L131 302V309Z" />
    <path fill="#8f5f44" d="M90 330H136V382H90Z" /><path fill="#fff3dc" d="M95 335H131V377H95Z" /><circle cx="113" cy="356" r="9" fill="#ffe2a0" strokeWidth="1.6" />
    <path fill="#d9a55e" d="M94 394H132V436H94Z" /><path fill="#fff3dc" d="M99 399H127V431H99Z" /><path fill="#7f9d78" strokeWidth="1.4" d="M113 427C104 420 106 408 113 404C120 408 122 420 113 427Z" />
    {/* 침대 옆 나무 상자: 병에 든 초 */}
    <circle cx="108" cy="436" r="52" fill={glow} stroke="none" />
    <path fill="#8f5f44" d="M80 454H140V482H80Z" /><path fill="none" stroke="#754a36" strokeWidth="1.6" d="M80 468H140" />
    <path fill="#fff3dc" d="M96 432H116V454H96Z" /><path stroke="none" fill="#ffc46b" d="M106 450C100 445 103 438 106 434C109 438 112 445 106 450Z" />
    <Candle x={128} y={454} h={9} />
    {/* 침대: 흰 이불과 등 뒤의 베개들 */}
    <path fill="#f4f4f7" d="M-10 477C110 473 370 480 490 476V710H-10Z" />
    <path fill="#dfe3ec" d="M136 450C148 440 194 438 206 446C214 458 214 484 206 496C194 502 150 502 138 494C130 482 130 462 136 450Z" />
    <path fill="#fbfbfd" d="M272 446C288 436 338 436 352 444C362 458 362 486 354 498C338 506 290 506 274 498C264 486 264 460 272 446Z" />
    <path fill="none" stroke="#c2c8d6" strokeWidth="1.8" d="M150 452C158 464 158 480 150 492M290 446C298 462 298 484 290 500M336 444C328 462 328 484 336 500" />
    {/* 펼쳐 둔 공책 */}
    <path fill="#fffaf0" d="M326 502L372 495L378 513L332 520Z" /><path fill="none" stroke="#c9b9a2" strokeWidth="1.2" d="M334 507L366 502M336 512L368 507" />
    <path fill="none" stroke="#b5694f" strokeWidth="2.4" d="M382 498L396 510" />
    {/* 구겨진 이불 자락과 아래에 걸친 담요 */}
    <path fill="#e6e9f0" d="M-10 528C40 520 90 536 150 526C210 516 260 534 320 524C380 516 430 532 490 522V710H-10Z" />
    <path fill="none" stroke="#b9bfcc" strokeWidth="1.8" d="M40 540C70 548 90 546 120 540M210 536C240 546 270 544 300 536M380 538C410 546 430 544 460 538M160 552C168 562 166 572 158 580M340 550C332 560 334 570 342 578" />
    <path fill="#b7a6d9" d="M-10 584C100 574 220 590 330 580C400 574 450 582 490 578V710H-10Z" />
    <path fill="none" stroke="#e9e0f7" strokeWidth="1.8" opacity=".7" d="M-10 604C100 594 220 610 330 600C400 594 450 602 490 598M-10 650C100 640 220 656 330 646C400 640 450 648 490 644" />
  </>}</Stage>;
}
