import { test, expect } from '@playwright/test';

const unique = (prefix) => `${prefix}.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

async function register(page, name, email) {
  await page.goto('/register');
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Password123!');
  const confirm = page.getByLabel(/Confirm Password/i);
  if (await confirm.count()) await confirm.fill('Password123!');
  await page.getByRole('button', { name: /register/i }).click();
  await expect(page).toHaveURL(/dashboard/);
}

test.describe('PairPad collaboration smoke flow', () => {
  test('two users can create, join and edit a shared workspace', async ({ browser }) => {
    const owner = await browser.newPage();
    const collaborator = await browser.newPage();

    const ownerEmail = unique('owner');
    const collaboratorEmail = unique('collaborator');

    await register(owner, 'E2E Owner', ownerEmail);
    await register(collaborator, 'E2E Collaborator', collaboratorEmail);

    await owner.getByRole('button', { name: 'Create Room' }).click();
    await owner.getByLabel('Room Name').fill('E2E Collaboration Room');
    await owner.getByRole('button', { name: /Create Room$/ }).last().click();

    const roomCard = owner.locator('.room-card').filter({ hasText: 'E2E Collaboration Room' });
    await expect(roomCard).toHaveCount(1);
    const roomCode = await roomCard.locator('.room-code strong').textContent();
    expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);

    await owner.getByRole('button', { name: 'Open Room' }).click();
    await expect(owner).toHaveURL(new RegExp(`/room/${roomCode}`));
    await expect(owner.getByText('Connected')).toBeVisible({ timeout: 15000 });

    await collaborator.getByRole('button', { name: 'Join Room' }).click();
    await collaborator.getByLabel('Room Code').fill(roomCode);
    await collaborator.getByRole('button', { name: /Join Room$/ }).last().click();
    await expect(collaborator).toHaveURL(new RegExp(`/room/${roomCode}`));
    await expect(collaborator.getByText('Connected')).toBeVisible({ timeout: 15000 });

    await owner.getByLabel('New file path').fill('src/main.js');
    await owner.getByRole('button', { name: '+' }).click();
    await expect(owner.getByRole('button', { name: 'src/main.js' })).toBeVisible();

    await collaborator.getByRole('button', { name: 'src/main.js' }).click();
    await expect(collaborator.getByText('src/main.js')).toBeVisible();

    const ownerEditor = owner.locator('.monaco-editor').last();
    await ownerEditor.click();
    await owner.keyboard.type('console.log("shared");');

    const collaboratorEditor = collaborator.locator('.monaco-editor .view-lines').last();
    await expect(collaboratorEditor.getByText('console.log', { exact: false })).toBeVisible({ timeout: 10000 });
    await expect(collaboratorEditor).toContainText('shared', { timeout: 10000 });

    await owner.close();
    await collaborator.close();
  });

  test('login surfaces a useful error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /Login to PairPad/i })).toBeVisible();
    await page.getByLabel('Email').fill('missing@example.com');
    await page.getByLabel('Password', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: /login/i }).click();
    await expect(page.getByText(/Login failed|Invalid|failed/i)).toBeVisible({ timeout: 5000 });
  });
});
