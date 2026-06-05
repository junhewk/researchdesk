# reviewer-agent 사용 가이드

`reviewer-agent`는 논문 작성 전 연구 방법을 먼저 설계하고, 그 설계에서
원고 초안을 만든 뒤, 리뷰/수정/응답까지 이어 가는 로컬 우선 데스크톱
워크스페이스입니다.

영문 README: [`../../README.md`](../../README.md)

## 상태

이 앱은 pre-0.1.0 closed-beta 연구 보조 앱입니다. 이 prerelease에서 배포하는
binary는 `v0.1.0-beta.0` GitHub prerelease에 첨부된 Windows x64 portable
`.exe`뿐입니다.

편집과 methods 점검을 돕는 workspace로 사용해야 하며, 의학적/법적/규제적/
통계적 조언으로 간주하면 안 됩니다. LLM 출력, 인용, 계산, 원고 변경 사항은
사용자가 직접 검증해야 합니다.

## 개인정보와 보안 모델

데이터는 로컬 SQLite와 markdown export에 저장됩니다. Cloud API 제공자를
설정하고 사용할 때만 원고 또는 reviewer 내용이 해당 제공자에게 전송됩니다.
PHI, PII, embargo 상태의 원고, confidential peer review 자료는 전송 권한이
있을 때만 cloud 제공자로 보내야 합니다.

Electron 데스크톱 앱은 서버를 `127.0.0.1`에 바인딩하고, 짧게 유지되는 앱
토큰을 Electron main process가 주입해 로컬 `/api/*` 요청을 보호합니다.
`npm run dev` / `npm run start`로 브라우저에서 직접 실행하는 방식은 개발자
모드이므로 네트워크에 노출하지 마세요.

## 워크스페이스

### Methods Workbench

논문 작성 전에 연구 설계를 명시하고 점검하는 공간입니다.

- 프로토콜 작성 및 감사
- SAP 작성
- 데이터 딕셔너리 편집/가져오기/내보내기
- 보고 체크리스트 구성
- `My Articles`와 연결된 원고 준비도 점검

### My Articles

원고를 올리거나 Methods Workbench에서 생성한 초안을 이어서 작업하는
공간입니다.

- 리뷰어 코멘트 기반 수정
- 제출 전 원고 리뷰
- 원고 준비도 점검
- 리뷰어 응답 초안 작성

## 단계별 사용 흐름

### 1. API 제공자 설정

`Settings` -> `API Providers`로 이동합니다.

기본 제공자, 모델, API 키, base URL을 설정합니다. 이 설정은 실제 LLM을
사용하는 원고 리뷰, 준비도 점검, 리뷰어 응답, 원고 채팅 기능에 사용됩니다.

`Settings` -> `Language`에서 앱 shell과 settings pane의 표시 언어를 영어
또는 한국어로 전환할 수 있습니다.

### 2. Methods Workbench에서 시작

`Methods Workbench`를 엽니다.

다음 중 하나를 선택합니다.

- `Seed Methods Demo`: 준비된 체계적 문헌고찰 데모 연구를 생성합니다.
- `+ Start a study`: 직접 연구 설계를 새로 만듭니다.

Methods Workbench는 연구 질문, 선정/제외 기준, 중재 또는 노출, 결과,
분석 계획, 보고 체크리스트를 먼저 정리하는 상위 설계 단계입니다.

### 3. 연구 설계 작업

연구 화면 안에서 다음 순서로 작업합니다.

1. decision card를 채웁니다.
2. 필요한 경우 evidence snapshot을 가져옵니다.
3. proposal과 preflight 기능으로 빠진 항목이나 서로 맞지 않는 설계 결정을
   찾습니다.
4. 생성된 산출물을 확인합니다.
   - protocol
   - SAP
   - data dictionary
   - reporting checklist map
   - PROSPERO 또는 registration fields

### 4. Article Draft 생성

Methods study 상단에서 `Create Article Draft`를 클릭합니다.

그러면 Methods decision을 바탕으로 `My Articles`에 연결된 원고 초안이
생성됩니다. 컴파일된 Methods 산출물도 원고 appendices로 첨부됩니다. 같은
버튼을 다시 누르면 중복 생성하지 않고 기존 연결 원고를 다시 엽니다.

### 5. My Articles에서 이어서 작업

생성된 article workspace를 엽니다.

연결된 article에는 다음이 포함됩니다.

- 구조화된 원고 초안
- 원래 Methods study로 돌아가는 `Source methods` 링크
- 첨부된 Methods 산출물
- LLM 기반 리뷰와 편집을 위한 manuscript chat/workspace

### 6. Readiness 실행

article workspace에서 `Readiness`를 클릭합니다.

Methods Workbench에서 생성된 article이면 readiness가 자동으로 원래 Methods
study와 원고를 비교합니다. 이를 통해 다음과 같은 drift를 찾을 수 있습니다.

- outcome timepoint 불일치
- eligibility criteria 누락
- reporting checklist 항목 누락
- protocol이나 설계 결정으로 뒷받침되지 않는 주장

### 7. 리뷰어 자료 추가

decision letter 또는 reviewer report를 article 흐름에서 업로드합니다.

그다음 다음 기능을 사용할 수 있습니다.

- `Reviewer response`: point-by-point 응답 초안 작성
- manuscript chat command: revise, review, explain, finalize 등

### 8. 앱 전체 데모 실행

대시보드의 `Load Demo Set`은 더 넓은 end-to-end 데모를 실행합니다.

1. Methods study 생성
2. manuscript 생성
3. 실제 API 기반 preflight, review, readiness, reviewer-response workflow 실행

설정한 API 제공자로 전체 앱 스택이 작동하는지 확인할 때 사용합니다.

핵심 흐름은 다음과 같습니다.

```text
Methods Workbench -> Create Article Draft -> My Articles -> Readiness / Review / Response / Finalize
```

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
npm run typecheck
npm run lint
npm test
npm run seed:methods-demo
npm run seed:demo
```

## 데이터 저장 위치

SQLite 데이터와 markdown export는 `REVIEWER_DATA_DIR` 아래에 저장됩니다.
기본값은 `./data`입니다.

## 보안

로컬 앱 보안 모델과 취약점 신고 절차는 [`../../SECURITY.md`](../../SECURITY.md)를
참조하세요.
