/** Confirm these operational details before setting LEGAL_POLICY_APPROVED=true. Server-only configuration. */
export const LEGAL = {
  operator: process.env.LEGAL_OPERATOR_NAME?.trim() || "루체",
  email: process.env.LEGAL_SUPPORT_EMAIL?.trim() || "developer@lucelab.co.kr",
  /** 개인정보 보호책임자 (예: "홍길동 · 대표"). 비어 있으면 처리방침에 운영자 이름을 쓴다 */
  privacyOfficer: process.env.LEGAL_PRIVACY_OFFICER?.trim() || "",
  approved: process.env.LEGAL_POLICY_APPROVED === "true" && [process.env.LEGAL_EFFECTIVE_DATE, process.env.LEGAL_RETENTION_NOTICE, process.env.LEGAL_PROCESSORS_NOTICE].every((value) => Boolean(value?.trim())),
  effectiveDate: process.env.LEGAL_EFFECTIVE_DATE?.trim() || "공개 전 확정 예정",
  retention: process.env.LEGAL_RETENTION_NOTICE?.trim() || "계정을 삭제하면 운영 데이터베이스의 계정 정보가 삭제됩니다. 업로드 파일은 별도 작업으로 삭제합니다. 복구용 백업, 접속 로그와 파일 사본의 보관 기간은 운영 설정을 확인 중입니다.",
  processors: process.env.LEGAL_PROCESSORS_NOTICE?.trim() || "카카오 로그인을 선택하면 계정 인증을 위해 카카오와 정보를 주고받습니다. 선택한 AI 기능의 답변 생성에는 미국 OpenAI의 API를 사용합니다. 웹 호스팅, 데이터베이스, 파일 보관·전송 및 메일 발송 업체의 처리 국가와 보관 조건은 확인 중입니다.",
};
