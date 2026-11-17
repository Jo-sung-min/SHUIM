import type { Metadata } from "next";
import Link from "next/link";
import LegalLayout from "@/components/LegalLayout";
import { LEGAL } from "@/lib/legal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "아동 안전 기준", alternates: { canonical: "/child-safety" } };

/**
 * Google Play 아동 안전 표준(CSAE) 정책이 요구하는 공개 기준 페이지.
 * Play Console 의 '아동 안전 표준' 선언에 이 주소(https://www.sorow.co.kr/child-safety)를 적는다.
 * 앱 이름(소로우)과 아동 성적 학대·착취 금지가 페이지에 분명히 드러나야 한다.
 */
export default function ChildSafetyPage() {
  return <LegalLayout title="아동 안전 기준">
    <section><h2>소로우는 아동 성적 학대·착취(CSAE)를 금지합니다</h2><p>소로우(SOROW)는 아동을 성적으로 대상화하거나 착취하는 어떤 콘텐츠와 행동도 허용하지 않습니다. 글·댓글·피드·쪽지·소로우(모임)·3D 공간의 방명록과 소원을 포함한 서비스의 모든 곳에 적용됩니다.</p>
      <ul>
        <li>아동 성학대물(CSAM)이나 아동을 성적으로 묘사·암시하는 이미지·영상·글</li>
        <li>아동에게 성적인 대화를 걸거나 만남을 꾀는 행위(그루밍), 성적 갈취·협박</li>
        <li>아동 성매매·인신매매를 알선하거나 홍보하는 내용</li>
        <li>위 내용을 찾거나 나누는 방법을 알려 주는 내용</li>
      </ul>
    </section>
    <section><h2>이용 연령</h2><p>소로우는 만 14세 이상만 가입할 수 있습니다. 만 14세 미만으로 확인된 계정은 이용을 제한하거나 삭제합니다.</p></section>
    <section><h2>앱 안에서 신고하기</h2><p>게시글·댓글·피드의 더보기 메뉴, 사용자 프로필과 쪽지 화면, 소로우(모임) 화면, 3D 공간에서 사람이나 방명록·소원을 고른 화면에서 바로 신고하고 차단할 수 있습니다. 앱 밖에서는 <a href={`mailto:${LEGAL.email}?subject=${encodeURIComponent("소로우 아동 안전 신고")}`}>{LEGAL.email}</a> 로 알려 주세요.</p>
      <p>아동 성학대물로 의심되는 내용은 내려받거나 다른 곳에 다시 보내지 말고, 해당 화면의 위치와 짧은 설명만 신고해 주세요.</p>
    </section>
    <section><h2>운영자의 조치</h2><p>신고나 운영 중 발견된 아동 안전 침해는 다른 신고보다 먼저 확인합니다. 확인되면 콘텐츠를 즉시 비공개·삭제하고 관련 계정을 정지하며, 아동 성학대물은 관련 법령에 따라 수사기관 등 관계 기관에 신고하고 수사에 협조합니다. 이를 위해 필요한 최소한의 기록은 법령이 허용하는 범위에서 보관할 수 있습니다.</p>
      <p>긴급한 위험이 있으면 경찰(112)에 먼저 신고해 주세요. 불법 촬영물·성착취물은 방송통신심의위원회(국번 없이 1377)에도 신고할 수 있습니다.</p>
    </section>
    {/* TODO(운영자 확인): 아동 안전 담당자(이름·직책)와 전용 연락처가 정해지면 여기에 적는다. Play Console 의 아동 안전 담당자 연락처와 같게 맞춘다 */}
    <section><h2>아동 안전 담당</h2><p>아동 안전 문의와 관계 기관 연락은 {LEGAL.operator}가 받습니다: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a></p>
      <p>함께 보기: <Link href="/terms#community">이용약관·커뮤니티 기준</Link>, <Link href="/privacy">개인정보 처리방침</Link></p>
    </section>
  </LegalLayout>;
}
