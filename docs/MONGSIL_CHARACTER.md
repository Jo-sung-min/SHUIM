# 몽실 — 2D 그림을 3D 공간에서 만나는 캐릭터

사용자가 보낸 17초 참고 영상처럼 2D 그림을 3D 공간에서 이동시키며, 옆에서도 몸통이 토실하게 보이는 방향별 캐릭터를 추가했다. 기존 남자·여자 선택은 그대로 유지한다.

## 사용

- 맵 메뉴 → 내 캐릭터 → **몽실**.
- `/character-preview`에서 정면·측면·뒷면과 걷기·쉬기·인사를 확인할 수 있다. 화면을 드래그하거나 천천히 둘러보기를 켜면 회전한다.
- 선택 ID `mongsil`, room skin `6`. 계정별 기존 저장 방식과 서버 입장·이동·재접속 경로를 사용한다.

## 그림과 렌더링

- 원본: `output/imagegen/mongsil/turnaround-source-v1.png`, `sides-source-v1.png`.
- 정확한 이미지 생성 프롬프트와 도구 모드: `output/imagegen/mongsil/README.md`.
- 앞·뒤·왼쪽·오른쪽 512 × 672 WebP 네 장은 총 210,076 bytes. 원화의 알파를 유지한다.
- `frontend/scripts/pack-mongsil-art.mjs`는 원화 네 뷰를 같은 높이로 정렬하고 WebP로 패키징한다.
- 런타임 경로는 `/characters/mongsil/`. 이미지와 원화는 Git에 포함할 수 있으며 S3 업로드나 CDN 설정이 필요하지 않다.
- GLB 종류를 늘리지 않고 별도 `PaperAvatarModels` 풀이 방향별 그림과 기하를 공유한다. 보는 방향과 캐릭터 이동 방향을 비교해 앞·옆·뒤 그림을 선택하며, 수직 그림 면은 카메라를 향해 몸통 폭을 유지한다. 기존 캐릭터 로딩·온천 가운은 유지하며 몽실은 온천에서도 자체 모습을 유지한다.

## 검증

관련 검사: `beach-paper-avatar`, `beach-appearance`, `beach-avatar`, `beach-onsen-engine`, `assets`, `service-availability`; 서버 `BeachCharacterMigrationTest`의 맵별 입장·이동·재접속 시나리오.
