// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const PORT = 4173;

// Seul Chromium est installé dans cet environnement — restreindre les
// projets évite un échec de lancement sur Firefox/WebKit absents, sans
// rapport avec la qualité réelle de l'application testée.
module.exports = defineConfig({
  testDir: __dirname,
  testMatch: 'tests/*.spec.js',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: `node ${path.join(__dirname, 'tests', 'static-server.js')}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    env: { MCPS_E2E_PORT: String(PORT) },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // La version de @playwright/test épinglée dans package.json (1.63.0)
        // attend une révision de navigateur plus récente que celle
        // pré-installée dans cet environnement (chromium-1194). On pointe
        // donc explicitement vers le binaire réellement présent au lieu de
        // laisser Playwright chercher/télécharger la révision qu'il attend.
        launchOptions: { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' },
      },
    },
  ],
});
