// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* Retake Gym: the e-mail sign-in screen (EMAIL_LOGIN). The web app signs in on its own server;
   the phone app hands the same fields to connectToServer, which asks /api/app/*. */
const mocks = vi.hoisted(() => {
  const state = { config: { email_login: true, password_login: true }, user: null }
  state.fns = {
    setUser: vi.fn(), adoptProfile: vi.fn(), setGuest: vi.fn(), loadConfig: vi.fn(), pushState: vi.fn(), pullState: vi.fn(),
    connectToServer: vi.fn(async () => {}),
  }
  state.snapshot = () => ({ config: state.config, S: {}, user: state.user, ...state.fns })
  return state
})
vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.snapshot()) : mocks.snapshot()
  useStore.getState = mocks.snapshot
  return { useStore, hasData: () => false }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: vi.fn(), openSheet: vi.fn() })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('../lib/api.js', () => ({
  webauthnOK: () => true, passkeyLogin: vi.fn(), passkeyRegister: vi.fn(), bio: () => 'your fingerprint', BIO: 'x',
  api: vi.fn(), passkeyAssertion: vi.fn(),
  passwordLogin: vi.fn(async () => ({ id: 'u1', name: 'Ana' })),
  passwordRegister: vi.fn(async () => ({ id: 'u1', name: 'Ana' })),
  passwordResetRedeem: vi.fn(async () => ({ id: 'u1', name: 'Ana' })),
}))
vi.mock('../lib/demo.js', () => ({ DEMO: false, REPO: 'https://example.invalid' }))
vi.mock('../sheets.jsx', () => ({ askAddDeviceData: vi.fn(), confirmSheet: vi.fn() }))

const api = await import('../lib/api.js')
const { EmailAuth, looksLikeUsername, suggestUsername, foldUsername } = await import('./EmailAuth.jsx')
const { default: Login } = await import('../views/Login.jsx')

const mounted = []
function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push({ root, host })
  act(() => root.render(el))
  return host
}
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent === text)
function type(input, value) {
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  act(() => { set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) })
}
const submit = async host => { await act(async () => { host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) }) }

beforeEach(() => { vi.clearAllMocks(); mocks.config = { email_login: true, password_login: true } })
afterEach(() => { act(() => { mounted.splice(0).forEach(({ root, host }) => { root.unmount(); host.remove() }) }) })

describe('user names', () => {
  it('follow the server rule', () => {
    for (const ok of ['ana', 'ana.souza', 'a_b_c', '@Ana', 'x'.repeat(20)]) expect(looksLikeUsername(ok)).toBe(true)
    for (const bad of ['an', '.ana', 'ana.', 'a..b', 'ana souza', 'ana!', 'x'.repeat(21), '']) expect(looksLikeUsername(bad)).toBe(false)
    expect(foldUsername(' @Ana ')).toBe('ana')
  })
  it('are suggested from the name', () => {
    expect(suggestUsername('João da Silva')).toBe('joao.da.silva')
    expect(suggestUsername('  Ana  ')).toBe('ana')
  })
})

describe('Login with EMAIL_LOGIN', () => {
  it('shows the e-mail form and no passkey buttons', () => {
    const page = mount(<Login />)
    expect(page.querySelector('input[placeholder="E-mail or user name"]')).toBeTruthy()
    expect(page.textContent).not.toContain('passkey')
    expect(button(page, 'Create account')).toBeTruthy()
  })

  it('signs in on the web with the e-mail and password', async () => {
    const page = mount(<EmailAuth />)
    type(page.querySelector('input[name="username"]'), 'ana@example.com')
    type(page.querySelector('input[type="password"]'), 'correct horse battery staple')
    await submit(page)
    expect(api.passwordLogin).toHaveBeenCalledWith('ana@example.com', 'correct horse battery staple')
    expect(mocks.fns.setUser).toHaveBeenCalled()
  })

  it('creates an account with name, user name, e-mail and password', async () => {
    const page = mount(<EmailAuth start="register" />)
    type(page.querySelector('input[name="name"]'), 'Ana Souza')
    expect(page.querySelector('input[name="nickname"]').value).toBe('ana.souza')
    type(page.querySelector('input[name="email"]'), 'ana@example.com')
    const [pw, again] = page.querySelectorAll('input[type="password"]')
    type(pw, 'correct horse battery staple')
    type(again, 'correct horse battery stable')
    await submit(page)
    expect(page.textContent).toContain('The two passwords are not the same.')
    type(again, 'correct horse battery staple')
    await submit(page)
    expect(api.passwordRegister).toHaveBeenCalledWith('Ana Souza', 'correct horse battery staple', '', 'ana@example.com', 'ana.souza')
  })

  it('on the phone it signs in through the server named', async () => {
    const page = mount(<EmailAuth server="https://gym.example.com" />)
    type(page.querySelector('input[name="username"]'), 'ana')
    type(page.querySelector('input[type="password"]'), 'correct horse battery staple')
    await submit(page)
    expect(mocks.fns.connectToServer).toHaveBeenCalledWith('https://gym.example.com',
      { kind: 'login', body: { identifier: 'ana', password: 'correct horse battery staple' } }, expect.anything())
    expect(api.passwordLogin).not.toHaveBeenCalled()
  })
})
