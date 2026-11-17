"use client";

import { isAndroidApp } from "./platform";

/**
 * 디지털 상품을 웹 결제(토스페이먼츠 등)로 팔아도 되는 화면인지.
 * 안드로이드 앱(Play TWA) 안에서는 Play 결제 정책 때문에 웹 결제를 열지 않는다 (Play Billing·대체 결제 연동 전까지).
 * 결제 진입점(상점 버튼·결제창 열기)을 다시 켤 때는 이 값이 false 면 렌더하지 말고 ANDROID_SALES_NOTE 를 보여 준다.
 * 온기 포인트로 이용권을 받는 것처럼 돈이 오가지 않는 교환은 해당하지 않는다.
 */
export function webPaymentsAllowed(): boolean {
  return !isAndroidApp();
}

export const ANDROID_SALES_NOTE = "앱에서는 결제 상품을 판매하지 않아요.";
