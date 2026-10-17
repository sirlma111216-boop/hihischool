import { useEffect, useRef, useState } from 'react'
import { ApiError } from './api'

export interface Async<T> {
  data: T | null
  error: ApiError | Error | null
  loading: boolean
  reload: () => void
}

/** 간단한 비동기 로더. key 가 바뀌면 다시 불러온다. */
export function useAsync<T>(fn: () => Promise<T>, key: string, enabled = true): Async<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | Error | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn
  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    setError(null)
    fnRef
      .current()
      .then((d) => {
        if (alive) setData(d)
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e : new Error(String(e)))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [key, tick, enabled])
  return { data, error, loading, reload: () => setTick((t) => t + 1) }
}

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(q).matches : false))
  useEffect(() => {
    const mq = window.matchMedia(q)
    const h = () => setM(mq.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [q])
  return m
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · 고교 아틀라스` : '고교 아틀라스'
  }, [title])
}
