import { Bulb, DEFAULT_SKY, Outside, Stage, type Sky } from "./MoruScene";
import styles from "./MoruRoom.module.css";

/** 묶어 둔 커튼 한 쪽 (오른쪽은 뒤집어 쓴다) */
function Curtain() {
  return <g>
    <path fill="#e5b65f" d="M118 231H180C178 262 170 302 152 338C144 356 139 366 137 373L127 373C126 330 121 282 118 231Z" />
    <path fill="none" stroke="#c08f3d" strokeWidth="1.8" d="M133 236C134 282 131 330 130 366M150 236C149 284 141 330 133 368M166 236C162 282 149 328 135 369" />
    <path fill="#e5b65f" d="M127 380H139C147 402 153 428 155 452H117C117 428 121 402 127 380Z" />
    <path fill="none" stroke="#c08f3d" strokeWidth="1.8" d="M131 384C128 406 127 428 127 448M137 384C142 406 145 428 146 448" />
    <path fill="#b5694f" d="M124 371Q132 368 141 371Q143 376 141 381Q132 384 124 381Q122 376 124 371Z" />
  </g>;
}

/** 기차 침대칸: 창밖 풍경이 천천히 지나가고, 모루는 창가 침대에 앉아 쉰다 */
export default function MoruTrainScene({ sky = DEFAULT_SKY }: { sky?: Sky }) {
  return <Stage view={<Outside sky={sky} moving width={208} height={208} className={styles.viewTrain} />}>{(glow) => <>
    {/* 나무 벽: 창 자리만 비운다 */}
    <path stroke="none" fill="#8c5f47" fillRule="evenodd" d="M-10-10H490V710H-10ZM158 238h164a18 18 0 0 1 18 18v164a18 18 0 0 1-18 18H158a18 18 0 0 1-18-18V256a18 18 0 0 1 18-18Z" />
    <path stroke="none" fill="#7a4f3c" d="M-10-10H490V198H-10Z" />
    <path fill="none" stroke="#754a36" strokeWidth="1.6" opacity=".7" d="M38 206C41 290 36 384 39 474M92 206C90 300 94 392 91 474M388 206C391 296 386 386 389 474M442 206C440 300 444 390 441 474M200 204V226M282 204V226M60 20C62 80 58 140 60 190M180 20C178 90 182 140 180 190M300 20C302 80 298 140 300 190M420 20C418 90 422 140 420 190" />
    <path fill="none" stroke="#5b3a2c" strokeWidth="5" d="M-10 198C120 195 320 201 490 197" />
    <path fill="none" stroke="#b08060" strokeWidth="1.6" opacity=".8" d="M-10 204C120 201 320 207 490 203" />
    {/* 짐 선반: 여행 가방과 말아 둔 담요 (작은 화면에서는 위쪽 줄 뒤에 있다) */}
    <g transform="translate(0 -44)">
      <path fill="#a9623f" d="M252 112Q300 108 348 112Q352 138 348 164H252Q248 138 252 112Z" />
      <path fill="#e9c58a" d="M270 111h10v53h-10zM320 111h10v53h-10z" />
      <path fill="none" d="M286 110Q300 96 314 110" />
      <path fill="#e5b65f" d="M150 134Q190 130 226 134Q234 149 226 164H150Q142 149 150 134Z" />
      <path fill="none" stroke="#c08f3d" strokeWidth="1.8" d="M170 134V164M206 134V164" />
      <path fill="#fff3dc" d="M150 134Q142 149 150 164Q158 149 150 134Z" />
      <path fill="#d9a55e" d="M56 164H424Q428 168 424 172H56Q52 168 56 164Z" />
      <path fill="#8f5f44" d="M84 172v14l14-14ZM396 172v14l-14-14Z" />
    </g>
    {/* 벽에 건 화분 */}
    <path fill="none" strokeWidth="1.5" d="M380 384V402" /><path fill="#c9705a" d="M369 402H391L388 420H372Z" />
    <path fill="#7f9d78" strokeWidth="1.6" d="M373 402C366 396 366 388 372 386C376 390 377 396 376 402ZM384 402C384 394 388 388 394 389C395 395 391 400 387 402Z" />
    {/* 창틀과 창턱 */}
    <path fill="#5f3d2d" fillRule="evenodd" d="M152 228h176a22 22 0 0 1 22 22v176a22 22 0 0 1-22 22H152a22 22 0 0 1-22-22V250a22 22 0 0 1 22-22ZM158 238h164a18 18 0 0 1 18 18v164a18 18 0 0 1-18 18H158a18 18 0 0 1-18-18V256a18 18 0 0 1 18-18Z" />
    <path stroke="none" fill="#ffffff" opacity=".08" d="M150 428L226 240H262L186 438H160Z" /><path stroke="none" fill="#ffffff" opacity=".05" d="M262 438L334 262V330L290 438Z" />
    <path fill="#b9835a" d="M124 446H356Q361 451 356 457H124Q119 451 124 446Z" />
    {/* 커튼과 봉, 줄 전구 */}
    <Curtain /><g transform="translate(480) scale(-1 1)"><Curtain /></g>
    <path fill="#d9a55e" d="M110 225H370Q373 228 370 231H110Q107 228 110 225Z" /><circle cx="108" cy="228" r="5" fill="#d9a55e" /><circle cx="372" cy="228" r="5" fill="#d9a55e" />
    <path fill="none" strokeWidth="1.4" d="M182 236C200 250 222 252 240 247C258 252 280 250 298 236" />
    {[[196, 250], [216, 254], [240, 253], [264, 254], [284, 250]].map(([x, y]) => <Bulb key={x} x={x} y={y} />)}
    {/* 접이식 탁자: 등과 찻잔 */}
    <circle cx="110" cy="440" r="52" fill={glow} stroke="none" />
    <path fill="#b9835a" d="M76 463H152Q157 469 152 475H76Z" /><path fill="#8f5f44" d="M92 475V496L124 475Z" />
    <path fill="#d9a55e" d="M100 463Q110 458 120 463Z" /><path fill="none" strokeWidth="3" d="M110 446V460" />
    <path fill="#ffd27a" d="M96 447L102 424H118L124 447Z" />
    <path fill="#fff3dc" d="M131 448H146V459Q146 463 142 463H135Q131 463 131 459Z" /><path fill="none" d="M146 451Q152 451 152 455Q152 459 146 459" />
    <path fill="none" stroke="#fff6e4" strokeWidth="1.6" opacity=".7" d="M136 443C133 438 139 436 136 430M142 443C139 439 144 437 142 432" />
    {/* 침대: 홑이불, 등 뒤의 베개, 펼쳐 둔 책, 앞쪽에 접어 둔 담요 */}
    <path fill="#f6e8d0" d="M-10 477C110 473 370 480 490 476V710H-10Z" />
    <path fill="#fff6e4" d="M266 448C284 438 336 438 352 446C362 460 362 486 354 498C336 506 284 506 268 498C258 486 258 462 266 448Z" />
    <path fill="none" stroke="#a9c1d6" strokeWidth="2" d="M286 444C282 462 282 482 286 502M310 441C308 462 308 484 310 504M334 443C338 462 338 482 334 502" />
    <path fill="#fffaf0" d="M108 498L138 492L140 508L110 514Z" /><path fill="#fffaf0" d="M138 492L168 498L166 514L140 508Z" />
    <path fill="none" stroke="#c9b9a2" strokeWidth="1.2" d="M114 502L133 498M115 507L134 503M145 498L162 502M145 503L161 507" />
    <path fill="#c9806a" d="M-10 530C60 520 130 534 200 526C270 518 340 534 410 524C440 520 470 526 490 524V710H-10Z" />
    <path stroke="none" fill="#dba08b" d="M-10 532C60 522 130 536 200 528C270 520 340 536 410 526C440 522 470 528 490 526V540C470 542 440 536 410 540C340 550 270 534 200 542C130 550 60 536 -10 546Z" />
    <path fill="none" stroke="#a9624f" strokeWidth="1.6" strokeDasharray="5 6" d="M-10 546C60 536 130 550 200 542C270 534 340 550 410 540C440 536 470 542 490 540" />
    <path fill="none" stroke="#f3dcc0" strokeWidth="1.8" opacity=".55" d="M-10 578C90 568 200 584 300 574C380 566 440 576 490 572M-10 586C90 576 200 592 300 582C380 574 440 584 490 580M-10 660C90 650 200 666 300 656C380 648 440 658 490 654M96 548C100 600 94 650 98 706M104 548C108 600 102 650 106 706M256 544C260 600 254 650 258 706M264 544C268 600 262 650 266 706M410 546C414 600 408 650 412 706M418 546C422 600 416 650 420 706" />
    <path fill="none" stroke="#a9624f" strokeWidth="1.8" opacity=".7" d="M176 552C170 580 180 610 172 640M344 556C350 584 340 612 348 644" />
  </>}</Stage>;
}
