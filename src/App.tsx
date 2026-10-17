import { Suspense, lazy, useEffect, useState, type FormEvent } from 'react'
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useWorkspace } from './lib/store'
import { Icon, Skeleton } from './components/ui'
import { EvidenceDrawer } from './components/EvidenceDrawer'
import { CompareBar } from './components/CompareBar'
import { CommandPalette } from './components/CommandPalette'
import { ErrorBoundary } from './components/ErrorBoundary'
import Landing from './routes/Landing'
import Schools from './routes/Schools'
import SchoolProfile from './routes/SchoolProfile'
import SchoolCurriculum from './routes/SchoolCurriculum'
import Compare from './routes/Compare'
import Planner from './routes/Planner'
import Counsel from './routes/Counsel'
import Briefing from './routes/Briefing'
import Sources from './routes/Sources'

const Admin = lazy(() => import('./routes/Admin'))

const COHORT_YEARS = [2025, 2026, 2027, 2028, 2029]

const NAV = [
  { to: '/schools', label: '학교 찾기', icon: Icon.school },
  { to: '/compare', label: '학교 비교', icon: Icon.compare },
  { to: '/planner', label: '배움 경로', icon: Icon.path },
  { to: '/counsel', label: '상담 워크스페이스', icon: Icon.counsel },
  { to: '/briefing', label: '상담 브리핑', icon: Icon.brief },
  { to: '/sources', label: '출처·자료 범위', icon: Icon.source },
]

export default function App() {
  const { state, dispatch } = useWorkspace()
  const nav = useNavigate()
  const loc = useLocation()
  const [q, setQ] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault()
        document.getElementById('global-search')?.focus()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    nav(`/schools?q=${encodeURIComponent(q.trim())}`)
  }

  const isAdmin = loc.pathname.startsWith('/admin')
  return (
    <div className="app">
      <a href="#main" className="skip-link">본문으로 건너뛰기</a>
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="고교 아틀라스 홈">
          <span className="mark" aria-hidden="true" />
          <span className="text">고교 아틀라스</span>
        </NavLink>
        <form className="topbar-search" role="search" onSubmit={submit}>
          <label htmlFor="global-search" className="sr-only">학교·과목·지역 검색</label>
          <input id="global-search" className="input" placeholder="학교, 과목, 자치구로 검색 (/ 키)" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          <button type="submit" className="btn primary" aria-label="검색"><Icon.search /></button>
        </form>
        <div className="topbar-right">
          <label className="cohort-select">
            <span className="lbl">대상 입학연도</span>
            <select value={state.cohortYear} onChange={(e) => dispatch({ type: 'cohort', year: Number(e.target.value) })} aria-label="대상 입학연도 선택">
              {COHORT_YEARS.map((y) => (
                <option key={y} value={y}>{y} 입학생</option>
              ))}
            </select>
          </label>
          <button type="button" className="btn quiet" onClick={() => setPaletteOpen(true)} aria-label="명령 팔레트 (Ctrl+K)" title="명령 팔레트 (Ctrl+K)">
            <span className="kbd">Ctrl K</span>
          </button>
        </div>
      </header>
      <div className={`shell ${state.evidenceId ? 'with-drawer' : ''}`}>
        <nav className="sidenav" aria-label="작업 공간">
          <div className="title">WORKSPACE</div>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              <n.icon /> {n.label}
            </NavLink>
          ))}
          <NavLink to="/admin" className={({ isActive }) => (isActive ? 'active' : '')}><Icon.admin /> 자료 관리</NavLink>
          <div className="foot">
            {state.cohortExplicit ? `${state.cohortYear} 입학생 기준으로 보는 중` : `입학연도 미선택 — 제안값 ${state.cohortYear}. 상단에서 확인하세요.`}
          </div>
        </nav>
        <main id="main" className={`main ${state.counselMode && loc.pathname.startsWith('/counsel') ? 'counsel-mode' : ''}`} tabIndex={-1}>
          <Suspense fallback={<Skeleton lines={6} />}>
            <ErrorBoundary key={loc.pathname}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/schools" element={<Schools />} />
              <Route path="/schools/:id" element={<SchoolProfile />} />
              <Route path="/schools/:id/curriculum" element={<SchoolCurriculum />} />
              <Route path="/compare" element={<Compare />} />
              <Route path="/planner" element={<Planner />} />
              <Route path="/counsel" element={<Counsel />} />
              <Route path="/briefing" element={<Briefing />} />
              <Route path="/sources" element={<Sources />} />
              <Route path="/admin/*" element={<Admin />} />
              <Route path="*" element={<div className="empty"><h3>없는 페이지입니다</h3><p><NavLink to="/">홈으로</NavLink></p></div>} />
            </Routes>
            </ErrorBoundary>
          </Suspense>
        </main>
        {state.evidenceId && <EvidenceDrawer />}
      </div>
      {!isAdmin && <CompareBar />}
      <nav className="mobile-nav" aria-label="모바일 탐색">
        {NAV.slice(0, 5).map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'active' : '')}>
            <n.icon /> {n.label.replace(' 워크스페이스', '')}
          </NavLink>
        ))}
      </nav>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  )
}
