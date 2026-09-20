// MCPS — Frontend smoke tests (Playwright)
// Vérifie que l'écran de connexion se charge et réagit correctement,
// sans nécessiter de projet Firebase configuré (état "Firebase non configuré").
//
// Lancer : npm run test:e2e
//
// CORRECTIF : ce fichier ciblait encore file://.../MCPS_Cockpit_Production_Universal.html
// — un nom de fichier qui n'existe plus depuis le passage à la structure
// modulaire (index.html + css/ + js/, voir README.md) — et un protocole
// file:// que l'application elle-même refuse de facto (localStorage bloqué
// par le navigateur sur cette origine, voir README.md). Les tests n'avaient
// donc jamais pu passer depuis cette réorganisation. Corrigé pour servir le
// dossier réel en http via playwright.config.js (webServer + baseURL).
const { test, expect } = require('@playwright/test');

test.describe('Écran de connexion', () => {
  test('affiche le message de configuration Firebase quand aucune clé n\'est renseignée', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#auth-setup-notice')).toBeVisible();
    await expect(page.locator('#auth-box')).toBeHidden();
  });

  test('le bouton "mode local" débloque l\'application', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Continuer en mode local');
    await expect(page.locator('body')).not.toHaveClass(/auth-locked/);
    await expect(page.locator('.sidebar')).toBeVisible();
  });

  test('la barre latérale liste les modules principaux', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Continuer en mode local');
    await expect(page.locator('.nav-item[data-view="dashboard"]')).toBeVisible();
    await expect(page.locator('.nav-item[data-view="today"]')).toBeVisible();
    await expect(page.locator('.nav-item[data-view="clients"]')).toBeVisible();
  });

  test('le sélecteur de langue bascule les libellés de la barre latérale', async ({ page }) => {
    // CORRECTIF : "nav.dashboard" vaut "Command Center" dans les DEUX langues
    // (choix de branding assumé, voir js/06-auth-cloud.js) — l'assertion
    // originale comparait donc "Tableau de Bord"/"Dashboard", des valeurs qui
    // n'ont jamais existé dans le code. "nav.today" varie réellement entre
    // les deux langues et vérifie le même mécanisme (applyI18n).
    await page.goto('/');
    await page.click('text=Continuer en mode local');
    await expect(page.locator('[data-i18n="nav.today"]')).toHaveText("Aujourd'hui");
    // Le bouton de langue vit dans le panneau "Outils", replié par défaut
    // (voir #sb-tools-toggle, aria-expanded="false") — jamais ouvert par ce
    // test avant ce correctif, d'où le timeout observé à la première
    // exécution réelle de cette suite.
    await page.click('#sb-tools-toggle');
    await page.click('text=English');
    await expect(page.locator('[data-i18n="nav.today"]')).toHaveText('Today');
  });
});

test.describe('Navigation de base', () => {
  test('cliquer sur "Aujourd\'hui" affiche la vue correspondante', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Continuer en mode local');
    await page.click('.nav-item[data-view="today"]');
    await expect(page.locator('#view-today')).toBeVisible();
  });
});
