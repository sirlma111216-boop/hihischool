/** D1 행 ↔ 도메인 타입 변환과 조회 도우미. 모든 SQL 은 prepared statement 다. */
import type {
  AdmissionEvent,
  AdmissionRule,
  CurriculumBundle,
  CurriculumOffering,
  CurriculumVersion,
  Evidence,
  Fact,
  School,
  SchoolProgram,
  SchoolTrack,
  SelectionGroup,
  SourceDocument,
} from '@shared/types'

type Row = Record<string, unknown>
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v))
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))
const arr = (v: unknown): string[] => {
  try {
    const p = JSON.parse(String(v ?? '[]'))
    return Array.isArray(p) ? p.map(String) : []
  } catch {
    return []
  }
}
const json = <T>(v: unknown, fallback: T): T => {
  try {
    return v === null || v === undefined ? fallback : (JSON.parse(String(v)) as T)
  } catch {
    return fallback
  }
}

export function rowToSchool(r: Row, aliases: string[] = [], codes: School['codes'] = [], tracks: SchoolTrack[] = []): School {
  const lat = num(r.lat)
  const lng = num(r.lng)
  return {
    id: String(r.id),
    officialName: String(r.official_name),
    shortName: str(r.short_name),
    aliases,
    district: String(r.district),
    districtCode: str(r.district_code),
    schoolType: String(r.school_type) as School['schoolType'],
    schoolTypeStatus: String(r.school_type_status) as School['schoolTypeStatus'],
    establishment: String(r.establishment) as School['establishment'],
    gender: String(r.gender) as School['gender'],
    dayNight: String(r.day_night) as School['dayNight'],
    operatingStatus: String(r.operating_status) as School['operatingStatus'],
    address: str(r.address),
    geo: lat !== null && lng !== null ? { lat, lng, source: str(r.geo_source) ?? 'unknown', retrievedAt: str(r.geo_retrieved_at) } : null,
    homepage: str(r.homepage),
    codes,
    tracks,
    isSynthetic: Number(r.is_synthetic) === 1,
    retrievedAt: str(r.retrieved_at),
    sourceDocumentId: str(r.source_document_id),
    exclusionReason: str(r.exclusion_reason),
  }
}

export function rowToTrack(r: Row): SchoolTrack {
  return { id: String(r.id), schoolId: String(r.school_id), name: String(r.name), kind: String(r.kind) as SchoolTrack['kind'], status: String(r.status) as SchoolTrack['status'] }
}

export function rowToDocument(r: Row): SourceDocument {
  return {
    id: String(r.id),
    schoolId: str(r.school_id),
    documentType: String(r.document_type) as SourceDocument['documentType'],
    title: String(r.title),
    officialUrl: str(r.official_url),
    originalFilename: str(r.original_filename),
    publisher: String(r.publisher),
    publishedAt: str(r.published_at),
    retrievedAt: str(r.retrieved_at),
    applicableAcademicYear: num(r.applicable_academic_year),
    cohortYear: num(r.cohort_year),
    curriculumRevision: str(r.curriculum_revision) as SourceDocument['curriculumRevision'],
    trackId: str(r.track_id),
    version: String(r.version),
    sha256: str(r.sha256),
    rights: String(r.rights) as SourceDocument['rights'],
    parseStatus: String(r.parse_status) as SourceDocument['parseStatus'],
    reviewStatus: String(r.review_status) as SourceDocument['reviewStatus'],
    supersedesId: str(r.supersedes_id),
    isSynthetic: Number(r.is_synthetic) === 1,
    notes: str(r.notes),
  }
}

export function rowToEvidence(r: Row): Evidence {
  return {
    id: String(r.id),
    documentId: String(r.document_id),
    pdfPageIndex: num(r.pdf_page_index),
    printedPageLabel: str(r.printed_page_label),
    tableId: str(r.table_id),
    rowIndex: num(r.row_index),
    columnIndex: num(r.column_index),
    boundingBox: json<Evidence['boundingBox']>(r.bounding_box, null),
    paragraphAnchor: str(r.paragraph_anchor),
    excerpt: str(r.excerpt),
    extractionMethod: String(r.extraction_method) as Evidence['extractionMethod'],
    reviewedBy: str(r.reviewed_by),
    reviewedAt: str(r.reviewed_at),
    isSynthetic: Number(r.is_synthetic) === 1,
  }
}

export function rowToVersion(r: Row): CurriculumVersion {
  return {
    id: String(r.id),
    schoolId: String(r.school_id),
    cohortYear: Number(r.cohort_year),
    trackId: str(r.track_id),
    revision: String(r.revision) as CurriculumVersion['revision'],
    status: String(r.status) as CurriculumVersion['status'],
    reviewStatus: String(r.review_status) as CurriculumVersion['reviewStatus'],
    documentIds: arr(r.document_ids),
    reviewedBy: str(r.reviewed_by),
    reviewedAt: str(r.reviewed_at),
    publishedAt: str(r.published_at),
    supersedesId: str(r.supersedes_id),
    notes: str(r.notes),
    isSynthetic: Number(r.is_synthetic) === 1,
  }
}

export function rowToOffering(r: Row): CurriculumOffering {
  return {
    id: String(r.id),
    versionId: String(r.version_id),
    schoolId: String(r.school_id),
    cohortYear: Number(r.cohort_year),
    trackId: str(r.track_id),
    courseOriginalName: String(r.course_original_name),
    courseCanonicalId: str(r.course_canonical_id),
    revision: String(r.revision) as CurriculumOffering['revision'],
    subjectGroup: String(r.subject_group ?? ''),
    courseCategory: String(r.course_category) as CurriculumOffering['courseCategory'],
    requirementType: String(r.requirement_type) as CurriculumOffering['requirementType'],
    grade: Number(r.grade) as CurriculumOffering['grade'],
    semester: Number(r.semester) as CurriculumOffering['semester'],
    creditValue: num(r.credit_value),
    creditUnit: String(r.credit_unit) as CurriculumOffering['creditUnit'],
    selectionGroupId: str(r.selection_group_id),
    offeringStatus: String(r.offering_status) as CurriculumOffering['offeringStatus'],
    crossSemesterGroup: str(r.cross_semester_group),
    note: str(r.note),
    evidenceIds: arr(r.evidence_ids),
  }
}

export function rowToGroup(r: Row): SelectionGroup {
  return {
    id: String(r.id),
    versionId: String(r.version_id),
    label: String(r.label),
    scope: String(r.scope ?? ''),
    memberOfferingIds: arr(r.member_offering_ids),
    minSelections: num(r.min_selections),
    maxSelections: num(r.max_selections),
    minCredits: num(r.min_credits),
    maxCredits: num(r.max_credits),
    periodScope: String(r.period_scope) as SelectionGroup['periodScope'],
    exceptions: arr(r.exceptions),
    verifiedRules: arr(r.verified_rules),
    unknownRules: arr(r.unknown_rules),
    ruleStatus: String(r.rule_status) as SelectionGroup['ruleStatus'],
    evidenceIds: arr(r.evidence_ids),
  }
}

export function rowToFact(r: Row): Fact {
  return {
    id: String(r.id),
    schoolId: String(r.school_id),
    field: String(r.field),
    value: json<unknown>(r.value_json, null),
    unit: str(r.unit),
    basisYear: num(r.basis_year),
    definition: str(r.definition),
    validFrom: str(r.valid_from),
    validTo: str(r.valid_to),
    status: String(r.status) as Fact['status'],
    evidenceIds: arr(r.evidence_ids),
    derivation: str(r.derivation),
    reviewerNote: str(r.reviewer_note),
  }
}

export function rowToProgram(r: Row): SchoolProgram {
  return {
    id: String(r.id),
    schoolId: String(r.school_id),
    name: String(r.name),
    kind: String(r.kind) as SchoolProgram['kind'],
    phase: String(r.phase) as SchoolProgram['phase'],
    basisYear: num(r.basis_year),
    availability: str(r.availability),
    status: String(r.status) as SchoolProgram['status'],
    evidenceIds: arr(r.evidence_ids),
    isSynthetic: Number(r.is_synthetic) === 1,
  }
}

export function rowToRule(r: Row): AdmissionRule {
  return {
    id: String(r.id),
    schoolId: str(r.school_id),
    schoolType: str(r.school_type) as AdmissionRule['schoolType'],
    admissionYear: Number(r.admission_year),
    round: str(r.round),
    selectionAuthority: String(r.selection_authority) as AdmissionRule['selectionAuthority'],
    title: String(r.title),
    eligibilityConditions: json<AdmissionRule['eligibilityConditions']>(r.eligibility_json, []),
    status: String(r.status) as AdmissionRule['status'],
    version: String(r.version),
    supersedesId: str(r.supersedes_id),
    documentId: str(r.document_id),
    evidenceIds: arr(r.evidence_ids),
    notes: str(r.notes),
    isSynthetic: Number(r.is_synthetic) === 1,
  }
}

export function rowToEvent(r: Row): AdmissionEvent {
  return {
    id: String(r.id),
    ruleId: str(r.rule_id),
    schoolId: str(r.school_id),
    admissionYear: Number(r.admission_year),
    title: String(r.title),
    date: String(r.date),
    endDate: str(r.end_date),
    time: str(r.time),
    allDay: Number(r.all_day) === 1,
    timezone: 'Asia/Seoul',
    status: String(r.status) as AdmissionEvent['status'],
    confirmedAt: str(r.confirmed_at),
    evidenceIds: arr(r.evidence_ids),
    isSynthetic: Number(r.is_synthetic) === 1,
  }
}

/* ---------- 조회 ---------- */

export async function loadSchool(db: D1Database, id: string, allowSynthetic: boolean): Promise<School | null> {
  const r = await db.prepare(`SELECT * FROM schools WHERE id = ? AND (is_synthetic = 0 OR ? = 1)`).bind(id, allowSynthetic ? 1 : 0).first<Row>()
  if (!r) return null
  const [aliases, codes, tracks] = await Promise.all([
    db.prepare(`SELECT alias FROM school_aliases WHERE school_id = ? AND approved = 1`).bind(id).all<Row>(),
    db.prepare(`SELECT provider, code, status, evidence_ids FROM school_codes WHERE school_id = ?`).bind(id).all<Row>(),
    db.prepare(`SELECT * FROM school_tracks WHERE school_id = ? ORDER BY name`).bind(id).all<Row>(),
  ])
  return rowToSchool(
    r,
    aliases.results.map((a) => String(a.alias)),
    codes.results.map((c) => ({ provider: String(c.provider) as School['codes'][number]['provider'], code: String(c.code), status: String(c.status) as 'confirmed' | 'pending', evidenceIds: arr(c.evidence_ids) })),
    tracks.results.map(rowToTrack),
  )
}

export async function loadBundle(db: D1Database, versionId: string): Promise<CurriculumBundle | null> {
  const v = await db.prepare(`SELECT * FROM curriculum_versions WHERE id = ?`).bind(versionId).first<Row>()
  if (!v) return null
  const version = rowToVersion(v)
  const [offs, groups] = await Promise.all([
    db.prepare(`SELECT * FROM curriculum_offerings WHERE version_id = ? ORDER BY grade, semester, requirement_type, course_original_name`).bind(versionId).all<Row>(),
    db.prepare(`SELECT * FROM selection_groups WHERE version_id = ? ORDER BY label`).bind(versionId).all<Row>(),
  ])
  const offerings = offs.results.map(rowToOffering)
  const selectionGroups = groups.results.map(rowToGroup)
  const documents = await loadDocuments(db, version.documentIds)
  const evidenceIds = [...new Set([...offerings.flatMap((o) => o.evidenceIds), ...selectionGroups.flatMap((g) => g.evidenceIds)])]
  const evidence = await loadEvidence(db, evidenceIds)
  return { version, offerings, selectionGroups, documents, evidence }
}

export async function loadDocuments(db: D1Database, ids: string[]): Promise<SourceDocument[]> {
  if (ids.length === 0) return []
  const placeholders = ids.map(() => '?').join(',')
  const r = await db.prepare(`SELECT * FROM source_documents WHERE id IN (${placeholders})`).bind(...ids).all<Row>()
  return r.results.map(rowToDocument)
}

export async function loadEvidence(db: D1Database, ids: string[]): Promise<Evidence[]> {
  if (ids.length === 0) return []
  const out: Evidence[] = []
  // D1 바인딩 수 제한을 고려해 50개씩 나눈다.
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    const r = await db.prepare(`SELECT * FROM evidence WHERE id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all<Row>()
    out.push(...r.results.map(rowToEvidence))
  }
  return out
}

export async function loadPublishedVersions(db: D1Database, schoolId: string): Promise<CurriculumVersion[]> {
  const r = await db.prepare(`SELECT * FROM curriculum_versions WHERE school_id = ? AND status = 'published' ORDER BY cohort_year DESC`).bind(schoolId).all<Row>()
  return r.results.map(rowToVersion)
}

export async function loadAllVersions(db: D1Database, schoolId: string): Promise<CurriculumVersion[]> {
  const r = await db.prepare(`SELECT * FROM curriculum_versions WHERE school_id = ? ORDER BY cohort_year DESC, created_at DESC`).bind(schoolId).all<Row>()
  return r.results.map(rowToVersion)
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
}
