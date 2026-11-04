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
- 정적 파일의 캐시는 하루이며 파일 갱신 시 해당 경로만 무효화합니다. PWA 아이콘·매니페스트·서비스 워커 주소는 앱 출처에 유지합니다.

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

스크립트는 `frontend/public`의 이미지와 GLB만 업로드합니다. 소스 코드, 환경변수, 모델 제작 메모 JSON은 올리지 않습니다. 원격 파일 삭제와 public-read ACL 변경은 하지 않습니다. 전송 결과는 로컬 `frontend/out/cdn-assets-report.json`에 저장됩니다. 새 업로드 직후 캐시 갱신 중 검증이 실패하면 잠시 후 `--verify`를 다시 실행합니다.

## 로컬 파일로 돌아가기

`NEXT_PUBLIC_ASSET_BASE_URL`을 비우고 다시 빌드합니다. public 파일도 함께 유지하므로 CDN 설정이 없는 개발 환경에서는 기존 로컬 경로를 사용합니다. CDN이 설정된 상태에서 네트워크가 끊기면 자동으로 로컬 파일을 재시도하는 구성은 아닙니다.
