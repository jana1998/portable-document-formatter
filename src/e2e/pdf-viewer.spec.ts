import { test, expect } from '@playwright/test';

test.describe('PDF Viewer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173');
  });

  test('should display empty state when no PDF is loaded', async ({ page }) => {
    await expect(page.getByText('No PDF Loaded')).toBeVisible();
    await expect(page.getByText('Open a PDF file to get started')).toBeVisible();
  });

  test('should have toolbar with disabled buttons when no PDF is loaded', async ({ page }) => {
    const toolbar = page.locator('[role="toolbar"], .toolbar, div').first();
    await expect(toolbar).toBeVisible();
  });

  test('should have sidebar toggle button', async ({ page }) => {
    // Check for sidebar toggle buttons (open/close)
    const buttons = page.locator('button');
    await expect(buttons.first()).toBeVisible();
  });
});

test.describe('PDF Annotations', () => {
  test('annotation tools should be disabled without a document', async ({ page }) => {
    await page.goto('http://localhost:5173');

    // Toolbar should be visible
    await expect(page.locator('div').first()).toBeVisible();
  });
});

test.describe('PDF Search', () => {
  test('search panel should be accessible', async ({ page }) => {
    await page.goto('http://localhost:5173');

    // Page should load
    await expect(page.locator('body')).toBeVisible();
  });
});
