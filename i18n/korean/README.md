# ResearchDesk 사용 가이드

`ResearchDesk`는 학술 논문 작업을 위한 로컬 우선 프롬프트 하네스입니다.
연구 설계, 논문 작성 프롬프트, 동료심사 대응, 제출 준비도 점검을 한곳에서
추적할 수 있게 합니다. 기본 흐름은 단순합니다. `Methods Workbench`에서 연구
결정을 명시하고, protocol/SAP/checklist 산출물을 컴파일한 뒤, 연결된 article
draft를 만들고, `My Articles`에서 원고 리뷰, readiness 점검, 수정, 리뷰어
응답 초안 작성으로 이어 갑니다.

이 앱은 워드프로세서도, 자율 논문 작성기도 아닙니다. 핵심 역할은 기록된
methods, 업로드된 article material, 검토된 review finding을 바탕으로
통제된 prompt와 harness를 만들어 주는 것입니다. 새로운 주장, 연구 설계 결정,
통계 판단, 인용, 최종 원고 수정은 사용자의 책임입니다.

ResearchDesk는 OpenAI-compatible endpoint, Ollama, LM Studio,
llama-server를 포함한 cloud 또는 local API provider와 함께 사용할 수
있습니다. local llama-server / LM Studio endpoint는 grammar-constrained
(JSON-schema) decoding으로 구동되어 Qwen3 같은 작은 local model도 안정적인
structured output을 반환할 수 있습니다. 데이터는 기본적으로 로컬에 저장되며,
provider를 설정하고 LLM-backed action을 실행할 때만 provider call이
발생합니다.

영문 README: [`../../README.md`](../../README.md)

## 상태

현재 버전은 연구 보조 앱 `v0.1.3` release입니다. 배포 desktop artifact는
GitHub Actions에서 생성한 Windows x64 portable `.exe`와 local macOS arm64
build인 `dist/mac-arm64/ResearchDesk.app`입니다. Headless MCP bundle은
Linux x64, Windows x64, macOS arm64용 `ResearchDesk-Headless-*` artifact로
별도 배포됩니다. Intel macOS(`darwin-x64`) release target은 지원하지 않습니다.

이 앱은 편집과 methods 점검을 돕는 workspace로 사용해야 하며, 의학적/법적/
규제적/통계적 조언으로 간주하면 안 됩니다. LLM 출력, 인용, 계산, 원고 변경
사항은 사용자가 직접 검증해야 합니다.

현재까지는 **scoping review**와 **systematic review** 연구 흐름을 중심으로
테스트되었습니다. retrospective observational, interventional/trial mode도
지원하지만 아직 완전히 검증된 상태는 아니므로 이후 업데이트를 예상하세요.

## v0.1.3 변경 사항

- **ResearchDesk로 이름과 포지션을 정리했습니다.** 로컬 우선 scholarly article
  prompt harness라는 역할을 전면에 두면서, Methods Workbench -> article ->
  review/response 흐름을 유지합니다.
- **canonical repository가 변경되었습니다.** 이후 release는
  [`junhewk/researchdesk`](https://github.com/junhewk/researchdesk)에서
  배포됩니다.
- **Headless + MCP runtime을 bundle로 제공합니다.** release build에는 app
  server, MCP bridge, wrapper CLI, embedded Node runtime이 포함된 headless
  artifact가 별도로 포함됩니다. `nvm`, `npx`, global Node, raw checkout path
  없이 MCP를 실행할 수 있습니다.
- **Article agent UX가 button-driven 방식으로 바뀌었습니다.** manuscript
  review, version creation, readiness, reviewer response, finalization은
  visible chat/composer가 아니라 명시적인 workflow button으로 실행합니다.
- **Desktop packaging이 작아지고 실행 가능해졌습니다.** macOS arm64 package는
  startup에 필요한 Next/Turbopack server runtime을 staging하면서 packaged app
  payload를 약 51 MB 수준으로 유지합니다.
- **Research Projects shell을 도입했습니다.** Bench/setup과 article/review
  record가 unified Projects view 아래에 놓이며, Archives와 Support route가
  포함됩니다. 기존 app-support data path는 유지되어 이전 record가 계속
  표시됩니다.
- **Intel macOS release target을 제거했습니다.** v0.1.3은 Linux x64, Windows
  x64, macOS arm64 headless bundle만 배포합니다.
- **호환성을 유지합니다.** 기존 `REVIEWER_*` environment variable,
  `x-reviewer-app-token` header, `reviewer-agent-mcp` bin alias, 예전 desktop
  data location은 계속 지원합니다. 새 이름은 `RESEARCHDESK_*`를 권장합니다.

## 개인정보와 보안 모델

데이터는 로컬 SQLite와 markdown export에 저장됩니다. Cloud provider는 사용자가
cloud API provider를 설정하고 실행한 경우에만 원고 또는 reviewer 내용을
받습니다. PHI, PII, embargo 상태의 원고, confidential peer review 자료는
전송 권한이 있을 때만 cloud provider로 보내야 합니다.

Electron desktop app은 서버를 `127.0.0.1`에 바인딩하고, Electron main process가
주입하는 짧은 수명의 app token으로 local `/api/*` 요청을 보호합니다. Headless
CLI도 loopback에서 같은 앱을 실행합니다. source에서 실행할 때 `/api/*`를
인증하려면 `RESEARCHDESK_APP_TOKEN`을 설정하세요. 기존
`REVIEWER_APP_TOKEN`도 계속 허용됩니다. `npm run dev` / `npm run start`는
developer browser mode이므로 네트워크에 노출하지 마세요.

## 워크스페이스

### Methods Workbench

원고 작성 전후에 study-method artifact를 만들고 점검하는 공간입니다.

- protocol creation 및 protocol audit
- SAP drafting
- data dictionary 편집/import/export
- reporting checklist setup
- scoping review: search-process CSV와 screened-record CSV import, screening
  decision 확인, PRISMA-ScR flow count, PRISMA-ScR checklist,
  characteristics-of-sources table, round-trip CSV compile
- drafting prompts: 기록된 design을 바탕으로 outline, introduction,
  methodology, review study의 results/discussion section prompt 생성
- `My Articles`와 연결된 manuscript-readiness check

첫 실행 setup panel과 in-canvas guide가 신규 사용자를 안내합니다. 기술 용어에는
hover 설명이 있어 소프트웨어 배경이 없는 연구자도 canvas에서 작업할 수 있습니다.

### My Articles

사용자의 원고를 업로드하거나 Methods Workbench에서 생성한 article draft를
이어받아 작업하는 공간입니다.

- reviewer commentary 기반 revision
- 제출 전 manuscript review: 여러 grounded reviewer와 neutral merge가 결합된
  **context-grounded ensemble**입니다. persona role-play가 아니라 prior review,
  scholarly search, citation/DOI 및 retraction validation, GRIM screening,
  linked Methods study와의 protocol-drift comparison 같은 deterministic check에
  기반합니다. workspace에서 **Run review**를 누르면 실행되며, provider/model/
  ensemble size 같은 advanced control은 Advanced drawer에 있습니다.
- manuscript readiness check
- reviewer-response drafting
- revision harness: 조정된 readiness finding을 self-contained prompt set으로
  바꾸어 AI가 accepted finding을 닫도록 원고 수정을 진행하게 합니다.

## 단계별 사용 흐름

### 1. API provider 설정

`Settings` -> `API Providers`로 이동합니다.

기본 provider, model, API key, base URL을 설정합니다. 이 설정은 manuscript
review, readiness check, reviewer response, version creation, finalization 같은
실제 LLM-backed action에 사용됩니다.

Settings page와 Methods Workbench setup panel은 provider별 live status를
표시합니다. 연결 가능 여부, API key 누락, 해결 단계가 긴 timeout 이후가 아니라
즉시 보입니다. 같은 check는 `GET /api/providers/health`에서도 사용할 수 있습니다.

`Settings` -> `Language`에서 app shell과 settings pane의 표시 언어를 영어 또는
한국어로 전환할 수 있습니다.

### 2. Methods Workbench에서 시작

`Methods Workbench`를 엽니다.

- `Seed Methods Demo`: 준비된 systematic-review demo study를 생성합니다.
- `+ Start a study`: 직접 study design을 새로 만듭니다.

Methods Workbench는 research question, eligibility criteria, intervention 또는
exposure, outcome, analysis plan, reporting checklist를 먼저 정리하는 upstream
planning layer입니다.

### 3. Methods study 작업

study 화면에서 다음 순서로 작업합니다.

1. decision card를 채웁니다. 확신이 없을 때는 evidence-grounded option을 요청할
   수 있습니다. assistant는 제안하고, 결정은 사용자가 합니다.
2. evidence를 추가합니다. plain background note를 붙여 넣으면 population,
   outcome, confounder 같은 evidence item을 추출하거나 structured snapshot을
   import할 수 있습니다.
3. proposal과 preflight action으로 빠진 항목이나 서로 맞지 않는 design choice를
   찾습니다.
4. 생성된 artifact를 확인합니다.
   - protocol
   - SAP
   - data dictionary
   - reporting checklist map
   - PROSPERO 또는 registration fields

### 4. Article Draft 생성

Methods study header에서 `Create Article Draft`를 클릭합니다.

그러면 Methods decision을 바탕으로 `My Articles`에 연결된 article이 생성됩니다.
컴파일된 Methods artifact도 manuscript appendix로 첨부됩니다. 같은 버튼을 다시
누르면 중복 생성하지 않고 기존 연결 article을 다시 엽니다.

이 버튼 옆의 `Drafting prompts`는 article section별 self-contained prompt를
컴파일합니다. outline, introduction, methodology, review study의 results와
discussion prompt를 만들 수 있으며, screened corpus와 PRISMA flow에 grounded된
내용만 사용하도록 지시합니다. combined prompt 또는 section별 prompt를
browser-based AI에 복사하거나, agentic tool용 `AGENTS.md` /
`drafting-prompts.md`를 다운로드할 수 있습니다.

### 5. My Articles에서 이어서 작업

생성된 article workspace를 엽니다.

article에는 다음이 포함됩니다.

- structured manuscript draft
- 원래 Methods study로 돌아가는 `Source methods` 링크
- 첨부된 Methods artifact
- review, versioning, readiness, reviewer response, finalization을 실행하는
  명시적인 workflow button이 있는 review workspace

### 6. Readiness 실행

article workspace에서 `Readiness`를 클릭합니다.

Methods Workbench에서 생성된 article이면 readiness가 자동으로 원래 study design과
manuscript를 비교합니다. outcome timepoint 불일치, eligibility criteria 누락,
reporting checklist 항목 누락, protocol로 뒷받침되지 않는 claim 같은 drift를
찾는 데 사용합니다.

finding을 조정한 뒤, 고칠 항목은 accept하고 나머지는 dismiss합니다. 그런 다음
`Generate revision harness`를 사용해 accepted finding을 닫도록 AI에 지시하는
self-contained prompt를 컴파일할 수 있습니다. 이 prompt는 작고 되돌릴 수 있는
수정을 요구하고, section pointer가 있는 revised text와 revision table로 끝나게
합니다. holistic prompt 하나와 accepted finding별 prompt를 받으며,
browser-based AI에 복사하거나 agentic tool용 `AGENTS.md` /
`revision-harness.md`를 다운로드할 수 있습니다.

### 7. 리뷰어 자료 추가

article flow에서 decision letter 또는 reviewer report를 업로드합니다.

그다음 다음 button을 사용합니다.

- `Reviewer response`: point-by-point reply 초안 작성
- `Create new version`, `Run review`, `Readiness`, `Finalize`: revision과 최종
  submission check를 이어서 진행

### 8. 앱 전체 demo 실행

dashboard의 `Load Demo Set`은 더 넓은 end-to-end demo를 실행합니다.

1. Methods study 생성
2. manuscript 생성
3. 실제 API-backed preflight, review, readiness, reviewer-response workflow 실행

설정한 provider로 전체 앱 stack이 작동하는지 확인할 때 사용합니다.

핵심 흐름은 다음과 같습니다.

```text
Methods Workbench -> Create Article Draft -> My Articles -> Readiness / Review / Response / Finalize
```

## MCP server (Claude Code / Codex)

ResearchDesk는 Claude Code 또는 Codex 같은 CLI agent가 앱을 구동할 수 있게 하는
MCP server(`mcp/server.mjs`)를 포함합니다. 이 server는 app의 local REST API에
연결되는 stdio bridge이며 자체 business logic을 갖지 않습니다. study 찾기/생성,
scoping-review CSV import, corpus와 PRISMA flow inspection, section별
self-contained drafting brief / `AGENTS.md` 생성 tool을 제공합니다.

또한 **intake give-and-take**를 제공합니다. recorded design을 읽고, gap과
uncovered reporting-guideline item을 드러내고, author answer를 기록하는 tool과
`methods_intake` / `screening_review` prompt가 포함됩니다. agent는 진행을 돕고
author가 결정합니다. 연구 내용을 invent하지 않습니다.

manuscript용으로는 `list_manuscripts`, context-grounded ensemble review를 실행하는
`review_manuscript`, `get_reviews`, 그리고 review를 실행하고 finding을 함께
검토하게 하는 `manuscript_review` prompt를 제공합니다. 따라서 CLI agent도 desktop
UI 없이 manuscript review를 end to end로 수행할 수 있습니다.

권장 release 사용 방식은 bundled headless artifact입니다. 자체 Node runtime과
wrapper CLI가 포함되어 `nvm`, `npx`, global Node install, checkout path가 필요
없습니다.

```bash
./bin/researchdesk init
./bin/researchdesk server
./bin/researchdesk config codex
```

MCP client에서는 `researchdesk mcp --with-server`가 MCP session 전용 private
loopback app server를 시작하고, client가 종료되면 함께 종료합니다.

source에서 개발할 때는 먼저 app을 headless로 실행한 뒤 MCP server를 연결합니다.

```bash
npm run build
export RESEARCHDESK_APP_TOKEN=$(openssl rand -hex 32) # /api/* 인증
npm run start:server                                 # 127.0.0.1에 바인딩
```

headless runbook과 Claude Code / Codex 등록 snippet은
[`../../docs/MCP.md`](../../docs/MCP.md)를 참조하세요. Headless server는
local-only입니다. loopback에만 두고 `RESEARCHDESK_APP_TOKEN`으로 `/api/*`를
인증하세요.

## 빠른 시작

```bash
nvm use
npm install --include=dev
npm run dev
```

브라우저에서 `http://localhost:3871`을 엽니다.

## 주요 스크립트

```bash
npm run dev
npm run build
npm run start:server   # 127.0.0.1에 바인딩되는 headless production server
npm run mcp            # 실행 중인 app에 연결되는 MCP stdio server
npm run headless:bundle
npm run typecheck
npm run lint
npm test
npm run desktop:dist      # local macOS arm64 package
npm run desktop:dist:win
```

## 데이터 저장 위치

SQLite 데이터와 markdown export는 `RESEARCHDESK_DATA_DIR` 아래에 저장됩니다.
source에서 실행할 때 기본값은 `./data`입니다. 기존 `REVIEWER_DATA_DIR` 이름도
계속 지원됩니다.

## 보안

로컬 앱 보안 모델과 취약점 신고 절차는
[`../../SECURITY.md`](../../SECURITY.md)를 참조하세요.
