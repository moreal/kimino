# Kimino

ActivityPub **Client-to-Server (C2S)** API로 타임라인을 읽고 공개 글과 답글을
작성하는 Solid 2 브라우저 클라이언트입니다. 인증된 actor의 inbox/outbox를
페이지 순회하고, 브라우저에서 Activity를 평가해 현재 게시글 상태를 만듭니다.
기록이 많으면 100페이지마다 이어 읽기를 선택할 수 있습니다. 완료 전에는 새
타임라인을 표시하지 않으며, 새로고침을 취소해도 기존 글과 작성 내용은 유지됩니다.
팔로우 기록도 이어 읽거나 중단할 수 있습니다. 취소할 원래 요청을 확인하는 동안에는
전송하지 않으며, 이미 접수된 요청의 상태 조회를 중단해도 접수 결과는 유지됩니다.

## 실행

Node.js 22.12 이상, npm, Docker Compose, Python 3가 필요합니다.

```sh
npm ci
npm run c2s:up
npm run c2s:seed
npm run c2s:smoke
npm run dev
```

클라이언트는 <http://127.0.0.1:5173>, 로컬 ONI Actor URL은
<https://localhost:8443/>입니다. `.local/c2s-credentials.json`의 `token`을
연결 화면에 입력하세요. 토큰은 현재 탭의 메모리에만 보관하며, 새로고침 시
다시 입력합니다. Actor URL만 브라우저에 저장합니다.

**로컬 인증서:** ONI는 HTTPS 식별자를 사용합니다. Caddy가 생성한
`.local/c2s-root.crt`를 브라우저에서 신뢰하거나 로컬 인스턴스에 인증서 예외를
허용해야 직접 연결할 수 있습니다. 스크립트는 OS 신뢰 저장소를 변경하지
않습니다. [인증서와 Docker 상세 안내](dev/README.md)를 참고하세요.

seed는 서버와 인증서 준비를 최대 60초 기다립니다. 시작이 더 늦으면
`docker compose logs`를 확인한 후 다시 실행하세요. seed는 실제 outbox에 공개 글과 답글을 작성합니다. 데이터는 Docker
volume에 보관되며 `npm run c2s:down` 후 다시 실행해도 유지됩니다.

## 읽기와 대화

연결 전 **먼저 둘러보기**로 예시 타임라인을 사용할 수 있습니다. 실제 서버가
아닌 읽기 전용 미리보기이며 게시·답글은 계정 연결 후 가능합니다.

**대화 보기**는 이미 불러온 부모 글과 답글을 함께 보여줍니다. 답글 작성기는
선택한 글 아래에 원문과 함께 열리며, 화면을 오가도 이 탭 안에서 초안을 유지합니다.
새로고침하거나 연결을 해제하면 초안은 지워집니다.

검색은 현재 불러온 글을 대상으로 합니다. 저장은 글 **링크만** 현재 브라우저에
보관하며 본문은 저장하지 않습니다. 현재 타임라인에 없는 저장 링크도 원문을
다시 열 수 있습니다. 서버·다른 기기에는 동기화되지 않습니다. 예시 공간의 저장은
체험용으로, 둘러보기를 종료하면 초기화됩니다.

작성자 이름을 눌러 **이 작성자의 글 숨기기**를 선택하면, 불러온 글 중 해당
작성자의 글을 타임라인·받은 답글·검색·저장·대화에서 숨깁니다. 상단의
**숨긴 작성자 관리**에서 언제든 다시 표시할 수 있습니다. 저장 링크와 초안은
삭제하지 않습니다. 작성자 주소만 계정별로 이 브라우저에 보관하며, 서버
차단이나 전달 중지를 요청하지 않습니다. 작성자를 알 수 없는 미수신 저장
링크는 그대로 남습니다. 둘러보기의 숨김은 메모리에만 적용해 새로고침하거나
종료하면 초기화됩니다.


## 구현 범위

- 타임라인, 새로고침, 내가 쓴 글, 공개 글 작성, 원문에 연결된 답글.
- `Note`, `Create`, `Update`, `Delete`, `Announce`, `Undo`의 결정적 평가,
  중복 제거, 최신 상태 및 작성자 검증. 알 수 없는 Activity 수를 표시합니다.
- Activity/객체 참조 해석, 페이지 순회, 순환 및 상한 초과 오류 처리.
- 수신 HTML 정제, 원격 이미지 자동 로드 차단, 토큰의 origin 제한.
  이미지 로딩 실패 시 설명을 유지하고 수동 재시도·숨기기를 제공합니다.
  ONI 모드에서는 받은 비공개 PNG/JPEG/WebP를 계정 서버를 통해 명시적으로
  불러옵니다. 5 MiB·10초 제한을 적용하고 숨기기·연결 해제 시 메모리를 정리합니다.
- ONI 연결에서 명시적으로 켜는 공개·미등재 이미지 작성: PNG/JPEG/WebP 최대
  4장(각 5 MiB), 로컬 미리보기, 대체 텍스트, 메모리에만 보관하는 초안.
  선택만으로 업로드하지 않으며, 게시 중 먼저 업로드된 이미지는 글 작성이
  실패하거나 취소되어도 공개로 남을 수 있습니다. 수정된 로컬 ONI가 비공개
  이미지 지원을 명시하면 팔로워·직접 답글에도 첨부할 수 있습니다. 이미지와
  글의 수신 범위를 맞추고, 확정된 업로드는 같은 수신 범위에서만 재사용합니다.
  비공개 업로드도 글 게시 실패·취소 후 원래 수신 범위에서 남을 수 있습니다.
- 사람 관리에서 `@이름@서버`를 명시적으로 조회하거나 계정 주소를 직접 입력.
  조회에는 토큰을 보내지 않으며 서버의 브라우저 조회 지원이 필요합니다.
- 사람 관리와 작성자 화면에서 C2S 팔로우·해제, 요청 중·승인·거절 상태 확인.
  승인 후 타임라인을 새로고침해 서버가 전달한 글을 읽습니다.
- LogTape 로깅, Sacho changelog, 단위·브라우저·실서버 테스트, CI.

inbox는 서버 전체의 모든 Activity 로그가 아닙니다. 이 MVP는 현재 계정에
전달된 inbox와 본인의 outbox를 합칩니다. 서버가 보관·노출하지 않는 과거 이벤트는
복원할 수 없습니다. 전체 JSON-LD 확장기나 브라우저 서명 검증기를 구현하지
않으며, 서버가 검증한 전달 내용을 신뢰합니다. 지원 표현과 보안 경계는
[프로토콜 문서](src/activitypub/README.md)에 있습니다.

기본 로컬 fixture는 실제 **단일 사용자 ONI**와 Caddy를 사용합니다. 팔로우와
글 수신은 서버를 보완한 별도의 두 계정 실험 환경에서 검증했습니다. 기본 ONI나
다른 서버의 호환성을 보장하지 않습니다. [실험 환경과 수정 내역](dev/oni-follow/README.md)을
참고하세요. OAuth 로그인 화면, 일반 파일 첨부, 스트리밍 및 영구
로컬 캐시는 아직 범위 밖입니다. 다른 서버는 C2S와 적절한 CORS 및 Bearer 인증을
지원해야 합니다. Mastodon REST API 전용 서버는 직접 연결할 수 없습니다.

## 개발과 검증

```sh
npm run check                   # 포맷, 타입, 단위 테스트, 빌드, changelog
npx playwright install chromium
npm run test:e2e                 # 실제 ONI에 새 글/답글을 작성하고 재연결 검증
npm run test:e2e:ui              # Docker 없이 UI 오류/XSS 동작 검증
npm run preview                 # 프로덕션 빌드 미리보기 :4173
```

실서버 E2E만 로컬 자체 서명 인증서를 허용합니다. 모의 UI 테스트의 실패 trace는
`test-results/`에서 확인할 수 있습니다. 실제 서버 테스트는 토큰 보호를 위해
trace·스크린샷·비디오를 저장하지 않습니다. E2E가 작성한 게시글은 로컬 서버에 남습니다.

서버 수정분을 포함한 별도 팔로우 실험 환경은 다음 명령으로 재현합니다.
Go 1.26.x와 Docker가 필요하며, 첫 실행은 소스 검증·회귀 테스트·이미지 빌드를
포함합니다. 기본 fixture 데이터와 분리되고 호스트의 인증서 신뢰 설정은 바꾸지 않습니다.

```sh
npm run c2s:follow:up           # 별도 두 계정, loopback :18448
npm run test:e2e:follow        # 팔로우 → 상대 글 작성 → 수신 → 해제
npm run c2s:follow:down        # 데이터는 보존하고 실험 환경만 종료
```

이 테스트는 토큰을 메모리에서만 사용하며 trace·스크린샷·비디오를 남기지 않습니다.
소스 출처, 서버 보완 범위와 빌드 조건은 [실험 환경 문서](dev/oni-follow/README.md)에 있습니다.

기존 코드는 React가 아닌 Solid 1/SolidStart 초기 템플릿이었습니다. 브라우저
중심 구조로 정리하면서 Solid `2.0.0-rc.6`, `@solidjs/web` 동버전, Vite 8을
사용합니다. RC API 변경에 대비해 Solid와 빌드 플러그인을 고정했습니다.

의존성 선택: [Solid 2 migration](https://github.com/solidjs/solid/blob/next/documentation/solid-2.0/MIGRATION.md),
[ActivityPub C2S](https://www.w3.org/TR/activitypub/#client-to-server-interactions),
ActivityPub 라이브러리를 확장할 때는 [Fedify](https://fedify.dev/)를 우선 검토합니다.
현재 제한된 C2S JSON 처리에는 별도 ActivityPub 런타임을 추가하지 않았습니다.

## 변경 기록과 에이전트

[Sacho](https://sacho.dev/)를 사용합니다. 사용자에게 보이는 변경은
`changes.d/<description>.md`에 작성하고 다음 명령으로 반영합니다.

```sh
npx sacho fmt
npm run changelog:build
npm run changelog:check
```

릴리스 시 `npx sacho release`, 다음 개발 주기에는 `npx sacho next <version>`을
사용합니다. [AGENTS.md](AGENTS.md)는 파일 책임, 검증 명령, 토큰 취급 및
서브에이전트 리뷰 절차를 정의합니다. [구현 계획](docs/superpowers/plans/2026-09-08-c2s-mvp.md)에 진행 상태를 기록합니다.

## 아키텍처

`domain`은 모델과 순수 평가 로직, `application`은 gateway 포트에 의존하는
세션 유스케이스입니다. ActivityPub HTTP와 브라우저 저장소는 바깥 어댑터이며,
`bootstrap.ts`가 구체 구현을 연결합니다. UI는 주입받은 세션과 preference
포트를 사용합니다. 프레임워크·네트워크·저장소가 안쪽 계층으로 들어오는 것을
회귀 테스트가 검사합니다.

제품 개선의 사용자 대리 평가와 판단은 [반복 기록](docs/product/iteration-log.md)에
남깁니다. 이는 실제 사용자 조사나 전환율 측정 결과가 아닙니다.
