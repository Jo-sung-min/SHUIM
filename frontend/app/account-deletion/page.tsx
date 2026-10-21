import type { Metadata } from "next";
import LegalLayout from "@/components/LegalLayout";
import DeleteAccount from "@/components/DeleteAccount";
import { LEGAL } from "@/lib/legal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "계정 및 데이터 삭제", alternates: { canonical: "/account-deletion" } };

export default function AccountDeletionPage() {
  return <LegalLayout title="계정 및 데이터 삭제">
    <p>소로우(SOROW) 계정과 연결된 데이터를 여기서 삭제할 수 있습니다. 앱을 삭제한 뒤에도 웹 브라우저에서 이 페이지를 열어 진행할 수 있습니다.</p>
    <section><h2>삭제되는 내용</h2><p>계정·프로필·로그인 세션, 기록·메모·목표·일정·사용자 카테고리, 작성한 게시물·댓글과 연결된 활동, 참여한 1:1 대화 등이 삭제됩니다. 상대방도 해당 대화를 볼 수 없게 됩니다. 업로드한 사진은 파일 삭제 처리를 시도하며 실패한 경우 재시도 대상으로 남습니다.</p><p>카카오 계정 자체는 삭제되지 않습니다. 다른 기기·브라우저에 남은 기기 저장소나 다른 사람이 별도로 저장한 사본은 원격으로 지울 수 없습니다. 해당 기기의 사이트 데이터도 정리해 주세요.</p><p>{LEGAL.retention}</p></section>
    <section><h2>삭제 진행</h2><DeleteAccount /></section>
    <section><h2>로그인이 어렵거나 일부 정보만 삭제하려는 경우</h2><p><a href={`mailto:${LEGAL.email}?subject=${encodeURIComponent("소로우 계정 및 데이터 삭제 요청")}`}>이메일로 삭제 요청하기</a>. 가입 이메일 또는 식별 가능한 최소 정보와 삭제할 범위를 알려 주세요. 비밀번호는 보내지 마세요. 운영자가 본인 확인 후 처리합니다.</p><p>계정을 유지하면서 개인 기록만 지우려면 나 화면의 ‘기록 전체 삭제’를 이용하세요. 계정과 별도로 작성한 게스트 기록이 남아 있다면 로그아웃 상태에서 기록 삭제를 하거나 브라우저의 사이트 데이터를 정리해 주세요.</p></section>
  </LegalLayout>;
}
