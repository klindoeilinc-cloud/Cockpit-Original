// MCPS — Frontend smoke tests (Playwright)
// Vérifie que l'écran de connexion se charge et réagit correctement,
// sans nécessiter de projet Firebase configuré (état "Firebase non configuré").
//
// Lancer : npx playwright test
const { test, expect } = require('@playwright/test');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '../MCPS_Cockpit_Production_Universal.html');

test.describe('Écran de connexion', () => {
  test('affiche le message de configuration Firebase quand aucune clé n\'est renseignée', async ({ page }) => {
    await page.goto(FILE_URL);
    await expect(page.locator('#auth-setup-notice')).toBeVisible();
    await expect(page.locator('#auth-box')).toBeHidden();
  });

  test('le bouton "mode local" débloque l\'application', async ({ page }) => {
    await page.goto(FILE_URL);
    await page.click('text=Continuer en mode local');
    await expect(page.locator('body')).not.toHaveClass(/auth-locked/);
    await expect(page.locator('.sidebar')).toBeVisible();
  });

  test('la barre latérale liste les modules principaux', async ({ page }) => {
    await page.goto(FILE_URL);
    await page.click('text=Continuer en mode local');
    await expect(page.locator('.nav-item[data-view="dashboard"]')).toBeVisible();
    await expect(page.locator('.nav-item[data-view="today"]')).toBeVisible();
    await expect(page.locator('.nav-item[data-view="clients"]')).toBeVisible();
  });

  test('le sélecteur de langue bascule les libellés de la barre latérale', async ({ page }) => {
    await page.goto(FILE_URL);
    await page.click('text=Continuer en mode local');
    await expect(page.locator('[data-i18n="nav.dashboard"]')).toHaveText('Tableau de Bord');
    await page.click('text=English');
    await expect(page.locator('[data-i18n="nav.dashboard"]')).toHaveText('Dashboard');
  });
});

test.describe('Navigation de base', () => {
  test('cliquer sur "Aujourd\'hui" affiche la vue correspondante', async ({ page }) => {
    await page.goto(FILE_URL);
    await page.click('text=Continuer en mode local');
    await page.click('.nav-item[data-view="today"]');
    await expect(page.locator('#view-today')).toBeVisible();
  });
});
