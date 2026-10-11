import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  localStorage.clear()
})

window.scrollTo = () => {}

// jsdom's AbortSignal is not accepted by Node's fetch; strip it in tests (real browsers are unaffected).
const nodeFetch = globalThis.fetch
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  if (init?.signal) {
    const rest = { ...init }
    delete rest.signal
    return nodeFetch(input, rest)
  }
  return nodeFetch(input, init)
}) as typeof fetch
