/**
 * 데이터셋 — 수집·추출·검토 결과를 D1 에 반영하기 위한 공통 묶음.
 * 스크립트(로컬)와 Worker(관리 API)와 테스트가 같은 변환을 쓴다.
 */
import type {
  AdmissionEvent,
  AdmissionRule,
  CurriculumOffering,
  CurriculumVersion,
  Evidence,
  Fact,
  School,
  SchoolProgram,
  SchoolTrack,
  SelectionGroup,
  SourceDocument,
} from './types'

export interface Dataset {
  schools: School[]
  tracks: SchoolTrack[]
  documents: SourceDocument[]
  evidence: Evidence[]
  versions: CurriculumVersion[]
  offerings: CurriculumOffering[]
  selectionGroups: SelectionGroup[]
  facts: Fact[]
  programs: SchoolProgram[]
  admissionRules: AdmissionRule[]
  admissionEvents: AdmissionEvent[]
}

export interface Statement {
  sql: string
  params: (string | number | null)[]
}

const j = (v: unknown) => JSON.stringify(v ?? null)
const b = (v: boolean) => (v ? 1 : 0)

export function emptyDataset(): Dataset {
  return {
    schools: [],
    tracks: [],
    documents: [],
    evidence: [],
    versions: [],
    offerings: [],
    selectionGroups: [],
    facts: [],
    programs: [],
    admissionRules: [],
    admissionEvents: [],
  }
}

export function searchBlobFor(s: School, extraTerms: string[] = []): string {
  return [s.officialName, s.shortName ?? '', ...s.aliases, s.district, s.address ?? '', ...s.tracks.map((t) => t.name), ...extraTerms]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 데이터셋 → upsert 문. 같은 id 는 덮어쓰되, 버전 레코드는 호출자가 새 id 로 만든다. */
export function datasetStatements(ds: Dataset): Statement[] {
  const out: Statement[] = []
  for (const s of ds.schools) {
    out.push({
      sql: `INSERT INTO schools (id, official_name, short_name, district, district_code, school_type, school_type_status, establishment, gender, day_night, operating_status, address, lat, lng, geo_source, geo_retrieved_at, homepage, is_synthetic, retrieved_at, source_document_id, exclusion_reason, search_blob, updated_at)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(id) DO UPDATE SET official_name=excluded.official_name, short_name=excluded.short_name, district=excluded.district, district_code=excluded.district_code, school_type=excluded.school_type, school_type_status=excluded.school_type_status, establishment=excluded.establishment, gender=excluded.gender, day_night=excluded.day_night, operating_status=excluded.operating_status, address=excluded.address, lat=excluded.lat, lng=excluded.lng, geo_source=excluded.geo_source, geo_retrieved_at=excluded.geo_retrieved_at, homepage=excluded.homepage, is_synthetic=excluded.is_synthetic, retrieved_at=excluded.retrieved_at, source_document_id=excluded.source_document_id, exclusion_reason=excluded.exclusion_reason, search_blob=excluded.search_blob, updated_at=excluded.updated_at`,
      params: [
        s.id, s.officialName, s.shortName, s.district, s.districtCode, s.schoolType, s.schoolTypeStatus, s.establishment, s.gender, s.dayNight,
        s.operatingStatus, s.address, s.geo?.lat ?? null, s.geo?.lng ?? null, s.geo?.source ?? null, s.geo?.retrievedAt ?? null, s.homepage,
        b(s.isSynthetic), s.retrievedAt, s.sourceDocumentId, s.exclusionReason, searchBlobFor(s),
      ],
    })
    for (const a of s.aliases) out.push({ sql: `INSERT OR REPLACE INTO school_aliases (school_id, alias, approved) VALUES (?,?,1)`, params: [s.id, a] })
    for (const c of s.codes)
      out.push({
        sql: `INSERT OR REPLACE INTO school_codes (school_id, provider, code, status, evidence_ids) VALUES (?,?,?,?,?)`,
        params: [s.id, c.provider, c.code, c.status, j(c.evidenceIds)],
      })
  }
  for (const t of ds.tracks)
    out.push({ sql: `INSERT OR REPLACE INTO school_tracks (id, school_id, name, kind, status) VALUES (?,?,?,?,?)`, params: [t.id, t.schoolId, t.name, t.kind, t.status] })
  for (const d of ds.documents)
    out.push({
      sql: `INSERT OR REPLACE INTO source_documents (id, school_id, document_type, title, official_url, original_filename, publisher, published_at, retrieved_at, applicable_academic_year, cohort_year, curriculum_revision, track_id, version, sha256, rights, parse_status, review_status, supersedes_id, is_synthetic, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: [
        d.id, d.schoolId, d.documentType, d.title, d.officialUrl, d.originalFilename, d.publisher, d.publishedAt, d.retrievedAt, d.applicableAcademicYear,
        d.cohortYear, d.curriculumRevision, d.trackId, d.version, d.sha256, d.rights, d.parseStatus, d.reviewStatus, d.supersedesId, b(d.isSynthetic), d.notes,
      ],
    })
  for (const e of ds.evidence)
    out.push({
      sql: `INSERT OR REPLACE INTO evidence (id, document_id, pdf_page_index, printed_page_label, table_id, row_index, column_index, bounding_box, paragraph_anchor, excerpt, extraction_method, reviewed_by, reviewed_at, is_synthetic) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: [
        e.id, e.documentId, e.pdfPageIndex, e.printedPageLabel, e.tableId, e.rowIndex, e.columnIndex, e.boundingBox ? j(e.boundingBox) : null, e.paragraphAnchor,
        e.excerpt, e.extractionMethod, e.reviewedBy, e.reviewedAt, b(e.isSynthetic),
      ],
    })
  for (const v of ds.versions)
    out.push({
      sql: `INSERT OR REPLACE INTO curriculum_versions (id, school_id, cohort_year, track_id, revision, status, review_status, document_ids, reviewed_by, reviewed_at, published_at, supersedes_id, notes, is_synthetic) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: [v.id, v.schoolId, v.cohortYear, v.trackId, v.revision, v.status, v.reviewStatus, j(v.documentIds), v.reviewedBy, v.reviewedAt, v.publishedAt, v.supersedesId, v.notes, b(v.isSynthetic)],
    })
  for (const o of ds.offerings)
    out.push({
      sql: `INSERT OR REPLACE INTO curriculum_offerings (id, version_id, school_id, cohort_year, track_id, course_original_name, course_canonical_id, revision, subject_group, course_category, requirement_type, grade, semester, credit_value, credit_unit, selection_group_id, offering_status, cross_semester_group, note, evidence_ids) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: [
        o.id, o.versionId, o.schoolId, o.cohortYear, o.trackId, o.courseOriginalName, o.courseCanonicalId, o.revision, o.subjectGroup, o.courseCategory,
        o.requirementType, o.grade, o.semester, o.creditValue, o.creditUnit, o.selectionGroupId, o.offeringStatus, o.crossSemesterGroup, o.note, j(o.evidenceIds),
      ],
    })
  for (const g of ds.selectionGroups)
    out.push({
      sql: `INSERT OR REPLACE INTO selection_groups (id, version_id, label, scope, member_offering_ids, min_selections, max_selections, min_credits, max_credits, period_scope, exceptions, verified_rules, unknown_rules, rule_status, evidence_ids) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: [
        g.id, g.versionId, g.label, g.scope, j(g.memberOfferingIds), g.minSelections, g.maxSelections, g.minCredits, g.maxCredits, g.periodScope, j(g.exceptions),
        j(g.verifiedRules), j(g.unknownRules), g.ruleStatus, j(g.evidenceIds),
      ],
    })
  for (const f of ds.facts)
    out.push({
      sql: `INSERT OR REPLACE INTO facts (id, school_id, field, value_json, unit, basis_year, definition, valid_from, valid_to, status, evidence_ids, derivation, reviewer_note, publish_status, is_synthetic) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: [f.id, f.schoolId, f.field, j(f.value), f.unit, f.basisYear, f.definition, f.validFrom, f.validTo, f.status, j(f.evidenceIds), f.derivation, f.reviewerNote, 'published', 0],
    })
  for (const p of ds.programs)
    out.push({
      sql: `INSERT OR REPLACE INTO school_programs (id, school_id, name, kind, phase, basis_year, availability, status, evidence_ids, publish_status, is_synthetic) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      params: [p.id, p.schoolId, p.name, p.kind, p.phase, p.basisYear, p.availability, p.status, j(p.evidenceIds), 'published', b(p.isSynthetic)],
    })
  for (const r of ds.admissionRules)
    out.push({
      sql: `INSERT OR REPLACE INTO admission_rules (id, school_id, school_type, admission_year, round, selection_authority, title, eligibility_json, status, version, supersedes_id, document_id, evidence_ids, notes, is_synthetic) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: [r.id, r.schoolId, r.schoolType, r.admissionYear, r.round, r.selectionAuthority, r.title, j(r.eligibilityConditions), r.status, r.version, r.supersedesId, r.documentId, j(r.evidenceIds), r.notes, b(r.isSynthetic)],
    })
  for (const e of ds.admissionEvents)
    out.push({
      sql: `INSERT OR REPLACE INTO admission_events (id, rule_id, school_id, admission_year, title, date, end_date, time, all_day, timezone, status, confirmed_at, evidence_ids, is_synthetic) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: [e.id, e.ruleId, e.schoolId, e.admissionYear, e.title, e.date, e.endDate, e.time, b(e.allDay), e.timezone, e.status, e.confirmedAt, j(e.evidenceIds), b(e.isSynthetic)],
    })
  return out
}

/** wrangler d1 execute --file 용 SQL 텍스트 (리터럴 이스케이프). */
export function statementsToSql(stmts: Statement[]): string {
  const lit = (p: string | number | null) => (p === null ? 'NULL' : typeof p === 'number' ? String(p) : `'${p.replace(/'/g, "''")}'`)
  return stmts
    .map((s) => {
      let i = 0
      const sql = s.sql.replace(/\?/g, () => lit(s.params[i++] ?? null))
      return sql + ';'
    })
    .join('\n')
}
