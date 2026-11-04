# AWS · Vercel 연결과 포트

2026-11-04 제공 로그에서 Java는 8080번으로 시작했지만 nginx는 `127.0.0.1:5000`으로 연결해 `Connection refused`가 발생했습니다. 실제 요청도 AWS 직접 `/api/db`와 Vercel `/api/db`에서 같은 nginx 502를 반환했습니다. Vercel 홈페이지는 200이었고 요청은 백엔드까지 전달되고 있었습니다.

## Elastic Beanstalk

해당 환경의 환경 속성을 다음과 같이 맞춥니다.

```dotenv
SERVER_PORT=5000
PORT=5000
```

`SERVER_PORT`는 Java 서버, `PORT`는 Beanstalk 프록시가 전달할 포트입니다. 이번 JAR는 `SERVER_PORT` → `PORT` → `5000` 순서로 결정합니다. 기존 `SERVER_PORT=8080`이 남아 있으면 새 JAR도 8080에서 실행되므로 환경 속성을 함께 수정합니다. [AWS Java SE 프록시 공식 문서](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/java-se-nginx.html)

외부 요청은 nginx의 HTTP 80번으로 들어가므로 5000번 포트를 인터넷에 열 필요는 없습니다. 로컬 개발은 `.env` 또는 실행 인자의 포트(현재 8081)를 사용합니다.

## Vercel

프런트엔드 프로젝트의 Production 환경변수:

```dotenv
BACKEND_ORIGIN=http://sorow-api-prod.eba-tudvgwhm.ap-northeast-2.elasticbeanstalk.com
NEXT_PUBLIC_ASSET_BASE_URL=https://cdn.sorow.co.kr
```

`BACKEND_ORIGIN`에는 `:5000`이나 `/api`를 붙이지 않습니다. `next.config.ts`가 `/api/:path*`를 `${BACKEND_ORIGIN}/api/:path*`로 전달합니다. 브라우저는 `https://www.sorow.co.kr/api/...`를 호출하고 Vercel이 서버 간 요청을 보냅니다. 이 값이나 정적 CDN 환경변수를 변경하면 Vercel을 재배포해야 합니다.

## 확인할 주소

- AWS: `http://sorow-api-prod.eba-tudvgwhm.ap-northeast-2.elasticbeanstalk.com/api/db`
- Vercel: `https://www.sorow.co.kr/api/db`
- 업로드 설정: `https://www.sorow.co.kr/api/upload/presign`

앞의 두 경로가 HTTP 200과 DB 정상 응답을 반환하면 포트·프록시 연결을 함께 확인할 수 있습니다. 업로드 설정의 `configured: true`는 설정 존재 여부이며 실제 쓰기 권한까지 증명하지는 않습니다. 이번에는 새 IAM `s3-uploader`로 서명된 PUT 업로드 200과 CDN 조회 200, 파일 해시 일치까지 별도로 확인했습니다.

사용자가 두 포트를 5000으로 적용한 뒤 2026-11-04 23:09 KST에 다시 확인했습니다. AWS와 Vercel의 `/api/db`, `/api/site`가 모두 HTTP 200을 반환했고, DB `ok: true`, Vercel 사진 업로드 `configured: true`를 확인했습니다.
