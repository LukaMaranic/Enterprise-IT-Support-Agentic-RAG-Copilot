import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/chat', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        answer: 'Open the VPN client and sign in.',
        source_used: 'private_kb',
        trace: ['Route question', 'Grounded answer'],
        citations: [{ title: 'Company handbook' }],
        rewritten_query: 'VPN connection',
      }),
    })
  })
  await page.goto('/')
})

test('asks a support question and shows the agent result', async ({ page }) => {
  await page.getByLabel('IT support question').fill('How do I connect to VPN?')
  await page.getByRole('button', { name: 'Ask Agent' }).click()
  await expect(page.getByText('Open the VPN client and sign in.')).toBeVisible()
  await expect(page.getByText('Grounded answer', { exact: true })).toBeVisible()
  await expect(page.getByText('private_kb', { exact: true })).toBeVisible()
})

test('opens and closes document upload accessibly', async ({ page }) => {
  await page.getByRole('button', { name: /add company document/i }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
})
