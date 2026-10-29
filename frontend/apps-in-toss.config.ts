import { defineConfig } from "@apps-in-toss/web-framework/config";

/**
 * 앱인토스 미니앱 설정. npm run build:ait 가 정적 번들(out-ait/)을 만든 뒤 ait build 가 이 설정으로 <appName>.ait 를 묶는다.
 * appName·브랜드 색은 앱인토스 콘솔에 등록한 값과 같아야 올릴 수 있다 (다르면 업로드가 막힌다).
 * 뒤로가기·홈은 토스 내비게이션 바가 맡고 (화면의 자체 ‹ 버튼은 숨긴다), 당겨서 새로고침·튕김은 끈다.
 */
export default defineConfig({
  appName: process.env.NEXT_PUBLIC_AIT_APP_NAME || "sorow",
  brand: { primaryColor: "#6d5bd0" },
  permissions: [],
  navigationBar: { withBackButton: true, withHomeButton: true },
  webView: { pullToRefreshEnabled: false, bounces: false, overScrollMode: "never" },
  webBundleDir: "out-ait",
});
