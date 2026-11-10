/// <reference lib="webworker" />
/** 캐릭터 메싱(1~2초)을 메인 스레드 밖에서: 로딩 중에도 화면이 멈추지 않는다 */
import { buildChibiData, chibiTransferables } from "./build";

self.onmessage = () => {
  const data = buildChibiData();
  (self as unknown as Worker).postMessage(data, chibiTransferables(data));
};
