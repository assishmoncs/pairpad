import { test, expect } from '@playwright/test';

const unique = (prefix) => `${prefix}.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

async function register(page, name, email) {
  await page.goto('/register');
  await expect(page.getByRole('heading', { name: /Create Account/i })).toBeVisible();

  const fullNameInput = page.getByLabel('Full Name', { exact: true });
  const nameInput = page.getByLabel('Name', { exact: true });
  if (await fullNameInput.count()) {
    await expect(fullNameInput).toBeVisible();
    await fullNameInput.fill(name);
  } else {
    await expect(nameInput).toBeVisible();
    await nameInput.fill(name);
  }

  const emailInput = page.getByLabel('Email', { exact: true });
  await expect(emailInput).toBeVisible();
  await emailInput.fill(email);

  const passwordInput = page.getByLabel('Password', { exact: true });
  await expect(passwordInput).toBeVisible();
  await passwordInput.fill('Password123!');

  const confirmInput = page.getByLabel('Confirm Password', { exact: true });
  if (await confirmInput.count()) {
    await expect(confirmInput).toBeVisible();
    await confirmInput.fill('Password123!');
  }

  const registerBtn = page.getByRole('button', { name: /register/i });
  await expect(registerBtn).toBeVisible();
  await registerBtn.click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
}

test.describe('PairPad collaboration smoke flow', () => {
  test('two users can create, join and edit a shared workspace', async ({ browser }) => {
    test.setTimeout(90000);

    const owner = await browser.newPage();
    const collaborator = await browser.newPage();

    const ownerEmail = unique('owner');
    const collaboratorEmail = unique('collaborator');

    await register(owner, 'E2E Owner', ownerEmail);
    await register(collaborator, 'E2E Collaborator', collaboratorEmail);

    const createRoomBtn = owner.getByRole('button', { name: 'Create Room' });
    await expect(createRoomBtn).toBeVisible();
    await createRoomBtn.click();

    const roomNameInput = owner.getByLabel('Room Name', { exact: true });
    await expect(roomNameInput).toBeVisible();
    await roomNameInput.fill('E2E Collaboration Room');

    const submitCreateBtn = owner.getByRole('button', { name: /Create Room$/ }).last();
    await expect(submitCreateBtn).toBeVisible();
    await submitCreateBtn.click();

    const roomCard = owner.locator('.room-card').filter({ hasText: 'E2E Collaboration Room' });
    await expect(roomCard).toBeVisible({ timeout: 20000 });
    const roomCode = await roomCard.locator('.room-code strong').textContent();
    expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);

    const openRoomBtn = owner.getByRole('button', { name: 'Open Room' });
    await expect(openRoomBtn).toBeVisible();
    await openRoomBtn.click();
    await expect(owner).toHaveURL(new RegExp(`/room/${roomCode}`), { timeout: 30000 });

    // Explicitly wait for the WebSocket / Socket.IO connection handshake to be fully established and stable
    await expect(owner.locator('.status-dot.connected')).toBeVisible({ timeout: 30000 });
    await expect(owner.getByText('Connected')).toBeVisible({ timeout: 30000 });

    // Now navigate the secondary user (collaborator) into the room
    const joinRoomBtn = collaborator.getByRole('button', { name: 'Join Room' });
    await expect(joinRoomBtn).toBeVisible();
    await joinRoomBtn.click();

    const roomCodeInput = collaborator.getByLabel('Room Code', { exact: true });
    await expect(roomCodeInput).toBeVisible();
    await roomCodeInput.fill(roomCode);

    const submitJoinBtn = collaborator.getByRole('button', { name: /Join Room$/ }).last();
    await expect(submitJoinBtn).toBeVisible();
    await submitJoinBtn.click();
    await expect(collaborator).toHaveURL(new RegExp(`/room/${roomCode}`), { timeout: 30000 });

    // Ensure the collaborator's WebSocket connection handshake is also fully established
    await expect(collaborator.locator('.status-dot.connected')).toBeVisible({ timeout: 30000 });
    await expect(collaborator.getByText('Connected')).toBeVisible({ timeout: 30000 });

    const newFileInput = owner.getByLabel('New file path', { exact: true });
    await expect(newFileInput).toBeVisible({ timeout: 30000 });
    await newFileInput.fill('src/main.js');

    const addFileBtn = owner.getByRole('button', { name: '+' });
    await expect(addFileBtn).toBeVisible();
    await addFileBtn.click();

    const ownerFileTab = owner.getByRole('button', { name: 'src/main.js' });
    await expect(ownerFileTab).toBeVisible({ timeout: 30000 });

    const collabFileTab = collaborator.getByRole('button', { name: 'src/main.js' });
    await expect(collabFileTab).toBeVisible({ timeout: 30000 });
    await collabFileTab.click();
    await expect(collaborator.getByText('src/main.js')).toBeVisible({ timeout: 30000 });

    const ownerEditor = owner.locator('.monaco-editor').last();
    await expect(ownerEditor).toBeVisible({ timeout: 30000 });
    await ownerEditor.click();
    await owner.keyboard.type('console.log("shared");');

    const collaboratorEditor = collaborator.locator('.monaco-editor .view-lines').last();
    await expect(collaboratorEditor).toBeVisible({ timeout: 30000 });
    await expect(collaboratorEditor.getByText('console.log', { exact: false })).toBeVisible({ timeout: 30000 });
    await expect(collaboratorEditor).toContainText('shared', { timeout: 30000 });

    await owner.close();
    await collaborator.close();
  });

  test('login surfaces a useful error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /Login to PairPad/i })).toBeVisible();

    const emailInput = page.getByLabel('Email', { exact: true });
    await expect(emailInput).toBeVisible();
    await emailInput.fill('missing@example.com');

    const passwordInput = page.getByLabel('Password', { exact: true });
    await expect(passwordInput).toBeVisible();
    await passwordInput.fill('wrong-password');

    const loginBtn = page.getByRole('button', { name: /login/i });
    await expect(loginBtn).toBeVisible();
    await loginBtn.click();
    await expect(page.getByText(/Login failed|Invalid|failed/i)).toBeVisible({ timeout: 10000 });
  });
});
