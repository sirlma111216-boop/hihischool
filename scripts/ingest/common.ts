/**
 * 수집 스크립트 공통: 환경 변수(.dev.vars) 읽기, 제한된 동시성, 재시도, 관리 API 로 결과 기록.
 * 키는 .dev.vars 또는 환경 변수에서만 읽고 출력·로그에 쓰지 않는다.
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Dataset } from '../../shared/dataset'

export function loadDevVars(root: string): Record<string, string> {
  const out: Record<string, string> = {}
  const file = path.join(root, '.dev.vars')
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !line.trim().startsWith('#')) out[m[1]!] = m[2]!.replace(/^"|"$/g, '')
    }
  }
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) out[k] = v
  return out
}

export async function withRetry<T>(fn: () => Promise<T>, tries = 3, delayMs = 800): Promise<T> {
  let last: unknown
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)))
    }
  }
  throw last
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const idx = i++
        if (idx >= items.length) return
        out[idx] = await fn(items[idx]!)
      }
    }),
  )
  return out
}

export function writeJson(file: string, data: unknown) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

/** 관리 API 로 데이터셋·범위 기록을 올린다. ADMIN_API_TOKEN 이 있어야 한다. 로컬 dev 서버(DEV_ADMIN_BYPASS) 도 허용. */
export async function postAdmin(baseUrl: string, token: string | undefined, pathName: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}${pathName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
  const j = (await res.json()) as { ok: boolean; data?: unknown; error?: { message: string } }
  if (!res.ok || !j.ok) throw new Error(`관리 API ${pathName} 실패 (${res.status}): ${j.error?.message ?? ''}`)
  return j.data
}

export interface ExistingSchool {
  id: string
  officialName: string
  address: string | null
  geo: { lat: number; lng: number; source: string; retrievedAt: string | null } | null
  schoolType: string
  schoolTypeStatus: string
  schoolSubtype: string | null
  sourceConflicts: { field: string; values: { provider: string; value: string }[] }[]
  establishment: string
  gender: string
  dayNight: string
}

/** 대상 API 의 현재 학교 목록(가상 제외). crosswalk 판단(정식명 + 도로명 주소)에 쓴다. */
export async function loadExistingSchools(baseUrl: string | undefined): Promise<ExistingSchool[]> {
  if (!baseUrl) return []
  try {
    const out: ExistingSchool[] = []
    for (let page = 1; page <= 20; page++) {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/schools?pageSize=200&page=${page}`)
      const j = (await res.json()) as { ok: boolean; data?: { items: { school: ExistingSchool & { isSynthetic: boolean } }[]; total: number } }
      const items = j.data?.items ?? []
      out.push(...items.filter((i) => !i.school.isSynthetic).map((i) => i.school))
      if (items.length < 200) break
    }
    return out
  } catch {
    return []
  }
}

export const normName = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, '').replace(/\(.*?\)/g, '')

/** 정식명 + 도로명 주소 앞부분이 모두 같을 때만 같은 학교로 본다 (이름만 같으면 병합하지 않음). */
export function matchExisting(existing: ExistingSchool[], name: string, roadAddress: string): { same: ExistingSchool | null; nameOnly: ExistingSchool | null } {
  const same = existing.find((e) => normName(e.officialName) === normName(name) && e.address && roadAddress && normName(e.address).startsWith(normName(roadAddress).slice(0, 12))) ?? null
  const nameOnly = same ? null : (existing.find((e) => normName(e.officialName) === normName(name)) ?? null)
  return { same, nameOnly }
}

export function emptyIngestDataset(): Dataset {
  return { schools: [], tracks: [], documents: [], evidence: [], versions: [], offerings: [], selectionGroups: [], facts: [], programs: [], admissionRules: [], admissionEvents: [] }
}
