/** Confirm these operational details before setting LEGAL_POLICY_APPROVED=true. Server-only configuration. */
export const LEGAL = {
  operator: process.env.LEGAL_OPERATOR_NAME?.trim() || "루체",
  email: process.env.LEGAL_SUPPORT_EMAIL?.trim() || "developer@lucelab.co.kr",
  /** 개인정보 보호책임자 (예: "홍길동 · 대표"). 비어 있으면 처리방침에 운영자 이름을 쓴다 */
  privacyOfficer: process.env.LEGAL_PRIVACY_OFFICER?.trim() || "",
  approved: process.env.LEGAL_POLICY_APPROVED === "true" && [process.env.LEGAL_EFFECTIVE_DATE, process.env.LEGAL_RETENTION_NOTICE, process.env.LEGAL_PROCESSORS_NOTICE].every((value) => Boolean(value?.trim())),
  effectiveDate: process.env.LEGAL_EFFECTIVE_DATE?.trim() || "공개 전 확정 예정",
  retention: process.env.LEGAL_RETENTION_NOTICE?.trim() || "복구용 백업, 접속 로그, 파일의 이전 버전 및 CDN 캐시에는 별도 보관 설정이 적용될 수 있습니다. 해당 사본의 보관 기간은 운영 설정을 확인 중입니다.",
  processors: process.env.LEGAL_PROCESSORS_NOTICE?.trim() || "소로우는 웹 서비스 제공에 Vercel, 계정과 기록의 데이터베이스 운영에 Supabase, 업로드 파일 보관에 Amazon Web Services의 S3를 사용합니다. 카카오 로그인을 선택하면 카카오가 인증을 처리하고, AI 기능에 동의하고 실행하면 미국 OpenAI가 답변 생성에 필요한 기록을 처리합니다. 업체별 보관 조건과 메일 발송에 관한 운영 설정을 확인 중입니다.",
};
