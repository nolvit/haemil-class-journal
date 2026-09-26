# 해밀학원 수업일지 운영 및 배포 안내

이 프로젝트는 **Manus OAuth 로그인**, **MySQL/TiDB 데이터베이스**, **tRPC 기반 서버 API**로 구성되어 있다. 비밀값은 코드나 저장소에 추가하지 않고 배포 환경 변수로 관리한다.

## 초기 운영 순서

프로젝트 소유자 계정은 최초 로그인 시 자동으로 `admin` 역할을 받는다. 관리자는 먼저 반 관리에서 반과 과목을 등록하고, 학생 관리에서 학생을 등록한 뒤 수강 반을 연결한다. 이후 강사는 출석 관리에서 상태와 등원 시간을 입력하고, 수업일지에서 수업 내용·과제·특이사항을 작성한다.

| 역할        | 허용되는 작업                                                                    |
| ----------- | -------------------------------------------------------------------------------- |
| 관리자      | 모든 수업일지·출석 기록 관리, 반 및 학생 등록·수정·비활성, 보호자 열람 공개 설정 |
| 강사        | 출석·수업일지 조회 및 본인이 최초 작성한 출석·수업일지 수정                      |
| 보호자/학생 | 관리자가 공개한 개별 토큰 링크로 자신의 주간 수업일지 열람                       |

## 필수 운영 규칙

수업일지의 필수 기록은 **출석 상태, 수업 내용, 과제**이다. 이 중 하나라도 비어 있으면 수업일지 목록에서 노란색으로 표시한다. 결석 또는 미등록 상태의 학생은 수업일지를 작성하지 않으며, 서버 API도 내용·과제·특이사항 저장을 차단한다. 수업일지 입력 창에서는 같은 반의 해당 학생에 대한 최근 출석 수업 기록을 불러와 현재 기록에 복사할 수 있다.

## 데이터베이스와 마이그레이션

현재 적용된 초기 마이그레이션 파일은 `drizzle/0001_late_young_avengers.sql`이다. 반(`class_groups`), 학생(`students`), 수강 연결(`student_enrollments`), 출석(`attendance_records`), 수업일지(`lesson_journals`) 테이블을 생성한다. 운영 데이터베이스에는 해당 테이블이 생성되어 있으며, 예시 학생이나 가짜 수업일지는 삽입하지 않았다.

향후 스키마 변경 시에는 다음 순서를 따른다.

1. `drizzle/schema.ts`를 수정한다.
2. `pnpm drizzle-kit generate`로 SQL 마이그레이션을 생성한다.
3. 생성 SQL을 검토한 뒤 관리형 데이터베이스에 적용한다.
4. `pnpm check`, `pnpm test`, `pnpm build`를 실행한다.

## 환경 변수와 빌드

| 구분                                                       | 값의 제공 방식         | 용도                         |
| ---------------------------------------------------------- | ---------------------- | ---------------------------- |
| `DATABASE_URL`                                             | 배포 환경에서 주입     | 데이터베이스 연결            |
| `JWT_SECRET`                                               | 배포 환경에서 주입     | 세션 서명                    |
| `MATHBANK_ROSTER_TOKEN`                                    | Railway 비밀 환경 변수 | 문제은행의 최소 학생 명부 조회 인증 |
| `MATHBANK_ASSIGNMENT_WRITE_TOKEN`                         | 양쪽 서비스의 Railway 비밀 환경 변수 | 자동채점 과제 발행 전용 인증. 명부 조회 토큰과 다른 32자 이상의 값 |
| `GOOGLE_VISION_SERVICE_ACCOUNT_JSON`                       | 수업일지 Railway 비밀 환경 변수 | Google Cloud Vision 서비스 계정 JSON. 브라우저로 전달하지 않음 |
| `GOOGLE_VISION_API_KEY`                                     | 수업일지 Railway 비밀 환경 변수 | Cloud Vision API로 제한한 서버 전용 키. JSON 키 생성이 차단된 프로젝트에서 사용 |
| `GOOGLE_VISION_BILLING_ACCOUNT_ID`                          | 수업일지 Railway 환경 변수 | OCR 월별 사용량을 청구 계정별로 기록하는 키 |
| `VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL` | 배포 환경에서 주입     | Manus OAuth 로그인           |
| `OWNER_OPEN_ID`                                            | 배포 환경에서 주입     | 최초 관리자 식별             |
| `SOLAPI_API_KEY`, `SOLAPI_API_SECRET`                      | Railway 비밀 환경 변수 | 솔라피 API 인증              |
| `SOLAPI_SENDER_NUMBER`                                     | Railway 환경 변수      | 솔라피에 등록된 발신번호     |
| `SOLAPI_KAKAO_PF_ID`                                       | Railway 환경 변수      | 승인된 카카오 채널 프로필 ID |
| `SOLAPI_REMAINING_ONE_TEMPLATE_ID`                         | Railway 환경 변수      | 잔여 1회 안내 템플릿 ID      |
| `SOLAPI_PAYMENT_CONFIRMED_TEMPLATE_ID`                     | Railway 환경 변수      | 원비 납부 확인 템플릿 ID     |

솔라피 관련 6개 값이 모두 설정된 경우에만 알림톡을 추가 발송한다. 값이
하나라도 없으면 기존 PWA 알림만 발송한다. 알림톡 발송 전에 학생·알림 종류·
총횟수 기준의 고유 기록을 먼저 저장해 서버 재시작이나 중복 요청에도 같은
알림이 다시 전송되지 않게 한다.

로컬과 배포 빌드는 `pnpm build` 명령으로 검증한다. 빌드 산출물은 정적 클라이언트 번들과 Node 서버 번들로 구성된다. 문제은행 명부 연동은 아래 비밀 환경 변수가 설정된 경우에만 활성화된다.

## 문제은행 학생 명부 연동

문제은행 서버는 `GET /api/integrations/mathbank/students`에 동일한 `MATHBANK_ROSTER_TOKEN`을 `Authorization: Bearer <token>`으로 보낸다. 응답에는 학생 ID, 이름, 학년, 활성 상태만 포함하며 비활성 학생도 반환한다. 토큰은 32자 이상으로 생성하고 양쪽 서비스의 비밀 환경 변수에만 저장한다. 문제은행의 `CLASS_JOURNAL_API_URL`은 이 경로를 가리키는 HTTPS 주소로 설정한다. 수업일지 서버는 Railway의 신뢰된 TLS 프록시가 설정하는 `X-Forwarded-Proto: https`를 확인한다. 토큰 미설정이나 명부 조회 실패 시에는 학생 데이터를 반환하지 않는다.

## 인쇄 답안지 자동채점

문제은행에는 `CLASS_JOURNAL_ASSIGNMENT_API_URL`을 수업일지의 `https://<수업일지 도메인>/api/integrations/mathbank/assignments`로 설정한다. 양쪽 서비스에 동일한 `MATHBANK_ASSIGNMENT_WRITE_TOKEN`을 설정하되, 명부 조회용 토큰과는 별도로 발급한다. 관리자가 자동채점용 학생 바구니를 명시적으로 발행해야 보호자 페이지에 과제가 나타난다. 자동채점용 선택 화면은 중2 2학기의 고정 1,484문항만 사용하며 일반 인쇄와 쌍둥이 검토의 선택 범위는 유지된다.

OCR을 쓰려면 전용 Google Cloud 청구 계정과 프로젝트를 준비하고 Cloud Vision API를 활성화한 뒤 Cloud Vision API로 제한한 키를 `GOOGLE_VISION_API_KEY`에 등록한다. 서버는 키를 URL에 넣지 않고 `x-goog-api-key` 헤더로 보낸다. 서비스 계정 JSON을 사용할 수 있는 환경에서는 기존 `GOOGLE_VISION_SERVICE_ACCOUNT_JSON`도 지원하며, 두 값이 모두 있으면 API 키가 우선한다. `GOOGLE_VISION_BILLING_ACCOUNT_ID`에는 그 프로젝트가 연결된 청구 계정 ID를 넣는다. Google Cloud의 월 1,000 무료 단위는 **문항 수가 아니라 OCR을 적용한 이미지 단위**이며, 다른 프로젝트가 같은 청구 계정을 쓰면 사용량을 합산한다. 앱은 기본 1,000회에서 OCR 호출을 중지하고 관리자가 해당 월의 추가 허용 건수를 지정한 경우에만 유료 호출을 재개한다. 별도의 Google Cloud 예산 알림도 설정해 앱 기록과 청구 기록을 대조한다. 인증 정보가 없거나 OCR 한도에 닿아도 보호자 페이지의 직접 답 입력·제출은 사용할 수 있어야 한다.

최종 제출된 답안지 사진은 공개 `/manus-storage/` 경로를 사용하지 않고 접근이 제한된 데이터베이스에 저장한다. 서버가 제출 후 30일이 지난 사진을 삭제하며, 답안·채점 이력은 유지한다. 과제 점수는 학습 진도율과 별도로 보관한다. 실제 학생 답안으로 손글씨 인식과 채점 결과를 확인하기 전에는 OCR 기능을 전체 학생에게 열지 않는다.
