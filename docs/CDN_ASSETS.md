# 소로우 이미지·3D 파일 CDN

정적 이미지와 3D 모델은 `sorow-aws-s3` 버킷의 기존 public 폴더 경로 그대로 저장합니다. 예를 들어 `frontend/public/beach/models/tripo-male-rigged-mobile-v3.glb`의 주소는 `https://cdn.sorow.co.kr/beach/models/tripo-male-rigged-mobile-v3.glb`입니다. 사용자 첨부 사진은 별도 `upload/` 경로에 저장됩니다.

## 넣을 환경변수

프런트엔드: Vercel 프로젝트의 Environment Variables에 아래 값을 추가한 뒤 재배포합니다. 로컬은 `frontend/.env.local`, 미니앱은 `.env.ait`를 사용합니다. `NEXT_PUBLIC_` 값은 빌드할 때 포함되므로 환경변수만 바꾸면 기존 배포 화면은 바뀌지 않습니다.

```dotenv
NEXT_PUBLIC_ASSET_BASE_URL=https://cdn.sorow.co.kr
```

백엔드: Elastic Beanstalk 환경 속성 또는 로컬 `backend/.env`에 넣습니다. 현재 등록된 액세스 키는 유지하고 값을 저장소에 커밋하지 않습니다.

```dotenv
AWS_REGION=ap-northeast-2
S3_BUCKET=sorow-aws-s3
S3_PREFIX=upload
CDN_BASE_URL=https://cdn.sorow.co.kr
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
# 임시 자격증명일 때만 입력
AWS_SESSION_TOKEN=
```

AWS 서버에 S3 쓰기 권한이 있는 IAM 역할을 연결한 경우 키 세 개는 비워도 됩니다. 필요한 권한과 자세한 백엔드 설명은 [S3 설정](../backend/S3_SETUP.md)에 있습니다. AWS 비밀 키에는 `NEXT_PUBLIC_` 접두사를 붙이지 않습니다.

## 연결 구성

- 리전: `ap-northeast-2`
- CDN: `https://cdn.sorow.co.kr`
- CloudFront 배포: `E9FJAUSU5FRXM`, 원본 경로는 빈 값
- S3 공개 차단은 유지하고 CloudFront OAC를 통한 읽기만 허용합니다.
- 공개 이미지 GET/HEAD에는 일관된 `Access-Control-Allow-Origin: *`가 필요합니다. 웹·앱의 WebGL 텍스처와 사진 캡처가 이를 사용합니다. CORS 설정은 S3 객체에 대한 읽기·쓰기 권한 자체를 부여하지 않습니다.
- 현재 S3 GET/HEAD CORS와 CloudFront의 기존 SimpleCORS 정책을 함께 사용합니다. 출처별 응답을 같은 캐시에 섞지 않도록 읽기 CORS를 통일했습니다.
- 사용자 사진의 서명된 PUT 업로드는 별도 규칙으로 `https://www.sorow.co.kr`, `https://sorow.co.kr`, 개발 주소 `http://127.0.0.1:3000`, `http://localhost:3000`, `http://localhost:5173`에서 허용했습니다. 다른 앱 출처가 추가되면 이 목록에 넣습니다.
- 정적 파일의 캐시는 하루이며 파일 갱신 시 해당 경로만 무효화합니다. PWA 아이콘도 CDN에서 읽고, 매니페스트·서비스 워커는 앱 출처에 유지합니다.

[AWS S3 CORS 문서](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ManageCorsUsing.html), [CloudFront 응답 헤더 정책](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-response-headers-policies.html)

## 파일을 추가하거나 교체한 뒤

프로젝트 최상위 폴더에서 실행합니다. Python과 `botocore`가 필요합니다(Elastic Beanstalk CLI를 설치한 현재 환경에는 이미 있습니다).

```powershell
# 목록과 용량 확인만 수행
python scripts/sync-public-assets.py
# 변경된 정적 파일만 업로드하고 CDN 캐시 갱신
python scripts/sync-public-assets.py --apply --distribution-id E9FJAUSU5FRXM
# CDN에서 전 파일의 실제 내용·형식·CORS 확인
python scripts/sync-public-assets.py --verify
```

자격증명은 명시한 `--profile`, 현재 프로세스의 AWS 환경변수, 로컬 `backend/.env` 또는 기본 AWS 자격증명 체인을 사용합니다. 오래된 `eb-cli` 프로필 대신 현재 `.env`의 키를 사용하려면 `--profile`을 생략합니다. 키 값은 출력하지 않습니다.

새 이미지·GLB는 잠시 `frontend/public`의 원하는 경로에 놓고 스크립트를 실행합니다. 소스 코드, 환경변수, 모델 제작 메모 JSON은 올리지 않습니다. 원격 파일 삭제와 public-read ACL 변경은 하지 않습니다. 전송 결과는 로컬 `frontend/out/cdn-assets-report.json`에 저장됩니다. 새 업로드 직후 캐시 갱신 중 검증이 실패하면 잠시 후 `--verify`를 다시 실행합니다. 검증 후 원본은 로컬에서 제거하고 변경된 `frontend/public-assets.manifest.json`만 커밋합니다.

## 로컬·Git 용량 정리

CDN에서 SHA256·파일 크기·형식·CORS 검증을 끝낸 49개 이미지와 GLB(20,146,600바이트)를 로컬 public 폴더에서 제거했습니다. 추적되던 파일은 Git 삭제 변경으로 반영하고, public의 이미지·GLB 확장자는 `.gitignore`에 추가했습니다. 기존 커밋 기록은 다시 쓰지 않았습니다.

주소·크기·해시는 `frontend/public-assets.manifest.json`에 남깁니다. 바이너리 검증 테스트는 필요한 파일을 CDN에서 메모리로만 읽고 해시를 검사하며 로컬 파일을 만들지 않습니다. 소스 제작 메모 JSON과 아직 CDN으로 올리지 않은 Aseprite 제작 원본은 삭제 범위에 포함하지 않았습니다.

환경변수가 비어 있거나 잘못되어도 기본 주소 `https://cdn.sorow.co.kr`를 사용합니다. 로컬 원본이 없으므로 앱 이미지와 3D 장면에는 CDN 네트워크 연결이 필요합니다.

## 온천복 캐시 복구 (2026-11-05)

기존 남녀 온천복 `v1.glb`의 일부 CloudFront 캐시 응답에서 `Access-Control-Allow-Origin`이 빠져, 실제 Chrome이 모델을 차단하는 현상을 재현했습니다. 단순 GET 확인으로는 드러나지 않았고 브라우저의 압축·출처 헤더를 포함한 요청에서 확인했습니다. 현재 업로드용 IAM에는 CloudFront 무효화 권한이 없어 같은 모델을 `tripo-male-onsen-mobile-v2.glb`, `tripo-female-onsen-mobile-v2.glb`로 발행했습니다. 원본 크기·SHA256·모델 내용은 동일하며, 이전 주소는 기존 배포용으로 유지합니다. manifest에는 두 버전을 모두 기록합니다.

새 주소는 로컬 및 운영 사이트 출처에서 실제 브라우저 GET 200, CORS 허용, 원본 바이트 일치를 확인했습니다. 런타임은 v2를 사용하고, 일시적인 로딩 실패에도 기존 캐릭터를 유지하며 5초 뒤 다시 시도합니다. 이 주소 변경은 프런트엔드를 새로 배포해야 운영 화면에 적용됩니다.


## 정원·구름 온천 이미지 소스 보관 (2026-11-09)

사용자 요청에 따라 `frontend/public/garden/art/*.webp`와 `frontend/public/cloudspa/art/*.webp`의 이미지 소스 15개는 GitHub 저장소에도 포함합니다. 기존에 검증한 CDN 주소와 파일 해시는 유지하며, 이 병합 작업에서는 S3에 추가 업로드하지 않습니다. 이 두 폴더의 WebP만 `.gitignore` 예외로 관리하므로 다른 공개 미디어의 기존 관리 방식은 유지됩니다.


### 바이칼 이미지 — CDN 이전 (2026-11-09)

실행용 WebP 4개(1254px/모바일 768px)를 S3 `baikal/art/`에 올리고 CDN에서 SHA256·형식·CORS를 검증했습니다. 앱은 `/baikal/art/` 경로를 CDN에서 읽고, manifest에 4개를 기록했습니다. 해당 WebP는 Git 추적에서 빼고 `.gitignore` 예외도 지웠습니다. 생성 원본 PNG는 `output/imagegen/baikal/`에, 생성 프롬프트는 `output/imagegen/baikal-assets.md`에 있습니다.

`scripts/sync-public-assets.py --apply`는 `frontend/public`의 로컬 파일을 모두 대상으로 삼습니다. `characters/mongsil/*.webp`와 `audio/onsen-water-v1.mp3`는 앱이 직접 제공하는 파일이라 manifest에 없고 CDN에도 올리지 않았으므로, 전체 실행 시 함께 올라가지 않게 주의합니다.
