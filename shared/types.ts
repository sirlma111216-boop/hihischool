/**
 * 고교 아틀라스 — 공유 도메인 타입.
 * 프런트엔드·Worker·로컬 스크립트가 같은 정의를 쓴다.
 * 날짜는 ISO 8601 문자열로 저장하고 표시 시에만 Asia/Seoul 로 변환한다.
 */

/** 자료의 확인 상태. 자료가 없다는 것과 없다고 확인된 것을 구분한다. */
export type DataStatus =
  | 'confirmed' // 확인됨 (출처·기준 시점 있음)
  | 'no_data' // 자료 없음 (공식 자료가 해당 항목을 제공하지 않음)
  | 'not_collected' // 미수집 (아직 수집 작업을 하지 않음)
  | 'unreviewed' // 미검토 (추출 초안은 있으나 사람 검토 전)
  | 'access_failed' // 접근 실패 (수집 시도했으나 실패)
  | 'confirmed_absent' // 확인된 미편성/없음
  | 'not_applicable' // 해당 없음
  | 'conflict' // 서로 충돌하는 자료

export const DATA_STATUS_LABEL: Record<DataStatus, string> = {
  confirmed: '확인됨',
  no_data: '자료 없음',
  not_collected: '미수집',
  unreviewed: '미검토',
  access_failed: '접근 실패',
  confirmed_absent: '확인된 미편성',
  not_applicable: '해당 없음',
  conflict: '자료 충돌',
}

export type ReviewStatus = 'draft' | 'in_review' | 'approved' | 'rejected' | 'superseded'
export type ParseStatus = 'not_retrieved' | 'retrieved' | 'extracted' | 'failed' | 'manual' | 'unsupported'
export type PublishStatus = 'draft' | 'published' | 'superseded' | 'withdrawn'

export type SchoolType =
  | 'general' // 일반고
  | 'autonomous_public' // 자율형 공립고
  | 'autonomous_private' // 자율형 사립고
  | 'special_purpose' // 특수목적고
  | 'specialized' // 특성화고
  | 'other' // 각종학교·기타
  | 'unknown'

export const SCHOOL_TYPE_LABEL: Record<SchoolType, string> = {
  general: '일반고',
  autonomous_public: '자율형 공립고',
  autonomous_private: '자율형 사립고',
  special_purpose: '특수목적고',
  specialized: '특성화고',
  other: '기타·각종학교',
  unknown: '유형 미확인',
}

export type Establishment = 'public' | 'private' | 'national' | 'unknown'
export const ESTABLISHMENT_LABEL: Record<Establishment, string> = {
  public: '공립',
  private: '사립',
  national: '국립',
  unknown: '미확인',
}

export type Gender = 'coed' | 'boys' | 'girls' | 'unknown'
export const GENDER_LABEL: Record<Gender, string> = { coed: '남녀공학', boys: '남고', girls: '여고', unknown: '미확인' }

export type DayNight = 'day' | 'night' | 'both' | 'unknown'

/** 선발 주체: 교육감 배정(학교 선택·지원·배정) 과 학교장 선발을 구분한다. */
export type SelectionAuthority = 'superintendent_assignment' | 'principal_selection' | 'mixed' | 'unknown'
export const SELECTION_AUTHORITY_LABEL: Record<SelectionAuthority, string> = {
  superintendent_assignment: '교육감 배정',
  principal_selection: '학교장 선발',
  mixed: '전형별 상이',
  unknown: '미확인',
}

export type OperatingStatus = 'operating' | 'closed' | 'suspended' | 'new' | 'renamed' | 'unknown'

export interface ProviderCode {
  provider: 'schoolinfo' | 'neis' | 'manual'
  code: string
  status: 'confirmed' | 'pending' // crosswalk 검토 상태
  evidenceIds: string[]
}

export interface GeoPoint {
  lat: number
  lng: number
  source: string // 좌표 출처 (예: neis, manual, geocoded)
  retrievedAt: string | null
}

export interface School {
  id: string
  officialName: string
  shortName: string | null
  aliases: string[]
  district: string // 자치구 이름 (예: 동대문구)
  districtCode: string | null // 법정 시군구 코드 (5자리)
  schoolType: SchoolType
  schoolTypeStatus: DataStatus
  establishment: Establishment
  gender: Gender
  dayNight: DayNight
  operatingStatus: OperatingStatus
  address: string | null
  geo: GeoPoint | null
  homepage: string | null
  codes: ProviderCode[]
  tracks: SchoolTrack[]
  isSynthetic: boolean
  retrievedAt: string | null
  sourceDocumentId: string | null
  exclusionReason: string | null // 범위가 다른 기관을 별도 분류할 때 사유
}

export interface SchoolTrack {
  id: string
  schoolId: string
  name: string // 학과/과정/트랙 (예: 보통과, 과학중점과정, 정보보안과)
  kind: 'department' | 'course' | 'track' | 'unknown'
  status: DataStatus
}

export type DocumentType =
  | 'curriculum_table' // 편제표
  | 'course_guide' // 선택과목 안내서
  | 'school_plan' // 학교교육계획
  | 'enrollment_guide' // 수강신청 안내
  | 'admission_guide' // 모집요강
  | 'admission_plan' // 교육청 기본계획
  | 'admission_revision' // 변경·정정 공고
  | 'disclosure' // 공시 항목
  | 'basic_info' // 기본정보 (API)
  | 'other'

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  curriculum_table: '교육과정 편제표',
  course_guide: '선택과목 안내',
  school_plan: '학교교육계획',
  enrollment_guide: '수강신청 안내',
  admission_guide: '모집요강',
  admission_plan: '고입 기본계획',
  admission_revision: '변경·정정 공고',
  disclosure: '공시 항목',
  basic_info: '학교 기본정보',
  other: '기타',
}

export interface SourceDocument {
  id: string
  schoolId: string | null // 교육청 공통 문서는 null
  documentType: DocumentType
  title: string
  officialUrl: string | null
  originalFilename: string | null
  publisher: string
  publishedAt: string | null // 문서 게시일
  retrievedAt: string | null // 수집일
  applicableAcademicYear: number | null // 문서의 적용 학년도
  cohortYear: number | null // 대상 입학연도
  curriculumRevision: CurriculumRevision | null
  trackId: string | null
  version: string
  sha256: string | null
  rights: 'official_public' | 'link_only' | 'restricted' | 'unknown'
  parseStatus: ParseStatus
  reviewStatus: ReviewStatus
  supersedesId: string | null
  isSynthetic: boolean
  notes: string | null
}

export interface Evidence {
  id: string
  documentId: string
  pdfPageIndex: number | null // 0-based PDF 배열 페이지
  printedPageLabel: string | null // 인쇄 쪽수
  tableId: string | null
  rowIndex: number | null
  columnIndex: number | null
  boundingBox: { x: number; y: number; width: number; height: number; pageWidth: number; pageHeight: number } | null
  paragraphAnchor: string | null
  excerpt: string | null
  extractionMethod: 'pdf_text' | 'pdf_table' | 'ocr' | 'hwpx' | 'xlsx' | 'html_table' | 'manual' | 'api' | 'unknown'
  reviewedBy: string | null
  reviewedAt: string | null
  isSynthetic: boolean
}

export interface Fact<T = unknown> {
  id: string
  schoolId: string
  field: string // 예: students.total, classes.total, teachers.total, graduates.path
  value: T | null
  unit: string | null
  basisYear: number | null // 공시 기준 연도
  definition: string | null // 지표 정의·분모
  validFrom: string | null
  validTo: string | null
  status: DataStatus
  evidenceIds: string[]
  derivation: string | null // 계산식
  reviewerNote: string | null
}

export type CurriculumRevision = '2015' | '2022' | 'unknown'
export type CreditUnit = 'credit' | 'unit' | 'hours' | 'unknown' // 학점(2022) / 단위(2015)
export type RequirementType = 'school_designated' | 'student_choice' | 'unknown'
export type CourseCategory =
  | 'common'
  | 'general_elective'
  | 'career_elective'
  | 'fusion_elective'
  | 'specialized'
  | 'unknown'
export const COURSE_CATEGORY_LABEL: Record<CourseCategory, string> = {
  common: '공통',
  general_elective: '일반선택',
  career_elective: '진로선택',
  fusion_elective: '융합선택',
  specialized: '전문교과',
  unknown: '분류 미확인',
}
export type OfferingStatus =
  | 'planned' // 교육과정에 편성됨 (편제표)
  | 'candidate' // 수강신청 후보
  | 'opened' // 실제 개설 확인
  | 'joint' // 공동교육과정 (별도 신청)
  | 'online' // 온라인학교
  | 'afterschool' // 방과후활동
  | 'unknown'
export const OFFERING_STATUS_LABEL: Record<OfferingStatus, string> = {
  planned: '편성 확인 / 개설 미확인',
  candidate: '수강신청 후보',
  opened: '개설 확인',
  joint: '공동교육과정 (별도 신청)',
  online: '온라인학교',
  afterschool: '방과후활동',
  unknown: '상태 미확인',
}

export type Grade = 1 | 2 | 3
export type Semester = 1 | 2

export interface CurriculumVersion {
  id: string
  schoolId: string
  cohortYear: number
  trackId: string | null
  revision: CurriculumRevision
  status: PublishStatus
  reviewStatus: ReviewStatus
  documentIds: string[]
  reviewedBy: string | null
  reviewedAt: string | null
  publishedAt: string | null
  supersedesId: string | null
  notes: string | null
  isSynthetic: boolean
}

export interface CurriculumOffering {
  id: string
  versionId: string
  schoolId: string
  cohortYear: number
  trackId: string | null
  courseOriginalName: string
  courseCanonicalId: string | null
  revision: CurriculumRevision
  subjectGroup: string // 교과(군) 원문 (예: 과학, 기술·가정/정보)
  courseCategory: CourseCategory
  requirementType: RequirementType
  grade: Grade
  semester: Semester
  creditValue: number | null // null = 학점 미확인. 0 으로 간주하지 않는다.
  creditUnit: CreditUnit
  selectionGroupId: string | null
  offeringStatus: OfferingStatus
  /** 같은 과목이 1·2학기 교차 편성(한 번만 이수)일 때 같은 식별자. */
  crossSemesterGroup: string | null
  note: string | null
  evidenceIds: string[]
}

export type SelectionPeriodScope = 'semester' | 'grade_year' | 'all_years' | 'unknown'

export interface SelectionGroup {
  id: string
  versionId: string
  label: string // 원문 표기 (예: 선택군 G)
  scope: string // 적용 범위 설명 (예: 2학년 1학기)
  memberOfferingIds: string[]
  minSelections: number | null
  maxSelections: number | null
  minCredits: number | null
  maxCredits: number | null
  periodScope: SelectionPeriodScope
  exceptions: string[]
  verifiedRules: string[] // 원문에서 확인된 규칙 문장
  unknownRules: string[] // 불명확하여 확인이 필요한 사항
  /** 선택 개수 규칙이 원문에서 확인되었는지. unverified 이면 판단 보류. */
  ruleStatus: 'verified' | 'unverified' | 'conflict'
  evidenceIds: string[]
}

export interface CurriculumBundle {
  version: CurriculumVersion
  offerings: CurriculumOffering[]
  selectionGroups: SelectionGroup[]
  documents: SourceDocument[]
  evidence: Evidence[]
}

/** 대상 입학연도 자료 조회 결과. 자료가 없으면 과거 자료를 자동 대체하지 않는다. */
export interface CurriculumLookup {
  schoolId: string
  requestedCohortYear: number
  requestedTrackId: string | null
  status: 'available' | 'cohort_not_available' | 'track_required' | 'unreviewed_only' | 'not_collected'
  bundle: CurriculumBundle | null
  availableCohortYears: number[]
  availableTracks: SchoolTrack[]
  referenceOnly: { cohortYear: number; versionId: string; trackId: string | null }[] // 참고 패널 전용
  message: string
}

export interface AdmissionRule {
  id: string
  schoolId: string | null
  schoolType: SchoolType | null
  admissionYear: number
  round: string | null // 전기/후기 등 원문 표기
  selectionAuthority: SelectionAuthority
  title: string
  eligibilityConditions: { label: string; status: DataStatus; detail: string | null; evidenceIds: string[] }[]
  status: PublishStatus
  version: string
  supersedesId: string | null
  documentId: string | null
  evidenceIds: string[]
  notes: string | null
  isSynthetic: boolean
}

export interface AdmissionEvent {
  id: string
  ruleId: string | null
  schoolId: string | null
  admissionYear: number
  title: string
  date: string // YYYY-MM-DD (Asia/Seoul 기준 달력 날짜)
  endDate: string | null
  time: string | null // HH:mm, 없으면 null (임의 시각 금지)
  allDay: boolean
  timezone: 'Asia/Seoul'
  status: 'scheduled' | 'revised' | 'cancelled' | 'unconfirmed'
  confirmedAt: string | null
  evidenceIds: string[]
  isSynthetic: boolean
}

export interface SchoolProgram {
  id: string
  schoolId: string
  name: string
  kind: 'club' | 'program' | 'facility' | 'dormitory' | 'meal' | 'scholarship' | 'counseling' | 'support' | 'other'
  phase: 'plan' | 'result' | 'promotion' | 'unknown' // 계획 / 운영 결과 / 홍보 소개
  basisYear: number | null
  availability: string | null // 사용 가능·선발 조건 등 확인된 내용
  status: DataStatus
  evidenceIds: string[]
  isSynthetic: boolean
}

export interface CoverageDistrict {
  district: string
  districtCode: string | null
  status: 'succeeded' | 'failed' | 'not_attempted' | 'partial'
  schoolCount: number
  lastAttemptAt: string | null
  error: string | null
}

export interface CoverageSummary {
  generatedAt: string
  schoolCount: number
  schoolsWithGeo: number
  schoolsWithPublishedCurriculum: number
  schoolsWithUnreviewedCurriculum: number
  syntheticExcluded: number
  districts: CoverageDistrict[]
  lastIngestion: { id: string; kind: string; status: string; finishedAt: string | null } | null
  dataBasisNote: string
}

export interface IngestionJob {
  id: string
  kind: 'schoolinfo_basic' | 'neis_basic' | 'document_import' | 'publish' | 'other'
  status: 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'cancelled'
  scope: Record<string, unknown>
  startedAt: string | null
  finishedAt: string | null
  error: string | null
  result: Record<string, unknown> | null
  actor: string | null
}

export interface AuditEntry {
  id: string
  entityType: string
  entityId: string
  action: string
  before: unknown
  after: unknown
  actor: string
  createdAt: string
}

/* ---------- 규칙 엔진 입출력 ---------- */

export type PlanVerdict =
  | 'no_conflict_within_verified_rules'
  | 'conflicts_with_verified_rules'
  | 'insufficient_data'

export const PLAN_VERDICT_LABEL: Record<PlanVerdict, string> = {
  no_conflict_within_verified_rules: '이 문서의 확인된 규칙 안에서는 함께 선택할 수 있습니다',
  conflicts_with_verified_rules: '확인된 규칙과 충돌합니다',
  insufficient_data: '선택군 규칙이 확인되지 않아 판단을 보류합니다',
}

export interface PlanViolation {
  kind: 'max_selections' | 'min_selections' | 'max_credits' | 'min_credits'
  groupId: string
  groupLabel: string
  rule: string
  chosenOfferingIds: string[]
  limit: number | null
  actual: number
  periodScope: SelectionPeriodScope
  periodRange: string
  evidenceIds: string[]
  message: string
}

export interface PlanUnknown {
  groupId: string | null
  groupLabel: string | null
  reason: 'rule_unverified' | 'rule_conflict' | 'no_group' | 'credit_missing' | 'cohort_mismatch' | 'track_required'
  offeringIds: string[]
  message: string
  question: string // 학교에 확인할 질문 문구
}

export interface PlanAlternative {
  groupId: string
  groupLabel: string
  offeringIds: string[]
  description: string
}

export interface CreditSummary {
  designatedConfirmed: number
  designatedUnknownCount: number
  selectedConfirmed: number
  selectedUnknownCount: number
  unit: CreditUnit
  mixedUnits: boolean
  graduationJudgement: 'not_evaluated'
  note: string
}

export interface PlanValidationResult {
  verdict: PlanVerdict
  violations: PlanViolation[]
  unknowns: PlanUnknown[]
  alternatives: PlanAlternative[]
  credits: CreditSummary
  evaluatedGroupIds: string[]
  disclaimer: string
}

export interface ComparisonBasis {
  cohortYear: number
  trackIds: Record<string, string | null>
  disclosureYear: number | null
}

/* ---------- 상담 (기기 내 저장, 서버 전송 금지) ---------- */

export interface UserVerifiedCommute {
  schoolId: string
  mode: string // 이동수단
  departAt: string | null
  minutes: number | null
  checkedOn: string | null
  source: string // 사용자가 확인한 외부 서비스 이름
}

export interface CounselingSession {
  id: string
  alias: string // 별칭 (실명 금지)
  targetCohortYear: number
  interests: string[] // 관심 분야
  interestCourses: string[] // 관심 과목 (표준화 과목명 또는 원문)
  commutePriority: 'high' | 'medium' | 'low' | null
  lifePreferences: string[]
  candidateSchoolIds: string[]
  questions: string[] // 궁금한 점
  checklist: { id: string; text: string; done: boolean }[]
  privateNotes: string // 교사 비공개 메모
  sharedNotes: string // 학생과 함께 보는 메모
  userCommutes: UserVerifiedCommute[]
  dataVersions: { schoolId: string; curriculumVersionId: string; cohortYear: number; capturedAt: string }[]
  createdAt: string
  updatedAt: string
}

export type ApiError = { ok: false; error: { code: string; message: string; details?: unknown } }
export type ApiOk<T> = { ok: true; data: T }
export type ApiResult<T> = ApiOk<T> | ApiError
