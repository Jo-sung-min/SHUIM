import { SITE } from "@/lib/site";
import { assetUrl } from "@/lib/assets";
import InlineScript from "./InlineScript";

/**
 * 시작 화면: 소로우 반가면. 앱을 열면 1초 보여 준 뒤 서서히 옅어지며 메인 화면이 드러난다.
 *
 * - 서버가 그린 HTML 에 바로 들어 있어 JS 가 뜨기 전 첫 화면부터 보인다.
 * - 바로 뒤의 인라인 스크립트가 HTML 을 읽는 도중에 실행돼(첫 페인트 전) 상태를 정한다.
 *   · 이 탭에서 이미 봤으면(sessionStorage) 즉시 숨김 → 새로고침·카카오 로그인 복귀 때는 다시 나오지 않는다
 *   · 이미지가 준비되면 "play": CSS 가 1초 기다렸다가 0.9초 동안 옅어진다 (느린 망이면 최대 2.5초만 기다림)
 *   · 애니메이션이 끝나면 "off" 로 완전히 치운다
 * - 상태는 <html> 이 아니라 이 요소의 data-state 에 둔다. 개발 모드 Strict Mode 가 <html> 속성을 되돌리기 때문.
 *   스크립트가 바꾼 DOM 을 React 가 그대로 두도록 suppressHydrationWarning.
 * - JS 가 꺼져 있으면 noscript 스타일로 숨긴다 (영원히 덮고 있지 않게).
 */

const STORAGE_KEY = "sorow:splash-seen";
const SPLASH_SRC = assetUrl("/brand/half-mask-512-v1.png");

/**
 * 1초 기다림 + 0.9초 옅어짐 (globals.css 의 .splash[data-state="play"] 와 같은 값).
 * 백그라운드 탭에서는 animationend 가 오지 않을 수 있어 넉넉히 1초 더 지난 뒤에도 치운다.
 * 페이지가 바빠 애니메이션 시작이 늦어져도 옅어지는 도중에 끊기지 않게 여유를 둔 것 (끝난 뒤엔 이미 안 보인다).
 */
const HOLD_MS = 1000;
const FADE_MS = 900;
const CLEANUP_MARGIN_MS = 1000;

const SCRIPT = `(function(){var s=document.getElementById("sorow-splash");if(!s)return;function off(){s.setAttribute("data-state","off")}try{if(sessionStorage.getItem("${STORAGE_KEY}")){off();return}sessionStorage.setItem("${STORAGE_KEY}","1")}catch(e){}var done=false;function play(){if(done)return;done=true;s.setAttribute("data-state","play");setTimeout(off,${HOLD_MS + FADE_MS + CLEANUP_MARGIN_MS})}s.addEventListener("animationend",function(e){if(e.target===s)off()});var i=s.querySelector("img");if(i&&!i.complete){i.addEventListener("load",play);i.addEventListener("error",play);setTimeout(play,2500)}else play()})()`;

export default function Splash() {
  return (
    <>
      <div id="sorow-splash" className="splash" data-state="hold" aria-hidden="true" style={{ backgroundColor: SITE.splashColor }} suppressHydrationWarning>
        {/* eslint-disable-next-line @next/next/no-img-element -- 첫 페인트에 바로 떠야 해서 next/image 의 지연 로딩·래퍼를 쓰지 않는다 */}
        <img src={SPLASH_SRC} alt="" width={512} height={512} fetchPriority="high" decoding="async" draggable={false} />
      </div>
      <InlineScript html={SCRIPT} />
      <noscript>
        <style>{`.splash{display:none}`}</style>
      </noscript>
    </>
  );
}
