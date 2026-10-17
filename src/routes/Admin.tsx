import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAsync, useDocumentTitle } from '../lib/hooks'
import { apiGet, apiPost, ApiError, getAdminToken, setAdminToken } from '../lib/api'
import type { CurriculumBundle, CurriculumVersion, SourceDocument } from '@shared/types'
import { DOCUMENT_TYPE_LABEL } from '@shared/types'
import { Button, Empty, ErrorBox, Skeleton, SyntheticBadge, Tone } from '../components/ui'
import { CurriculumMatrix, SelectionGroupList } from '../components/CurriculumMatrix'
import { formatDateKo } from '@shared/format'

type Me = { actor: string; method: string; env: string; aiAvailable: boolean }
type Check = { level: 'error' | 'warning'; code: string; message: string; ids?: string[] }
type VersionRow = CurriculumVersion & { schoolName?: string }

export default function Admin() {
  useDocumentTitle('자료 관리')
  const me = useAsync(() => apiGet<Me>('/api/admin/me'), 'me')
  if (me.loading) return <Skeleton lines={5} />
  if (me.error) {
    const e = me.error
    return (
      <Empty title="관리자 인증이 필요합니다" actions={<TokenForm onSaved={me.reload} />}>
        {e instanceof ApiError && e.status === 401 ? '이 영역은 Cloudflare Access 또는 서버 측 토큰으로 보호됩니다. 메뉴를 숨기는 방식이 아니라 API 가 요청마다 인증을 검증합니다. 관리자 토큰(ADMIN_API_TOKEN)이 있으면 아래에 입력하세요. 이 브라우저 탭에만 보관됩니다.' : e.message}
      </Empty>
    )
  }
  return <AdminInner me={me.data!} />
}

function AdminInner({ me }: { me: Me }) {
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') ?? 'overview'
  const setTab = (t: string) => { const n = new URLSearchParams(sp); n.set('tab', t); n.delete('version'); setSp(n) }
  return (
    <>
      <div className="page-head">
        <div><h1>자료 수집·문서 검토·공개 관리</h1><div className="sub">인증: {me.actor} ({me.method}) · 환경 {me.env} · 생성형 AI 보조 {me.aiAvailable ? '사용 가능' : '비활성 (키 없음)'}</div></div>
      </div>
      <div className="hint">자동 추출 결과는 '초안', 사람이 승인한 것만 '검토 완료'입니다. 잘못된 입학연도·합계 불일치·규칙 모순·출처 누락은 공개를 막는 오류입니다. 검토자는 사람 이름이어야 하며 AI 로 기록되지 않습니다.</div>
      <div className="tabs" role="tablist">
        {[['overview', '현황'], ['versions', '교육과정 버전'], ['documents', '원문 등록'], ['coverage', '수집·범위'], ['audit', '감사 기록'], ['ai', 'AI 보조']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k!)}>{l}</button>)}
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'versions' && (sp.get('version') ? <VersionDetail id={sp.get('version')!} onBack={() => { const n = new URLSearchParams(sp); n.delete('version'); setSp(n) }} /> : <Versions onOpen={(id) => { const n = new URLSearchParams(sp); n.set('version', id); setSp(n) }} />)}
      {tab === 'documents' && <Documents />}
      {tab === 'coverage' && <Coverage />}
      {tab === 'audit' && <Audit />}
      {tab === 'ai' && <AiPanel available={me.aiAvailable} />}
    </>
  )
}

function TokenForm({ onSaved }: { onSaved: () => void }) {
  const [t, setT] = useState(getAdminToken() ?? '')
  return (
    <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setAdminToken(t.trim() || null); onSaved() }}>
      <input className="input" type="password" style={{ width: 320 }} value={t} onChange={(e) => setT(e.target.value)} placeholder="관리자 토큰" aria-label="관리자 토큰" autoComplete="off" />
      <Button type="submit" variant="primary">토큰으로 열기</Button>
    </form>
  )
}

function Overview() {
  const r = useAsync(() => apiGet<Record<string, number>>('/api/admin/overview'), 'ov')
  if (r.loading) return <Skeleton />
  if (r.error) return <ErrorBox error={r.error} retry={r.reload} />
  const d = r.data!
  return (
    <div className="summary-strip">
      <div className="item"><div className="k">초안 버전</div><div className="v">{d.draft_versions}</div></div>
      <div className="item"><div className="k">공개 버전</div><div className="v">{d.published_versions}</div></div>
      <div className="item"><div className="k">검토 대기 문서</div><div className="v">{d.pending_docs}</div></div>
      <div className="item"><div className="k">학교 (실제)</div><div className="v">{d.schools}</div></div>
      <div className="item"><div className="k">학교 (가상)</div><div className="v">{d.synthetic_schools}</div></div>
      <div className="item"><div className="k">문제 있는 작업</div><div className="v">{d.problem_jobs}</div></div>
    </div>
  )
}

function Versions({ onOpen }: { onOpen: (id: string) => void }) {
  const r = useAsync(() => apiGet<VersionRow[]>('/api/admin/versions'), 'versions')
  const [importText, setImportText] = useState('')
  const [msg, setMsg] = useState('')
  if (r.loading) return <Skeleton />
  if (r.error) return <ErrorBox error={r.error} retry={r.reload} />
  const doImport = async () => {
    try {
      const ds = JSON.parse(importText)
      const res = await apiPost<{ jobId: string; imported: Record<string, number> }>('/api/admin/import', { dataset: ds.dataset ?? ds, keepStatus: false, jobLabel: '관리 화면 가져오기' })
      setMsg(`가져오기 완료 (초안): ${JSON.stringify(res.imported)}`)
      setImportText('')
      r.reload()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '실패')
    }
  }
  return (
    <>
      <div className="card">
        <h3>검토 패키지 가져오기 (JSON → 초안)</h3>
        <p className="small muted">로컬 <code>npm run docs:package</code> 가 만든 검토 JSON 을 붙여 넣습니다. 상태는 항상 초안으로 강제되고, 검토·공개는 별도 단계입니다. 배포 환경에는 가상 자료를 가져올 수 없습니다.</p>
        <textarea className="input" value={importText} onChange={(e) => setImportText(e.target.value)} placeholder='{"dataset": {...}}' aria-label="검토 패키지 JSON" />
        <div className="toolbar"><Button variant="primary" onClick={doImport} disabled={!importText.trim()}>초안으로 가져오기</Button>{msg && <span className="small">{msg}</span>}</div>
      </div>
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table className="data">
          <caption>교육과정 버전 (초안 포함). 공개 API 는 published 만 읽습니다.</caption>
          <thead><tr><th scope="col">학교</th><th scope="col">입학연도</th><th scope="col">과정</th><th scope="col">개정</th><th scope="col">상태</th><th scope="col">검토</th><th scope="col">검토자</th><th scope="col"></th></tr></thead>
          <tbody>
            {r.data!.map((v) => (
              <tr key={v.id}>
                <th scope="row">{v.schoolName ?? v.schoolId}{v.isSynthetic && <> <SyntheticBadge /></>}</th><td>{v.cohortYear}</td><td>{v.trackId ?? '—'}</td><td>{v.revision}</td>
                <td>{v.status === 'published' ? <Tone tone="ok">공개</Tone> : v.status === 'draft' ? <Tone tone="warn">초안</Tone> : <Tone tone="unknown">{v.status}</Tone>}</td>
                <td>{v.reviewStatus}</td><td>{v.reviewedBy ?? '—'}</td>
                <td><Button size="sm" onClick={() => onOpen(v.id)}>열기</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function VersionDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const r = useAsync(() => apiGet<{ bundle: CurriculumBundle; checks: Check[] }>(`/api/admin/versions/${encodeURIComponent(id)}`), id)
  const [reviewer, setReviewer] = useState('')
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<string>('')
  const [editGroup, setEditGroup] = useState<{ id: string; max: string; min: string; status: string; rule: string } | null>(null)
  if (r.loading) return <Skeleton lines={8} />
  if (r.error) return <ErrorBox error={r.error} retry={r.reload} />
  const { bundle, checks } = r.data!
  const errors = checks.filter((c) => c.level === 'error')
  const act = async (fn: () => Promise<unknown>, okMsg: string) => {
    try {
      await fn()
      setMsg(okMsg)
      r.reload()
    } catch (e) {
      setMsg(e instanceof ApiError ? `${e.message} ${e.details ? JSON.stringify(e.details) : ''}` : e instanceof Error ? e.message : '실패')
    }
  }
  return (
    <>
      <div className="toolbar"><Button size="sm" variant="quiet" onClick={onBack}>← 목록</Button><strong>{bundle.version.schoolId} · {bundle.version.cohortYear} 입학생 · {bundle.version.status} / {bundle.version.reviewStatus}</strong>{bundle.version.isSynthetic && <SyntheticBadge />}</div>
      <div className="grid-2">
        <div className="card">
          <h3>공개 전 검사</h3>
          {checks.length === 0 ? <Tone tone="ok">오류·경고 없음</Tone> : <ul style={{ paddingLeft: 18 }}>{checks.map((c, i) => <li key={i}>{c.level === 'error' ? <Tone tone="bad">오류</Tone> : <Tone tone="warn">경고</Tone>} {c.message} {c.ids && <span className="muted small">({c.ids.slice(0, 5).join(', ')}{c.ids.length > 5 ? '…' : ''})</span>}</li>)}</ul>}
        </div>
        <div className="card">
          <h3>검토·공개</h3>
          <div className="field"><label htmlFor="reviewer">검토자 (사람 이름)</label><input id="reviewer" className="input" value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="예: 홍길동" /></div>
          <div className="field"><label htmlFor="rnote">검토 메모</label><input id="rnote" className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <div className="toolbar">
            <Button onClick={() => act(() => apiPost('/api/admin/review', { versionId: id, reviewStatus: 'in_review', reviewer: reviewer || '검토자', note }), '검토 중으로 표시')} disabled={bundle.version.status === 'published'}>검토 시작</Button>
            <Button variant="primary" onClick={() => act(() => apiPost('/api/admin/review', { versionId: id, reviewStatus: 'approved', reviewer, note }), '승인됨')} disabled={!reviewer || errors.length > 0 || bundle.version.status === 'published'}>승인 (사람 검토 완료)</Button>
            <Button variant="destructive" onClick={() => act(() => apiPost('/api/admin/review', { versionId: id, reviewStatus: 'rejected', reviewer: reviewer || '검토자', note }), '반려됨')} disabled={bundle.version.status === 'published'}>반려</Button>
            <Button variant="primary" onClick={() => act(() => apiPost('/api/admin/publish', { versionId: id }), '공개됨 (이전 공개 버전은 대체됨)')} disabled={bundle.version.reviewStatus !== 'approved' || bundle.version.status === 'published'}>공개 (승인 묶음 반영)</Button>
            {bundle.version.status === 'published' && <Button variant="destructive" onClick={() => { const reason = prompt('철회 사유'); if (reason) act(() => apiPost('/api/admin/withdraw', { versionId: id, reason }), '철회됨') }}>공개 철회</Button>}
          </div>
          {msg && <p className="small" role="status">{msg}</p>}
          <p className="source">문서: {bundle.documents.map((d) => `${d.title} (${d.reviewStatus})`).join(' · ') || '연결된 문서 없음'}</p>
        </div>
      </div>
      <section style={{ marginTop: 14 }}>
        <h3>선택군 편집 (초안만)</h3>
        <SelectionGroupList groups={bundle.selectionGroups} offerings={bundle.offerings} />
        {bundle.version.status !== 'published' && (
          <div className="toolbar">
            <select className="select" style={{ maxWidth: 240 }} value={editGroup?.id ?? ''} onChange={(e) => { const g = bundle.selectionGroups.find((x) => x.id === e.target.value); setEditGroup(g ? { id: g.id, max: g.maxSelections?.toString() ?? '', min: g.minSelections?.toString() ?? '', status: g.ruleStatus, rule: g.verifiedRules.join(' / ') } : null) }} aria-label="편집할 선택군"><option value="">선택군 선택</option>{bundle.selectionGroups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</select>
            {editGroup && (
              <>
                <input className="input" style={{ width: 90 }} value={editGroup.min} onChange={(e) => setEditGroup({ ...editGroup, min: e.target.value })} placeholder="최소" aria-label="최소 선택 수" />
                <input className="input" style={{ width: 90 }} value={editGroup.max} onChange={(e) => setEditGroup({ ...editGroup, max: e.target.value })} placeholder="최대" aria-label="최대 선택 수" />
                <select className="select" style={{ width: 150 }} value={editGroup.status} onChange={(e) => setEditGroup({ ...editGroup, status: e.target.value })} aria-label="규칙 상태"><option value="verified">확인됨</option><option value="unverified">미확인</option><option value="conflict">충돌</option></select>
                <input className="input" style={{ width: 260 }} value={editGroup.rule} onChange={(e) => setEditGroup({ ...editGroup, rule: e.target.value })} placeholder="확인된 규칙 문장" aria-label="확인된 규칙" />
                <Button size="sm" variant="primary" onClick={() => act(() => apiPost('/api/admin/groups/edit', { groupId: editGroup.id, patch: { minSelections: editGroup.min === '' ? null : Number(editGroup.min), maxSelections: editGroup.max === '' ? null : Number(editGroup.max), ruleStatus: editGroup.status, verifiedRules: editGroup.rule ? editGroup.rule.split(' / ') : [] } }), '선택군 수정됨')}>저장</Button>
              </>
            )}
          </div>
        )}
      </section>
      <section style={{ marginTop: 14 }}>
        <h3>편성 (원문 옆에서 검토)</h3>
        <CurriculumMatrix bundle={bundle} interest={[]} selected={new Set()} view="source" />
        <p className="source">오탈자·학점·지정/선택·근거 연결은 /api/admin/offerings/edit 로 수정합니다 (초안만). 공개된 버전은 새 초안을 만들어 검토·공개합니다.</p>
      </section>
    </>
  )
}

function Documents() {
  const r = useAsync(() => apiGet<SourceDocument[]>('/api/admin/documents'), 'docs')
  const [url, setUrl] = useState('')
  const [schoolId, setSchoolId] = useState('')
  const [docType, setDocType] = useState('curriculum_table')
  const [cohort, setCohort] = useState('')
  const [msg, setMsg] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const check = async () => {
    try {
      const res = await apiPost<{ documentId: string; fetched: boolean; status: number | null; contentType: string | null; bytes: number; fileSignature: string; error: string | null; nextStep: string; storedPrivately: boolean }>('/api/admin/sources/check', { url, schoolId: schoolId || null, documentType: docType, cohortYear: cohort ? Number(cohort) : null })
      setMsg(`${res.fetched ? '확인됨' : '접근 실패'} · HTTP ${res.status ?? '—'} · ${res.contentType ?? ''} · ${res.bytes} 바이트 · 서명 ${res.fileSignature}${res.error ? ` · ${res.error}` : ''} · ${res.nextStep}`)
      r.reload()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '실패')
    }
  }
  const upload = async () => {
    if (!file) return
    const fd = new FormData()
    fd.set('file', file)
    fd.set('schoolId', schoolId)
    fd.set('documentType', docType)
    if (cohort) fd.set('cohortYear', cohort)
    const res = await fetch('/api/admin/upload', { method: 'POST', body: fd })
    const j = (await res.json()) as { ok: boolean; data?: { note: string; fileSignature: string }; error?: { message: string } }
    setMsg(j.ok ? `${j.data!.fileSignature} · ${j.data!.note}` : j.error!.message)
    r.reload()
  }
  return (
    <>
      <div className="card">
        <h3>공식 URL 등록·확인 / 파일 업로드</h3>
        <p className="small muted">허용 목록(교육청·학교알리미·나이스·고입포털·검증된 학교 홈페이지)의 공식 문서만 수집합니다. 사설 주소·리다이렉트 밖·크기 초과는 차단되며 범용 프록시가 아닙니다. 큰 파일·OCR·HWP 변환은 로컬 명령으로 처리합니다.</p>
        <div className="grid-2">
          <div>
            <div className="field"><label htmlFor="u">공식 URL</label><input id="u" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." /></div>
            <div className="field"><label htmlFor="f">파일 (PDF/HWPX/XLSX/HWP, 서명 검사)</label><input id="f" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          </div>
          <div>
            <div className="field"><label htmlFor="sid">학교 ID</label><input id="sid" className="input" value={schoolId} onChange={(e) => setSchoolId(e.target.value)} placeholder="예: syn_school_a" /></div>
            <div className="field"><label htmlFor="dt">문서 종류</label><select id="dt" className="select" value={docType} onChange={(e) => setDocType(e.target.value)}>{Object.entries(DOCUMENT_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div className="field"><label htmlFor="cy">대상 입학연도</label><input id="cy" className="input" value={cohort} onChange={(e) => setCohort(e.target.value)} inputMode="numeric" /></div>
          </div>
        </div>
        <div className="toolbar"><Button variant="primary" onClick={check} disabled={!url}>URL 확인·등록</Button><Button onClick={upload} disabled={!file}>업로드</Button>{msg && <span className="small">{msg}</span>}</div>
      </div>
      {r.loading ? <Skeleton /> : r.error ? <ErrorBox error={r.error} retry={r.reload} /> : (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="data">
            <thead><tr><th scope="col">문서</th><th scope="col">학교</th><th scope="col">종류</th><th scope="col">대상</th><th scope="col">파싱</th><th scope="col">검토</th><th scope="col">수집일</th><th scope="col">메모</th></tr></thead>
            <tbody>{r.data!.map((d) => <tr key={d.id}><th scope="row">{d.title}<span className="cellnote">{d.id}</span></th><td>{d.schoolId ?? '공통'}</td><td>{DOCUMENT_TYPE_LABEL[d.documentType]}</td><td>{d.cohortYear ?? '—'}</td><td>{d.parseStatus}</td><td>{d.reviewStatus}</td><td>{d.retrievedAt ? formatDateKo(d.retrievedAt) : '—'}</td><td className="small">{d.notes}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </>
  )
}

function Coverage() {
  const r = useAsync(() => apiGet<Record<string, unknown>[]>('/api/admin/jobs'), 'jobs')
  return (
    <div className="card">
      <h3>수집 작업</h3>
      <p className="small muted">학교알리미(구별 sgg 조회)·나이스 수집은 로컬 명령 <code>npm run ingest:schoolinfo</code> / <code>npm run ingest:neis</code> 로 실행하고, 결과(성공 구/실패 구/학교 수)를 이 API 에 기록합니다. 상담 화면 방문마다 25개 구를 호출하지 않습니다. 재시도 시 학교 코드 기준 upsert 로 중복 학교를 만들지 않습니다.</p>
      {r.loading ? <Skeleton /> : r.error ? <ErrorBox error={r.error} retry={r.reload} /> : r.data!.length === 0 ? <p className="muted">작업 이력이 없습니다.</p> : (
        <ul style={{ paddingLeft: 18 }}>{r.data!.map((j) => <li key={String(j.id)} className="small">{String(j.kind)} · {String(j.status)} · {j.finished_at ? formatDateKo(String(j.finished_at), { withTime: true }) : '진행 중'} · {String(j.result_json ?? '')} {j.error ? `· 오류: ${String(j.error)}` : ''}</li>)}</ul>
      )}
    </div>
  )
}

function Audit() {
  const r = useAsync(() => apiGet<Record<string, unknown>[]>('/api/admin/audit'), 'audit')
  if (r.loading) return <Skeleton />
  if (r.error) return <ErrorBox error={r.error} retry={r.reload} />
  return (
    <div className="table-wrap">
      <table className="data">
        <caption>감사 기록에는 키·문서 전문·상담 메모를 넣지 않습니다.</caption>
        <thead><tr><th scope="col">시각</th><th scope="col">대상</th><th scope="col">동작</th><th scope="col">행위자</th><th scope="col">변경</th></tr></thead>
        <tbody>{r.data!.map((a) => <tr key={String(a.id)}><td>{formatDateKo(String(a.created_at), { withTime: true })}</td><td>{String(a.entity_type)} {String(a.entity_id)}</td><td>{String(a.action)}</td><td>{String(a.actor)}</td><td className="small">{String(a.before_json ?? '')} → {String(a.after_json ?? '')}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

function AiPanel({ available }: { available: boolean }) {
  const [text, setText] = useState('')
  const [out, setOut] = useState<string>('')
  return (
    <div className="card">
      <h3>생성형 AI 문서 구조화 보조 (선택)</h3>
      {!available ? (
        <div className="hint warn">비활성 상태입니다. Worker secret 에 AI_PROVIDER 와 AI_API_KEY 가 없으면 이 기능은 동작하지 않으며, 핵심 검색·비교·조합 계산·브리핑은 AI 없이 완전하게 작동합니다.</div>
      ) : (
        <>
          <p className="small muted">공개된 학교 문서 텍스트에서 과목·선택군·근거 위치 후보만 추출합니다. 반환 JSON 은 스키마·원문 존재로 검증되고, 근거 없는 항목은 버려집니다. 학생 정보는 보내지 않습니다. 결과는 자동 공개되지 않습니다.</p>
          <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="문서 텍스트 (로컬 추출 결과)" aria-label="문서 텍스트" />
          <div className="toolbar">
            <Button onClick={async () => setOut(JSON.stringify(await apiPost('/api/admin/ai/extract', { documentId: 'manual', text, cohortYear: 2027, dryRun: true }), null, 2))} disabled={!text}>예상 비용 보기 (dry run)</Button>
            <Button variant="primary" onClick={async () => setOut(JSON.stringify(await apiPost('/api/admin/ai/extract', { documentId: 'manual', text, cohortYear: 2027, dryRun: false }), null, 2))} disabled={!text}>후보 추출 실행</Button>
          </div>
          {out && <pre className="small" style={{ whiteSpace: 'pre-wrap' }}>{out}</pre>}
        </>
      )}
    </div>
  )
}
