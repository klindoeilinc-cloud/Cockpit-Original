(function(){

  // ── 1) Recherche floue (Fuse.js) — remplace la recherche par sous-chaîne exacte ──
  // ═══════════════════════════════════════════════════════
  //  PATCH #12 (audit technique, Phase 12) — optimisation du rendu
  //  ───────────────────────────────────────────────────────
  //  CONSTAT : onSearch() et _cmdkRender() reconstruisaient chacun 3 à 4
  //  index Fuse.js ENTIÈREMENT NEUFS à chaque appel — donc à chaque frappe
  //  au clavier (la palette de commandes n'avait même pas de délai anti-
  //  rebond). Un index Fuse a un coût réel de construction ; le reconstruire
  //  sur des données qui n'ont pas changé entre deux frappes est un travail
  //  pur perdu, exactement le anti-pattern que l'audit signale (§20 :
  //  éviter un traitement complet après chaque petite modification).
  //
  //  CORRECTIF : un cache unique, partagé entre les deux, reconstruit
  //  UNIQUEMENT quand les données changent réellement (hook post-sauvegarde,
  //  même mécanisme que les Phases 2/6/10) plutôt qu'à chaque frappe.
  // ═══════════════════════════════════════════════════════
  let _mcpsSearchIdx = null;
  function _mcpsRebuildSearchIndices(){
    if (typeof Fuse === 'undefined') { _mcpsSearchIdx = null; return; }
    const o = { threshold: 0.38, ignoreLocation: true };
    _mcpsSearchIdx = {
      clients:  new Fuse(DB.clients,  { ...o, keys:['name','sector'] }),
      projects: new Fuse(DB.projects, { ...o, keys:['name'] }),
      tasks:    new Fuse(DB.tasks,    { ...o, keys:['name'] }),
      invoices: new Fuse(DB.invoices||[], { ...o, keys:['number','label'] }),
    };
  }
  window._mcpsPostSaveHooks.push(_mcpsRebuildSearchIndices);
  document.addEventListener('DOMContentLoaded', _mcpsRebuildSearchIndices);

  window.onSearch = function(q){
    const box = document.getElementById('search-results');
    const qTrim = (q||'').trim();
    if (!qTrim) { if (box) box.classList.remove('open'); return; }
    let clients, projects, tasks, invs = [];
    const _canInv = typeof can !== 'function' || can('invoice.view'); // PATCH #4 : facturation masquée si non autorisée
    if (typeof Fuse !== 'undefined') {
      if (!_mcpsSearchIdx) _mcpsRebuildSearchIndices();
      clients = _mcpsSearchIdx.clients.search(qTrim).slice(0,4).map(r=>r.item);
      projects = _mcpsSearchIdx.projects.search(qTrim).slice(0,4).map(r=>r.item);
      tasks = _mcpsSearchIdx.tasks.search(qTrim).slice(0,4).map(r=>r.item);
      if (_canInv) invs = _mcpsSearchIdx.invoices.search(qTrim).slice(0,3).map(r=>r.item);
    } else {
      const ql = qTrim.toLowerCase();
      clients = DB.clients.filter(c=>c.name.toLowerCase().includes(ql)||c.sector.toLowerCase().includes(ql)).slice(0,4);
      projects = DB.projects.filter(p=>p.name.toLowerCase().includes(ql)).slice(0,4);
      tasks = DB.tasks.filter(t=>t.name.toLowerCase().includes(ql)).slice(0,4);
      if (_canInv) invs = (DB.invoices||[]).filter(i=>i.number.toLowerCase().includes(ql)||i.label.toLowerCase().includes(ql)).slice(0,3);
    }
    let html = '';
    if (clients.length) { html += `<div class="sr-section">Clients</div>`; html += clients.map(c=>`<div class="sr-item" onclick="go('clients');setTimeout(()=>openClientDetail(${c.id}),200)"><span class="sr-icon">👤</span><span class="sr-name">${esc(c.name)}</span><span class="sr-sub">${esc(c.sector)}</span></div>`).join(''); }
    if (projects.length) { html += `<div class="sr-section">Projets</div>`; html += projects.map(p=>{const cl=gc(p.clientId);return`<div class="sr-item" onclick="go('projects')"><span class="sr-icon">🗂</span><span class="sr-name">${esc(p.name)}</span><span class="sr-sub">${esc(cl?cl.name:'')}</span></div>`;}).join(''); }
    if (tasks.length) { html += `<div class="sr-section">Tâches</div>`; html += tasks.map(t=>{const cl=gc(t.clientId);return`<div class="sr-item" onclick="go('tasks')"><span class="sr-icon">📋</span><span class="sr-name">${esc(t.name)}</span><span class="sr-sub">${esc(cl?cl.name:'')}</span></div>`;}).join(''); }
    if (invs.length) { html += `<div class="sr-section">Factures</div>`; html += invs.map(i=>`<div class="sr-item" onclick="go('invoices')"><span class="sr-icon">💳</span><span class="sr-name">${esc(i.number)}</span><span class="sr-sub">${formatXOF(i.amount)}</span></div>`).join(''); }
    if (!html) html = `<div class="sr-item"><span class="sr-name" style="color:var(--text-muted)">Aucun résultat pour "${esc(qTrim)}"</span></div>`;
    if (box) { box.innerHTML = html; box.classList.add('open'); }
  };

  // ── 2) Palette de commandes (Cmd/Ctrl+K) ──
  const CMDK_ACTIONS = [
    { label:"Tableau de Bord", icon:'layout-dashboard', run:()=>go('dashboard') },
    { label:"Aujourd'hui", icon:'sunrise', run:()=>go('today') },
    { label:"Secteurs d'Activité", icon:'shapes', run:()=>go('sectors') },
    { label:"Clients", icon:'users', run:()=>go('clients') },
    { label:"Projets", icon:'folder-kanban', run:()=>go('projects') },
    { label:"Tâches", icon:'list-checks', run:()=>go('tasks') },
    { label:"Équipe", icon:'users-round', run:()=>go('team') },
    { label:"Rapports", icon:'bar-chart-3', run:()=>go('reports') },
    { label:"Rapport Direction", icon:'file-bar-chart', run:()=>go('directorreport') },
    { label:"Suivi Tâches", icon:'book-open-check', run:()=>go('suivi') },
    { label:"To-Do List", icon:'check-square', run:()=>go('todo') },
    { label:"MCPS Intelligence Layer", icon:'brain-circuit', run:()=>go('intelligence') },
    { label:"Nouveau client", icon:'user-plus', run:()=>{ go('clients'); setTimeout(()=>openModal('client'),150); } },
    { label:"Nouveau projet", icon:'folder-plus', run:()=>{ go('projects'); setTimeout(()=>openModal('project'),150); } },
    { label:"Nouvelle tâche", icon:'list-plus', run:()=>{ go('tasks'); setTimeout(()=>openModal('task'),150); } },
    { label:"Basculer le thème", icon:'moon', run:()=>{ if (typeof toggleTheme==='function') toggleTheme(); } },
    { label:"Sauvegarder", icon:'save', run:()=>{ if (typeof saveDB==='function') saveDB(); } },
  ];
  let _cmdkItems = [], _cmdkIndex = -1;

  function _cmdkIcon(name){ return `<i data-lucide="${name}"></i>`; }

  function _cmdkRender(q){
    const results = document.getElementById('cmdk-results');
    if (!results) return;
    q = (q||'').trim();
    let actionMatches = CMDK_ACTIONS;
    let dataHtml = '';
    if (q) {
      if (typeof Fuse !== 'undefined') {
        actionMatches = new Fuse(CMDK_ACTIONS, { keys:['label'], threshold:0.4 }).search(q).map(r=>r.item);
        if (!_mcpsSearchIdx) _mcpsRebuildSearchIndices();
        const clients = _mcpsSearchIdx.clients.search(q).slice(0,4).map(r=>r.item);
        const projects = _mcpsSearchIdx.projects.search(q).slice(0,4).map(r=>r.item);
        const tasks = _mcpsSearchIdx.tasks.search(q).slice(0,4).map(r=>r.item);
        if (clients.length) dataHtml += `<div class="cmdk-section">Clients</div>` + clients.map(c=>`<div class="cmdk-item" data-run="client:${c.id}">${_cmdkIcon('user')}<span>${esc(c.name)}</span></div>`).join('');
        if (projects.length) dataHtml += `<div class="cmdk-section">Projets</div>` + projects.map(p=>`<div class="cmdk-item" data-run="project:${p.id}">${_cmdkIcon('folder')}<span>${esc(p.name)}</span></div>`).join('');
        if (tasks.length) dataHtml += `<div class="cmdk-section">Tâches</div>` + tasks.map(t=>`<div class="cmdk-item" data-run="task:${t.id}">${_cmdkIcon('check-square')}<span>${esc(t.name)}</span></div>`).join('');
      } else {
        const ql = q.toLowerCase();
        actionMatches = CMDK_ACTIONS.filter(a=>a.label.toLowerCase().includes(ql));
      }
    }
    const actionsHtml = actionMatches.length ? `<div class="cmdk-section">Actions</div>` + actionMatches.map(a=>`<div class="cmdk-item" data-action="${CMDK_ACTIONS.indexOf(a)}">${_cmdkIcon(a.icon)}<span>${esc(a.label)}</span></div>`).join('') : '';
    const html = actionsHtml + dataHtml;
    results.innerHTML = html || `<div class="cmdk-empty">Aucun résultat pour « ${esc(q)} »</div>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    _cmdkItems = [...results.querySelectorAll('.cmdk-item')];
    _cmdkIndex = _cmdkItems.length ? 0 : -1;
    _cmdkHighlight();
    _cmdkItems.forEach(el => el.addEventListener('click', () => _cmdkExecute(el)));
  }

  function _cmdkHighlight(){
    _cmdkItems.forEach((el,i)=>el.classList.toggle('active', i===_cmdkIndex));
    if (_cmdkIndex>=0 && _cmdkItems[_cmdkIndex] && typeof _cmdkItems[_cmdkIndex].scrollIntoView === 'function') {
      _cmdkItems[_cmdkIndex].scrollIntoView({block:'nearest'});
    }
  }

  function _cmdkExecute(el){
    if (!el) return;
    const actionIdx = el.dataset.action;
    const runKey = el.dataset.run;
    _cmdkClose();
    if (actionIdx !== undefined) {
      const action = CMDK_ACTIONS[parseInt(actionIdx,10)];
      if (action) setTimeout(()=>action.run(), 60);
    } else if (runKey) {
      const [type,id] = runKey.split(':');
      const nid = parseInt(id,10);
      setTimeout(()=>{
        if (type==='client') { go('clients'); setTimeout(()=>openClientDetail(nid),150); }
        else if (type==='project') go('projects');
        else if (type==='task') go('tasks');
      }, 60);
    }
  }

  function _cmdkOpen(){
    const ov = document.getElementById('cmdk-overlay');
    if (!ov) return;
    ov.classList.add('open');
    const input = document.getElementById('cmdk-input');
    if (input) { input.value = ''; setTimeout(()=>input.focus(), 30); }
    _cmdkRender('');
  }
  window._cmdkOpen = _cmdkOpen;

  function _cmdkClose(){
    const ov = document.getElementById('cmdk-overlay');
    if (ov) ov.classList.remove('open');
  }
  window._cmdkClose = _cmdkClose;

  document.addEventListener('keydown', (e) => {
    const overlay = document.getElementById('cmdk-overlay');
    const isOpen = overlay && overlay.classList.contains('open');
    if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='k') {
      e.preventDefault();
      isOpen ? _cmdkClose() : _cmdkOpen();
      return;
    }
    if (!isOpen) return;
    if (e.key==='Escape') { _cmdkClose(); return; }
    if (e.key==='ArrowDown') { e.preventDefault(); if (_cmdkItems.length) { _cmdkIndex=(_cmdkIndex+1)%_cmdkItems.length; _cmdkHighlight(); } return; }
    if (e.key==='ArrowUp') { e.preventDefault(); if (_cmdkItems.length) { _cmdkIndex=(_cmdkIndex-1+_cmdkItems.length)%_cmdkItems.length; _cmdkHighlight(); } return; }
    if (e.key==='Enter') { e.preventDefault(); if (_cmdkIndex>=0) _cmdkExecute(_cmdkItems[_cmdkIndex]); return; }
  });

  document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('cmdk-input');
    if (input) {
      let _cmdkDebounce = null;
      input.addEventListener('input', () => {
        clearTimeout(_cmdkDebounce);
        _cmdkDebounce = setTimeout(() => _cmdkRender(input.value), 120);
      });
    }
  });

  // ── 3) Flatpickr sur tous les champs date, y compris ceux ajoutés dynamiquement ──
  function _initFlatpickrOn(root){
    if (typeof flatpickr === 'undefined') return;
    (root||document).querySelectorAll('input[type="date"]:not([data-fp-init])').forEach(el => {
      el.dataset.fpInit = '1';
      try {
        flatpickr(el, {
          dateFormat: 'Y-m-d',
          altInput: true,
          altFormat: 'd M Y',
          locale: (flatpickr.l10ns && flatpickr.l10ns.fr) ? 'fr' : undefined,
          allowInput: true,
        });
      } catch(e) { /* champ déjà transformé ou non compatible — on ignore */ }
    });
  }
  let _fpDebounce = null;
  document.addEventListener('DOMContentLoaded', () => {
    _initFlatpickrOn(document);
    const mo = new MutationObserver(() => {
      clearTimeout(_fpDebounce);
      _fpDebounce = setTimeout(() => _initFlatpickrOn(document), 150);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  });

  // ── 4) Tippy.js sur tous les attributs title=, y compris futurs (délégation) ──
  document.addEventListener('DOMContentLoaded', () => {
    if (typeof tippy !== 'undefined' && tippy.delegate) {
      tippy.delegate(document.body, { target: '[title]', theme: 'mcps', delay: [300,0], animation: 'shift-away', maxWidth: 240 });
    }
  });

  // ═══════════════════════════════════════════════════════
  //  STEP 12 (Enterprise SaaS Transformation) — tri de tableaux, générique
  //  ───────────────────────────────────────────────────────
  //  Le CSS `thead th[data-sort]{cursor:pointer}` existait déjà mais n'était
  //  câblé à aucune logique — un habillage sans fonction. Cette délégation
  //  d'événement rend N'IMPORTE QUEL tableau triable en ajoutant simplement
  //  data-sort="text|number|date" à ses <th>, y compris les tableaux générés
  //  dynamiquement plus tard (aucun besoin de ré-attacher un écouteur).
  // ═══════════════════════════════════════════════════════
  function _mcpsSortTable(th){
    const table = th.closest('table');
    const tbody = table && table.querySelector('tbody');
    if (!tbody) return;
    const headerRow = th.parentElement;
    const colIndex = [...headerRow.children].indexOf(th);
    const type = th.dataset.sort;
    const nextDir = th.dataset.sortDir === 'asc' ? 'desc' : 'asc';
    [...headerRow.children].forEach(h => { delete h.dataset.sortDir; const ind = h.querySelector('.mcps-sort-ind'); if (ind) ind.remove(); });
    th.dataset.sortDir = nextDir;

    const rows = [...tbody.querySelectorAll('tr')];
    const parseVal = (row) => {
      const cell = row.children[colIndex];
      const raw = cell ? cell.textContent.trim() : '';
      if (type === 'number') return parseFloat(raw.replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;
      if (type === 'date') { const d = new Date(raw.split('/').reverse().join('-')); return isNaN(d) ? new Date(raw) : d; }
      return raw.toLowerCase();
    };
    rows.sort((a, b) => {
      const av = parseVal(a), bv = parseVal(b);
      let cmp;
      if (av instanceof Date) cmp = av - bv;
      else if (typeof av === 'number') cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv), 'fr');
      return nextDir === 'asc' ? cmp : -cmp;
    });
    rows.forEach(r => tbody.appendChild(r));
    th.insertAdjacentHTML('beforeend', ` <span class="mcps-sort-ind">${nextDir === 'asc' ? '▲' : '▼'}</span>`);
  }
  document.addEventListener('click', (e) => {
    const th = e.target.closest('thead th[data-sort]');
    if (th) _mcpsSortTable(th);
  });

  // ═══════════════════════════════════════════════════════
  //  STEP 14 (accessibilité) — libellés automatiques + fermeture au clavier
  //  ───────────────────────────────────────────────────────
  //  Beaucoup de boutons de l'app ne contiennent qu'une icône ou un symbole
  //  (✕, 🗑, ✎…) : lus par un lecteur d'écran, ils ne disent rien d'utile.
  //  Les corriger un par un dans le HTML est impossible en pratique — la
  //  plupart sont générés dynamiquement par les fonctions de rendu. Cet
  //  observateur les étiquette automatiquement, y compris ceux créés plus
  //  tard, sans toucher à une seule fonction de rendu existante.
  // ═══════════════════════════════════════════════════════
  const _ICON_LABELS = [
    { match: /^[✕✖×]$/, label: 'Fermer' },
    { match: /^🗑/,      label: 'Supprimer' },
    { match: /^[✎✏]/,    label: 'Modifier' },
    { match: /^＋$|^\+$/, label: 'Ajouter' },
  ];
  function _mcpsAutoLabel(root){
    (root || document).querySelectorAll('button:not([aria-label]), .modal-x:not([aria-label])').forEach(el => {
      const txt = (el.textContent || '').trim();
      if (!txt || el.getAttribute('aria-label')) return;
      const hit = _ICON_LABELS.find(r => r.match.test(txt));
      if (hit) el.setAttribute('aria-label', hit.label);
    });
  }
  let _labelDebounce = null;
  document.addEventListener('DOMContentLoaded', () => {
    _mcpsAutoLabel(document);
    new MutationObserver(() => {
      clearTimeout(_labelDebounce);
      _labelDebounce = setTimeout(() => _mcpsAutoLabel(document), 200);
    }).observe(document.body, { childList: true, subtree: true });
  });

  // Échap ferme la modale ouverte — attendu de tout SaaS, et indispensable
  // pour une personne qui navigue sans souris. La palette de commandes gère
  // déjà son propre Échap ; on ne la touche pas ici.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const cmdk = document.getElementById('cmdk-overlay');
    if (cmdk && cmdk.classList.contains('open')) return; // déjà géré ailleurs
    const openOverlay = document.querySelector('.overlay.open, .detail-overlay.open, #audit-log-overlay.open');
    if (!openOverlay) return;
    const id = openOverlay.id;
    if (id === 'main-overlay' && typeof closeModal === 'function') closeModal();
    else if (id === 'pdf-overlay' && typeof closePDFModal === 'function') closePDFModal();
    else if (id === 'export-overlay' && typeof closeExport === 'function') closeExport();
    else if (id === 'prospect-overlay' && typeof closeProspectModal === 'function') closeProspectModal();
    else if (id === 'client-detail-overlay') openOverlay.classList.remove('open');
    else if (id === 'audit-log-overlay' && typeof _closeAuditLog === 'function') _closeAuditLog();
  });

  // ═══════════════════════════════════════════════════════
  //  STEP 12 (formulaires enterprise-grade) — erreurs de validation visibles
  //  ───────────────────────────────────────────────────────
  //  Les 6 fonctions submit*() signalaient une erreur uniquement par un toast
  //  fugace : le message disparaissait en quelques secondes, sans jamais
  //  indiquer quel champ corriger. Ce helper affiche TOUTES les erreurs dans
  //  un bandeau persistant en haut de la modale, jusqu'à correction.
  //  Les submit*() continuent d'appeler showToast() comme avant — ce bandeau
  //  s'ajoute, il ne remplace rien (aucun risque de régression).
  // ═══════════════════════════════════════════════════════
  window._mcpsShowFormErrors = function(errors){
    const body = document.getElementById('modal-body');
    if (!body || !errors || !errors.length) return;
    let box = body.querySelector('.form-error');
    if (!box) {
      box = document.createElement('div');
      box.className = 'form-error';
      box.setAttribute('role', 'alert'); // annoncé immédiatement par un lecteur d'écran
      body.insertBefore(box, body.firstChild);
    }
    box.innerHTML = `<span class="form-error-ico">⚠️</span><div>${
      errors.length === 1 ? esc(errors[0])
        : '<strong>Corrigez les points suivants :</strong><ul style="margin:6px 0 0;padding-left:18px">'
          + errors.map(e => `<li>${esc(e)}</li>`).join('') + '</ul>'
    }</div>`;
    box.classList.add('show');
    box.scrollIntoView && box.scrollIntoView({ block: 'nearest' });
  };
  window._mcpsClearFormErrors = function(){
    const box = document.querySelector('#modal-body .form-error');
    if (box) box.classList.remove('show');
  };

  // ── Outils repliables de la barre latérale ──
  // Le choix ouvert/fermé est mémorisé : quelqu'un qui utilise souvent les
  // exports n'a pas à rouvrir le panneau à chaque visite.
  window._toggleSidebarTools = function(){
    const footer = document.querySelector('.sb-footer');
    const toggle = document.getElementById('sb-tools-toggle');
    if (!footer) return;
    const open = footer.classList.toggle('tools-open');
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    try { localStorage.setItem('mcps-sb-tools', open ? '1' : '0'); } catch(e) {}
  };
  document.addEventListener('DOMContentLoaded', () => {
    let open = false;
    try { open = localStorage.getItem('mcps-sb-tools') === '1'; } catch(e) {}
    if (open) {
      const footer = document.querySelector('.sb-footer');
      const toggle = document.getElementById('sb-tools-toggle');
      if (footer) footer.classList.add('tools-open');
      if (toggle) toggle.setAttribute('aria-expanded', 'true');
    }
  });

})();
