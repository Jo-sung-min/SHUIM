export const LEGAL = {
  operator: process.env.LEGAL_OPERATOR_NAME?.trim() || "루체",
  email: process.env.LEGAL_SUPPORT_EMAIL?.trim() || "developer@lucelab.co.kr",
  /** 개인정보 보호책임자 (예: "홍길동 · 대표"). 비어 있으면 처리방침에 운영자 이름을 쓴다 */
  privacyOfficer: process.env.LEGAL_PRIVACY_OFFICER?.trim() || "",
  // 이용약관과 아동 안전 기준의 공개 상태. 개인정보 처리방침은 문서 자체에 시행일을 명시한다.
  approved: process.env.LEGAL_POLICY_APPROVED === "true" && [process.env.LEGAL_EFFECTIVE_DATE, process.env.LEGAL_RETENTION_NOTICE, process.env.LEGAL_PROCESSORS_NOTICE].every((value) => Boolean(value?.trim())),
  effectiveDate: process.env.LEGAL_EFFECTIVE_DATE?.trim() || "공개 전 확정 예정",
};
