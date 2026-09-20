(function(){
  // ═══════════════════════════════════════════════════════
  //  PATCH #8 (audit technique, Phase 8) — error boundary global
  //  ───────────────────────────────────────────────────────
  //  AVANT : aucune capture globale. Une erreur dans une fonction de rendu
  //  pouvait laisser une vue à moitié affichée, silencieusement, sans aucun
  //  retour à l'utilisateur ni trace exploitable (audit, section G.12).
  //
  //  APRÈS : deux filets de sécurité complémentaires.
  //  1) window.onerror / unhandledrejection — capturent TOUTE exception non
  //     interceptée ailleurs (clic de bouton, code asynchrone...), montrent
  //     un message compréhensible au lieu du message technique brut, et
  //     journalisent l'erreur (console + journal d'activité si connecté,
  //     réutilisant l'infrastructure de la Phase 7).
  //  2) go() est entouré d'un try/catch dédié : si une vue échoue à se
  //     rendre, l'application reste utilisable (on peut encore naviguer
  //     ailleurs) au lieu de rester bloquée sur un écran à moitié construit.
  //  Anti-spam : la même erreur répétée en boucle n'affiche qu'un seul
  //  avertissement toutes les quelques secondes, pas une tempête de toasts.
  // ═══════════════════════════════════════════════════════
  let _mcpsLastErrorSig = null, _mcpsLastErrorTime = 0;

  const _FRIENDLY_ERROR_MAP = [
    [/insufficient permissions|permission-denied/i, "Vous n'avez pas les droits nécessaires pour cette action."],
    [/network|fetch|Failed to fetch|net::/i, "Problème de connexion réseau — vérifiez votre connexion internet."],
    [/quota|resource-exhausted/i, "Limite atteinte — réessayez dans quelques instants."],
    [/auth\//i, "Problème d'authentification — reconnectez-vous si le problème persiste."],
    [/unavailable|deadline-exceeded/i, "Le service est temporairement indisponible — réessayez dans un instant."],
  ];
  function _mcpsFriendlyError(rawMessage){
    const msg = String(rawMessage || '');
    for (const [re, friendly] of _FRIENDLY_ERROR_MAP) if (re.test(msg)) return friendly;
    return "Une erreur inattendue s'est produite. Si le problème persiste, contactez le support.";
  }

  function _mcpsHandleError(rawMessage, context){
    const sig = (context || '') + '|' + String(rawMessage || '').slice(0, 120);
    const now = Date.now();
    if (sig === _mcpsLastErrorSig && (now - _mcpsLastErrorTime) < 4000) return; // anti-spam : même erreur, fenêtre de 4s
    _mcpsLastErrorSig = sig; _mcpsLastErrorTime = now;
    console.error('MCPS error boundary [' + context + ']:', rawMessage);
    if (typeof showToast === 'function') showToast('⚠️', _mcpsFriendlyError(rawMessage), 'var(--red)');
    if (typeof _mcpsAudit === 'function') _mcpsAudit('ERROR', 'app', context || null, { message: String(rawMessage).slice(0, 300) });
  }
  window._mcpsHandleError = _mcpsHandleError;

  window.addEventListener('error', (e) => {
    _mcpsHandleError(e.error ? (e.error.message || String(e.error)) : e.message, 'window.onerror');
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    _mcpsHandleError(reason && reason.message ? reason.message : String(reason), 'unhandledrejection');
    e.preventDefault(); // déjà journalisé proprement ci-dessus, pas besoin du message rouge par défaut du navigateur en plus
  });

  // Filet de sécurité dédié autour de go() : une vue qui échoue à se rendre
  // ne doit pas bloquer toute la navigation.
  if (typeof go === 'function') {
    const _origGoForErrorBoundary = go;
    go = function(view){
      try {
        return _origGoForErrorBoundary(view);
      } catch(e) {
        _mcpsHandleError(e && e.message ? e.message : String(e), 'go:' + view);
      }
    };
    window.go = go;
  }
})();
