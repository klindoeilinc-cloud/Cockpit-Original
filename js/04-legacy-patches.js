(function(){
  const noopChart = function(){ return { destroy(){}, update(){} }; };
  if (!window.confetti) window.confetti = function(){};
  if (!window.Chart) window.Chart = function(){ return noopChart(); };

  function normalizeBusinessRules(){
    if (!DB || !Array.isArray(DB.clients)) return;
    DB.clients.forEach(c => {
      if (c.id === 13) c.name = 'Iconnekt';
      if (c.id === 23) {
        c.type = 'appeloffre';
        c.prospectStatus = c.prospectStatus || 'proposal';
        c.pipelineStage = c.pipelineStage || 'proposal';
      }
    });
  }
  window._mcpsPreSaveHooks.push(normalizeBusinessRules); // PATCH #2 : remplace l'ancien wrapper window.saveDB

  function getPools(){
    normalizeBusinessRules();
    const active = DB.clients.filter(c => c.type !== 'prospect' && c.type !== 'appeloffre' && !c.closedAt);
    const prospects = getProspects().filter(c => !c.closedAt);
    const appels = DB.clients.filter(c => c.type === 'appeloffre' && !c.closedAt);
    const closed = DB.clients.filter(c => !!c.closedAt);
    const converted = active.filter(c => c.convertedFromProspect || c.prospectStatus === 'converted');
    return { active, prospects, appels, closed, converted };
  }

  const _origUpdateCounters = window._updateCounters;
  window._updateCounters = function(){
    const { active, prospects, appels, closed, converted } = getPools();
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('ctab-count-client', active.length);
    set('ctab-count-prospect', prospects.length);
    set('ctab-count-appeloffre', appels.length);
    set('ctab-count-cloture', closed.length);
    if (typeof animCount === 'function') {
      animCount('#kpi-c', active.length);
      animCount('#kpi-clients-actifs', active.length);
      animCount('#kpi-prospects-total', prospects.length);
      animCount('#kpi-prospects-convertis', converted.length);
      animCount('#kpi-clients-clotures', closed.length);
      animCount('#kpi-appels-offres', appels.length);
    }
    set('dash-prospect-count', prospects.length);
    set('dash-client-count', active.length);
    set('dash-appeloffre-count', appels.length);
    if (typeof _origUpdateCounters === 'function') {
      try { _origUpdateCounters(active, prospects, closed); } catch(e) {}
    }
  };

  const _origRenderDashDistrib = window.renderDashDistrib;
  if (typeof _origRenderDashDistrib === 'function') {
    window.renderDashDistrib = function(activeClients){
      if (!activeClients) activeClients = getPools().active;
      else activeClients = (activeClients || []).filter(c => c.type !== 'appeloffre' && !c.closedAt);
      return _origRenderDashDistrib(activeClients);
    };
  }

  window._renderClientCard = function(c) {
    const projs = cProjects(c.id), tasks = cTasks(c.id), invs = cInvoices(c.id);
    const done = tasks.filter(t=>t.status==='Terminé').length;
    const pct = tasks.length ? Math.round(done/tasks.length*100) : 0;
    const paidAmt = invs.filter(i=>i.status==='Payée').reduce((s,i)=>s+i.amount,0);
    const lateInvs = invs.filter(i=>i.status==='En retard');
    const meta = SECTORS_META[c.sector] || {icon:'◈'};
    const isProspect = c.type === 'prospect';
    const isTender = c.type === 'appeloffre';
    const typeLbl = isTender
      ? `<span class="lbl-appeloffre">📂 Appel d'offre</span>`
      : isProspect
        ? `<span class="lbl-prospect">🎯 Prospect</span>`
        : `<span class="lbl-client">✅ Client</span>`;
    const actionHtml = isProspect
      ? `<div style="display:flex;gap:6px;margin-top:8px"><button class="convert-btn" onclick="convertToClient(${c.id})" style="flex:1">🎉 Convertir en Client</button></div>`
      : isTender
        ? `<div style="display:flex;gap:6px;margin-top:8px"><button class="btn btn-ghost btn-sm" style="flex:1" onclick="openClientDetail(${c.id})">🔍 Voir la fiche</button></div>`
        : `<div style="display:flex;gap:6px;margin-top:8px"><button class="btn btn-ghost btn-sm" style="flex:1" onclick="openClientDetail(${c.id})">🔍 Voir la fiche</button><button class="btn-cloture" onclick="clotureClient(${c.id})" style="flex:none;white-space:nowrap">🔒 Clôturer</button></div>`;
    return `<div class="client-card" style="--cc-color:${c.color}">
      <div class="cc-head">
        <div style="display:flex;align-items:center;gap:11px">
          <div class="cc-avatar" style="background:${c.color}">${esc(c.avatar)}</div>
          <div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><div class="cc-name">${esc(c.name)}</div>${typeLbl}</div>
            <div class="cc-sector">${meta.icon} ${esc(c.sector)}</div>
          </div>
        </div>
        <div style="display:flex;gap:5px">
          <button class="btn btn-ghost btn-sm" onclick="openClientDetail(${c.id})" title="Voir détail">🔍</button>
          <button class="btn btn-ghost btn-sm" onclick="openEditClient(${c.id})" title="Modifier">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="deleteClient(${c.id})" title="Supprimer">🗑</button>
        </div>
      </div>
      <div class="cc-needs">${(c.needs||[]).map(n=>needBadge(n)).join('')}</div>
      ${c.brief?`<div style="font-size:11.5px;color:var(--text-muted);line-height:1.5;margin-bottom:10px;padding:8px 10px;background:var(--surface2);border-radius:6px;border-left:2px solid ${c.color}">"${esc(c.brief)}"</div>`:''}
      ${(c.budget&&c.contractDuration)?`<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--amber-dim);border-radius:6px;margin-bottom:10px;border:1px solid rgba(255,171,0,.2)"><span style="font-size:12px">💰</span><span style="font-size:11px;color:var(--amber);font-weight:600">${Math.round(c.budget/c.contractDuration).toLocaleString('fr-FR')} XOF <span style="font-weight:400;color:var(--text-muted)">/ mois HT · ${c.contractDuration} mois</span></span></div>`:''}
      ${lateInvs.length?`<div style="display:flex;align-items:center;gap:7px;padding:6px 10px;background:var(--red-dim);border-radius:6px;margin-bottom:10px;border:1px solid rgba(255,61,90,.2)"><span>⚠️</span><span style="font-size:11.5px;color:var(--red);font-weight:600">${lateInvs.length} facture(s) en retard — ${formatXOF(lateInvs.reduce((s,i)=>s+i.amount,0))}</span></div>`:''}
      <div class="cc-stats"><div class="client-stat"><div class="cc-stat-val" style="color:${c.color}">${projs.length}</div><div class="cc-stat-lbl">Projets</div></div><div class="client-stat"><div class="cc-stat-val">${tasks.length}</div><div class="cc-stat-lbl">Tâches</div></div>${paidAmt?`<div class="client-stat"><div class="cc-stat-val" style="color:var(--green);font-size:13px">${fmtXOFShort(paidAmt)}</div><div class="cc-stat-lbl">Encaissé</div></div>`:''}</div>
      <div><div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:5px"><span>Complétion globale</span><span style="color:${c.color};font-family:var(--mono);font-weight:700">${pct}%</span></div><div class="pbar" style="height:6px"><div class="pfill" style="width:${pct}%;background:linear-gradient(90deg,${c.color},${c.color}88)"></div></div></div>
      ${actionHtml}
    </div>`;
  };

  window.switchClientTab = function(tab) {
    window._clientActiveTab = tab;
    const COLORS = {client:'var(--accent)', prospect:'var(--purple)', appeloffre:'#60a5fa', cloture:'var(--amber)'};
    const DIMS   = {client:'var(--accent-dim)', prospect:'var(--purple-dim)', appeloffre:'rgba(96,165,250,.14)', cloture:'var(--amber-dim)'};
    ['client','prospect','appeloffre','cloture'].forEach(t => {
      const btn = document.getElementById('ctab-' + t);
      if (!btn) return;
      if (t === tab) {
        btn.style.color = COLORS[t];
        btn.style.borderBottomColor = COLORS[t];
        btn.style.fontWeight = '700';
        const sp = btn.querySelector('span');
        if (sp) { sp.style.background = DIMS[t]; sp.style.color = COLORS[t]; }
      } else {
        btn.style.color = 'var(--text-muted)';
        btn.style.borderBottomColor = 'transparent';
        btn.style.fontWeight = '600';
        const sp = btn.querySelector('span');
        if (sp) { sp.style.background = 'var(--surface2)'; sp.style.color = 'var(--text-muted)'; }
      }
    });
    const bnc = document.getElementById('btn-new-client');
    const bnp = document.getElementById('btn-new-prospect');
    if (bnc) bnc.style.display = (tab === 'client') ? 'inline-flex' : 'none';
    if (bnp) bnp.style.display = (tab === 'prospect') ? 'inline-flex' : 'none';
    window.renderClients();
  };

  window.renderClients = function() {
    normalizeBusinessRules();
    const sf = document.getElementById('cf-sector');
    if (sf) {
      const sectors = [...new Set(DB.clients.map(c => c.sector).filter(Boolean))];
      const existing = new Set([...sf.options].map(o => o.value));
      sectors.forEach(s => {
        if (existing.has(s)) return;
        const o = document.createElement('option');
        o.value = s; o.textContent = s; sf.appendChild(o);
      });
    }
    const fSec = sf ? sf.value : 'all';
    const needEl = document.getElementById('cf-need');
    const fNeed = needEl ? needEl.value : 'all';
    const tab = window._clientActiveTab || 'client';
    const { active, prospects, appels, closed } = getPools();
    window._updateCounters();
    const applyFilters = list => list.filter(c => {
      if (fSec !== 'all' && c.sector !== fSec) return false;
      if (fNeed !== 'all' && !(c.needs||[]).includes(fNeed)) return false;
      return true;
    });
    const grid = document.getElementById('clients-grid');
    if (!grid) return;
    let pool = [], emptyIcon='👤', emptyTxt='Aucun élément';
    if (tab === 'cloture') { pool = applyFilters(closed); emptyIcon='🔒'; emptyTxt='Aucun client clôturé pour le moment'; }
    else if (tab === 'prospect') { pool = applyFilters(prospects); emptyIcon='🎯'; emptyTxt='Aucun prospect en cours'; }
    else if (tab === 'appeloffre') { pool = applyFilters(appels); emptyIcon='📂'; emptyTxt='Aucun appel d\'offre'; }
    else { pool = applyFilters(active); emptyIcon='👤'; emptyTxt='Aucun client actif trouvé'; }
    if (!pool.length) grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-ico">${emptyIcon}</div><div class="empty-txt">${emptyTxt}</div></div>`;
    else if (tab === 'cloture') grid.innerHTML = pool.map(c => _renderClosedCard(c)).join('');
    else grid.innerHTML = pool.map(c => _renderClientCard(c)).join('');
    const hs = document.getElementById('historique-section'); if (hs) hs.style.display = 'none';
  };

  function ensureClientTab(){
    const tabs = document.getElementById('client-tabs');
    if (!tabs || document.getElementById('ctab-appeloffre')) return;
    const clotureBtn = document.getElementById('ctab-cloture');
    const btn = document.createElement('button');
    btn.id = 'ctab-appeloffre';
    btn.onclick = function(){ switchClientTab('appeloffre'); };
    btn.style.cssText = 'padding:10px 20px;font-size:13px;font-weight:600;cursor:pointer;border:none;border-bottom:2px solid transparent;background:transparent;color:var(--text-muted);margin-bottom:-1px;font-family:var(--body);display:flex;align-items:center;gap:7px;transition:all .2s';
    btn.innerHTML = '📂 Appels d\'offre <span id="ctab-count-appeloffre" style="font-family:var(--mono);font-size:11px;padding:1px 7px;border-radius:10px;background:var(--surface2);color:var(--text-muted)">0</span>';
    tabs.insertBefore(btn, clotureBtn);
  }

  function ensureTopButtons(){
    const topbarRight = document.getElementById('topbarRight');
    if (topbarRight && !document.getElementById('topbar-pdf-btn')) {
      const btn = document.createElement('button');
      btn.id = 'topbar-pdf-btn';
      btn.className = 'btn btn-pdf';
      btn.style.marginRight = '8px';
      btn.innerHTML = '📄 Export PDF';
      btn.onclick = openPDFModal;
      topbarRight.insertBefore(btn, topbarRight.firstChild);
    }
    const footer = document.querySelector('.sb-footer');
    if (footer && !document.getElementById('sidebar-pdf-btn')) {
      const btn = document.createElement('button');
      btn.id = 'sidebar-pdf-btn';
      btn.className = 'sb-btn';
      btn.innerHTML = '<span>📄</span> Export PDF dashboard';
      btn.onclick = openPDFModal;
      footer.appendChild(btn);
    }
    const saveBtn = document.getElementById('save-file-btn');
    if (saveBtn) {
      const hints = saveBtn.querySelectorAll('.kbd-hint');
      hints.forEach((el, idx) => { if (idx > 0) el.remove(); });
    }
  }

  function ensureDashboardKpi(){
    const strip = document.getElementById('dash-analytics-strip');
    if (strip && !document.getElementById('kpi-appels-offres')) {
      strip.style.gridTemplateColumns = 'repeat(5,1fr)';
      const box = document.createElement('div');
      box.className = 'kpi';
      box.style.setProperty('--kpi-c', '#60a5fa');
      box.innerHTML = '<div class="kpi-icon">📂</div><div class="kpi-val" id="kpi-appels-offres">0</div><div class="kpi-lbl">Appels d\'offre</div>';
      strip.appendChild(box);
    }
  }

  function ensureConvertedStrip(){
    const analytics = document.getElementById('dash-analytics-strip');
    if (!analytics) return;
    if (!document.getElementById('dash-converted-strip-wrap')) {
      const wrap = document.createElement('div');
      wrap.id = 'dash-converted-strip-wrap';
      wrap.className = 'card';
      wrap.style.marginBottom = '14px';
      wrap.innerHTML = '<div class="card-hd"><div class="card-title">🔄 Clients convertis depuis le pipeline</div></div><div id="dash-converted-strip" class="converted-strip"></div>';
      analytics.insertAdjacentElement('afterend', wrap);
    }
  }

  function ensureAppelOffreSection(){
    const clientsHd = document.querySelector('#view-dashboard .dash-section-hd:nth-of-type(2)');
    const clientSectionTitle = [...document.querySelectorAll('#view-dashboard .dash-section-title')].find(el => /Clients actifs/i.test(el.textContent));
    if (!clientSectionTitle) return;
    const hd = clientSectionTitle.closest('.dash-section-hd');
    if (!hd || document.getElementById('dash-appeloffre-list')) return;
    const secHd = document.createElement('div');
    secHd.className = 'dash-section-hd';
    secHd.innerHTML = '<div class="dash-section-title">📂 Appels d\'offre <span class="dash-section-count" style="color:#60a5fa" id="dash-appeloffre-count">0</span></div><button class="btn" style="background:rgba(96,165,250,.12);color:#60a5fa;border:1px solid rgba(96,165,250,.3);font-size:12px" onclick="go(\'clients\');setTimeout(()=>{_clientActiveTab=\'appeloffre\';switchClientTab(\'appeloffre\');},100)">Voir tous →</button>';
    const list = document.createElement('div');
    list.id = 'dash-appeloffre-list';
    list.className = 'appeloffre-list';
    hd.parentNode.insertBefore(secHd, hd);
    hd.parentNode.insertBefore(list, hd);
  }

  function renderDashboardAdditions(){
    const { appels, converted } = getPools();
    const strip = document.getElementById('dash-converted-strip');
    if (strip) {
      strip.innerHTML = converted.length
        ? converted.map(c => `<div class="converted-chip"><span>🎉</span><strong>${esc(c.name)}</strong><span style="color:var(--text-muted)">client converti</span></div>`).join('')
        : '<div style="color:var(--text-muted);font-size:12px">Aucun client converti actuellement.</div>';
    }
    const list = document.getElementById('dash-appeloffre-list');
    if (list) {
      list.innerHTML = appels.length
        ? appels.map(c => `<div class="appeloffre-card" onclick="openClientDetail(${c.id})"><div class="appeloffre-card-head"><div class="appeloffre-avatar" style="background:${c.color}">${esc(c.avatar)}</div><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.name)}</div><div class="appeloffre-meta">${prospectStageBadge(c.prospectStatus || 'proposal')}</div></div></div><div style="font-size:11px;color:var(--text-muted);line-height:1.5">${esc(c.brief || 'Appel d\'offre en suivi.')}</div></div>`).join('')
        : '<div style="color:var(--text-muted);font-size:12px">Aucun appel d\'offre actif.</div>';
    }
  }

  function setupPDFModal(){
    const modal = document.querySelector('#pdf-overlay .modal');
    if (!modal) return;
    modal.style.maxWidth = '780px';
    modal.innerHTML = `
      <div class="modal-hd"><div class="modal-ttl">📄 Exporter le dashboard en PDF</div><span class="modal-x" onclick="closePDFModal()">✕</span></div>
      <div>
        <div class="fg"><label class="flbl">Titre du document</label><input class="fin" id="pdf-title-input" value="Cockpit opérationnel — export dashboard"></div>
        <div class="fg"><label class="flbl">Vues à exporter</label>
          <div class="pdf-view-grid" id="pdf-view-grid">
            <label class="pdf-view-item"><input type="checkbox" value="dashboard" checked><div><div class="pdf-view-label">Tableau de bord</div><div class="pdf-view-sub">KPIs, conversions, appels d'offre</div></div></label>
            <label class="pdf-view-item"><input type="checkbox" value="clients" checked><div><div class="pdf-view-label">Clients actifs</div><div class="pdf-view-sub">Liste des clients opérationnels</div></div></label>
            <label class="pdf-view-item"><input type="checkbox" value="prospects" checked><div><div class="pdf-view-label">Prospects</div><div class="pdf-view-sub">Pipeline commercial en cours</div></div></label>
            <label class="pdf-view-item"><input type="checkbox" value="appeloffre" checked><div><div class="pdf-view-label">Appels d'offre</div><div class="pdf-view-sub">Dossiers AO distincts des prospects</div></div></label>
            <label class="pdf-view-item"><input type="checkbox" value="clotures" checked><div><div class="pdf-view-label">Clôturés</div><div class="pdf-view-sub">Clients terminés / archivés</div></div></label>
            <label class="pdf-view-item"><input type="checkbox" value="projects" checked><div><div class="pdf-view-label">Projets</div><div class="pdf-view-sub">Statuts, priorités, progression</div></div></label>
            <label class="pdf-view-item"><input type="checkbox" value="tasks" checked><div><div class="pdf-view-label">Tâches</div><div class="pdf-view-sub">Pilotage opérationnel détaillé</div></div></label>
            <label class="pdf-view-item"><input type="checkbox" value="team"><div><div class="pdf-view-label">Équipe</div><div class="pdf-view-sub">Charge et performance des membres</div></div></label>
            <label class="pdf-view-item"><input type="checkbox" value="reports"><div><div class="pdf-view-label">Rapports</div><div class="pdf-view-sub">Synthèse de performance et finances</div></div></label>
          </div>
        </div>
        <div class="pdf-preview" style="margin-top:14px"><div class="pdf-preview-ttl">Principe</div><div class="pdf-section-list"><div class="pdf-section-item"><span class="pdf-check">✓</span> Export PDF multi-vues, directement téléchargeable</div><div class="pdf-section-item"><span class="pdf-check">✓</span> Les compteurs proviennent des mêmes données dynamiques</div><div class="pdf-section-item"><span class="pdf-check">✓</span> Les sections non cochées ne sont pas exportées</div></div></div>
        <div class="modal-acts"><button class="btn btn-ghost" onclick="closePDFModal()">Annuler</button><button class="btn btn-pdf" onclick="generatePDF()">📄 Générer le PDF</button></div>
      </div>`;
  }

  function pdfTitle(doc, title, sub){
    doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.text(title, 14, 18);
    doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(90);
    doc.text(sub, 14, 25); doc.setTextColor(0);
  }

  window.generatePDF = function(){
    try {
      if (!window.jspdf || !window.jspdf.jsPDF) {
        showToast('⚠️','Le moteur PDF n\'est pas chargé. Vérifiez la connexion internet.','var(--amber)');
        return;
      }
      const selected = [...document.querySelectorAll('#pdf-view-grid input:checked')].map(i => i.value);
      if (!selected.length) {
        showToast('⚠️','Sélectionnez au moins une vue à exporter.','var(--amber)');
        return;
      }
      const title = (document.getElementById('pdf-title-input')?.value || 'Cockpit opérationnel — export dashboard').trim();
      const {jsPDF} = window.jspdf;
      const doc = new jsPDF({orientation:'p', unit:'mm', format:'a4'});
      const pools = getPools();
      const addTable = (opts) => doc.autoTable(Object.assign({ styles:{fontSize:8, cellPadding:2.3}, headStyles:{fillColor:[10,17,32]}, margin:{left:14,right:14} }, opts));
      const fmt = d => d ? fmtDate(d) : '—';
      const addPageTitle = (titleTxt, subTxt='') => { doc.addPage(); pdfTitle(doc, titleTxt, subTxt); };

      pdfTitle(doc, title, `Généré le ${new Date().toLocaleDateString('fr-FR')} · ${selected.length} vue(s) exportée(s)`);
      addTable({ startY: 34, head:[['Vue sélectionnée','Contenu exporté']], body: selected.map(v => [({dashboard:'Tableau de bord',clients:'Clients actifs',prospects:'Prospects',appeloffre:'Appels d\'offre',clotures:'Clôturés',projects:'Projets',tasks:'Tâches',team:'Équipe',reports:'Rapports'})[v] || v, 'Export dynamique']) });

      if (selected.includes('dashboard')) {
        addPageTitle('Tableau de bord', 'Synthèse consolidée du cockpit');
        addTable({ startY: 34, head:[['Indicateur','Valeur']], body:[
          ['Clients actifs', String(pools.active.length)],
          ['Prospects', String(pools.prospects.length)],
          ['Appels d\'offre', String(pools.appels.length)],
          ['Clients convertis', String(pools.converted.length)],
          ['Clients clôturés', String(pools.closed.length)],
          ['Projets totaux', String(DB.projects.length)],
          ['Tâches totales', String(DB.tasks.length)],
          ['Tâches terminées', String(DB.tasks.filter(t=>t.status==='Terminé').length)]
        ]});
        if (pools.converted.length) addTable({ startY: doc.lastAutoTable.finalY + 8, head:[['Clients convertis','Secteur','Date conversion']], body: pools.converted.map(c => [c.name, c.sector||'—', c.convertedAt ? new Date(c.convertedAt).toLocaleDateString('fr-FR') : '—']) });
        if (pools.appels.length) addTable({ startY: doc.lastAutoTable.finalY + 8, head:[['Appel d\'offre','Secteur','Statut']], body: pools.appels.map(c => [c.name, c.sector||'—', (c.prospectStatus||'proposal')]) });
      }

      if (selected.includes('clients')) {
        addPageTitle('Clients actifs', 'Clients non clôturés et hors appels d\'offre');
        addTable({ startY:34, head:[['Client','Secteur','Projets','Tâches','Complétion']], body: pools.active.map(c => {
          const tasks = cTasks(c.id), done = tasks.filter(t=>t.status==='Terminé').length, pct = tasks.length ? Math.round(done/tasks.length*100)+'%' : '0%';
          return [c.name, c.sector||'—', String(cProjects(c.id).length), String(tasks.length), pct];
        }) });
      }

      if (selected.includes('prospects')) {
        addPageTitle('Prospects', 'Pipeline commercial en cours');
        addTable({ startY:34, head:[['Prospect','Secteur','Étape','Apporteur']], body: pools.prospects.map(c => [c.name, c.sector||'—', c.prospectStatus||'lead', c.referredBy||'—']) });
      }

      if (selected.includes('appeloffre')) {
        addPageTitle('Appels d\'offre', 'Suivi des dossiers AO');
        addTable({ startY:34, head:[['Dossier','Secteur','Étape','Équipe']], body: pools.appels.map(c => [c.name, c.sector||'—', c.prospectStatus||'proposal', (c.teamMembers||[]).join(', ') || '—']) });
      }

      if (selected.includes('clotures')) {
        addPageTitle('Clients clôturés', 'Clients archivés / terminés');
        addTable({ startY:34, head:[['Client','Secteur','Date clôture','Projets','Tâches']], body: pools.closed.map(c => [c.name, c.sector||'—', c.closedAt ? new Date(c.closedAt).toLocaleDateString('fr-FR') : '—', String(cProjects(c.id).length), String(cTasks(c.id).length)]) });
      }

      if (selected.includes('projects')) {
        addPageTitle('Projets', 'Vue projet consolidée');
        addTable({ startY:34, head:[['Projet','Client','Statut','Priorité','Complétion']], body: DB.projects.map(p => [p.name, gc(p.clientId)?.name || '—', p.status || '—', p.priority || '—', (typeof pComp === 'function' ? pComp(p.id) : 0) + '%']) });
      }

      if (selected.includes('tasks')) {
        addPageTitle('Tâches', 'Vue opérationnelle détaillée');
        addTable({ startY:34, head:[['Tâche','Client','Projet','Statut','Échéance','Assigné']], body: DB.tasks.map(t => [t.name, gc(t.clientId)?.name || '—', gp(t.projectId)?.name || '—', t.status || '—', fmt(t.endDate), t.assignedTo || '—']) });
      }

      if (selected.includes('team')) {
        addPageTitle('Équipe', 'Performance et charge');
        const stats = (typeof computeTeamStats === 'function') ? computeTeamStats() : {};
        const rows = Object.keys(stats).map(name => {
          const s = stats[name];
          const pct = s.total ? Math.round((s.done/s.total)*100) + '%' : '0%';
          return [name, String(s.total), String(s.done), String(s.late), pct];
        });
        addTable({ startY:34, head:[['Membre','Tâches','Terminées','En retard','Complétion']], body: rows.length ? rows : [['—','0','0','0','0%']] });
      }

      if (selected.includes('reports')) {
        addPageTitle('Rapports', 'Indicateurs de performance et finances');
        const paid = DB.invoices.filter(i=>i.status==='Payée').reduce((s,i)=>s+i.amount,0);
        const sent = DB.invoices.filter(i=>i.status==='Envoyée').reduce((s,i)=>s+i.amount,0);
        const late = DB.invoices.filter(i=>i.status==='En retard').reduce((s,i)=>s+i.amount,0);
        addTable({ startY:34, head:[['Indicateur','Valeur']], body:[
          ['Factures payées', formatXOF(paid)],
          ['Factures envoyées', formatXOF(sent)],
          ['Factures en retard', formatXOF(late)],
          ['Score efficacité', (typeof effScore === 'function' ? effScore() : 0) + '/100']
        ]});
      }

      const filename = (title || 'cockpit-dashboard').replace(/[^\w\-À-ÿ]+/g,'_').replace(/_+/g,'_');
      doc.save(filename + '.pdf');
      closePDFModal();
      showToast('📄','PDF généré avec succès.','var(--purple)');
    } catch (e) {
      console.error(e);
      showToast('⚠️','Erreur lors de la génération du PDF.','var(--red)');
    }
  };

  // ── STEP 08 (Command Center) : synthèse "Attention Required" ──
  // Ne recalcule rien de nouveau : relit des données déjà utilisées ailleurs
  // dans le tableau de bord (tâches en retard, factures en retard) et les
  // présente en un seul repère visuel clair en haut de page.
  function renderAttentionRequired(){
    const card = document.getElementById('dash-attention-card');
    if (!card) return;
    const now = new Date();
    const lateTasks = (DB.tasks||[]).filter(t => t.status !== 'Terminé' && t.endDate && new Date(t.endDate) < now);
    const lateInvoices = (DB.invoices||[]).filter(i => i.status === 'En retard' || (i.status === 'Envoyée' && i.dueDate && new Date(i.dueDate) < now));
    const items = [];
    if (lateTasks.length) items.push({ icon:'⏰', label: `${lateTasks.length} tâche${lateTasks.length>1?'s':''} en retard`, action:"go('tasks')", color:'var(--red)' });
    if (lateInvoices.length) items.push({ icon:'💳', label: `${lateInvoices.length} facture${lateInvoices.length>1?'s':''} en retard`, action:"go('reports')", color:'var(--amber)' });
    if (!items.length) { card.style.display = 'none'; return; }
    card.style.display = 'block';
    card.innerHTML = `<div class="card" style="border-color:var(--red);padding:var(--space-4) var(--space-5)">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--red);font-family:var(--mono);margin-bottom:var(--space-2)">⚠️ Attention requise</div>
      <div style="display:flex;gap:var(--space-5);flex-wrap:wrap">
        ${items.map(it => `<div onclick="${it.action}" style="cursor:pointer;display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:${it.color}">${it.icon} ${it.label} →</div>`).join('')}
      </div>
    </div>`;
  }
  window.renderAttentionRequired = renderAttentionRequired;

  // ── Onboarding : guide de démarrage pour un espace de travail vide ──
  // Le brief V1 demande que "l'utilisateur comprenne quoi faire sans connaître
  // MCPS". Les états vides existants sont passifs ("Aucun projet trouvé") : ils
  // constatent, ils ne guident pas. Ce bloc ne s'affiche QUE tant que l'espace
  // est réellement vide, et disparaît dès la première donnée saisie — aucune
  // donnée fictive n'est jamais affichée, conformément au brief.
  function renderEmptyWorkspace(){
    const box = document.getElementById('dash-empty-workspace');
    if (!box) return;
    const nbClients = (DB.clients||[]).length + (DB.prospects||[]).length;
    const nbProjects = (DB.projects||[]).length;
    const nbTasks = (DB.tasks||[]).length;
    if (nbClients > 0 && nbProjects > 0 && nbTasks > 0) { box.style.display = 'none'; return; }

    const steps = [
      { done: nbClients > 0,  n:1, label:"Créer votre premier client", desc:"Ou un prospect, si vous démarrez par la prospection.", action:"openModal('client')", cta:"Ajouter un client" },
      { done: nbProjects > 0, n:2, label:"Créer un projet",            desc:"Rattaché à ce client — une campagne, une refonte, un lancement.", action:"openModal('project')", cta:"Ajouter un projet" },
      { done: nbTasks > 0,    n:3, label:"Ajouter une première tâche", desc:"C'est ce qui alimente les indicateurs de l'Intelligence Layer.", action:"openModal('task')", cta:"Ajouter une tâche" },
    ];
    const nextStep = steps.find(s => !s.done);

    box.style.display = 'block';
    box.innerHTML = `<div class="card" style="padding:var(--space-5) var(--space-6)">
      <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--accent);font-family:var(--mono);margin-bottom:var(--space-2)">🚀 Démarrer avec MCPS</div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:var(--space-4);line-height:1.6">Votre espace de travail est prêt. Trois étapes suffisent pour que le cockpit commence à produire des indicateurs utiles.</div>
      <div style="display:flex;flex-direction:column;gap:var(--space-3)">
        ${steps.map(s => `
          <div style="display:flex;align-items:flex-start;gap:var(--space-3);opacity:${s.done ? '.55' : '1'}">
            <span style="width:24px;height:24px;flex-shrink:0;border-radius:var(--radius-pill);background:${s.done ? 'var(--green-dim)' : 'var(--accent-dim)'};color:${s.done ? 'var(--green)' : 'var(--accent)'};font-family:var(--mono);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">${s.done ? '✓' : s.n}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;${s.done ? 'text-decoration:line-through' : ''}">${s.label}</div>
              <div style="font-size:11.5px;color:var(--text-muted)">${s.desc}</div>
            </div>
            ${!s.done && s === nextStep ? `<button class="btn btn-primary btn-sm" onclick="${s.action}" style="flex-shrink:0">${s.cta}</button>` : ''}
          </div>`).join('')}
      </div>
    </div>`;
  }
  window.renderEmptyWorkspace = renderEmptyWorkspace;

  const _origRenderDashboard = window.renderDashboard;
  window.renderDashboard = function(){
    normalizeBusinessRules();
    const res = _origRenderDashboard ? _origRenderDashboard() : undefined;
    ensureDashboardKpi();
    ensureConvertedStrip();
    ensureAppelOffreSection();
    window._updateCounters();
    renderDashboardAdditions();
    renderAttentionRequired();
    renderEmptyWorkspace();
    if (typeof renderDashDistrib === 'function') renderDashDistrib();
    if (typeof renderDashboardResources === 'function') renderDashboardResources();
    if (typeof renderDashboardProspects === 'function') renderDashboardProspects();
    if (typeof renderTeamPerformance === 'function') renderTeamPerformance();
    return res;
  };

  document.addEventListener('DOMContentLoaded', function(){
    normalizeBusinessRules();
    ensureClientTab();
    ensureTopButtons();
    ensureDashboardKpi();
    ensureConvertedStrip();
    ensureAppelOffreSection();
    setupPDFModal();
    window._updateCounters();
    setTimeout(function(){
      if (typeof renderDashboard === 'function' && state.view === 'dashboard') renderDashboard();
      if (typeof renderClients === 'function' && state.view === 'clients') renderClients();
    }, 350);
  });
})();
