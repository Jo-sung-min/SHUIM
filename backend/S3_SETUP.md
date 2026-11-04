# 소로우 사진 업로드와 CDN 설정

백엔드는 첨부 사진을 `sorow-aws-s3` 버킷의 `upload/` 아래에 저장하도록 서명하고, 게시글에는 `https://cdn.sorow.co.kr` 주소를 반환한다. 바닷가 이미지·GLB 등 앱 공용 에셋 배포와는 별개 경로다.

## 환경변수

로컬은 `backend/.env`, 운영은 백엔드 실행 환경의 환경변수에 설정한다. 애플리케이션은 `.env` 또는 `backend/.env`를 선택적으로 읽는다. 프런트엔드 공개 환경변수에는 AWS 자격증명을 넣지 않는다.

```dotenv
AWS_REGION=ap-northeast-2
S3_BUCKET=sorow-aws-s3
S3_PREFIX=upload
CDN_BASE_URL=https://cdn.sorow.co.kr
```

| 이름 | 의미 |
| --- | --- |
| `AWS_REGION` | 버킷이 있는 실제 AWS 리전. 이 버킷은 서울 `ap-northeast-2`다. |
| `S3_BUCKET` | 버킷 이름. `arn:aws:s3:::sorow-aws-s3` 전체 ARN을 넣지 않는다. |
| `S3_PREFIX` | 사용자 사진 키의 시작 경로. 현재 `upload`이며 결과 키는 `upload/YYYY/MM/DD/사용자ID-무작위값.webp` 형태다. |
| `CDN_BASE_URL` | 버킷 루트를 제공하는 CDN 주소. `/upload`, `/beach` 또는 다른 에셋 접두사를 붙이지 않는다. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | 명시적 키를 사용할 때 함께 설정하는 한 쌍. |
| `AWS_SESSION_TOKEN` | 명시적으로 입력한 자격증명이 STS 임시 키일 때 함께 필요한 세션 토큰. 일반 장기 키에는 비워 둔다. |

현재 설정된 명시적 키를 계속 사용할 수 있다. IAM 역할로 전환할 때는 자격증명 세 변수를 모두 비우고, Elastic Beanstalk의 EC2 인스턴스 프로필 등에 업로드 권한을 부여한다. 서버는 AWS SDK 기본 자격증명 체인을 사용한다. 키가 일부만 입력되어 있으면 다른 계정의 자격증명으로 자동 전환하지 않고 업로드를 비활성화한다. [AWS Java SDK 기본 자격증명 체인](https://docs.aws.amazon.com/sdk-for-java/latest/developer-guide/credentials-chain.html)

로컬 기본 체인은 환경변수나 AWS 공유 프로필도 확인한다. SSO/AssumeRole 프로필은 사용하는 자격증명 방식에 맞는 SDK 모듈과 로그인이 필요할 수 있다. 운영 인스턴스 역할 사용에는 정적 비밀키를 복사할 필요가 없다.

## 필요한 저장소 권한

사용자 사진을 다루는 백엔드 역할/사용자는 다음 객체 범위에 `s3:PutObject`, `s3:DeleteObject`가 필요하다. 공개 앱 에셋을 배포하는 업로더의 권한은 별도로 정한다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::sorow-aws-s3/upload/*"
    }
  ]
}
```

CDN은 S3 REST 원본을 읽어야 한다. 원본 경로를 비워 버킷 루트가 `/`와 대응하도록 연결하고, CloudFront OAC로 해당 배포의 읽기만 허용한다. 이 구성은 버킷을 직접 공개하지 않아도 CDN에서 이미지를 읽을 수 있게 한다. [CloudFront의 S3 원본 접근 제어](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)

## 브라우저 직접 업로드

사진 업로드 요청은 CDN이 아니라 서명된 S3 주소로 `PUT`한다. 그러므로 S3 CORS에 실제 웹앱 출처와 `PUT`, `Content-Type`, `Cache-Control` 등 요청 헤더가 허용되어야 한다. 기존 공용 에셋의 `GET`/`HEAD` 규칙은 유지하고 업로드 규칙을 추가한다. 개발 출처는 필요한 개발 환경에만 추가한다. [S3 CORS 설정](https://docs.aws.amazon.com/AmazonS3/latest/userguide/enabling-cors-examples.html)

운영 웹 출처는 `https://www.sorow.co.kr`이고, 실제로 쓰는 다른 출처가 있다면 함께 허용한다. URL 끝의 `/`는 origin 값에 넣지 않는다. `APP_ALLOWED_ORIGINS`는 백엔드 API의 허용 출처이며, S3 버킷 CORS 설정을 대신하지 않는다.

업로드 흐름:

1. 로그인한 사용자가 `POST /api/upload/presign`으로 `{contentType, size}`를 보낸다.
2. 서버는 약관 동의와 파일 형식·크기(최대 5MB)를 확인한 뒤 60초짜리 `uploadUrl`, `publicUrl`, `headers`를 돌려준다.
3. 클라이언트는 반환된 `headers`와 원본 파일을 사용해 `uploadUrl`에 `PUT`한다.
4. 성공하면 `publicUrl`을 게시글 등에 저장한다. 예: `https://cdn.sorow.co.kr/upload/2026/11/04/…webp`.

사용자 사진은 변경·삭제가 가능하므로 현재 응답의 `Cache-Control`은 `public, max-age=300`이다. 해시/버전 경로의 공용 3D 에셋용 장기 캐시와 구분한다.

## 확인 방법

`GET /api/upload/presign`의 `configured: true`는 저장소 주소와 자격증명 선택 방식이 구성되었다는 뜻이다. 실제 IAM 권한이나 CDN 연결까지 확인하는 네트워크 상태 점검은 아니다. 실제 작은 사진 한 장을 앱에서 첨부해 S3 업로드와 CDN 표시를 함께 확인한다.

- 서명 발급이 503이면 실행 중인 서버의 자격증명 공급자를 확인한다. 클라이언트에는 자격증명 진단 내용을 노출하지 않는다.
- S3 `PUT`이 403이면 서명 만료, 실행 역할의 객체 쓰기 권한, 서명 당시의 파일 형식·크기·헤더를 확인한다.
- 브라우저 CORS 오류는 S3의 허용 출처·메서드·헤더를 확인한다.
- 업로드는 되지만 CDN 이미지가 403/404이면 OAC 읽기 정책, 원본 경로, 요청 객체 키와 캐시를 확인한다.

`backend/.env.example`은 공개 예시이고 실제 비밀값은 저장하지 않는다. 환경변수를 바꾼 뒤에는 백엔드를 재시작해야 적용된다.
