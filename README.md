# Kimino

ActivityPub **Client-to-Server (C2S)** API로 타임라인을 읽고 공개 글과 답글을
작성하는 Solid 2 브라우저 클라이언트입니다. 인증된 actor의 inbox/outbox를
페이지 순회하고, 브라우저에서 Activity를 평가해 현재 게시글 상태를 만듭니다.

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

## 구현 범위

- 타임라인, 새로고침, 내가 쓴 글, 공개 글 작성, 원문에 연결된 답글.
- `Note`, `Create`, `Update`, `Delete`, `Announce`, `Undo`의 결정적 평가,
  중복 제거, 최신 상태 및 작성자 검증. 알 수 없는 Activity 수를 표시합니다.
- Activity/객체 참조 해석, 페이지 순회, 순환 및 상한 초과 오류 처리.
- 수신 HTML 정제, 원격 이미지 자동 로드 차단, 토큰의 origin 제한.
- LogTape 로깅, Sacho changelog, 단위·브라우저·실서버 테스트, CI.

inbox는 서버 전체의 모든 Activity 로그가 아닙니다. 이 MVP는 현재 계정에
전달된 inbox와 본인의 outbox를 합칩니다. 서버가 보관·노출하지 않는 과거 이벤트는
복원할 수 없습니다. 전체 JSON-LD 확장기나 브라우저 서명 검증기를 구현하지
않으며, 서버가 검증한 전달 내용을 신뢰합니다. 지원 표현과 보안 경계는
[프로토콜 문서](src/activitypub/README.md)에 있습니다.

로컬 fixture는 실제 **단일 사용자 ONI**와 Caddy를 사용합니다. 두 인스턴스 간
연합, OAuth 로그인 화면, 팔로우 UI, 비공개 글, 첨부 파일, 스트리밍 및 영구
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

실서버 E2E만 로컬 자체 서명 인증서를 허용합니다. 실패 시 Playwright trace를
`test-results/`에서 확인할 수 있습니다. E2E가 작성한 게시글은 로컬 서버에 남습니다.

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
