-- 고교 아틀라스 D1 스키마 (초기)
-- 원칙: 명시적 없음은 status 로 표현하고 NULL/0 과 혼동하지 않는다.
--       기간·연도가 다른 값은 덮어쓰지 않고 버전·효력 범위를 유지한다.
--       is_synthetic=1 인 행은 기능 검증용 가상 자료이며 production 조회에서 제외한다.

CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY,
  official_name TEXT NOT NULL,
  short_name TEXT,
  district TEXT NOT NULL,
  district_code TEXT,
  school_type TEXT NOT NULL DEFAULT 'unknown',
  school_type_status TEXT NOT NULL DEFAULT 'not_collected',
  establishment TEXT NOT NULL DEFAULT 'unknown',
  gender TEXT NOT NULL DEFAULT 'unknown',
  day_night TEXT NOT NULL DEFAULT 'unknown',
  operating_status TEXT NOT NULL DEFAULT 'unknown',
  address TEXT,
  lat REAL,
  lng REAL,
  geo_source TEXT,
  geo_retrieved_at TEXT,
  homepage TEXT,
  is_synthetic INTEGER NOT NULL DEFAULT 0,
  retrieved_at TEXT,
  source_document_id TEXT,
  exclusion_reason TEXT,
  search_blob TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_schools_district ON schools(district, is_synthetic);
CREATE INDEX IF NOT EXISTS idx_schools_type ON schools(school_type, is_synthetic);
CREATE INDEX IF NOT EXISTS idx_schools_name ON schools(official_name);

CREATE TABLE IF NOT EXISTS school_aliases (
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (school_id, alias)
);
CREATE INDEX IF NOT EXISTS idx_aliases_alias ON school_aliases(alias);

CREATE TABLE IF NOT EXISTS school_codes (
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  evidence_ids TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (provider, code)
);
CREATE INDEX IF NOT EXISTS idx_codes_school ON school_codes(school_id);

CREATE TABLE IF NOT EXISTS school_tracks (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'unknown',
  status TEXT NOT NULL DEFAULT 'unreviewed'
);
CREATE INDEX IF NOT EXISTS idx_tracks_school ON school_tracks(school_id);

CREATE TABLE IF NOT EXISTS source_documents (
  id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES schools(id) ON DELETE SET NULL,
  document_type TEXT NOT NULL,
  title TEXT NOT NULL,
  official_url TEXT,
  original_filename TEXT,
  publisher TEXT NOT NULL,
  published_at TEXT,
  retrieved_at TEXT,
  applicable_academic_year INTEGER,
  cohort_year INTEGER,
  curriculum_revision TEXT,
  track_id TEXT,
  version TEXT NOT NULL DEFAULT '1',
  sha256 TEXT,
  rights TEXT NOT NULL DEFAULT 'unknown',
  parse_status TEXT NOT NULL DEFAULT 'not_retrieved',
  review_status TEXT NOT NULL DEFAULT 'draft',
  supersedes_id TEXT,
  is_synthetic INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_docs_school ON source_documents(school_id, document_type, cohort_year);
CREATE INDEX IF NOT EXISTS idx_docs_review ON source_documents(review_status);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  pdf_page_index INTEGER,
  printed_page_label TEXT,
  table_id TEXT,
  row_index INTEGER,
  column_index INTEGER,
  bounding_box TEXT,
  paragraph_anchor TEXT,
  excerpt TEXT,
  extraction_method TEXT NOT NULL DEFAULT 'unknown',
  reviewed_by TEXT,
  reviewed_at TEXT,
  is_synthetic INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_evidence_doc ON evidence(document_id);

CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  value_json TEXT,
  unit TEXT,
  basis_year INTEGER,
  definition TEXT,
  valid_from TEXT,
  valid_to TEXT,
  status TEXT NOT NULL DEFAULT 'not_collected',
  evidence_ids TEXT NOT NULL DEFAULT '[]',
  derivation TEXT,
  reviewer_note TEXT,
  publish_status TEXT NOT NULL DEFAULT 'published',
  is_synthetic INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_facts_school_field ON facts(school_id, field, basis_year);

CREATE TABLE IF NOT EXISTS curriculum_versions (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  cohort_year INTEGER NOT NULL,
  track_id TEXT,
  revision TEXT NOT NULL DEFAULT 'unknown',
  status TEXT NOT NULL DEFAULT 'draft',
  review_status TEXT NOT NULL DEFAULT 'draft',
  document_ids TEXT NOT NULL DEFAULT '[]',
  reviewed_by TEXT,
  reviewed_at TEXT,
  published_at TEXT,
  supersedes_id TEXT,
  notes TEXT,
  is_synthetic INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_cv_school_cohort ON curriculum_versions(school_id, cohort_year, status);

CREATE TABLE IF NOT EXISTS curriculum_offerings (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES curriculum_versions(id) ON DELETE CASCADE,
  school_id TEXT NOT NULL,
  cohort_year INTEGER NOT NULL,
  track_id TEXT,
  course_original_name TEXT NOT NULL,
  course_canonical_id TEXT,
  revision TEXT NOT NULL DEFAULT 'unknown',
  subject_group TEXT NOT NULL DEFAULT '',
  course_category TEXT NOT NULL DEFAULT 'unknown',
  requirement_type TEXT NOT NULL DEFAULT 'unknown',
  grade INTEGER NOT NULL,
  semester INTEGER NOT NULL,
  credit_value REAL,
  credit_unit TEXT NOT NULL DEFAULT 'unknown',
  selection_group_id TEXT,
  offering_status TEXT NOT NULL DEFAULT 'unknown',
  cross_semester_group TEXT,
  note TEXT,
  evidence_ids TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_off_version ON curriculum_offerings(version_id);
CREATE INDEX IF NOT EXISTS idx_off_course ON curriculum_offerings(course_canonical_id, school_id, cohort_year);
CREATE INDEX IF NOT EXISTS idx_off_name ON curriculum_offerings(course_original_name);

CREATE TABLE IF NOT EXISTS selection_groups (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES curriculum_versions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  member_offering_ids TEXT NOT NULL DEFAULT '[]',
  min_selections INTEGER,
  max_selections INTEGER,
  min_credits REAL,
  max_credits REAL,
  period_scope TEXT NOT NULL DEFAULT 'unknown',
  exceptions TEXT NOT NULL DEFAULT '[]',
  verified_rules TEXT NOT NULL DEFAULT '[]',
  unknown_rules TEXT NOT NULL DEFAULT '[]',
  rule_status TEXT NOT NULL DEFAULT 'unverified',
  evidence_ids TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_sg_version ON selection_groups(version_id);

CREATE TABLE IF NOT EXISTS admission_rules (
  id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES schools(id) ON DELETE CASCADE,
  school_type TEXT,
  admission_year INTEGER NOT NULL,
  round TEXT,
  selection_authority TEXT NOT NULL DEFAULT 'unknown',
  title TEXT NOT NULL,
  eligibility_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  version TEXT NOT NULL DEFAULT '1',
  supersedes_id TEXT,
  document_id TEXT,
  evidence_ids TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  is_synthetic INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_adm_year ON admission_rules(admission_year, status);
CREATE INDEX IF NOT EXISTS idx_adm_school ON admission_rules(school_id);

CREATE TABLE IF NOT EXISTS admission_events (
  id TEXT PRIMARY KEY,
  rule_id TEXT REFERENCES admission_rules(id) ON DELETE CASCADE,
  school_id TEXT,
  admission_year INTEGER NOT NULL,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  end_date TEXT,
  time TEXT,
  all_day INTEGER NOT NULL DEFAULT 1,
  timezone TEXT NOT NULL DEFAULT 'Asia/Seoul',
  status TEXT NOT NULL DEFAULT 'unconfirmed',
  confirmed_at TEXT,
  evidence_ids TEXT NOT NULL DEFAULT '[]',
  is_synthetic INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_events_year ON admission_events(admission_year, date);

CREATE TABLE IF NOT EXISTS school_programs (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other',
  phase TEXT NOT NULL DEFAULT 'unknown',
  basis_year INTEGER,
  availability TEXT,
  status TEXT NOT NULL DEFAULT 'unreviewed',
  evidence_ids TEXT NOT NULL DEFAULT '[]',
  publish_status TEXT NOT NULL DEFAULT 'published',
  is_synthetic INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_programs_school ON school_programs(school_id, kind);

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  scope_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT,
  finished_at TEXT,
  error TEXT,
  result_json TEXT,
  actor TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_kind ON ingestion_jobs(kind, started_at);

CREATE TABLE IF NOT EXISTS coverage_districts (
  district TEXT PRIMARY KEY,
  district_code TEXT,
  status TEXT NOT NULL DEFAULT 'not_attempted',
  school_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  error TEXT,
  job_id TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS publish_bundles (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  actor TEXT NOT NULL,
  summary_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'published'
);

CREATE TABLE IF NOT EXISTS canonical_courses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  revision TEXT NOT NULL,
  subject_group TEXT NOT NULL,
  category TEXT NOT NULL,
  source_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_canon_name ON canonical_courses(name, revision);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);

-- 초기 자치구 범위 행 (수집 전 상태)
INSERT OR IGNORE INTO coverage_districts (district, district_code, status) VALUES
('종로구','11110','not_attempted'),('중구','11140','not_attempted'),('용산구','11170','not_attempted'),
('성동구','11200','not_attempted'),('광진구','11215','not_attempted'),('동대문구','11230','not_attempted'),
('중랑구','11260','not_attempted'),('성북구','11290','not_attempted'),('강북구','11305','not_attempted'),
('도봉구','11320','not_attempted'),('노원구','11350','not_attempted'),('은평구','11380','not_attempted'),
('서대문구','11410','not_attempted'),('마포구','11440','not_attempted'),('양천구','11470','not_attempted'),
('강서구','11500','not_attempted'),('구로구','11530','not_attempted'),('금천구','11545','not_attempted'),
('영등포구','11560','not_attempted'),('동작구','11590','not_attempted'),('관악구','11620','not_attempted'),
('서초구','11650','not_attempted'),('강남구','11680','not_attempted'),('송파구','11710','not_attempted'),
('강동구','11740','not_attempted');
