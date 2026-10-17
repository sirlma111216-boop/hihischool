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

export function emptyIngestDataset(): Dataset {
  return { schools: [], tracks: [], documents: [], evidence: [], versions: [], offerings: [], selectionGroups: [], facts: [], programs: [], admissionRules: [], admissionEvents: [] }
}
