/**
 * 입학연도·과정 선택 — 과거 입학생 자료를 현재 입학생에게 자동 대체하지 않는다.
 */
import type { CurriculumLookup, CurriculumBundle, CurriculumVersion, SchoolTrack } from '../types'

export interface ResolveInput {
  schoolId: string
  cohortYear: number
  trackId: string | null
  versions: CurriculumVersion[] // 공개(published) 버전만 넘길 것. admin 은 draft 도 포함 가능.
  tracks: SchoolTrack[]
  loadBundle: (versionId: string) => CurriculumBundle | null
}

export function resolveCurriculum(input: ResolveInput): CurriculumLookup {
  const { schoolId, cohortYear, trackId, versions, tracks, loadBundle } = input
  const published = versions.filter((v) => v.status === 'published')
  const years = [...new Set(published.map((v) => v.cohortYear))].sort((a, b) => b - a)
  const sameYear = published.filter((v) => v.cohortYear === cohortYear)
  const referenceOnly = published
    .filter((v) => v.cohortYear !== cohortYear)
    .map((v) => ({ cohortYear: v.cohortYear, versionId: v.id, trackId: v.trackId }))

  const base = { schoolId, requestedCohortYear: cohortYear, requestedTrackId: trackId, availableCohortYears: years, availableTracks: tracks, referenceOnly }

  if (versions.length === 0) {
    return { ...base, status: 'not_collected', bundle: null, message: '이 학교의 교육과정 자료는 아직 수집되지 않았습니다.' }
  }
  if (sameYear.length === 0) {
    const hasDraft = versions.some((v) => v.cohortYear === cohortYear && v.status === 'draft')
    return {
      ...base,
      status: hasDraft ? 'unreviewed_only' : 'cohort_not_available',
      bundle: null,
      message: hasDraft
        ? `${cohortYear} 입학생 자료는 검토 대기 중입니다. 공개 전까지 비교·경로 검토에 사용하지 않습니다.`
        : `${cohortYear} 입학생 자료가 확인되지 않았습니다. 다른 입학연도 자료는 참고 패널에서만 열 수 있습니다.`,
    }
  }
  // 학과/과정이 여러 개면 선택을 요구한다. 학교명만으로 합치지 않는다.
  const trackIds = [...new Set(sameYear.map((v) => v.trackId))]
  let chosen: CurriculumVersion | undefined
  if (trackIds.length === 1) chosen = sameYear[0]
  else {
    if (trackId === null) {
      return {
        ...base,
        status: 'track_required',
        bundle: null,
        availableTracks: tracks.filter((t) => trackIds.includes(t.id)),
        message: '이 입학연도에는 학과·과정별로 편제가 다릅니다. 과정을 선택하세요.',
      }
    }
    chosen = sameYear.find((v) => v.trackId === trackId)
    if (!chosen) {
      return { ...base, status: 'track_required', bundle: null, message: '선택한 과정의 자료가 없습니다. 다른 과정을 선택하세요.' }
    }
  }
  if (!chosen) return { ...base, status: 'not_collected', bundle: null, message: '자료를 불러올 수 없습니다.' }
  const bundle = loadBundle(chosen.id)
  if (!bundle) return { ...base, status: 'not_collected', bundle: null, message: '자료를 불러올 수 없습니다.' }
  return { ...base, status: 'available', bundle, message: `${cohortYear} 입학생 자료 (검토 ${chosen.reviewStatus === 'approved' ? '완료' : '대기'})` }
}
