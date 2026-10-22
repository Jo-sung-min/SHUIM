/** Confirm these operational details before setting LEGAL_POLICY_APPROVED=true. Server-only configuration. */
export const LEGAL = {
  operator: process.env.LEGAL_OPERATOR_NAME?.trim() || "루체",
  email: process.env.LEGAL_SUPPORT_EMAIL?.trim() || "developer@lucelab.co.kr",
  approved: process.env.LEGAL_POLICY_APPROVED === "true" && [process.env.LEGAL_EFFECTIVE_DATE, process.env.LEGAL_RETENTION_NOTICE, process.env.LEGAL_PROCESSORS_NOTICE].every((value) => Boolean(value?.trim())),
  effectiveDate: process.env.LEGAL_EFFECTIVE_DATE?.trim() || "공개 전 확정 예정",
  retention: process.env.LEGAL_RETENTION_NOTICE?.trim() || "계정 삭제 후에도 복구용 사본, 접속 기록, 사진 보관·전송 서비스에 일부 정보가 남을 수 있습니다. 각 정보의 보관 기간과 완전히 삭제되는 시점은 정식 안내를 공개하기 전에 확정합니다.",
  processors: process.env.LEGAL_PROCESSORS_NOTICE?.trim() || "서비스 운영, 기록·사진 보관, AI 처리를 맡는 업체의 이름과 정보를 처리하는 국가, 보관 기간, 해외 이전에 관한 상세 내용은 정식 안내를 공개하기 전에 확정해 이곳에 안내합니다.",
};
