import { test, expect } from '@playwright/test';

const publicPages = ['/login', '/register', '/does-not-exist'];

const auditPage = async (page, path) => {
  await page.goto(path, { waitUntil: 'networkidle' });

  await expect(page.locator('h1')).toHaveCount(1);

  const unnamedInteractive = await page.locator('button, a, input, select, textarea').evaluateAll((nodes) => nodes
    .filter((node) => {
      const accessibleName = node.getAttribute('aria-label') || node.getAttribute('aria-labelledby') || node.textContent?.trim() || node.getAttribute('title');
      if (node instanceof HTMLInputElement && node.type === 'hidden') return false;
      return !accessibleName;
    })
    .map((node) => `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}`));

  expect(unnamedInteractive, `Unnamed interactive elements on ${path}`).toEqual([]);

  const unlabeledFields = await page.locator('input, select, textarea').evaluateAll((nodes) => nodes
    .filter((node) => {
      if (node instanceof HTMLInputElement && node.type === 'hidden') return false;
      const id = node.id;
      const hasExplicitLabel = id && document.querySelector(`label[for="${CSS.escape(id)}"]`);
      const hasWrappedLabel = node.closest('label');
      const hasAria = node.getAttribute('aria-label') || node.getAttribute('aria-labelledby');
      return !hasExplicitLabel && !hasWrappedLabel && !hasAria;
    })
    .map((node) => `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}`));

  expect(unlabeledFields, `Unlabeled form fields on ${path}`).toEqual([]);

  const positiveTabIndexes = await page.locator('[tabindex]').evaluateAll((nodes) => nodes
    .filter((node) => Number(node.getAttribute('tabindex')) > 0)
    .map((node) => node.outerHTML.slice(0, 160)));

  expect(positiveTabIndexes).toEqual([]);

  const imagesWithoutAlt = await page.locator('img').evaluateAll((nodes) => nodes
    .filter((node) => !node.hasAttribute('alt'))
    .map((node) => node.outerHTML.slice(0, 160)));

  expect(imagesWithoutAlt).toEqual([]);
};

test.describe('accessibility gates', () => {
  for (const path of publicPages) {
    test(`public page ${path} has accessible controls`, async ({ page }) => {
      await auditPage(page, path);
    });
  }

  test('keyboard focus is visibly styled for primary controls', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    const loginButton = page.getByRole('button', { name: 'Login' });
    await loginButton.focus();

    const focusStyles = await loginButton.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow,
      };
    });

    expect(
      focusStyles.outlineStyle !== 'none' && parseFloat(focusStyles.outlineWidth) > 0 || focusStyles.boxShadow !== 'none',
    ).toBeTruthy();
  });
});
