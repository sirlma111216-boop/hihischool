# DATA_DICTIONARY

타입 원본: `shared/types.ts`. D1 스키마: `migrations/0001_init.sql`. JSON 열은 `*_json`/`*_ids` 로 저장.

## 상태 enum

| enum | 값 | 뜻 |
| --- | --- | --- |
| `DataStatus` | `confirmed` | 출처·기준 시점이 있는 확인된 값 |
| | `no_data` | 공식 자료가 해당 항목을 제공하지 않음 (미공개). 0 이 아님 |
| | `not_collected` | 아직 수집하지 않음 |
| | `unreviewed` | 추출 초안은 있으나 사람 검토 전 |
| | `access_failed` | 수집 시도 실패 |
| | `confirmed_absent` | 공식 자료에서 없음을 확인 (확인된 미편성) |
| | `not_applicable` | 해당 없음 |
| | `conflict` | 공식 자료끼리 충돌 (검토 전 임의 선택 금지) |
| `ReviewStatus` | `draft` / `in_review` / `approved` / `rejected` / `superseded` | 사람 검토 상태 |
| `ParseStatus` | `not_retrieved` / `retrieved` / `extracted` / `failed` / `manual` / `unsupported` | 원문 처리 상태 |
| `PublishStatus` | `draft` / `published` / `superseded` / `withdrawn` | 공개 상태 (공개 API 는 published 만) |
| `OfferingStatus` | `planned`(편성 확인/개설 미확인) / `candidate`(수강신청 후보) / `opened`(개설 확인) / `joint`(공동교육과정) / `online` / `afterschool` / `unknown` | 서로 다른 상태 |
| `RequirementType` | `school_designated` / `student_choice` / `unknown` | 학생 선택이라는 이유로 진로선택으로 분류하지 않음 |
| `CourseCategory` | `common` / `general_elective` / `career_elective` / `fusion_elective` / `specialized` / `unknown` | |
| `CreditUnit` | `credit`(학점, 2022) / `unit`(단위, 2015) / `hours` / `unknown` | 섞어 합치지 않음 |
| `SelectionPeriodScope` | `semester` / `grade_year` / `all_years` / `unknown` | 학년 전체 제한은 학기가 달라도 적용 |
| `SelectionGroup.ruleStatus` | `verified` / `unverified` / `conflict` | verified 가 아니면 판단 보류 |
| `PlanVerdict` | `no_conflict_within_verified_rules` / `conflicts_with_verified_rules` / `insufficient_data` | true/false 로 만들지 않음 |
| `SelectionAuthority` | `superintendent_assignment`(교육감 배정) / `principal_selection`(학교장 선발) / `mixed` / `unknown` | |

## 엔티티

### School (`schools`, `school_aliases`, `school_codes`, `school_tracks`)
id, 공식명/약칭/승인 별칭, 자치구·법정코드, 유형(+상태), 설립, 공학, 주야, 운영 상태, 주소, 좌표(+출처·수집일), 홈페이지, 제공처 코드(`provider` schoolinfo|neis|manual, `status` confirmed|pending — crosswalk), 학과/과정, `is_synthetic`, 수집일, 출처 문서, 제외 사유, `search_blob`.

### SourceDocument (`source_documents`)
학교(또는 공통 null), 문서 종류, 제목, 공식 URL, 원본 파일명, 발행기관, **게시일**, **수집일**, **적용 학년도**, **대상 입학연도**, 개정, 과정, 버전, sha256, 권리(official_public|link_only|restricted|unknown), 파싱 상태, 검토 상태, 대체한 문서 id, 가상 여부, 메모. 연도 필드는 모두 별개다.

### Evidence (`evidence`)
문서, **PDF 배열 페이지(0-based)**, **인쇄 쪽수 라벨**, 표 id, 행, 열, 좌표(bbox: PDF 좌표계 + 페이지 크기), 문단 anchor, 발췌, 추출 방법(pdf_text|pdf_table|ocr|hwpx|xlsx|manual|api), 검토자, 검토일. 정확하지 않은 위치는 null (가짜 하이라이트 금지).

### Fact (`facts`)
학교, field(예 `students.total`), 값(JSON), 단위, 기준 연도, 정의/분모, 효력 범위, 상태, 근거, 계산식, 검토 메모. 같은 field 의 다른 연도는 별 행 (덮어쓰지 않음).

### CurriculumVersion (`curriculum_versions`)
학교, 입학연도, 과정, 개정, 공개 상태, 검토 상태, 문서 ids, 검토자/검토일, 공개일, 대체 버전, 메모, 가상 여부.

### CurriculumOffering (`curriculum_offerings`)
버전, 학교, 입학연도, 과정, 과목명 원문, 표준화 id(자동 합치지 않음), 개정, 교과군, 분류, 지정/선택, 학년, 학기, 학점 값(null 허용)·단위, 선택군, 개설 상태, 교차 편성 그룹, 비고, 근거 ids.

### SelectionGroup (`selection_groups`)
버전, 표기, 범위, 구성 편성 ids, 최소/최대 선택 수, 최소/최대 학점, 기간 범위, 예외, 확인된 규칙 문장, 미확인 사항, 규칙 상태, 근거 ids.

### AdmissionRule / AdmissionEvent (`admission_rules`, `admission_events`)
규정: 학교 또는 유형, 입학연도, 전기/후기, 선발 주체, 제목, 자격 조건(라벨·상태·근거), 공개 상태, 버전, 대체 관계, 문서. 일정: 날짜(YYYY-MM-DD, Asia/Seoul), 종료일, 시각(null 허용 — 임의 00:00 금지), 종일, 상태(scheduled|revised|cancelled|unconfirmed), 확인일, 근거.

### SchoolProgram (`school_programs`)
동아리·특색사업·시설·기숙사·급식·장학·상담·지원. 단계(plan|result|promotion|unknown), 기준 연도, 사용 가능·조건, 상태, 근거.

### IngestionJob / coverage_districts / audit_log / publish_bundles
작업 종류·상태(queued|running|succeeded|partial|failed|cancelled)·범위·오류·결과; 자치구별 수집 상태(succeeded|failed|partial|not_attempted)·학교 수·마지막 시도·오류; 감사(대상·동작·전후 요약·행위자); 공개 묶음 버전.

### LocalCounselingSession (브라우저 전용, `shared/types.ts` `CounselingSession`)
별칭, 대상 입학연도, 관심 분야/과목, 통학 우선순위, 생활 선호, 후보 학교, 질문, 체크리스트, 비공개/공유 메모, 사용자 확인 통학(이동수단·출발·분·확인일·출처), 사용한 자료 버전, 생성/수정 시각. **서버 저장 금지.**

## 날짜 규약
저장: ISO 8601 UTC 문자열(`retrievedAt`, `reviewedAt` …) 또는 달력 날짜 `YYYY-MM-DD`(일정·게시일). 표시: `shared/format.ts` 가 Asia/Seoul 로 변환. 공시연도·게시일·적용 학년도·입학연도·학년/학기·수집일·검토일은 모두 별도 필드.
