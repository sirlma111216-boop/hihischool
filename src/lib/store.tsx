/**
 * 작업 공간 상태. 공개 자료 조건(입학연도·비교 바구니·관심 과목·필터)은 sessionStorage 에,
 * 상담 기록은 기본 메모리, 사용자가 선택할 때만 localStorage 에 저장한다. 서버로는 보내지 않는다.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react'
import type { CounselingSession } from '@shared/types'
import { MAX_COMPARE_SCHOOLS, suggestedCohortYear } from '@shared/constants'

export interface WorkspaceState {
  cohortYear: number
  cohortExplicit: boolean
  compare: string[]
  interestCourses: string[]
  trackChoice: Record<string, string | null>
  evidenceId: string | null
  evidenceReturnFocus: string | null
  counselMode: boolean
  session: CounselingSession | null
  persistSession: boolean
  lastSearch: { query: string; scrollY: number } | null
}

type Action =
  | { type: 'cohort'; year: number }
  | { type: 'compare.add'; id: string }
  | { type: 'compare.remove'; id: string }
  | { type: 'compare.set'; ids: string[] }
  | { type: 'interest.set'; courses: string[] }
  | { type: 'track.set'; schoolId: string; trackId: string | null }
  | { type: 'evidence.open'; id: string; returnFocus: string | null }
  | { type: 'evidence.close' }
  | { type: 'counselMode'; on: boolean }
  | { type: 'session.set'; session: CounselingSession | null }
  | { type: 'session.persist'; on: boolean }
  | { type: 'search.remember'; query: string; scrollY: number }

const SS_KEY = 'atlas.workspace.v1'
const SS_SESSION_KEY = 'atlas.counseling.session.v1' // 탭 세션 (탭을 닫으면 사라짐)
const LS_SESSION_KEY = 'atlas.counseling.v1' // 기기 저장 (사용자가 선택할 때만)

function load(): WorkspaceState {
  const base: WorkspaceState = {
    cohortYear: suggestedCohortYear(),
    cohortExplicit: false,
    compare: [],
    interestCourses: [],
    trackChoice: {},
    evidenceId: null,
    evidenceReturnFocus: null,
    counselMode: false,
    session: null,
    persistSession: false,
    lastSearch: null,
  }
  try {
    const raw = sessionStorage.getItem(SS_KEY)
    if (raw) Object.assign(base, JSON.parse(raw) as Partial<WorkspaceState>, { evidenceId: null, session: null })
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage.getItem(LS_SESSION_KEY)
    if (raw) {
      base.session = JSON.parse(raw) as CounselingSession
      base.persistSession = true
    } else {
      const ss = sessionStorage.getItem(SS_SESSION_KEY)
      if (ss) base.session = JSON.parse(ss) as CounselingSession
    }
  } catch {
    /* ignore */
  }
  return base
}

function reducer(s: WorkspaceState, a: Action): WorkspaceState {
  switch (a.type) {
    case 'cohort':
      return { ...s, cohortYear: a.year, cohortExplicit: true }
    case 'compare.add':
      if (s.compare.includes(a.id) || s.compare.length >= MAX_COMPARE_SCHOOLS) return s
      return { ...s, compare: [...s.compare, a.id] }
    case 'compare.remove':
      return { ...s, compare: s.compare.filter((x) => x !== a.id) }
    case 'compare.set':
      return { ...s, compare: a.ids.slice(0, MAX_COMPARE_SCHOOLS) }
    case 'interest.set':
      return { ...s, interestCourses: [...new Set(a.courses.map((c) => c.trim()).filter(Boolean))] }
    case 'track.set':
      return { ...s, trackChoice: { ...s.trackChoice, [a.schoolId]: a.trackId } }
    case 'evidence.open':
      return { ...s, evidenceId: a.id, evidenceReturnFocus: a.returnFocus }
    case 'evidence.close':
      return { ...s, evidenceId: null }
    case 'counselMode':
      return { ...s, counselMode: a.on }
    case 'session.set':
      return { ...s, session: a.session }
    case 'session.persist':
      return { ...s, persistSession: a.on }
    case 'search.remember':
      return { ...s, lastSearch: { query: a.query, scrollY: a.scrollY } }
    default:
      return s
  }
}

const Ctx = createContext<{ state: WorkspaceState; dispatch: (a: Action) => void } | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)
  useEffect(() => {
    try {
      const { cohortYear, cohortExplicit, compare, interestCourses, trackChoice, counselMode, lastSearch } = state
      sessionStorage.setItem(SS_KEY, JSON.stringify({ cohortYear, cohortExplicit, compare, interestCourses, trackChoice, counselMode, lastSearch }))
    } catch {
      /* ignore */
    }
  }, [state])
  useEffect(() => {
    try {
      // 기본: 이 탭의 세션 저장소에만 (탭을 닫으면 사라짐). 기기 저장은 명시적 선택.
      if (state.session) sessionStorage.setItem(SS_SESSION_KEY, JSON.stringify(state.session))
      else sessionStorage.removeItem(SS_SESSION_KEY)
      if (state.persistSession && state.session) localStorage.setItem(LS_SESSION_KEY, JSON.stringify(state.session))
      else localStorage.removeItem(LS_SESSION_KEY)
    } catch {
      /* ignore */
    }
  }, [state.session, state.persistSession])
  const value = useMemo(() => ({ state, dispatch }), [state])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWorkspace() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('WorkspaceProvider 밖에서 사용되었습니다.')
  return ctx
}

export function useEvidence() {
  const { state, dispatch } = useWorkspace()
  const open = useCallback(
    (id: string, returnFocus: string | null = null) => dispatch({ type: 'evidence.open', id, returnFocus }),
    [dispatch],
  )
  const close = useCallback(() => dispatch({ type: 'evidence.close' }), [dispatch])
  return { evidenceId: state.evidenceId, open, close }
}

export function newSession(cohortYear: number): CounselingSession {
  const now = new Date().toISOString()
  return {
    id: `cs_${Math.random().toString(36).slice(2, 10)}`,
    alias: '',
    targetCohortYear: cohortYear,
    interests: [],
    interestCourses: [],
    commutePriority: null,
    lifePreferences: [],
    candidateSchoolIds: [],
    questions: [],
    checklist: [],
    privateNotes: '',
    sharedNotes: '',
    userCommutes: [],
    dataVersions: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function clearDeviceStorage() {
  try {
    localStorage.removeItem(LS_SESSION_KEY)
    sessionStorage.removeItem(SS_SESSION_KEY)
    sessionStorage.removeItem(SS_KEY)
  } catch {
    /* ignore */
  }
}
