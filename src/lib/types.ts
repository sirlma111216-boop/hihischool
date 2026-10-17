/** 클라이언트가 보는 API 응답 형태 (Worker 라우트와 일치) */
import type { AdmissionEvent, AdmissionRule, CoverageSummary, CurriculumBundle, CurriculumLookup, CurriculumOffering, CurriculumVersion, Fact, School, SchoolProgram, SchoolTrack, SelectionGroup, SourceDocument } from '@shared/types'

export interface SchoolListItem {
  school: School
  curriculumStatus: 'published' | 'draft_only' | 'none' | 'other_cohort_only' | 'other_cohort_draft'
  publishedCohortYears: number[]
  draftCohortYears: number[]
  courseMatch: { status: 'confirmed' | 'confirmed_absent' | 'unknown'; offerings: { name: string; grade: number; semester: number; credit: number | null; requirement: string; groupId: string | null }[] } | null
  programMatch: { name: string; kind: string; phase: string; status: string }[] | null
}

export interface SchoolsResponse {
  items: SchoolListItem[]
  candidates: SchoolListItem[]
  confirmedAbsent: SchoolListItem[]
  page: number
  pageSize: number
  total: number
  counts: { schoolsInDb: number; results: number; candidates: number; withGeoInDb: number; withGeoInResults: number }
  interpreted: { chips: { key: string; label: string; value: string }[]; residualText: string; unrecognized: string[] }
  coverage: { succeededDistricts: number; failedDistricts: number; notAttempted: number; basisNote: string }
}

export interface ProfileResponse {
  school: School
  facts: Fact[]
  programs: SchoolProgram[]
  curriculumVersions: CurriculumVersion[]
  draftVersionCount: number
  documents: SourceDocument[]
  admissionRules: AdmissionRule[]
  admissionEvents: AdmissionEvent[]
}

export interface CompareColumn {
  schoolId: string
  school: School | null
  status: 'ok' | 'not_found'
  curriculum: {
    status: CurriculumLookup['status']
    message: string
    versionId: string | null
    reviewStatus: string | null
    revision: string | null
    trackId: string | null
    availableCohortYears: number[]
    availableTracks: SchoolTrack[]
    draftCount: number
    offeringCount: number
    groupCount: number
    unverifiedGroupCount: number
    documentIds: string[]
  } | null
  interest: { name: string; status: 'confirmed' | 'confirmed_absent' | 'unknown' | 'track_required'; offerings: CurriculumOffering[]; groups: SelectionGroup[] }[]
  facts: Fact[]
  programs: SchoolProgram[]
  admissionRules: AdmissionRule[]
  admissionEvents: AdmissionEvent[]
  documents: SourceDocument[]
}

export interface CompareResponse {
  basis: { cohortYear: number; trackIds: Record<string, string | null> }
  columns: CompareColumn[]
  comparability: { curriculumComparableCount: number; note: string }
}

export interface AdmissionsResponse {
  rules: AdmissionRule[]
  events: AdmissionEvent[]
  documents: SourceDocument[]
}

export interface SourcesResponse {
  documents: SourceDocument[]
  pendingReviewCount: number
  jobs: { id: string; kind: string; status: string; scope: unknown; startedAt: string | null; finishedAt: string | null; error: string | null; result: unknown }[]
  coverage: CoverageSummary
}

export type Bundle = CurriculumBundle
