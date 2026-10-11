/**
 * End-to-end UI tests: the real React app + real FastAPI backend (seeded demo data).
 * Run with:  TEST_API_BASE=http://127.0.0.1:8001/api/v1 npm test
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { ApiService } from '../services/api'

const live = !!process.env.TEST_API_BASE
const PW = process.env.TEST_PASSWORD || 'password123'

async function signIn(emp: string, user = userEvent.setup(), alreadyRendered = false) {
  if (!alreadyRendered) render(<App />)
  await user.type(await screen.findByLabelText(/employee id/i), emp)
  await user.type(screen.getByLabelText(/^password/i), PW)
  await user.click(screen.getByRole('button', { name: /sign in/i }))
  await screen.findByRole('navigation', { name: 'Main' })
  return user
}

async function lookup(user: ReturnType<typeof userEvent.setup>, qr: string) {
  const input = screen.getByRole('textbox', { name: /seatbelt qr/i })
  await user.clear(input)
  await user.type(input, qr)
  await user.click(screen.getByRole('button', { name: /^lookup$/i }))
  await screen.findByText(qr, { selector: 'span' })
}

describe.skipIf(!live)('app against live API', () => {
  beforeEach(() => ApiService.clearToken())

  it('shows the login screen and rejects bad credentials', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(await screen.findByLabelText(/employee id/i), 'OP101')
    await user.type(screen.getByLabelText(/^password/i), 'wrong-password')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid employee id or password/i)
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
  })

  it('production operator: scan -> run stations in order -> sign out', async () => {
    const user = await signIn('OP102')
    expect(screen.queryByRole('button', { name: /reports/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /admin/i })).toBeNull() // role-based nav

    await lookup(user, 'SB-2026-000127')
    // M2 is locked: it has no Run action
    await user.click(screen.getByRole('button', { name: /^M2 /i }))
    expect(screen.queryByRole('button', { name: /run station/i })).toBeNull()

    // M1: run it through the modal
    await user.click(screen.getByRole('button', { name: /^M1 /i }))
    await user.click(screen.getByRole('button', { name: /run station/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /run station/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await screen.findByRole('button', { name: /^M1 .*completed/i })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /^M2 .*in progress/i })).toBeInTheDocument()

    // sign out returns to login
    await user.click(screen.getByRole('button', { name: /sign out/i }))
    expect(await screen.findByLabelText(/employee id/i)).toBeInTheDocument()
    expect(ApiService.hasToken()).toBe(false)
  })

  it('missing-data flow validates tolerance, then QA approves it', async () => {
    const user = await signIn('OP102')
    await lookup(user, 'SB-2026-000123')
    await user.click(screen.getByRole('button', { name: /^M5 /i }))
    await user.click(screen.getByRole('button', { name: /enter missing data/i }))
    const dialog = await screen.findByRole('dialog')

    // empty submit is blocked client-side
    await user.click(within(dialog).getByRole('button', { name: /save data/i }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/fill in valid values/i)

    const type = async (label: RegExp, v: string) => { const el = within(dialog).getByLabelText(label); await user.clear(el); await user.type(el, v) }
    await type(/torsion/i, '250')              // out of tolerance -> forced FAIL
    await type(/load limiting/i, '3.86')
    await type(/sensor voltage/i, '4.97')
    await user.selectOptions(within(dialog).getByLabelText(/calibration/i), 'PASS')
    expect(within(dialog).getByText(/will be recorded as FAIL/i)).toBeInTheDocument()
    await type(/torsion/i, '181.5')            // back in tolerance
    expect(within(dialog).queryByText(/will be recorded as FAIL/i)).toBeNull()

    await user.click(within(dialog).getByRole('button', { name: /save data/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await screen.findByText(/MANUAL DATA ENTRY/i, { selector: 'span' })).toBeInTheDocument()

    // switch to the QA user
    await user.click(screen.getByRole('button', { name: /sign out/i }))
    const qa = await signIn('QA201', user, true)
    expect(screen.queryByRole('button', { name: /run station/i })).toBeNull()
    await qa.click(screen.getByRole('button', { name: /quality review/i }))
    await qa.click(await screen.findByText('SB-2026-000123'))
    await qa.type(screen.getByLabelText(/verification comments/i), 'Verified with gauge CG-408')
    await qa.click(screen.getByRole('button', { name: /approve/i }))
    expect(await screen.findByText(/approved/i, { selector: '[role=status] *' })).toBeInTheDocument()
  })

  it('applies the user language preference (Tamil) after login and can switch', async () => {
    const user = await signIn('OP101') // profile language = ta
    expect(screen.getByRole('button', { name: 'வெளியேறு' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('ta')
    await user.click(screen.getByRole('button', { name: 'மொழி மாற்று' }))
    expect(await screen.findByRole('button', { name: /sign out/i })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
  })

  it('search view paginates and filters', async () => {
    const user = await signIn('SUP301')
    await user.click(screen.getByRole('button', { name: /traceability search/i }))
    expect(await screen.findByText('SB-2026-000125')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText(/all statuses/i), 'COMPLETED')
    await waitFor(() => expect(screen.queryByText('SB-2026-000124')).toBeNull())
    expect(screen.getByText('SB-2026-000125')).toBeInTheDocument()
  })

  it('admin can open user management and machine configuration', async () => {
    const user = await signIn('ADM001')
    await user.click(screen.getByRole('button', { name: /admin/i }))
    await user.click(await screen.findByRole('tab', { name: /users/i }))
    expect(await screen.findByText('OP101')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /machine adapters/i }))
    await user.click((await screen.findAllByRole('button', { name: /configure/i }))[0])
    expect(await screen.findByRole('dialog', { name: /configure m1/i })).toBeInTheDocument()
  })

  it('dashboard renders real KPIs', async () => {
    await signIn('SUP301')
    await userEvent.click(screen.getByRole('button', { name: /dashboard/i }))
    expect(await screen.findByText(/Industrial Production/i)).toBeInTheDocument()
    expect(await screen.findByText(/Active Operators/i)).toBeInTheDocument()
  })
})
