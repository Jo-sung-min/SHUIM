/** Confirm these operational details before setting LEGAL_POLICY_APPROVED=true. Server-only configuration. */
export const LEGAL = {
  operator: process.env.LEGAL_OPERATOR_NAME?.trim() || "루체",
  email: process.env.LEGAL_SUPPORT_EMAIL?.trim() || "developer@lucelab.co.kr",
  approved: process.env.LEGAL_POLICY_APPROVED === "true" && [process.env.LEGAL_EFFECTIVE_DATE, process.env.LEGAL_RETENTION_NOTICE, process.env.LEGAL_PROCESSORS_NOTICE].every((value) => Boolean(value?.trim())),
  effectiveDate: process.env.LEGAL_EFFECTIVE_DATE?.trim() || "공개 전 확정 예정",
  retention: process.env.LEGAL_RETENTION_NOTICE?.trim() || "운영 DB에서 삭제한 후 백업·로그·파일 저장소·CDN에 남을 수 있는 기간과 삭제 처리 기한은 공개 전 확정하여 안내합니다.",
  processors: process.env.LEGAL_PROCESSORS_NOTICE?.trim() || "호스팅, 데이터베이스, 사진 저장소와 AI 처리 제공자의 실제 계약 주체·처리 국가·보유기간 및 국외 이전 관련 안내는 공개 전 확정하여 이 항목에 기재합니다.",
};
