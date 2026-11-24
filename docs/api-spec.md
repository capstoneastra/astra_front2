# ASTRA API 명세서 v0.1 (초안)

> 기준: REST + JSON, Base URL `/api/v1`, 인증 `Authorization: Bearer <accessToken>` (JWT)
> DB 기준 문서: `schema.sql` / ERD: `erd.dbml`
> 표기: 🔓 비로그인 허용(`/auth/**`만) · `로그인` 로그인한 모든 사용자 · 🏢 의뢰자(본인 상담·시험조건·의뢰의 주인. 기업·기관·대학 회원 모두 해당) · 🏛 장비 보유 조직 구성원(그 장비·의뢰의 `institution_id`가 내 소속 조직인 회원. 기업·기관·대학 모두 해당) · 👑 플랫폼 관리자(ADMIN)
> 👑 관리자는 마스터 권한으로 모든 API를 호출할 수 있으므로, 표에는 관리자 전용 API에만 👑를 표시합니다.

---

## 0. 공통 규약

### 0-1. 응답 형식
```json
// 성공
{ "success": true, "data": { ... } }

// 목록 (페이지네이션)
{ "success": true,
  "data": { "content": [ ... ], "page": 0, "size": 20, "totalElements": 71, "totalPages": 4 } }

// 실패
{ "success": false,
  "error": { "code": "REQUEST_INVALID_STATUS", "message": "보완 요청 상태에서만 재제출할 수 있습니다.", "details": null } }
```

### 0-2. 규칙
| 항목 | 규칙 |
|---|---|
| JSON 필드명 | camelCase (`desiredStartDate`). DB는 snake_case |
| 날짜/시각 | `2026-11-20` / ISO-8601 `2026-11-05T09:00:00+09:00` |
| 페이지네이션 | `?page=0&size=20&sort=createdAt,desc` (0부터 시작). `size` 는 최대 100 (더 크게 보내도 100) |
| enum | 대문자 문자열 그대로 (`UNDER_REVIEW`). 화면 한글 라벨은 프론트에서 매핑 |
| ID | 숫자 `id` 사용. 장비는 `externalId`도 함께 응답 (초기 적재 `ASTRA-CAND-0001`, 기관 신규 등록 `ASTRA-EQ-0072`) |
| 조건·사양 키 | JSON 필드명(camelCase)과 별개로, 조건·사양을 가리키는 키 값은 단위 없는 snake_case. 단위는 `unit`에 따로 (`{ "key": "sample_mass", "value": 15, "unit": "kg" }`). 시험유형별 키 목록은 `GET /test-types/{code}`의 `conditionRules` |
| MOCK 표시 | 시연용 데이터가 섞인 응답엔 `isMock`/`sourceType` 필드를 반드시 포함, 프론트는 "DEMO" 배지 표시 |
| 동시성 | 상태 변경 요청은 `version` 필드를 보내고, 불일치 시 `409 CONFLICT` |
| 필수 검사 스위치 | 서버 설정 `ASTRA_RULES_STRICT`(기본 `true`). `false` 면 회의 결정으로 추가된 필수 검사 3가지(가입 국가연구자번호, 제출 필수 칸, 결과 등록 후 완료)를 건너뜀. 프론트가 새 칸을 만들기 전 연동할 때만 사용 ([`frontend-integration.md`](frontend-integration.md)) |
| CORS | 브라우저에서 부를 수 있는 프론트 주소는 서버 환경변수 `CORS_ALLOWED_ORIGINS` (쉼표로 여러 개, `http://localhost:*` 패턴 가능, 기본 `http://localhost:5173`). 쿠키는 쓰지 않으므로 `withCredentials` 불필요. 401·403 응답에도 CORS 헤더가 붙음 |

### 0-3. HTTP 상태 / 에러 코드
| HTTP | code 예시 | 상황 |
|---|---|---|
| 400 | `VALIDATION_FAILED` | 입력값 검증 실패 (`details`에 필드별 사유) |
| 400 | `EMAIL_NOT_VERIFIED`, `VERIFICATION_CODE_INVALID`, `VERIFICATION_CODE_EXPIRED` | 회원가입: 이메일 인증 토큰이 없거나 만료·사용됨 / 인증 코드 틀림(`details.remainingAttempts`) / 코드 만료·5회 틀림 → 다시 받기 |
| 401 | `AUTH_REQUIRED`, `TOKEN_EXPIRED`, `INVALID_CREDENTIALS` | 미인증·잘못된 토큰 / access 토큰 만료 → refresh 시도 / 로그인 시 이메일 또는 비밀번호 불일치 |
| 403 | `FORBIDDEN`, `ACCOUNT_NOT_ACTIVE` | 역할·소유권 불일치 (다른 기관 의뢰 조회 등) / 승인 대기·거절·정지 계정 로그인 (`details.status`, 거절이면 `details.rejectReason`) |
| 404 | `NOT_FOUND`, `EQUIPMENT_NOT_FOUND`, `REQUEST_NOT_FOUND` | 없는 주소 / 없는 장비 / 없는 의뢰 |
| 405 | `METHOD_NOT_ALLOWED` | 지원하지 않는 HTTP 메서드 |
| 409 | `REQUEST_INVALID_STATUS`, `VERSION_CONFLICT`, `RESERVATION_OVERLAP`, `RESERVATION_ALREADY_CONFIRMED`, `SUPPLEMENT_ALREADY_OPEN` | 상태 전이 불가 / 동시 수정 / 일정 중복 / 이미 확정된 의뢰 / 답변 대기 중인 보완 요청 존재 |
| 409 | `EMAIL_ALREADY_EXISTS`, `ORGANIZATION_ALREADY_EXISTS` | 회원가입: 이미 가입된 이메일 / 같은 유형에 같은 이름의 조직이 이미 있음 (`organizations` UNIQUE(org_type, name)) |
| 409 | `USER_INVALID_STATUS` | 관리자: 승인 대기(PENDING)가 아닌 회원을 승인·거절 |
| 429 | `TOO_MANY_REQUESTS` | 요청이 너무 잦음. 이메일 인증 코드는 같은 이메일 60초에 한 번, 같은 IP 1분에 5번(전체 60번), 로그인은 같은 IP 1분에 20번 (`details.retryAfter` 초). AI 기능은 AI 서비스 한도 초과·동시 호출 초과 때도 429 ("잠시 후 다시 시도") |
| 500 | `INTERNAL_ERROR` | 처리되지 않은 서버 오류 (서버 로그 확인) |
| 502 | `AI_UPSTREAM_ERROR` | LLM 호출 실패 |

### 0-4. 권한 규칙
| 역할 | 범위 |
|---|---|
| 비로그인 | `/auth/**` (이메일 인증·가입·로그인·토큰 재발급·가입용 기관 목록)만 허용. 나머지는 전부 `401 AUTH_REQUIRED`. 프론트는 로그인 페이지 외 모든 라우트에서 로그인 페이지로 이동 |
| 🏢 의뢰자 | 장비·시험정보 조회, 본인 상담/시험조건/의뢰/시뮬레이션만 조회·수정. 기업·기관·대학 회원 누구나 의뢰자가 될 수 있음. 단, **자기 소속 조직이 보유한 장비에는 의뢰할 수 없음** (`400 VALIDATION_FAILED`, `details.field=equipmentId`). 매칭 추천에서도 자기 조직 장비는 빠짐 |
| 🏛 장비 보유 조직 구성원 | 장비·시험정보 조회, 소속 조직 장비 등록·수정, 소속 조직 장비로 들어온 의뢰 검토·보완요청·예약 확정. 기업·기관·대학 어느 유형이든 소속 조직 기준으로 판단 (역할 `COMPANY_USER`/`INSTITUTION_MANAGER`는 가입 유형 표시) |
| 👑 플랫폼 관리자 | 전체(마스터). 모든 조회·수정, 회원·기관 승인, 초기 데이터 적재. 관리자가 대신 처리한 상태 변경도 `request_status_history.changed_by`에 관리자 id로 남음 |

- 소유권 체크: `user.organization_id == equipment.institution_id` (의뢰는 `test_requests.institution_id`) 일 때만 수정 가능, 아니면 `403 FORBIDDEN`. 역할·조직 유형은 보지 않으므로 기업 회원도 자기 조직 장비를 등록·관리할 수 있음
- `institution_id`·`/institutions` 라는 이름은 그대로지만 뜻은 "장비 보유 조직"(기업·기관·대학). `GET /institutions`에는 승인된 기관·대학 전부와, 활성 장비가 1대 이상인 기업이 나옴 (`orgType`으로 구분)
- 상태가 `ACTIVE`가 아닌 계정(PENDING/REJECTED/SUSPENDED)은 로그인 시 `403 ACCOUNT_NOT_ACTIVE` (승인 대기 안내 화면)
- 로그인한 뒤 관리자가 정지·거절하면 **이미 받은 access 토큰도 다음 요청부터** `403 ACCOUNT_NOT_ACTIVE` (서버가 요청마다 계정 상태 확인, 30초 캐시 + 상태 변경 시 즉시 반영). 계정이 없어진 토큰은 `401 AUTH_REQUIRED`. 가입·로그인 같은 공개 API 는 그대로 사용 가능
- 관리자 계정은 회원가입으로 만들 수 없음. 서버 초기 세팅(seed/환경변수)으로만 생성

---

## 1. 인증 · 사용자 (BE-A)

| Method | URL | 권한 | 설명 |
|---|---|---|---|
| POST | `/auth/email-verifications` | 🔓 | 이메일 인증 코드(6자리) 발송 |
| POST | `/auth/email-verifications/confirm` | 🔓 | 인증 코드 확인 → 가입용 `verificationToken` |
| POST | `/auth/signup` | 🔓 | 회원가입 (기업 / 기관 담당자, 이메일 인증 필수) |
| POST | `/auth/login` | 🔓 | 로그인 → access/refresh 토큰 |
| POST | `/auth/refresh` | 🔓 | 토큰 재발급 |
| GET | `/auth/institutions` | 🔓 | 가입용 기관·대학 목록 (id·유형·이름·지역만) |
| POST | `/auth/logout` | 로그인 | refresh 토큰 폐기 |
| GET | `/users/me` | 로그인 | 내 정보 + 소속 조직 |
| PATCH | `/users/me` | 로그인 | 내 정보 수정 |

**가입 흐름**

모든 가입은 **① 이메일 인증 → ② 가입 신청(PENDING) → ③ 플랫폼 관리자 승인(ACTIVE)** 순서입니다. 아이디는 이메일입니다.

| 가입 유형 | 입력 | 가입 직후 상태 | 활성화 |
|---|---|---|---|
| 기업 | 이메일(인증), 비밀번호, 이름, 회사명, 사업자등록번호 → 기업 조직 새로 생성 (`is_verified=false`) | `PENDING` | 관리자가 승인 → 회원 `ACTIVE` + 기업 조직 승인 |
| 기관 담당자 (등록된 기관) | 이메일(인증), 비밀번호, 이름, 기관 목록에서 선택 `organizationId` | `PENDING` | 관리자가 승인 → `ACTIVE` |
| 기관 담당자 (미등록 기관) | 이메일(인증), 비밀번호, 이름, 기관명·주소·연락처 → 기관 조직 생성 (`is_verified=false`) | `PENDING` | 관리자가 승인 → 회원 `ACTIVE` + 기관 승인(가입용 기관 목록에 나타남) |
| 플랫폼 관리자 | 가입 불가 | - | 서버 초기 세팅으로 생성 |

- **이메일 인증**: 6자리 코드 10분 유효, 같은 이메일은 60초에 한 번 발송, 5번 틀리면 다시 받기. 확인되면 `verificationToken`(30분 유효, 가입에 한 번만 사용)을 받아 가입 요청에 같이 보냅니다.
- **메일 발송**: 서버에 SMTP(`MAIL_HOST` 등)가 설정돼 있으면 실제 메일, 없으면(로컬·시연) 서버 로그에 코드를 출력합니다.
- **사업자등록번호**: 숫자 10자리인지만 확인하고(하이픈 있어도 됨, `123-45-67890` 형식으로 저장) 진위 확인은 관리자가 승인할 때 합니다.
- **같은 이름의 조직**: 이미 있으면 `409 ORGANIZATION_ALREADY_EXISTS`. 단, 미승인 조직이고 승인 대기·활성 회원이 없으면(거절된 신청만 남은 경우) 그 조직을 다시 쓰고 사업자번호·주소·연락처를 새 입력으로 바꿉니다.

> 가입 화면에서 기관을 고르려면 로그인 전에 기관 목록이 필요하므로 `GET /auth/institutions`를 `/auth` 아래에 두고 유형·이름·지역만 반환합니다. 대학(`UNIVERSITY`)도 기관과 같은 방식으로 가입하므로 이 목록에 함께 나옵니다.

```json
// ① POST /auth/email-verifications { "email": "a@company.com" } → 200
{ "expiresIn": 600, "resendAvailableIn": 60 }
// 실패: 409 EMAIL_ALREADY_EXISTS / 429 TOO_MANY_REQUESTS { "retryAfter": 42 }

// ② POST /auth/email-verifications/confirm { "email": "a@company.com", "code": "123456" } → 200
{ "verificationToken": "oT1Jjp0d3VXWgK9it_iACWk2W9RuoSyVYvcmeCieBtI", "expiresIn": 1800 }
// 실패: 400 VERIFICATION_CODE_INVALID { "remainingAttempts": 4 } / 400 VERIFICATION_CODE_EXPIRED (만료·5회 틀림 → ① 다시)

// ③ POST /auth/signup (기업)
{ "email": "a@company.com", "password": "****", "name": "홍길동", "phone": "010-0000-0000",
  "role": "COMPANY_USER", "verificationToken": "oT1Jjp0d3...",
  "organization": { "name": "가상 B기업", "businessRegNo": "123-45-67890" } }
// → 201 { "userId": 20, "status": "PENDING" }  관리자 승인 전에는 로그인 시 403 ACCOUNT_NOT_ACTIVE

// POST /auth/signup (기관 담당자 - 기존 기관 선택)
{ "email": "kim@ktp.or.kr", "password": "****", "name": "김담당", "phone": "042-000-0000",
  "role": "INSTITUTION_MANAGER", "verificationToken": "...", "organizationId": 3, "researcherNo": "11223344" }
// → 201 { "userId": 21, "status": "PENDING" }  관리자 승인 전에는 로그인 시 403 ACCOUNT_NOT_ACTIVE
// researcherNo: 국가연구자번호. 기관·대학 담당자는 필수, 숫자 8자리 형식만 확인(실제 조회 없음, V12).
//   없거나 형식이 틀리면 400 VALIDATION_FAILED (fields[0].field = "researcherNo"). 기업은 보내지 않음.
//   GET /users/me, GET /admin/users 응답에 researcherNo 로 나옴

// POST /auth/signup (기관 담당자 - 미등록 기관 신청: organizationId 대신 organization)
{ "email": "lee@newlab.re.kr", "password": "****", "name": "이담당", "phone": "055-000-0000",
  "role": "INSTITUTION_MANAGER", "verificationToken": "...",
  "organization": { "name": "가상 신규 시험기관", "address": "경남 진주시 ...", "phone": "055-000-0000" } }
// → 201 { "userId": 22, "status": "PENDING" }

// POST /auth/signup (대학 담당자 - 미등록 대학 신청: organization.orgType 을 UNIVERSITY 로. 생략하면 INSTITUTION)
{ "email": "park@univ.ac.kr", "password": "****", "name": "박담당", "phone": "055-000-0001",
  "role": "INSTITUTION_MANAGER", "verificationToken": "...",
  "organization": { "orgType": "UNIVERSITY", "name": "가상대학교 공동기기센터", "address": "경남 진주시 ...", "phone": "055-000-0001" } }
// → 201 { "userId": 23, "status": "PENDING" }  (이미 승인된 대학은 기관처럼 organizationId 로 선택)
// 실패: 400 EMAIL_NOT_VERIFIED (토큰 없음·만료·이미 사용·다른 이메일) / 409 EMAIL_ALREADY_EXISTS / 409 ORGANIZATION_ALREADY_EXISTS
//       400 VALIDATION_FAILED (role=ADMIN, 사업자등록번호 형식, 기관 담당자 신청의 orgType 이 INSTITUTION·UNIVERSITY 가 아님 등)

// POST /auth/login { "email": "a@company.com", "password": "****" } → 200
{ "accessToken": "eyJ...", "refreshToken": "eyJ...", "expiresIn": 3600,
  "user": { "id": 1, "name": "홍길동", "role": "COMPANY_USER", "organizationId": 10 } }
// 실패: 401 INVALID_CREDENTIALS
//       403 ACCOUNT_NOT_ACTIVE { "status": "PENDING" } 또는 { "status": "REJECTED", "rejectReason": "사업자등록번호를 확인할 수 없습니다." }

// POST /auth/refresh { "refreshToken": "eyJ..." } → 200 (로그인과 같은 형식, refresh 토큰도 새로 발급)
// 한 번 쓴 refresh 토큰은 폐기됨. 만료·폐기된 토큰이면 401 AUTH_REQUIRED → 다시 로그인

// POST /auth/logout { "refreshToken": "eyJ..." } → 200 { "success": true }

// GET /auth/institutions → 200 (승인된 기관·대학만, 가나다순. orgType 은 INSTITUTION | UNIVERSITY)
[ { "id": 5, "orgType": "INSTITUTION", "name": "가온대학교 첨단소재분석센터", "region": "진주" }, ... ]

// GET /users/me → 200 (organization 은 소속이 없으면 null)
{ "id": 3, "email": "manager@example.com", "name": "김담당", "phone": "042-000-0001",
  "role": "INSTITUTION_MANAGER", "status": "ACTIVE",
  "organization": { "id": 2, "orgType": "INSTITUTION", "name": "미리내우주환경시험센터", "region": "대전", "isVerified": true },
  "lastLoginAt": "2026-11-07T17:03:04+09:00", "createdAt": "2026-11-07T17:02:51+09:00" }

// PATCH /users/me { "name"?: "김담당", "phone"?: "042-000-0009" } → 200 (GET 과 같은 형식, 보낸 값만 수정)
```

> 시연 계정과 비밀번호는 저장소에 적지 않습니다. 백엔드 담당자에게 받아 주세요.

> 토큰: access 토큰은 `Authorization: Bearer` 헤더로 보냅니다(유효 1시간). refresh 토큰은 유효 14일이고, 서버는 원문 대신 해시만 `refresh_tokens.token_hash`에 저장합니다.

---

## 2. 장비 · 검색 · 시험정보 (BE-A) — 기능 1·2·3·4·12

| Method | URL | 권한 | 설명 | 기능 |
|---|---|---|---|---|
| GET | `/equipment` | 로그인 | 장비 통합 검색/목록 | 1 |
| GET | `/equipment/{id}` | 로그인 | 장비 상세 (사양, 이용조건, 가동률, 갱신일) | 2 |
| GET | `/equipment/spec-definitions` | 로그인 | 허용 사양 키·한글명·기준 단위·값 형식 목록 | 2 |
| GET | `/equipment/{id}/availability` | 로그인 | `?from=YYYY-MM-DD&to=YYYY-MM-DD` 기간별 가용성 | 2 |
| GET | `/equipment/{id}/similar` | 로그인 | 동일·유사 장비 (같은 시험유형/분류, 이름 유사도) | 12 |
| GET | `/equipment/duplicates` | 로그인 | 지역 내 중복 장비 그룹 목록 `?region=대전&testType=VIBRATION` | 12 |
| POST | `/equipment/compare` | 로그인 | 장비 N개 사양·이용 조건 비교표 `{ "equipmentIds": [1,5,9], "testType"?: "VIBRATION" }` | 12 |
| GET | `/search` | 로그인 | 시험항목·자연어 통합 검색 `?q=15kg 시료 진동시험` | 3 |
| GET | `/test-types` | 로그인 | 시험유형 목록 (15개, 표시 순서, 장비 수 포함) | 3 |
| GET | `/test-types/{code}` | 로그인 | 시험 정보 안내: 가능 기관·예상비용·기간·이용조건 + 입력할 조건 목록(`conditionRules`) | 4 |
| GET | `/institutions` | 로그인 | 장비 보유 조직 목록 (승인된 기관·대학 + 장비가 있는 기업, 가나다순, 장비 수 포함) | |
| GET | `/institutions/{id}` | 로그인 | 기관 상세 + 보유 장비 수·유형별 수·가능 시험유형 | |
| GET | `/institutions/{id}/security` | 로그인 | 기관 보안시설·시료/데이터 반출·NDA 협의 안내 | |
| PATCH | `/institutions/{id}/security` | 🏛(소유기관) 👑 | `hasSecureFacility`, `securityNote` 수정 | |

**GET `/equipment` 쿼리**

| 파라미터 | 예시 | 설명 |
|---|---|---|
| `q` | `진동` | 장비명·모델·제조사, 또는 시험유형(이름·코드·키워드) 부분 일치. 검색어가 있으면 이름이 비슷한 순서(pg_trgm)가 먼저 |
| `region` | `대전` | 복수 가능 `region=대전&region=진주` |
| `institutionId` | `3` | |
| `equipmentType` | `TEST` | MEASUREMENT / MANUFACTURING / TEST / SOFTWARE / SUPPORT |
| `testType` | `VIBRATION` | |
| `availability` | `AVAILABLE` | |
| `externalOnly` | `true` | 외부 이용 가능만 |
| `accreditedOnly` | `true` | 유효한 공인성적서 발급 정보가 있는 장비만. testType 지정 시 같은 시험유형의 공인 여부로 필터. 기본 false |
| `includeMock` | `true` | 기본 true(시연), 운영 시 false |
| `page`, `size`, `sort` | `sort=infoUpdatedAt,desc` | 기본 `size=20`, 정렬은 `externalId`(기본, 오름차순)·`infoUpdatedAt`만. 그 외 필드는 `400 VALIDATION_FAILED` |

- 활성 장비(`is_active`)만 나옵니다. 없거나 비활성인 장비 상세는 `404 EQUIPMENT_NOT_FOUND`.
- `region`: 원본에 지역이 없던 진주뿌리기술지원센터 장비 31대는 V5 마이그레이션으로 `진주`를 채웠습니다.

```json
// GET /equipment?testType=VIBRATION → content[] 항목  (seed 실제 데이터 ASTRA-CAND-0048)
{ "id": 48, "externalId": "ASTRA-CAND-0048", "name": "진동시험기", "model": "EDS5000LS4-445",
  "institution": { "id": 2, "name": "미리내우주환경시험센터" }, "region": "대전",
  "equipmentType": "TEST", "testTypes": ["VIBRATION"],
  "availability": "UNKNOWN", "availabilityNeedsConfirmation": true, "utilizationRate": null, "feeText": null,
  "verificationStatus": "LISTING_CONFIRMED", "isMock": true, "infoUpdatedAt": "2026-11-07T11:52:01.241657+09:00" }
// infoUpdatedAt: 초기 적재 데이터는 DB 를 만든(마이그레이션) 시각. 기관이 수정·확인하면 그 시각으로 바뀜

// GET /equipment/48 → 위 필드 + 아래
// specs: REAL·MOCK 을 모두 주고, 같은 사양 키면 REAL 이 먼저 (예: 장비 37 의 frequency 는 REAL, MOCK 순)
//        단일값 value / 범위 min·max / 숫자가 아니면 valueText. 값이 없는 필드는 생략
{ ...,
  "manufacturer": "(주)팜테크", "category": null, "description": null,
  "usage": { "accessScope": "UNKNOWN", "feeText": null, "feeAmount": null, "feeUnit": null,
             "durationText": null, "utilizationRate": null, "availability": "UNKNOWN",
             "availabilityUpdatedAt": null, "availabilityUpdatedBy": null, "availabilityNote": null,
             "availabilityNeedsConfirmation": true, "leadTimeDays": null, "operationMode": "UNKNOWN" },
  "specs": [
    { "key": "frequency", "label": "주파수 범위", "min": 10, "max": 3000, "unit": "Hz", "originalUnit": "Hz",
      "sourceType": "MOCK", "usageScope": "DEMO_ONLY", "verificationStatus": "NOT_VERIFIED" },
    { "key": "max_payload", "label": "최대 시료 질량", "value": 40, "unit": "kg", "sourceType": "MOCK", ... },
    { "key": "max_fixture_mass", "label": "고정구 질량 허용 예시", "value": 15, "unit": "kg", "sourceType": "MOCK", ... },
    { "key": "rated_sine_force", "label": "정현파 가진력 예시", "value": 35, "unit": "kN", "sourceType": "MOCK", ... } ],
  "source": { "type": "WEB", "url": "https://deps.dips.or.kr/mic/community/equipCommonList?comGubun=Universe&manuId=MENU00421",
              "file": "astra_deps_additional_10.json", "page": null },
  "simulation": { "capability": "CALCULATED_DEMO", "presetIds": ["SIM-0048"] } }

// GET /search?q=위성 전장품 15kg, 20~2000Hz 진동시험 → 기능 3 (시연 문장, 실제 응답)
{ "interpreted": { "interpreter": "KEYWORD", "testTypes": ["VIBRATION"],
                   "conditions": [ { "key": "sample_mass", "value": 15, "unit": "kg" },
                                   { "key": "frequency", "min": 20, "max": 2000, "unit": "Hz" } ],
                   "regions": [] },
  "testTypes": [ { "code": "VIBRATION", "nameKo": "진동시험" } ],
  "equipment": [ /* 목록 항목 형식: ASTRA-CAND-0044, 0045, 0047, 0048 */ ] }
// 해석: BE-C 추출기(ConditionExtractor)가 있으면 그것(interpreter=AI), 없으면 키워드·숫자 해석(KEYWORD)
//   KEYWORD: 시험유형 이름·키워드(test_types.keywords)로 시험유형, "20~2000Hz" → 단위 같은 RANGE 조건, "15kg" → 단위 같은 NUMBER 조건
//   regions: 문장에 있던 지역(예: "대전 진동시험" → ["대전"]) → 장비 검색 지역 필터
// equipment: 해석된 시험유형의 장비 (최대 20대). 시험유형을 못 찾으면 문장으로 장비명·모델 검색
// 실패: 400 VALIDATION_FAILED (q 없음·빈 값)

// GET /test-types/VIBRATION → 기능 4 (+ 조건 입력폼·AI 누락 분석·매칭이 쓰는 conditionRules)
{ "code": "VIBRATION", "nameKo": "진동시험", "description": null,
  "conditionRules": [
    { "conditionKey": "sample_mass",     "label": "시료 질량",   "valueType": "NUMBER", "unit": "kg", "isRequired": true,  "specKey": "max_payload",      "comparator": "MAX_LIMIT" },
    { "conditionKey": "fixture_mass",    "label": "고정구 질량", "valueType": "NUMBER", "unit": "kg", "isRequired": true,  "specKey": "max_fixture_mass", "comparator": "MAX_LIMIT" },
    { "conditionKey": "frequency",       "label": "주파수 범위", "valueType": "RANGE",  "unit": "Hz", "isRequired": true,  "specKey": "frequency",        "comparator": "RANGE_WITHIN" },
    { "conditionKey": "excitation_axis", "label": "가진 축",     "valueType": "TEXT",   "unit": null, "isRequired": false, "specKey": null,               "comparator": "NONE" },
    { "conditionKey": "accredited_required", "label": "공인성적서 필요 여부", "valueType": "TEXT", "unit": null, "isRequired": false, "specKey": null, "comparator": "NONE" } ],
  "institutions": [
    { "id": 6, "name": "다온신뢰성시험센터", "region": "대전", "equipmentCount": 2,
      "estCostMin": null, "estCostMax": null, "estDurationDays": null, "accessScope": "UNKNOWN" },
    { "id": 8, "name": "마루기술지원센터", "region": "원주", "equipmentCount": 1,
      "estCostMin": null, "estCostMax": null, "estDurationDays": null, "accessScope": "UNKNOWN" },
    { "id": 2, "name": "미리내우주환경시험센터", "region": "대전", "equipmentCount": 1,
      "estCostMin": null, "estCostMax": null, "estDurationDays": null, "accessScope": "UNKNOWN" } ] }
// institutions: 장비 수 많은 순, 같으면 가나다순. 기관 장비가 여러 대면 estCostMin=최솟값, estCostMax=최댓값,
//   estDurationDays=가장 짧은 값, accessScope=하나라도 외부 이용 가능이면 EXTERNAL_ALLOWED / 모두 내부 전용이면 INTERNAL_ONLY / 그 외 UNKNOWN
// 없는 코드면 404 NOT_FOUND

// GET /equipment/48/similar → 유사 장비 최대 10개 (자기 자신 제외)
//   후보: 시험유형이 하나라도 같거나, 같은 유형·분류이거나, 이름 유사도(pg_trgm) 0.3 이상
//   순서: 시험유형이 겹치는 장비 → 이름 유사도 높은 순
[ { "equipment": { /* 목록 항목 형식 */ "id": 44, "externalId": "ASTRA-CAND-0044", "name": "진동시험기1", ... },
    "reasons": ["같은 시험유형: 진동시험", "이름 유사"], "nameSimilarity": 0.62 },
  { "equipment": { "id": 47, "externalId": "ASTRA-CAND-0047", ... }, "reasons": ["같은 시험유형: 진동시험", "이름 유사"], ... },
  { "equipment": { "id": 45, "externalId": "ASTRA-CAND-0045", ... }, "reasons": ["같은 시험유형: 진동시험"], ... }, ... ]

// GET /equipment/duplicates?region=대전&testType=VIBRATION → 같은 지역 + 같은 시험유형에 장비 2대 이상인 그룹
//   region·testType 생략 시 전체. 장비 수 많은 순 → 지역 가나다순 → 시험유형 표시 순서
[ { "region": "대전", "testType": { "code": "VIBRATION", "nameKo": "진동시험" },
    "equipmentCount": 3, "institutionCount": 2,
    "equipment": [ /* 목록 항목 형식: ASTRA-CAND-0044, ASTRA-CAND-0045, ASTRA-CAND-0048 */ ] } ]

// POST /equipment/compare { "equipmentIds": [48, 44], "testType"?: "VIBRATION" } → 장비 2~5대 비교표
//   rows: 사양 키별 한 줄 (요청 순서대로 처음 나온 키 순). values 는 equipment 순서와 같고 사양이 없으면 null
//   칸마다 같은 키에 REAL 이 있으면 REAL, 없으면 MOCK. MOCK 이 하나라도 쓰였으면 usedMockData=true (DEMO 표시)
//   usage: 장비별 이용 조건 (equipment 순서와 같음). 값이 없으면 null → 화면에 "정보 없음" (seed 는 요금·예상 비용 대부분 없음)
//   testType 을 보내면 usage[].testTypeEstimate 에 그 시험의 예상 비용·소요일. 그 장비가 그 시험을 못 하면 supported=false
{ "equipment": [ /* 목록 항목 48 */, /* 목록 항목 44 */ ],
  "rows": [ { "key": "frequency", "label": "주파수 범위",
              "values": [ { "equipmentId": 48, "min": 10, "max": 3000, "unit": "Hz", "sourceType": "MOCK" },
                          { "equipmentId": 44, "min": 5, "max": 1800, "unit": "Hz", "sourceType": "MOCK" } ] }, ... ],
  "usage": [ { "equipmentId": 48, "accessScope": "UNKNOWN", "feeText": null, "feeAmount": null, "feeUnit": null,
               "durationText": null, "utilizationRate": null, "availability": "UNKNOWN",
               "availabilityNeedsConfirmation": true, "leadTimeDays": null, "operationMode": "UNKNOWN",
               "verificationStatus": "LISTING_CONFIRMED", "infoUpdatedAt": "2026-11-07T11:52:01.241657+09:00",
               "testTypeEstimate": { "code": "VIBRATION", "supported": true, "estCostMin": null, "estCostMax": null,
                                     "estDurationDays": null, "isAccredited": null,
                                     "accreditationNo": null, "accreditationValidUntil": null } }, ... ],
  "testType": "VIBRATION",
  "usedMockData": true }
// seed의 시험별 예상 비용·기간·공인정보는 미확인(null). 임의 가격·공인번호를 채우지 않음
// rows[].values[].originalUnit은 입력 원문 단위. 숫자와 unit은 항상 기준 단위
// 실패: 400 VALIDATION_FAILED (1대 또는 6대 이상, 같은 장비 중복, 없는 testType) / 404 EQUIPMENT_NOT_FOUND { "equipmentIds": [999999] }

// GET /test-types → 15개, display_order 순. equipmentCount = 그 시험을 할 수 있는 활성 장비 수 (0 이어도 포함)
[ { "code": "ACOUSTIC_NOISE", "nameKo": "음향·소음 시험", "description": null, "keywords": ["소음", "음향", "dB"], "equipmentCount": 1 },
  { "code": "BATTERY_TEST", "nameKo": "배터리 시험", "description": null, "keywords": ["배터리", "충방전", "전지"], "equipmentCount": 2 }, ... ]

// GET /institutions → 승인된 기관·대학 전체 + 장비가 있는 기업, 이름 가나다순 (페이지 없음). orgType 은 INSTITUTION | UNIVERSITY | COMPANY
[ { "id": 5, "orgType": "INSTITUTION", "name": "가온대학교 첨단소재분석센터", "parentName": null, "region": "진주", "equipmentCount": 5 },
  { "id": 8, "orgType": "INSTITUTION", "name": "마루기술지원센터", "parentName": null, "region": "원주", "equipmentCount": 1 }, ... ]

// GET /institutions/2 → 없거나 미승인이거나, 장비가 없는 기업이면 404 NOT_FOUND
{ "id": 2, "orgType": "INSTITUTION", "name": "미리내우주환경시험센터", "parentName": null, "region": "대전",
  "address": null, "phone": null, "email": null, "homepageUrl": null,
  "equipmentCount": 13, "equipmentByType": { "MEASUREMENT": 11, "TEST": 2 },
  "testTypes": [ { "code": "ELECTRICAL_RF_ANALYSIS", "nameKo": "전기·RF 측정", "equipmentCount": 10 },
                 { "code": "TEMPERATURE_HUMIDITY", "nameKo": "온습도시험", "equipmentCount": 1 },
                 { "code": "VIBRATION", "nameKo": "진동시험", "equipmentCount": 1 },
                 { "code": "X_RAY_INSPECTION", "nameKo": "X선 비파괴검사", "equipmentCount": 1 } ] }
```

---

### 2-1. 기관 장비 관리 — 장비 정보는 기관이 직접 등록·갱신

플랫폼은 장비 정보를 직접 입력하지 않습니다. 기관 담당자가 소속 기관 장비를 등록하고 갱신하며, 플랫폼은 입력 창구, 검증 상태 표시, 갱신 알림만 맡습니다.

| Method | URL | 권한 | 설명 |
|---|---|---|---|
| GET | `/institutions/me/equipment` | 로그인 | 우리 조직(기업·기관·대학) 장비 목록 (검증 상태, 마지막 갱신일, 갱신 필요 여부). 등록한 장비가 없으면 빈 목록 |
| POST | `/equipment` | 로그인 | 장비 등록. 기업·기관·대학 모두 가능. `institutionId`는 로그인 사용자 소속 조직으로 서버가 채움 (관리자는 `institutionId` 필수) |
| PATCH | `/equipment/{id}` | 🏛(소유기관) | 기본정보·이용조건·요금·가동률·가용상태 수정 (보낸 값만) → `INSTITUTION_VERIFIED`, `infoUpdatedAt` 갱신 |
| PUT | `/equipment/{id}/specs` | 🏛(소유기관) | 실제 사양(REAL) 전체를 보낸 목록으로 교체 (빈 목록이면 REAL 삭제). MOCK 사양은 수정 불가 |
| PUT | `/equipment/{id}/test-types` | 🏛(소유기관) | 가능 시험유형 + 예상 비용·소요기간 (기능 4 데이터) |
| GET | `/equipment/{id}/downtimes` | 🏛(소유기관) 👑 | `?from=&to=` 정비·운휴 일정과 사유 |
| POST | `/equipment/{id}/downtimes` | 🏛(소유기관) 👑 | `{startAt,endAt,reason}` 정비·운휴 등록 → 201 `{id}` |
| DELETE | `/equipment/{id}/downtimes/{downtimeId}` | 🏛(소유기관) 👑 | 정비·운휴 삭제 → 200 data=null |
| POST | `/equipment/{id}/confirm` | 🏛(소유기관) | "현재 정보가 맞음" 확인만 → `INSTITUTION_VERIFIED`, `infoUpdatedAt=now` |
| DELETE | `/equipment/{id}` | 🏛(소유기관) | 비활성화 (`is_active=false`, 기존 의뢰 이력 보존) |
| GET | `/equipment/{id}/change-logs` | 🏛(소유기관) | 누가 언제 무엇을 바꿨는지 |
| POST | `/admin/equipment/import` | 👑 | 초기 데이터(공개자료 수집 JSON) 적재 (미구현, 현재는 V2 seed 로 적재) |

- 권한: 기관 담당자는 소속 기관 장비만 (`AccessGuard.requireInstitution`), 아니면 `403 FORBIDDEN`. 관리자는 전부. 기업 회원은 `403`
- 없거나 비활성인 장비는 `404 EQUIPMENT_NOT_FOUND` (변경 이력 조회는 비활성 장비도 가능)
- 장비 기본정보·사양·시험유형 변경은 `equipment_change_logs`에 `action`(CREATE / UPDATE / SPECS_UPDATE / TEST_TYPES_UPDATE / CONFIRM / DEACTIVATE / TRANSFER)과 `changes` `{"필드": {"before", "after"}}`로 기록. 정비 등록자는 별도 일정의 createdBy로 기록
- 입력 오류는 `400 VALIDATION_FAILED` + 필드 경로 (`specs[0].value`: 값 없음, `specs[0].min`: min > max, `specs[1].key`: 키 중복, `testTypes[0].code`: 없는 코드·중복)

**초기 데이터 → 기관 인수인계 흐름**
1. 관리자가 공개자료로 모은 71대를 `import`로 적재 (`verification_status=NEEDS_MANUAL_REVIEW`, 화면에 "기관 미확인" 표시)
2. 기관 담당자가 가입·승인되면 대시보드에 "우리 기관 장비 N대 확인 필요" 표시
3. 담당자가 수정하거나 `confirm`을 누르면 `INSTITUTION_VERIFIED`로 바뀌고, 화면의 "기관 미확인" 표시가 사라짐
4. 상태 확인일 `availabilityUpdatedAt`(없으면 생성일)이 90일을 넘으면 담당자에게 `EQUIPMENT_UPDATE_REQUIRED` 알림. `confirm`은 일반 정보만 확인하며 상태 확인은 `usage.availability`를 포함해 PATCH

> MOCK 사양은 시연용이라 관리자 seed로만 들어갑니다. 기관이 REAL 사양을 입력하면 화면과 매칭은 REAL을 우선 사용합니다.

```json
// POST /equipment (장비 48의 실제 seed 목록 정보를 사용한 요청 형식. 사양·가격은 확인 전이므로 생략)
{ "name": "진동시험기", "model": "EDS5000LS4-445", "manufacturer": "(주)팜테크",
  "equipmentType": "TEST", "usage": { "accessScope": "UNKNOWN", "availability": "UNKNOWN" },
  "testTypes": [ { "code": "VIBRATION" } ] }
// → 201 data: {id, externalId, verificationStatus}. 새 ID는 서버가 부여
// 입력한 사양은 REAL(verificationStatus=VERIFIED)로 저장하므로 기관의 실제 확인값만 입력
// region 을 안 보내면 기관 지역

// PATCH /equipment/48 { "model": "EDS5000LS4-445" } → 200 장비 상세 (보낸 값만 수정)
// PUT /equipment/37/specs (장비 37의 REAL seed 주파수를 사용한 요청 형식)
// { "specs": [ { "key": "frequency", "label": "주파수 범위", "min": 75, "max": 110, "unit": "GHz" } ] }
//   → 200 장비 상세. REAL은 Hz로 환산, originalUnit=GHz. 기존 MOCK은 유지
// PUT /equipment/48/test-types { "testTypes": [ { "code": "VIBRATION" } ] } → 200 장비 상세
// POST /equipment/48/confirm → 200 장비 상세 (verificationStatus=INSTITUTION_VERIFIED, infoUpdatedAt=지금)
// DELETE /equipment/{id} → 200 { "success": true, "data": null }

// GET /institutions/me/equipment → 페이지 (기관 담당자: 소속 기관 / 관리자: ?institutionId= 필수). 기본 정렬 externalId
//   needsUpdate = updateReasons가 있거나 availabilityNeedsConfirmation이면 true.
//   NOT_CONFIRMED: 일반 정보 기관 확인 전, OUTDATED: 일반 정보 마지막 갱신 90일 경과
{ "content": [ { "id": 48, "externalId": "ASTRA-CAND-0048", "name": "진동시험기", "model": "EDS5000LS4-445",
                 "equipmentType": "TEST", "testTypes": ["VIBRATION"], "availability": "UNKNOWN",
                 "verificationStatus": "LISTING_CONFIRMED", "specVerificationStatus": "NOT_VERIFIED", "isMock": true,
                 "infoUpdatedAt": "2026-11-07T11:52:01.241657+09:00", "daysSinceUpdate": 1,
                 "needsUpdate": true, "updateReasons": ["NOT_CONFIRMED"], "availabilityNeedsConfirmation": true }, ... ],
  "page": 0, "size": 20, "totalElements": 13, "totalPages": 1 }

// GET /equipment/72/change-logs → 페이지, 최신순
{ "content": [ { "id": 3, "action": "UPDATE", "changedBy": { "id": 3, "name": "김담당" },
                 "changes": { "model": { "before": "V-850", "after": "V-900" },
                              "feeAmount": { "before": 300000, "after": 450000 } },
                 "createdAt": "2026-11-08T12:40:00+09:00" },
               { "id": 1, "action": "CREATE", "changedBy": { "id": 3, "name": "김담당" },
                 "changes": { "name": { "before": null, "after": "진동시험기" }, ..., "specs": { "before": null, "after": [ ... ] } },
                 "createdAt": "..." } ], ... }
```

---

### 2-2. 사양 사전·가용성·현업 정보 (V6)

`GET /equipment/spec-definitions`는 `specKey`, `nameKo`, `baseUnit`, `valueType`을 가진 배열(현재 29건)을 반환합니다. 사양 등록/교체는 이 사전의 키와 형식을 따라야 합니다. NUMBER는 value만, RANGE는 min/max 둘 다, TEXT는 비어 있지 않은 valueText만 받습니다. 수치는 기준 단위로 환산하고 입력 단위는 originalUnit에 보관합니다. 알 수 없는 키·단위·잘못된 형식은 `400 VALIDATION_FAILED`입니다. 현재 값에 맞춰 조회 폼을 구성하고 임의 사양 키를 만들지 않습니다.

`GET /equipment/{id}/availability`의 from/to는 한국 날짜이며 to 날짜를 포함합니다. from 생략은 오늘, to 생략은 from+60일이며 총 366일 이내입니다. 날짜 역전·초과는 `400 VALIDATION_FAILED`입니다. 응답 data의 구조는 다음과 같습니다.

| 필드 | 형식·의미 |
|---|---|
| equipmentId, from, to | 장비 ID, 조회 시작·종료 날짜 |
| availability | 장비에 저장된 현재 상태 |
| available | 전체 조회 구간이 AVAILABLE인 경우에만 true |
| needsConfirmation | UNKNOWN, 확인일 없음/90일 초과, 기관 확인자 없음이면 true |
| leadTimeDays | 대기 일수. null은 미확인 |
| intervals[] | `{startAt,endAt,availability}`. 시간대 포함 ISO 날짜/시간. 시작 포함·끝 제외 |

확정 예약(CONFIRMED)은 BUSY, 정비·운휴는 MAINTENANCE로 합칩니다. 겹친 구간은 UNAVAILABLE > MAINTENANCE > BUSY > UNKNOWN > AVAILABLE 순으로 표시합니다. 확인이 필요한 AVAILABLE은 UNKNOWN으로 표시하고, 종료 근거가 없는 현재 BUSY는 미래에도 보수적으로 BUSY를 유지합니다. 예약자·의뢰 내용은 공개하지 않습니다. 예약 제안·변경제안·확정 시 정비 겹침 또는 MAINTENANCE/UNAVAILABLE 상태는 `409 RESERVATION_OVERLAP`입니다.

정비 등록은 시간대 포함 startAt/endAt(끝 > 시작), 공백 아닌 reason(최대 500자)이 필수입니다. 확정 예약과 겹치면 `409 RESERVATION_OVERLAP`. 목록의 항목은 id, equipmentId, startAt, endAt, reason, createdBy, createdAt이며 같은 날짜 조회 범위를 사용합니다. 없는 일정 삭제는 `404 NOT_FOUND`. 정비 조회·등록·삭제는 소유기관 담당자/관리자만 가능합니다.

| PATCH usage 필드 | 의미 |
|---|---|
| availability | AVAILABLE: 운영 가능 확인, BUSY: 사용 중/일정 협의, MAINTENANCE: 정비, UNAVAILABLE: 제공 중단, UNKNOWN: 미확인 |
| availabilityNote | 상태 판단 근거, 최대 500자 |
| leadTimeDays | 0 이상 대기 일수 |
| operationMode | INSTITUTION_OPERATED(기관 전담), SUPERVISED_SELF_SERVICE(입회 후 자가), SELF_SERVICE(자가), UNKNOWN |

availability를 보내면 서버가 availabilityUpdatedAt/By를 기록하고 알림 주기를 초기화합니다. 일반 정보 수정·confirm은 상태 확인 시각을 바꾸지 않습니다. 목록·상세 usage·비교 usage·기관 관리 목록에 availabilityNeedsConfirmation이 추가됩니다. V6 seed의 시연 상태는 장비 45 AVAILABLE, 46 BUSY, 50 MAINTENANCE, 51 UNAVAILABLE이며 DEMO 근거를 표시하고 모두 기관 확인 필요입니다. 나머지 67대는 UNKNOWN입니다.

`PUT /equipment/{id}/test-types`의 항목에는 isAccredited(boolean/null), accreditationNo(최대 100자), accreditationValidUntil(날짜)을 추가합니다. true에는 인정번호·유효일까지 필수입니다. 비교의 testTypeEstimate.isAccredited는 만료일을 반영하며 false는 불가/만료, null은 미확인입니다. 시험유형을 지정한 비교에서만 시험별 공인정보를 반환합니다.

`GET /institutions/2/security`의 seed 응답 data는 `{"hasSecureFacility":null,"securityNote":null}`입니다. PATCH는 같은 두 필드를 받으며 null/생략은 변경하지 않습니다. securityNote는 최대 1000자입니다. 반출·NDA 안내이며 법적 허가 판정은 아닙니다.

활성 TEST/MEASUREMENT 장비는 등록·시험유형 교체·분류 변경 시 시험유형이 하나 이상 필요하며, 위반 시 `400 VALIDATION_FAILED`(testTypes)입니다. seed 연결 누락도 검사합니다. 가공·소프트웨어·지원 장비 25대는 유형을 추측해 연결하지 않고 검색·비교에 유지합니다. 상태 정의와 변경 책임은 [데이터 사전](design/data-dictionary.md)을 참조합니다.

---

## 3. AI 상담 · 조건 분석 (BE-C) — 기능 5·6

| Method | URL | 권한 | 설명 | 기능 |
|---|---|---|---|---|
| POST | `/chat/sessions` | 🏢 | 상담 시작 `{ "title"?: "..." }` | 5 |
| GET | `/chat/sessions` | 🏢 | 내 상담 목록 | 5 |
| GET | `/chat/sessions/{id}/messages` | 🏢 | 메시지 목록 | 5 |
| POST | `/chat/sessions/{id}/messages` | 🏢 | 메시지 전송 → AI 응답 (`Accept: text/event-stream` 시 SSE 스트리밍) | 5 |
| POST | `/chat/sessions/{id}/requirement` | 🏢 | 대화 내용으로 시험조건(requirement) 생성/갱신 | 6 |
| POST | `/requirements` | 🏢 | 시험조건 직접 생성 (폼 입력) | 6 |
| GET | `/requirements/{id}` | 🏢 | 시험조건 조회 (조건 항목 + 상태) | 6 |
| PATCH | `/requirements/{id}` | 🏢 | 목적·시료명 등 수정 | 6 |
| PUT | `/requirements/{id}/conditions` | 🏢 | 조건 항목 일괄 저장 (사용자 직접 수정) | 6 |
| POST | `/requirements/{id}/analyze` | 🏢 | AI 조건 분석: 누락·미확인 항목 + 질문 제안 | 6 |
| POST | `/requirements/{id}/confirm` | 🏢 | 조건 확정 (DRAFT→CONFIRMED) | 6 |

```json
// POST /chat/sessions/{id}/messages
{ "content": "위성 부품 진동시험 하고 싶어요. 시료 15kg, 20~2000Hz요" }
// → 200
{ "userMessage": { "id": 101, "role": "USER", "content": "..." },
  "assistantMessage": { "id": 102, "role": "ASSISTANT",
    "content": "고정구(지그)는 준비되어 있나요? 질량을 알려주시면 ...",
    "metadata": {
      "extractedConditions": [
        { "key": "sample_mass", "label": "시료 질량", "value": 15, "unit": "kg", "status": "CONFIRMED", "confidence": 0.95 },
        { "key": "frequency", "label": "주파수 범위", "min": 20, "max": 2000, "unit": "Hz", "status": "CONFIRMED", "confidence": 0.9 },
        { "key": "fixture_mass", "label": "고정구 질량", "unit": "kg", "status": "MISSING" } ],
      "suggestedTestType": "VIBRATION",
      "suggestedEquipmentIds": [45, 107, 108] } } }
// suggestedEquipmentIds: 상담 AI 가 소개할 수 있게 넘긴 그 시험유형의 DB 장비(최대 5대, 내 조직 제외, 예약 가능 먼저).
//   적합 여부 판단은 하지 않음(매칭이 판단). 화면에서 장비 카드로 보여 주면 좋음

// POST /requirements/{id}/analyze → 200
{ "requirementId": 7, "testTypeCode": "VIBRATION",
  "conditions": [ /* requirement_conditions */ ],
  "missing":     [ { "key": "fixture_mass", "label": "고정구 질량", "question": "고정구 질량은 얼마인가요?" } ],
  "unconfirmed": [ { "key": "excitation_axis", "label": "가진 축", "reason": "문장에서 명확하지 않음" } ],
  "readyForMatching": false }
```

> 설계 원칙(PPT 12p): AI 추출값은 `source=AI_EXTRACTED`, 불확실하면 `UNCONFIRMED`로 저장하고 사용자가 직접 수정 가능해야 함.
> `missing`은 그 시험유형의 `test_condition_rules` 중 `is_required=true`인데 값이 없는 조건입니다. AI는 정해진 조건 키 목록 안에서만 추출합니다.

structured output의 시험유형 enum은 test_types, 조건 키 enum은 선택 시험의 test_condition_rules에서 동적으로 만듭니다. 프롬프트에 spec_definitions와 condition_aliases를 함께 전달합니다. 예: 무게·중량→VIBRATION의 sample_mass, 가진→test_types.keywords의 VIBRATION. 조건은 항목마다 따로 검사합니다. 모르는 키·단위나 원문에 없는 숫자는 그 항목만 버리고, 근거 문장이 원문과 정확히 일치하지 않으면 UNCONFIRMED 로 낮춥니다(℃·도·%·배 같은 단위 표기와 "2,400" 같은 숫자는 기준 단위로 맞춤). 응답 구조 자체가 깨졌을 때만 `AI_UPSTREAM_ERROR`이고, 잘못된 응답을 성공 결과로 저장하지 않습니다. 허용된 값 중 불확실한 조건은 UNCONFIRMED로 남깁니다. chat_messages.metadata와 match_condition_checks에 추출·조건별 판정 근거를 보관합니다.

---

## 4. AI 매칭 · 비교 (BE-C) — 기능 7

| Method | URL | 권한 | 설명 |
|---|---|---|---|
| POST | `/requirements/{id}/match-runs` | 🏢 | 매칭 실행 `{ "region"?: "대전", "limit": 5 }` |
| GET | `/match-runs/{id}` | 🏢 | 추천 결과 + 장비별 조건 비교표 |
| GET | `/requirements/{id}/match-runs` | 🏢 | 이 조건의 매칭 이력 |

**매칭 판정 규칙 (`test_condition_rules` 기준, 코드로 판정하고 LLM은 이유 문장만 생성)**

| comparator | 판정 | 예 (진동시험) |
|---|---|---|
| `RANGE_WITHIN` | 요구 값·범위가 장비 범위 안에 있으면 MET | 요구 `frequency` 20~2000 Hz ⊂ 장비 `frequency` 10~3000 Hz |
| `MAX_LIMIT` | 요구값 ≤ 장비값이면 MET | 요구 `sample_mass` 15 kg ≤ 장비 `max_payload` 40 kg |
| `MIN_LIMIT` | 장비값 ≤ 요구값이면 MET (분해능처럼 작을수록 좋은 사양) | 장비 `measurement_resolution` 0.001 mm ≤ 요구 `resolution` 0.01 mm |
| `NONE` | 비교하지 않음 → 기관 확인 | `excitation_axis` |

- 요구 조건이 비었거나 장비에 해당 사양이 없으면 `UNKNOWN`입니다.
- V6부터 사양과 규칙의 단위는 `spec_definitions.base_unit`으로 통일합니다. RF 장비 37의 REAL frequency는 75~110 GHz에서 75000000000~110000000000 Hz로 환산하며 `originalUnit=GHz`를 보관합니다. 요구 조건도 기준 단위로 환산해 비교합니다.
- 후보는 `EquipmentQueryService.findCandidates()` 결과에 한정합니다. UNAVAILABLE·MAINTENANCE는 제외하며 UNKNOWN·오래된 상태·기관 미확인 DEMO는 확인 필요를 표시합니다.
- 선택 조건 `accredited_required`는 TEXT(`필요`/`불필요`), specKey=null, comparator=NONE입니다. 일반 NONE 조건과 별도로 코드가 공인 능력을 판정합니다. `필요`이면 유효 공인정보 → MET, 불가·만료 → NOT_MET, 미확인 → UNKNOWN. `불필요`는 MET입니다. 만료일 당일까지 한국 날짜 기준으로 유효합니다.
- REAL 사양이 있으면 REAL을, 없으면 MOCK을 씁니다. MOCK을 썼으면 `usedMockData=true`입니다.
- 점수(예시): MET 비율 × 100, NOT_MET이 하나라도 있으면 `UNSUITABLE`, UNKNOWN이 있으면 `PARTIAL`, 전부 MET이면 `SUITABLE`.

```json
// GET /match-runs/{id}
{ "id": 3, "requirementId": 7, "algorithmVersion": "rule-v2", "createdAt": "...",
  "results": [
    { "id": 31, "rank": 1, "score": 66.7, "verdict": "PARTIAL", "usedMockData": true,
      "equipment": { "id": 48, "externalId": "ASTRA-CAND-0048", "name": "진동시험기", "institutionName": "미리내우주환경시험센터",
                     "availability": "AVAILABLE", "availabilityNeedsConfirmation": true, "accessScope": "EXTERNAL_ALLOWED" },
      // availability: 예약 가능(AVAILABLE)·사용 중(BUSY)·정비 중·사용 불가·모름
      // accessScope: EXTERNAL_ALLOWED = 공동활용, INTERNAL_ONLY = 단독활용, UNKNOWN = 확인 필요
      "reason": "주파수 범위와 시료 질량 조건을 충족합니다. 고정구 질량이 아직 정해지지 않아 기관 확인이 필요합니다.",
      "checks": [
        { "conditionKey": "frequency", "requiredText": "20~2000 Hz", "equipmentText": "10~3000 Hz", "result": "MET" },
        { "conditionKey": "sample_mass", "requiredText": "15 kg", "equipmentText": "최대 40 kg", "result": "MET" },
        { "conditionKey": "fixture_mass", "requiredText": "미정", "equipmentText": "최대 15 kg", "result": "UNKNOWN" } ] },
    { "id": 32, "rank": 2, "score": 33.3, "verdict": "UNSUITABLE", "usedMockData": true,
      "equipment": { "id": 44, "externalId": "ASTRA-CAND-0044", "name": "진동시험기1", "institutionName": "다온신뢰성시험센터" },
      "reason": "시료 질량은 충족하지만 요구 주파수 상한(2000 Hz)이 장비 범위(1800 Hz)를 넘습니다.",
      "checks": [
        { "conditionKey": "frequency", "requiredText": "20~2000 Hz", "equipmentText": "5~1800 Hz", "result": "NOT_MET" },
        { "conditionKey": "sample_mass", "requiredText": "15 kg", "equipmentText": "최대 60 kg", "result": "MET" },
        { "conditionKey": "fixture_mass", "requiredText": "미정", "equipmentText": "최대 25 kg", "result": "UNKNOWN" } ] } ],
  "disclaimer": "최종 시험 가능 여부는 기관 검토로 확정됩니다." }
```

---

## 5. 시험 의뢰 (BE-B, AI 초안은 BE-C) — 기능 8·9

| Method | URL | 권한 | 설명 | 기능 |
|---|---|---|---|---|
| POST | `/test-requests` | 🏢 | 의뢰 생성(DRAFT) `{ equipmentId, requirementId?, matchResultId? }`. 소속 조직 보유 장비면 `400 VALIDATION_FAILED` | 9 |
| POST | `/test-requests/ai-draft` | 🏢 | AI 의뢰서 초안 생성 → DRAFT + revision(isAiGenerated) | 8 |
| GET | `/test-requests` | 🏢 🏛 | 목록: `?box=SENT` 내가 보낸 의뢰 / `?box=RECEIVED` 우리 조직 장비로 들어온 의뢰(제출된 것만). `box`를 안 보내면 `INSTITUTION_MANAGER`는 RECEIVED, 그 외는 SENT (관리자는 전체). `?status=UNDER_REVIEW` | 9 |
| GET | `/test-requests/{id}` | 🏢 🏛 | 상세 (현재 상태, 최신 revision, 열린 보완요청, 예약, `estimatedFee`, `result`) | 9 |
| PUT | `/test-requests/{id}/draft` | 🏢 | 작업본 revision 내용 저장 (DRAFT 또는 SUPPLEMENT_REQUESTED) | 8 |
| POST | `/test-requests/{id}/submit` | 🏢 | 제출 (DRAFT→SUBMITTED). 이용 희망 기간(`schedule.desiredStartDate`·`desiredEndDate`)과 실사용자·회계 담당자의 이름·연락처(전화 또는 이메일)가 없으면 `400 VALIDATION_FAILED` (`details.missingItems`: `schedule.desiredStartDate`, `accounting.name`, `accounting.contact` 등) | 9 |
| PUT | `/test-requests/{id}/estimated-fee` | 🏛 | 예상 이용료 입력 `{ version?, amount(원, 0 이상), note? }`. 검토 중~일정 조율 중에만. 응답은 상세(`estimatedFee`) | 9 |
| PUT | `/test-requests/{id}/result` | 🏛 | 시험 결과·성적서 등록 `{ summary, reportNo?, reportUrl?(http/https) }`. 일정 확정(CONFIRMED) 뒤에만, 다시 보내면 수정. 의뢰자에게 `RESULT_REGISTERED` 알림. 응답은 상세(`result`) | 9 |
| POST | `/test-requests/{id}/cancel` | 🏢 | 취소 `{ reason }` | 9 |
| GET | `/test-requests/{id}/revisions` | 🏢 🏛 | 제출본 이력 목록 | 10 |
| GET | `/test-requests/{id}/revisions/{no}` | 🏢 🏛 | 특정 제출본 (`?diffWith=1` 이면 변경 필드 diff 포함) | 10 |
| GET | `/test-requests/{id}/history` | 🏢 🏛 | 상태 변경 이력 | 9 |
| POST | `/test-requests/{id}/attachments` | 🏢 🏛 | 첨부 업로드 (multipart: `file`, `category`=`GENERAL`(기본)·`RESULT_REPORT`). 파일당 20MB, 허용 확장자 pdf·이미지·xlsx/xls/csv·docx/doc·hwp/hwpx·pptx·txt·zip (그 외·초과는 `400 VALIDATION_FAILED`). 성적서(`RESULT_REPORT`)는 장비 보유 조직이 일정 확정(CONFIRMED·COMPLETED) 뒤에만 올리고(아니면 409), 의뢰자에게 `RESULT_REGISTERED` 알림. → 201 `{ id, requestId, category, fileName, mimeType, sizeBytes, uploadedBy, createdAt, downloadUrl }` | 9 |
| GET | `/test-requests/{id}/attachments` | 🏢 🏛 | 첨부 목록 (의뢰 당사자만) | 9 |
| GET | `/attachments/{id}/download` | 🏢 🏛 | 파일 내려받기. 항상 `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff` (브라우저에서 바로 열리지 않음) | 9 |
| DELETE | `/attachments/{id}` | 업로더 | 첨부 삭제 (올린 사람 또는 관리자) | 9 |

**의뢰서 본문 `content` (JSONB) 스키마 (프론트/백 공통 계약)**
(질량·주파수·크기 같은 수치 조건은 모두 `conditions[]`에 조건 키로 넣고, `sample`에는 시료 이름·수량·준비일만 둡니다.)

선택 객체 `serviceRequirements`의 허용 키는 accreditedRequired(공인성적서 필요), operatorSupportRequested(운용 인력 지원 요청), securityOrExportControlled(보안·수출통제 협의 대상)입니다. 값은 boolean/null이며 생략·null은 미확인, false는 요청하지 않음입니다. 그 외 키·숫자/문자 값은 `400 VALIDATION_FAILED`. AI 초안은 명시적으로 확인한 accredited_required만 accreditedRequired로 옮기고 나머지는 추측하지 않습니다.

```json
{
  "applicant": { "companyName": "가상 A기업", "contactName": "홍길동", "phone": "010-...", "email": "..." },
  "actualUser": { "name": "홍길동", "phone": "010-...", "email": "..." },     // 실사용자. 의뢰를 만들 때 신청자로 미리 채움, 제출 필수
  "accounting": { "name": "김회계", "phone": "02-...", "email": "..." },      // 회계 담당자. 제출 필수 (이름 + 전화 또는 이메일)
  "responsible": { "name": "박책임" },                                         // 아래 4개는 검토 중 추가 정보 요청으로 받음 (§6)
  "report": { "type": "공인성적서(KOLAS)" },
  "billing": { "method": "세금계산서" },
  "test": { "testTypeCode": "VIBRATION", "purpose": "발사 환경 진동 내구성 확인", "standard": "MIL-STD-810H (선택)" },
  "sample": { "name": "위성 탑재 전장품", "quantity": 1, "readyDate": "2026-11-15", "disposal": "시험 후 반환" },
  "conditions": [ { "key": "sample_mass", "label": "시료 질량", "value": 15, "unit": "kg", "status": "CONFIRMED" },
                  { "key": "fixture_mass", "label": "고정구 질량", "value": 2, "unit": "kg", "status": "CONFIRMED" },
                  { "key": "frequency", "label": "주파수 범위", "min": 20, "max": 2000, "unit": "Hz", "status": "CONFIRMED" } ],
  "schedule": { "desiredStartDate": "2026-11-20", "desiredEndDate": "2026-11-21" },
  "equipment": { "id": 48, "externalId": "ASTRA-CAND-0048", "name": "진동시험기" },
  "serviceRequirements": { "accreditedRequired": null, "operatorSupportRequested": null, "securityOrExportControlled": null },
  "notes": "자유 기재"
}
```

```json
// POST /test-requests/ai-draft
{ "requirementId": 7, "equipmentId": 48, "matchResultId": 31 }
// → 201
{ "requestId": 15, "requestNo": "REQ-20261105-0001", "status": "DRAFT",
  "revision": { "revisionNo": 1, "isAiGenerated": true, "content": { /* 위 스키마 */ } },
  "aiNotes": ["고정구 질량이 미확인 상태입니다. 제출 전 입력을 권장합니다."] }

// GET /test-requests/{id} 상세에 붙는 두 항목 (없으면 null)
"estimatedFee": { "amount": 1250000, "note": "진동시험 2일, 고정구 제작비 별도", "updatedAt": "2026-11-20T10:00:00+09:00" },
"result": { "summary": "3축 진동시험 완료. 시료 외관 이상 없음", "reportNo": "KOLAS-2026-1234",
            "reportUrl": "https://.../report-1234.pdf", "registeredBy": { "id": 3, "name": "김담당" },
            "registeredAt": "...", "updatedAt": "..." }
```

---

## 6. 기관 검토 · 보완 (BE-B) — 기능 10

| Method | URL | 권한 | 설명 |
|---|---|---|---|
| POST | `/test-requests/{id}/review/start` | 🏛 | 검토 시작 (SUBMITTED/RESUBMITTED→UNDER_REVIEW), 담당자 지정 |
| POST | `/test-requests/{id}/supplements` | 🏛 | 보완 요청 (→SUPPLEMENT_REQUESTED). `kind`: `SUPPLEMENT`(기본, message 필수) 또는 `ADDITIONAL_INFO`(추가 정보 요청, message·items 생략 시 기본값). 답변 대기 중인 요청이 있으면 `409 SUPPLEMENT_ALREADY_OPEN` |
| GET | `/test-requests/{id}/supplements` | 🏢 🏛 | 보완 요청 목록 |
| POST | `/supplements/{id}/respond` | 🏢 | 보완 제출 → 새 revision 생성, (→RESUBMITTED) |
| POST | `/test-requests/{id}/accept` | 🏛 | 기술 검토 통과 (→SCHEDULING) |
| POST | `/test-requests/{id}/reject` | 🏛 | 반려 `{ reason }` (→REJECTED) |
| POST | `/test-requests/{id}/complete` | 🏛 | 시험 완료 처리 (CONFIRMED→COMPLETED). 결과(`PUT .../result`)가 없으면 `409 REQUEST_INVALID_STATUS` |

```json
// POST /test-requests/{id}/supplements
{ "version": 3,
  "message": "고정구 질량과 시료 준비 완료일을 추가로 확인 부탁드립니다.",
  "items": [ { "fieldKey": "fixture_mass", "label": "고정구 질량", "required": true },
             { "fieldKey": "sample.readyDate", "label": "시료 준비 완료일", "required": true } ],
  "dueDate": "2026-11-12" }
// fieldKey: 조건 키(fixture_mass) 또는 의뢰서 content 경로(sample.readyDate)

// 추가 정보 요청 (검토 중, 회의 결정 2026-11). items 를 비우면 아래 4개가 필수 항목으로 들어감
{ "kind": "ADDITIONAL_INFO" }
// items = responsible.name(책임자명), report.type(성적서 종류), sample.disposal(시료 처리), billing.method(청구 방법)
// 의뢰자 알림 제목은 "추가 정보(…)를 요청했습니다". 응답 supplement 에 "kind" 가 포함됨

// POST /supplements/{id}/respond
{ "version": 4, "message": "요청하신 정보 보완했습니다.",
  "content": { /* 수정된 전체 의뢰서 content */ },
  "changeSummary": "고정구 질량 2kg, 준비 완료일 11/15 입력" }
// → 200 { "requestId": 15, "status": "RESUBMITTED", "revisionNo": 2 }
```

---

## 7. 예약 (BE-B) — 기능 11

| Method | URL | 권한 | 설명 |
|---|---|---|---|
| POST | `/test-requests/{id}/reservations` | 🏢 🏛 | 일정 제안 `{ startAt, endAt, note }` (SCHEDULING 상태에서) |
| GET | `/test-requests/{id}/reservations` | 🏢 🏛 | 이 의뢰의 일정 제안·확정 목록 (최신순, `proposedBySide`: COMPANY=의뢰자 / INSTITUTION=장비 보유 조직. 조직 유형이 아니라 이 의뢰에서의 입장) |
| POST | `/reservations/{id}/counter` | 🏢 🏛 | 대안 일정 제안 (→COUNTER_PROPOSED) |
| POST | `/reservations/{id}/confirm` | 🏛 | 예약 확정 → 의뢰 CONFIRMED |
| POST | `/reservations/{id}/cancel` | 🏢 🏛 | 예약 취소 |
| GET | `/equipment/{id}/reservations` | 로그인 | 장비 예약 현황(바쁜 구간만) `?from=2026-11-01&to=2026-11-30` |

**중복 예약 방지 (필수 구현)**

| 시점 | 검사 | 실패 시 |
|---|---|---|
| 일정 제안·대안 제안 | 같은 장비의 CONFIRMED 예약과 시간이 겹치는지 서비스 코드에서 먼저 조회 | `409 RESERVATION_OVERLAP` + 겹치는 구간 |
| 예약 확정 | 위 조회를 한 번 더 하고 저장. 동시에 확정해도 DB 제약(`ex_resv_no_overlap`)이 최종으로 막음 | `409 RESERVATION_OVERLAP` |
| 예약 확정 | 같은 의뢰에 이미 CONFIRMED 예약이 있는지 (`uq_resv_one_confirmed_per_request`) | `409 RESERVATION_ALREADY_CONFIRMED` |

- 시간 구간은 `[시작, 종료)`로 봅니다. 10:00~12:00 예약 뒤에 12:00~14:00 예약은 가능합니다.
- PROPOSED(제안 중) 예약끼리는 겹쳐도 됩니다. 확정된 일정만 막습니다.
- 프론트는 일정 선택 전에 `GET /equipment/{id}/reservations`로 확정 구간을 받아 달력에서 비활성 처리합니다.

```json
// 409 응답 예시
{ "success": false,
  "error": { "code": "RESERVATION_OVERLAP", "message": "선택한 시간에 이미 확정된 예약이 있습니다.",
             "details": { "conflicts": [ { "startAt": "2026-11-20T09:00:00+09:00", "endAt": "2026-11-21T18:00:00+09:00" } ] } } }
```

> 기관 예약시스템 연동 시 `externalSystem/externalRef` 사용.

---

## 8. AI 자동 추진 (BE-C) — 기능 13

| Method | URL | 권한 | 설명 |
|---|---|---|---|
| POST | `/ai/auto-runs` | 🏢 | 시작 `{ "chatSessionId": 5 }` 또는 `{ "inputText": "..." }` → 202 |
| GET | `/ai/auto-runs/{id}` | 🏢 | 진행 상태 (폴링 1~2초) |
| GET | `/ai/auto-runs/{id}/events` | 🏢 | (선택, 미구현) SSE 진행 이벤트. 지금은 `GET /ai/auto-runs/{id}` 를 주기적으로 조회 |
| POST | `/ai/auto-runs/{id}/resume` | 🏢 | WAITING_USER 상태에서 조건 보완 후 재개 |
| POST | `/ai/auto-runs/{id}/cancel` | 🏢 | 중단 |

```json
// GET /ai/auto-runs/{id}
{ "id": 9, "status": "RUNNING", "currentStep": "MATCH",
  "steps": [ { "step": "ANALYZE", "status": "DONE",    "message": "조건 6개 추출, 누락 1개" },
             { "step": "SEARCH",  "status": "DONE",    "message": "후보 장비 8대" },
             { "step": "MATCH",   "status": "RUNNING", "message": null },
             { "step": "DRAFT",   "status": "PENDING", "message": null } ],
  "requirementId": 7, "matchRunId": null, "draftRequestId": null }
```
> 필수 조건이 `MISSING`이면 `status=WAITING_USER`로 멈추고, 프론트는 조건 입력 화면으로 유도한 뒤 입력이 끝나면 같은 run을 `POST /ai/auto-runs/{id}/resume`로 재개합니다. 마지막 결과는 **DRAFT 의뢰서까지만** 생성합니다(자동 제출 금지, 사용자 승인 필수).

---

## 9. 가상 시뮬레이션 (BE-B) — 기능 15

| Method | URL | 권한 | 설명 |
|---|---|---|---|
| GET | `/simulation/models` | 로그인 | 모델 카탈로그 (설명·필수 입력·한계) |
| GET | `/equipment/{id}/simulation-presets` | 로그인 | 장비의 프리셋 |
| POST | `/simulation/runs` | 로그인 | 실행 `{ "presetId": "SIM-0048", "inputParameters": {...}, "requirementId"?: 7 }` |
| GET | `/simulation/runs/{id}` | 로그인 | 결과 |
| GET | `/simulation/runs` | 로그인 | 내 실행 이력 `?equipmentId=12` |

```json
// POST /simulation/runs → 201
// 요청: { "presetId": "SIM-0048", "inputParameters": { "massKg": 15, "fixtureMassKg": 2, "stiffnessNPerM": 100000,
//          "dampingRatio": 0.05, "frequencyMinHz": 20, "frequencyMaxHz": 2000 } }   ← SIM-0048 프리셋 값 그대로
{ "id": 40, "presetId": "SIM-0048", "status": "SUCCEEDED", "modelType": "SDOF_BASE_EXCITATION", "modelVersion": "0.6",
  "capability": "CALCULATED_DEMO", "isMock": true,
  "output": { "chart": { "xLabel": "Hz", "yLabel": "Transmissibility",
                         "series": [[20,0.599],[50,0.068],[100,0.020],[500,0.003],[1000,0.001],[2000,0.001]] },
              "summary": { "naturalFrequencyHz": 12.2 } },
  // 고유진동수 = √(k / (질량+고정구 질량)) / 2π = √(100000 / 17) / 2π ≈ 12.2 Hz
  "warning": "가상 시연 모델입니다. 실제 장비 성능·시험 적합성을 의미하지 않습니다." }
```
> README v0.6 정책: 화면에 "실장비 시뮬레이션 가능" 표기 금지, `capability` + DEMO 배지 동시 표시.

---

## 10. 대시보드 · 알림 (BE-A / BE-B) — 기능 14

| Method | URL | 권한 | 설명 |
|---|---|---|---|
| GET | `/dashboard/summary` | 로그인 | 요약 (아래). `?view=REQUESTER` 의뢰자 화면 / `?view=PROVIDER` 장비 보유 조직 화면. 안 보내면 `INSTITUTION_MANAGER`는 PROVIDER, `COMPANY_USER`는 REQUESTER. 관리자는 항상 관리자 요약 |
| GET | `/dashboard/equipment-stats` | 로그인 | 지역/유형별 장비 수, 기관별 보유 현황 |
| GET | `/notifications` | 로그인 | 알림 목록 `?unreadOnly=true` |
| GET | `/notifications/unread-count` | 로그인 | 헤더 배지용 |
| PATCH | `/notifications/{id}/read` | 로그인 | 읽음 |
| POST | `/notifications/read-all` | 로그인 | 모두 읽음 |

> 의뢰·예약 칸은 BE-B 의 `RequestDashboardQuery`, 최근 상담은 BE-C 의 `ChatSessionQuery` 구현이 있을 때만 채워집니다.
> 구현 전에는 0·빈 목록이고 `dataAvailable` 이 `false`이므로, 프론트는 그 칸을 "준비 중"으로 표시합니다. 목록 칸은 최대 5개.

> 응답 형식은 `role`이 아니라 `view`로 구분합니다. 기업 회원도 `?view=PROVIDER`로 자기 조직이 받은 의뢰를, 기관·대학 회원도 `?view=REQUESTER`로 자기가 보낸 의뢰를 볼 수 있습니다.

```json
// GET /dashboard/summary?view=REQUESTER (의뢰자 화면. COMPANY_USER 의 기본값)
{ "role": "COMPANY_USER", "view": "REQUESTER",
  "requestCounts": { "DRAFT": 1, "SUBMITTED": 0, "UNDER_REVIEW": 2, "SUPPLEMENT_REQUESTED": 1, "RESUBMITTED": 0,
                     "SCHEDULING": 0, "CONFIRMED": 3, "COMPLETED": 0, "REJECTED": 0, "CANCELED": 0 },  // 10개 상태 항상 포함
  "actionRequired": [ { "requestId": 15, "requestNo": "REQ-20261105-0001", "title": "위성 전장품 진동시험",
                        "status": "SUPPLEMENT_REQUESTED", "dueDate": "2026-11-12", "submittedAt": "..." } ],
  "recentChats": [ { "id": 5, "title": "위성 부품 진동시험", "updatedAt": "..." } ],
  "equipmentStats": { "total": 339, "byRegion": { "경남": 1, "고흥": 40, "광주": 1, "대전": 32, "사천": 154, "원주": 1, "진주": 36, "창원": 74 } },
  "dataAvailable": { "requests": true, "chats": true } }

// GET /dashboard/summary?view=PROVIDER (장비 보유 조직 화면. INSTITUTION_MANAGER 의 기본값, manager1 — seed 실제 값)
{ "role": "INSTITUTION_MANAGER", "view": "PROVIDER",
  "institution": { "id": 2, "name": "미리내우주환경시험센터" },
  "requestCounts": { ... 10개 상태 ... },                       // 우리 기관 접수함
  "pendingReview": [ /* actionRequired 와 같은 형식 (SUBMITTED·RESUBMITTED) */ ],
  "upcomingReservations": [ { "reservationId": 4, "requestId": 15, "requestNo": "REQ-20261105-0001", "equipmentId": 48,
                              "equipmentName": "진동시험기", "startAt": "2026-11-20T09:00:00+09:00", "endAt": "..." } ],
  "equipmentNeedsUpdate": { "total": 13, "notConfirmed": 13, "outdated": 0 },  // total = 장비 목록 needsUpdate 수 (기관 확인 전·정보 90일 경과·가용 상태 확인 필요 중 하나). notConfirmed·outdated 는 사유별 수라 합이 total 과 다를 수 있음
  "equipmentStats": { "total": 339, "byRegion": { ... } },
  "dataAvailable": { "requests": false } }

// GET /dashboard/summary (ADMIN)
{ "role": "ADMIN", "view": "ADMIN", "pendingUsers": 1, "pendingInstitutions": 0,
  "requestCounts": { ... 10개 상태 (전체) ... },
  "institutionVerification": [ /* equipment-stats 의 institutions 와 같은 형식 */ ],
  "equipmentStats": { "total": 339, "byRegion": { ... } },
  "dataAvailable": { "requests": false } }

// GET /dashboard/equipment-stats → 활성 장비 기준 (seed 실제 값)
{ "total": 339,
  "byRegion": { "경남": 1, "광주": 1, "대전": 32, "원주": 1, "진주": 36 },               // 가나다순
  "byEquipmentType": { "MEASUREMENT": .., "MANUFACTURING": .., "TEST": .., "SOFTWARE": .., "SUPPORT": .. },
  "byTestType": [ { "code": "ACOUSTIC_NOISE", "nameKo": "음향·소음 시험", "equipmentCount": 1 }, ... ],  // 15개, 표시 순서
  "institutions": [ { "id": 1, "name": "한빛뿌리기술지원센터", "region": "진주",
                      "equipmentCount": 31, "verifiedCount": 0, "verificationRate": 0.0 }, ... ] }  // 장비 수 많은 순
```

- 장비 상태 갱신 알림: 매일 오전 9시(한국 시간) `availability_updated_at`(없으면 생성일)이 90일을 넘긴 장비의 소속 기관 활성 담당자에게 `EQUIPMENT_UPDATE_REQUIRED`. 상태 확인 주기당 한 번이며 중단 기간에 누락된 장비도 처리합니다. 담당자가 없으면 다음 실행에서 재시도합니다. `astra.equipment.update-reminder.enabled=false` 로 끕니다

---

## 11. 의뢰 상태 전이표 (BE-B 구현 · FE 버튼 노출 기준)

```
DRAFT ──submit──▶ SUBMITTED ──review/start──▶ UNDER_REVIEW ──accept──▶ SCHEDULING ──reservation confirm──▶ CONFIRMED ──▶ COMPLETED
                                                  │   ▲                                   
                                       supplements│   │review/start                        
                                                  ▼   │                                    
                                     SUPPLEMENT_REQUESTED ──respond──▶ RESUBMITTED          
UNDER_REVIEW ──reject──▶ REJECTED        (DRAFT~SCHEDULING 에서 기업 cancel ──▶ CANCELED)
```

| 현재 상태 | 액션 | 다음 상태 | 수행자 |
|---|---|---|---|
| DRAFT | submit | SUBMITTED | 기업 |
| SUBMITTED, RESUBMITTED | review/start | UNDER_REVIEW | 기관 |
| UNDER_REVIEW | supplements | SUPPLEMENT_REQUESTED | 기관 |
| SUPPLEMENT_REQUESTED | respond | RESUBMITTED | 기업 |
| UNDER_REVIEW | accept | SCHEDULING | 기관 |
| UNDER_REVIEW | reject | REJECTED | 기관 |
| SCHEDULING | reservation confirm | CONFIRMED | 기관 |
| CONFIRMED | complete | COMPLETED | 기관 |
| DRAFT ~ SCHEDULING | cancel | CANCELED | 기업 |

모든 전이는 **하나의 트랜잭션**에서: `test_requests.status/version` 갱신 + `request_status_history` INSERT + `notifications` INSERT(상대방).

---

## 12. 플랫폼 관리자 (BE-A) — 마스터

위 모든 API를 조회 범위 제한 없이 호출할 수 있고, 아래는 관리자 전용입니다.

| Method | URL | 권한 | 설명 |
|---|---|---|---|
| GET | `/admin/users` | 👑 | 회원 목록 `?role=COMPANY_USER&status=PENDING&page=0&size=20&sort=createdAt,desc` |
| POST | `/admin/users/{id}/approve` | 👑 | 가입 승인 (PENDING→ACTIVE). 가입하며 만든 조직(기업·신규 기관)도 함께 승인 |
| POST | `/admin/users/{id}/reject` | 👑 | 가입 거절 `{ reason }` (→REJECTED) |
| PATCH | `/admin/users/{id}/status` | 👑 | 정지·해제 `{ "status": "SUSPENDED" }` / `{ "status": "ACTIVE" }` |
| GET | `/admin/organizations` | 👑 | 조직 목록 `?orgType=INSTITUTION&verified=false&page=0&size=20&sort=createdAt,desc` |
| POST | `/admin/organizations` | 👑 | 기관·대학 직접 등록 |
| POST | `/admin/organizations/{id}/verify` | 👑 | 신규 기관 신청 승인 |
| PATCH | `/admin/organizations/{id}` | 👑 | 기관 정보 수정 |
| POST | `/admin/equipment/{id}/transfer` | 👑 | 장비 소속 기관 변경 (잘못 수집된 경우) |

```json
// GET /admin/users?status=PENDING → 200 (페이지). 정렬 가능: createdAt(기본, 최신순)·email·name·role·status·approvedAt·lastLoginAt
{ "content": [
    { "id": 5, "email": "pending@example.com", "name": "이대기", "phone": "055-000-0003",
      "role": "INSTITUTION_MANAGER", "status": "PENDING",
      "organization": { "id": 4, "orgType": "INSTITUTION", "name": "가람재료시험연구원", "businessRegNo": null,
                        "region": "경남", "address": null, "phone": null, "isVerified": true },
      "rejectReason": null, "approvedAt": null, "lastLoginAt": null, "createdAt": "2026-11-07T17:02:51+09:00" } ],
  "page": 0, "size": 20, "totalElements": 1, "totalPages": 1 }

// POST /admin/users/5/approve → 200 (목록 항목과 같은 형식, status=ACTIVE, approvedAt 채워짐)
// POST /admin/users/5/reject { "reason": "소속을 확인할 수 없습니다." } → 200 (status=REJECTED, rejectReason)
// 실패: 404 NOT_FOUND (없는 회원) / 409 USER_INVALID_STATUS (PENDING 아님) / 400 VALIDATION_FAILED (사유 없음, 정렬 불가 필드)

// PATCH /admin/users/{id}/status { "status": "SUSPENDED" } → 200 (목록 항목과 같은 형식)
//   ACTIVE → SUSPENDED(정지), SUSPENDED → ACTIVE(해제)만. 정지하면 refresh 토큰을 모두 폐기하고,
//   이미 받은 access 토큰도 다음 요청부터 바로 403 ACCOUNT_NOT_ACTIVE (해제하면 같은 토큰이 다시 바로 통과)
// 실패: 400 VALIDATION_FAILED (ACTIVE·SUSPENDED 외 값) / 409 USER_INVALID_STATUS (관리자 계정, PENDING·REJECTED 등)

// GET /admin/organizations?orgType=INSTITUTION&verified=false → 페이지 (기본 최신 등록순, 정렬은 createdAt·id 만)
{ "content": [ { "id": 15, "orgType": "INSTITUTION", "name": "가상 신규 시험기관", "parentName": null, "businessRegNo": null,
                 "region": null, "address": "경남 진주시 ...", "phone": "055-000-0000", "email": null, "homepageUrl": null,
                 "isVerified": false, "createdAt": "2026-11-08T10:00:00+09:00" } ], ... }

// POST /admin/organizations { "name": "가상 시험센터", "region": "진주", "phone": "055-000-0009" } → 201 (위 항목 형식, 시험기관으로 바로 승인)
// POST /admin/organizations { "orgType": "UNIVERSITY", "name": "가상대학교 공동기기센터" } → 201 (대학으로 바로 승인. orgType 생략 시 INSTITUTION, 그 외 유형은 400)
// POST /admin/organizations/15/verify → 200 (isVerified=true, 이미 승인됐어도 200)
// PATCH /admin/organizations/15 { "homepageUrl": "https://..." } → 200 (보낸 값만)
// 실패: 404 NOT_FOUND / 409 ORGANIZATION_ALREADY_EXISTS (같은 유형에 같은 이름)

// POST /admin/equipment/72/transfer { "institutionId": 6, "reason": "수집 오류" } → 200 장비 상세 (변경 이력에 TRANSFER)
// 실패: 400 VALIDATION_FAILED (승인된 기관 아님, 이미 그 기관 소속) / 404 EQUIPMENT_NOT_FOUND
```

---

## 13. 알림 트리거
| 이벤트 | 받는 사람 | type |
|---|---|---|
| 기업 제출/재제출 | 기관 담당자 전원 | `REQUEST_SUBMITTED` / `REQUEST_RESUBMITTED` |
| 보완 요청 | 의뢰자 | `SUPPLEMENT_REQUESTED` |
| 검토 통과 / 반려 | 의뢰자 | `REQUEST_ACCEPTED` / `REQUEST_REJECTED` |
| 일정 제안 / 대안 제안 | 상대방 | `RESERVATION_PROPOSED` |
| 예약 확정 | 의뢰자 | `RESERVATION_CONFIRMED` |
| 시험 결과·성적서 등록/수정 | 의뢰자 | `RESULT_REGISTERED` |
| AI 자동추진 완료/대기 | 실행자 | `AI_RUN_DONE` / `AI_RUN_WAITING` |
| 회원 가입 신청 (기업·기관 담당자) | 관리자 전원 | `USER_APPROVAL_REQUESTED` |
| 가입 승인 / 거절 | 신청자 | `USER_APPROVED` / `USER_REJECTED` |
| 장비 상태 확인 90일 경과 | 소속 기관 담당자 | `EQUIPMENT_UPDATE_REQUIRED` |
