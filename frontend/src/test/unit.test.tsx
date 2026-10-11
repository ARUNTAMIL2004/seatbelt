import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { evaluateParams, isFutureInstant } from '../services/paramEval'
import { formatDetail } from '../services/api'
import { formatDateTime, localToIso, errorMessage } from '../services/format'
import { translations } from '../services/i18n'
import { Modal } from '../components/Modal'
import type { ParameterDefinition } from '../types'

const schema: ParameterDefinition[] = [
  { name: 'torque', label: 'Torque', type: 'number', unit: 'Nm', min_value: 10, max_value: 20, required: true },
  { name: 'check', label: 'Check', type: 'string', nominal: 'PASS', required: true },
]

describe('evaluateParams', () => {
  it('flags missing, invalid and out-of-range values', () => {
    expect(evaluateParams(schema, {}).missing).toEqual(['Torque', 'Check'])
    expect(evaluateParams(schema, { torque: 'abc', check: 'PASS' }).invalid).toEqual(['Torque'])
    const out = evaluateParams(schema, { torque: '25', check: 'PASS' })
    expect(out.allInTolerance).toBe(false)
    expect(out.outOfRange[0]).toContain('25 > 20')
    expect(evaluateParams(schema, { torque: '5', check: 'PASS' }).outOfRange[0]).toContain('5 < 10')
  })
  it('treats FAIL tokens as out of tolerance and builds a numeric payload', () => {
    expect(evaluateParams(schema, { torque: '15', check: 'fail' }).allInTolerance).toBe(false)
    const ok = evaluateParams(schema, { torque: '15.5', check: 'PASS' })
    expect(ok.allFilled && ok.allInTolerance).toBe(true)
    expect(ok.payload).toEqual({ torque: 15.5, check: 'PASS' })
  })
  it('does not coerce blank input to zero', () => {
    const r = evaluateParams(schema, { torque: '', check: 'PASS' })
    expect(r.missing).toEqual(['Torque'])
    expect('torque' in r.payload).toBe(false)
  })
  it('detects future instants', () => {
    expect(isFutureInstant(new Date(Date.now() + 3_600_000).toISOString())).toBe(true)
    expect(isFutureInstant(new Date(Date.now() - 3_600_000).toISOString())).toBe(false)
  })
})

describe('api helpers', () => {
  it('formats FastAPI validation errors readably', () => {
    expect(formatDetail([{ loc: ['body', 'reason'], msg: 'Field required' }], 'x')).toBe('reason: Field required')
    expect(formatDetail('Plain', 'x')).toBe('Plain')
    expect(formatDetail(undefined, 'fallback')).toBe('fallback')
  })
  it('formats dates / errors defensively', () => {
    expect(formatDateTime(null)).toBe('—')
    expect(formatDateTime('not-a-date')).toBe('—')
    expect(formatDateTime('2026-10-02T10:00:00Z')).not.toBe('—')
    expect(localToIso('2026-10-02', '10:00')).toMatch(/Z$/)
    expect(errorMessage(new Error('boom'))).toBe('boom')
    expect(errorMessage('x', 'fb')).toBe('fb')
  })
  it('has Tamil for every English key', () => {
    expect(Object.keys(translations.ta).sort()).toEqual(Object.keys(translations.en).sort())
  })
})

describe('Modal', () => {
  it('is an accessible dialog that closes on Escape and the close button', async () => {
    const onClose = vi.fn()
    render(<Modal isOpen onClose={onClose} title="Hello"><input aria-label="field" /></Modal>)
    expect(screen.getByRole('dialog', { name: 'Hello' })).toBeInTheDocument()
    expect(screen.getByLabelText('field')).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
  it('renders nothing when closed and restores body scroll', () => {
    const { rerender } = render(<Modal isOpen onClose={() => {}} title="T">x</Modal>)
    expect(document.body.style.overflow).toBe('hidden')
    rerender(<Modal isOpen={false} onClose={() => {}} title="T">x</Modal>)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.body.style.overflow).toBe('')
  })
})
