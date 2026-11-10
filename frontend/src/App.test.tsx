import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('App', () => {
  it('submits a question and renders the grounded response, trace, and citation', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      answer: 'Use the VPN client.',
      source_used: 'private_kb',
      trace: ['Retrieved private KB', 'Evidence accepted'],
      citations: [{ title: 'IT handbook', url: 'https://example.test/handbook' }],
      rewritten_query: 'VPN connection',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    render(<App />)
    const input = screen.getByRole('textbox', { name: /it support question/i })
    await userEvent.type(input, 'How do I use VPN?{enter}')

    expect(await screen.findByText('Use the VPN client.')).toBeInTheDocument()
    expect(screen.getByText('Evidence accepted')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'IT handbook' })).toHaveAttribute('href', 'https://example.test/handbook')
  })

  it('reports API failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ detail: 'Service unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    }))
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'What is our password reset policy?' }))
    expect(await screen.findByText('Error: Service unavailable')).toBeInTheDocument()
    expect(screen.getByText('Request failed')).toBeInTheDocument()
  })

  it('clears sensitive upload input after success and closes with Escape', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      message: 'Document indexed', file: 'guide.md', chunks: 3, ids_created: 3,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /add company document/i }))
    const keyInput = screen.getByLabelText('Admin API key')
    const fileInput = screen.getByLabelText('Company document')
    await userEvent.type(keyInput, 'secret')
    await userEvent.upload(fileInput, new File(['content'], 'guide.md', { type: 'text/markdown' }))
    await userEvent.click(screen.getByRole('button', { name: 'Index Document' }))
    expect(await screen.findByText('Indexed guide.md: 3 chunks.')).toBeInTheDocument()
    await waitFor(() => expect(keyInput).toHaveValue(''))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
