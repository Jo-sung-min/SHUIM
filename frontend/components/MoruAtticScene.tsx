import { Bulb, DEFAULT_SKY, Outside, Stage, type Sky } from "./MoruScene";
import styles from "./MoruRoom.module.css";

/** 다락방: 기울어진 지붕 아래 둥근 창, 바닥에 깐 요와 두꺼운 이불. 창밖은 멈춰 있고 비·눈만 내린다 */
export default function MoruAtticScene({ sky = DEFAULT_SKY }: { sky?: Sky }) {
  return <Stage view={<Outside sky={sky} width={188} height={188} className={styles.viewAttic} />}>{(glow) => <>
    {/* 박공벽: 둥근 창 자리만 비운다 */}
    <path stroke="none" fill="#dbb78f" fillRule="evenodd" d="M-10-10H490V710H-10ZM150 332a90 90 0 1 0 180 0a90 90 0 1 0-180 0Z" />
    <path fill="none" stroke="#b98f66" strokeWidth="1.6" opacity=".75" d="M-10 226C120 223 330 229 490 225M-10 262C60 260 120 264 172 262M308 262C360 260 430 264 490 261M-10 298C50 296 100 300 148 298M332 298C380 296 440 300 490 297M-10 334C50 332 100 336 142 334M338 334C380 332 440 336 490 333M-10 370C50 368 100 372 150 370M330 370C380 368 440 372 490 369M-10 406C60 404 120 408 177 406M303 406C360 404 430 408 490 405M-10 442C120 439 330 445 490 441" />
    {/* 기울어진 지붕 안쪽과 서까래 */}
    <path stroke="none" fill="#8a5d45" d="M-10-10H236L24 470H-10ZM490-10H244L456 470H490Z" />
    <path fill="none" stroke="#754a36" strokeWidth="1.6" opacity=".7" d="M184 20L-28 470M132 20L-80 470M296 20L508 470M348 20L560 470" />
    <path fill="#6b4534" d="M226 20H240L28 470H14ZM254 20H240L452 470H466Z" />
    {/* 둥근 창과 창살 */}
    <path fill="#6b4534" fillRule="evenodd" d="M142 332a98 98 0 1 0 196 0a98 98 0 1 0-196 0ZM152 332a88 88 0 1 0 176 0a88 88 0 1 0-176 0Z" />
    <path fill="#6b4534" d="M237 246h6v172h-6ZM154 329h172v6H154Z" />
    <path stroke="none" fill="#ffffff" opacity=".08" d="M176 400L250 250H280L206 410Z" />
    {/* 창을 두른 줄 전구 */}
    <path fill="none" strokeWidth="1.4" d="M139 300A108 108 0 0 1 341 300" />
    {[[152, 281], [181, 248], [222, 231], [258, 231], [299, 248], [328, 281]].map(([x, y]) => <Bulb key={x} x={x} y={y + 2} />)}
    {/* 오른쪽 벽 선반: 화분과 병 */}
    <path fill="#b9835a" d="M350 448H412Q416 452 412 456H350Z" /><path fill="#8f5f44" d="M360 456v12l12-12Z" />
    <path fill="#c9705a" d="M360 430H382L379 448H363Z" /><path fill="#7f9d78" strokeWidth="1.6" d="M366 430C360 422 362 412 368 410C372 416 372 424 370 430ZM374 430C374 420 380 412 386 414C386 422 382 428 378 430Z" />
    <path fill="#fff3dc" d="M393 434H405V448H393Z" /><path fill="#d9a55e" d="M392 430H406V435H392Z" />
    {/* 책 위에 올려 둔 등 */}
    <circle cx="111" cy="438" r="52" fill={glow} stroke="none" />
    <path fill="#b5694f" d="M86 458H136V468H86Z" /><path fill="#8fa3bd" d="M90 468H132V478H90Z" />
    <path fill="none" d="M104 424Q111 408 118 424" />
    <path fill="#6b4534" d="M100 422H122V428H100ZM99 450H123V457H99Z" /><path fill="#ffe9b0" d="M102 428H120V450H102Z" />
    <path stroke="none" fill="#ffc46b" d="M111 446C106 442 108 436 111 432C114 436 116 442 111 446Z" />
    {/* 요와 등 뒤의 쿠션 두 개 */}
    <path fill="#f7ecd8" d="M-10 477C110 473 370 480 490 476V710H-10Z" />
    <path fill="#e9aaa2" d="M128 452C140 440 186 438 198 446C206 458 206 484 198 496C186 502 140 502 130 494C122 482 122 462 128 452Z" />
    <path fill="none" stroke="#c9837c" strokeWidth="1.8" d="M140 452C150 462 150 480 140 490M186 450C176 462 176 480 186 492" />
    <path fill="#e5b65f" d="M282 448C296 438 340 438 354 446C362 458 362 484 356 496C342 504 296 504 284 496C276 484 276 460 282 448Z" />
    <path fill="none" stroke="#c08f3d" strokeWidth="1.8" d="M296 448C306 460 306 482 296 494M342 448C332 460 332 482 342 494" />
    {/* 찻쟁반 */}
    <path fill="#b9835a" d="M322 508L396 503L400 516L326 522Z" />
    <path fill="#fff3dc" d="M340 492H356V506Q356 510 352 510H344Q340 510 340 506Z" /><path fill="none" d="M356 495Q362 495 362 499Q362 503 356 503" />
    <path fill="none" stroke="#fff6e4" strokeWidth="1.6" opacity=".7" d="M345 487C342 482 348 480 345 474M351 487C348 483 353 481 351 476" />
    <circle cx="376" cy="506" r="5" fill="#d9a55e" /><circle cx="386" cy="509" r="4.5" fill="#d9a55e" />
    {/* 폭신한 누빔 이불 */}
    <path fill="#a9bf9f" d="M-10 532C20 518 50 518 80 530C110 518 140 518 170 530C200 518 230 518 260 530C290 518 320 518 350 530C380 518 410 518 440 530C460 520 480 522 490 526V710H-10Z" />
    <path fill="none" stroke="#86a07f" strokeWidth="1.6" strokeDasharray="5 6" d="M80 532C83 590 77 650 80 706M170 532C173 590 167 650 170 706M260 532C263 590 257 650 260 706M350 532C353 590 347 650 350 706M440 532C443 590 437 650 440 706M-10 604C120 596 340 610 490 600M-10 672C120 664 340 678 490 668" />
    <path stroke="none" fill="#c3d5ba" opacity=".7" d="M24 528C40 522 58 524 70 530C56 534 38 534 24 528ZM204 528C220 522 238 524 250 530C236 534 218 534 204 528ZM384 528C400 522 418 524 430 530C416 534 398 534 384 528Z" />
  </>}</Stage>;
}
