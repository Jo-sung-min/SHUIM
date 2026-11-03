# 소로우 기본 캐릭터 원본

승인된 남성·여성 캐릭터를 실제 바닷가에 사용하는 픽셀 원본입니다. `male`은 아틀라스 0행, `female`은 1행입니다. 정면은 사용자가 승인한 72×104px 이미지와 동일합니다.

## 편집 파일

- `{male,female}/front.aseprite`: 정면 의상 편집용. 실제 픽셀이 있는 `hair_back`, `body_base`, `bottom`, `shoes`, `top`, `hands_front`, `face`, `hair_front` 레이어.
- `{male,female}/layers/*.png`: 승인 당시의 개별 투명 레이어 사본.
- `{male,female}/turns-source.png`: 정면과 맞춰 생성한 왼쪽·뒤쪽 원본. 왼쪽 절반이 옆모습, 오른쪽 절반이 뒷모습입니다. 배경의 색 데이터는 투명하며 가져올 때 알파를 정리합니다.
- `{male,female}/{front,left,back,right}.png`: 투명한 네 방향 기본 포즈, 72×104px. 발바닥은 Y=101입니다.
- `{male,female}/animated.aseprite`: 앞·뒤·왼·오른 방향별 서있기 4프레임 + 걷기 6프레임, 총 40프레임. 원본 픽셀을 움직여 만든 렌더링 결과이며, 의상 편집 원본은 `front.aseprite`입니다.

## 다시 만들기

`frontend`에서 실행합니다.

```sh
node scripts/gen-beach-character.mjs
node scripts/gen-beach-sprites.mjs
```

Aseprite가 PATH에 없다면 `ASEPRITE` 환경변수로 실행 파일 경로를 지정합니다. 정면 `.aseprite`를 먼저 PNG로 내보내므로 원본 의상 수정이 다음 생성에 반영됩니다. 개별 `layers/*.png`는 승인 시점의 사본이며 자동 갱신하지 않습니다.

출력은 `public/beach/chars-v2.png`(현재 앱), `chars.png`(호환 사본), `chars.json`, `lib/beach/atlas.ts`입니다. 전체 크기는 2880×208px입니다. `directions-preview.png`, `male-walk.gif`, `female-walk.gif`로 확인할 수 있습니다.

## 움직임과 이후 의상 작업

정면 서있기 0번은 승인 이미지 그대로입니다. 다른 프레임은 1px 호흡, 짧은 눈 깜빡임, 1~2px 팔 움직임·발 들기로 만듭니다. 옆모습에서는 가려졌던 다리를 원본 픽셀에서 복제해 걷는 동안 보이게 합니다. 오른쪽은 왼쪽의 반전이므로 비대칭 장식이 생기면 별도 오른쪽 그림이 필요합니다.

기본 몸통은 상의·하의·신발 아래에 단순한 크림색 바탕을 포함합니다. 다른 옷에서 새로 드러나는 부분은 추가로 다듬어야 합니다. 남녀의 어깨·허리 위치는 달라 각각의 원본에 맞춰 의상을 제작합니다. 현재 실행 화면은 합쳐진 의상을 사용합니다. 앱 내 옷 갈아입기 기능이나 방향별 의상 레이어는 아직 구현하지 않았습니다.
