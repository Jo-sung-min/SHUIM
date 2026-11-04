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

## 불꽃놀이 상태 오류와 화면 배포

2026-11-04 운영 사이트의 `/beach`가 불러오는 `/_next/static/immutable/chunks/20ijz56xyglzz.js`를 확인했습니다. 이 배포본의 불꽃놀이 검사는 이벤트에 `id`, `seed`, `startedAt`, `durationMs` 네 필드만 허용합니다. 새 JAR는 종류를 구분하는 `variant`를 추가하므로, 이 응답을 구버전 화면이 받으면 정상 불꽃놀이도 거부합니다. 같은 시점 AWS와 Vercel의 `/api/db`는 모두 HTTP 200, `ok: true`였습니다.

현재 작업본의 `frontend/lib/beach/net.ts`는 기존 네 필드와 새 다섯 필드를 모두 지원합니다. 해결하려면 이 작업본이 포함된 새 프런트엔드를 Vercel Production에 배포해야 합니다. 기존 커밋을 그대로 Redeploy하거나 포트·환경변수만 바꾸는 것으로는 이 코드가 갱신되지 않습니다. Git 연동 배포를 쓴다면 수정본을 배포 브랜치에 반영한 뒤 해당 커밋의 배포 완료를 확인합니다.

배포 후 사이트나 앱을 완전히 닫았다가 다시 열고 방에 재입장합니다. 관리자의 불꽃놀이 버튼에 **축제 / 송이 안녕? / 사랑해** 선택지가 보이면 새 화면입니다. 한 종류를 시작한 뒤 다른 방문자도 입장할 수 있는지 확인합니다. 이미 열려 있던 구버전 화면은 새 배포 후에도 다시 열기 전까지 남아 있을 수 있습니다.
