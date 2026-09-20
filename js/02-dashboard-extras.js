// ── DATE RANGE REPORT ──
function setRptPeriod(p) {
  const now = new Date();
  const from = new Date(), to = new Date();
  if (p === 'week') { from.setDate(now.getDate()-7); }
  else if (p === 'month') { from.setDate(1); from.setMonth(now.getMonth()); }
  else if (p === 'quarter') { from.setMonth(Math.floor(now.getMonth()/3)*3); from.setDate(1); }
  else if (p === 'year') { from.setMonth(0); from.setDate(1); }
  else { from.setFullYear(2000); }
  const fmt = d => d.toISOString().split('T')[0];
  document.getElementById('rpt-date-from').value = fmt(from);
  document.getElementById('rpt-date-to').value = fmt(to);
  renderFilteredReport();
}

function renderFilteredReport() {
  const fromVal = document.getElementById('rpt-date-from')?.value;
  const toVal = document.getElementById('rpt-date-to')?.value;
  const summary = document.getElementById('rpt-period-summary');
  if (!fromVal || !toVal) return;
  const from = new Date(fromVal + 'T00:00:00');
  const to = new Date(toVal + 'T23:59:59');
  if (from > to) {
    if(summary) summary.innerHTML = '<span>⚠️</span><span style="color:var(--red)">La date de fin doit être après la date de début.</span>';
    return;
  }
  if (summary) summary.innerHTML = `<span>📌</span><span>Période : <strong>${from.toLocaleDateString('fr',{day:'2-digit',month:'long',year:'numeric'})}</strong> → <strong>${to.toLocaleDateString('fr',{day:'2-digit',month:'long',year:'numeric'})}</strong></span>`;

  const tasks = DB.tasks.filter(t => {
    const d = new Date(t.startDate || t.endDate);
    return d >= from && d <= to;
  });
  const taskCountEl = document.getElementById('rpt-task-count');
  if (taskCountEl) taskCountEl.textContent = tasks.length + ' tâche(s)';

  const tbody = document.getElementById('rpt-tasks-tbody');
  if (tbody) {
    tbody.innerHTML = tasks.length ? tasks.map(t => {
      const pj = gp(t.projectId);
      return `<tr>
        <td><strong>${esc(t.name)}</strong></td>
        <td>${ctag(t.clientId)}</td>
        <td style="font-size:11.5px;color:var(--text-muted)">${esc(pj?.name||'—')}</td>
        <td>${statusBadge(t.status)}</td>
        <td class="time-n">${fmtDate(t.startDate)}</td>
        <td class="time-n">${fmtDate(t.endDate)}</td>
        <td style="font-size:12px">${t.assignedTo?'<span class="team-tag">👤 '+esc(t.assignedTo)+'</span>':'<span style="color:var(--text-dim)">—</span>'}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">Aucune tâche sur cette période</td></tr>';
  }

  const projs = DB.projects.filter(p => {
    const start = new Date(p.startDate || '2000-01-01');
    const end = new Date(p.endDate || '2099-01-01');
    return start <= to && end >= from;
  });
  const pTbody = document.getElementById('rpt-projs-tbody');
  if (pTbody) {
    pTbody.innerHTML = projs.length ? projs.map(p => {
      const comp = pComp(p.id);
      const ts = pTasks(p.id);
      return `<tr>
        <td><strong>${esc(p.name)}</strong></td>
        <td>${ctag(p.clientId)}</td>
        <td>${statusBadge(p.status)}</td>
        <td>${priBadge(p.priority)}</td>
        <td><div style="display:flex;align-items:center;gap:7px;min-width:90px"><div class="pbar" style="flex:1"><div class="pfill" style="width:${comp}%"></div></div><span style="font-family:var(--mono);font-size:11px;color:var(--text-muted)">${comp}%</span></div></td>
        <td style="font-family:var(--mono);font-size:12px">${ts.filter(t=>t.status==='Terminé').length}/${ts.length}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">Aucun projet sur cette période</td></tr>';
  }

  window._rptFilteredTasks = tasks;
  window._rptFilteredProjs = projs;
}

function exportFilteredCSV(type) {
  if (!window._rptFilteredTasks && !window._rptFilteredProjs) {
    showToast('⚠️', "Sélectionnez d'abord une période", 'var(--amber)');
    return;
  }
  let csv = '';
  if (type === 'tasks') {
    csv = 'Tâche,Client,Projet,Statut,Début,Fin,Assigné à,H.Estimées\n';
    (window._rptFilteredTasks||[]).forEach(t => {
      const cl = gc(t.clientId), pj = gp(t.projectId);
      csv += `"${t.name}","${cl?.name||''}","${pj?.name||''}","${t.status}","${t.startDate||''}","${t.endDate||''}","${t.assignedTo||''}",${t.estimatedHours||0}\n`;
    });
    dl(new Blob([csv],{type:'text/csv'}), 'taches-periode.csv');
  } else {
    csv = 'Projet,Client,Statut,Priorité,Complétion,Tâches terminées,Total tâches\n';
    (window._rptFilteredProjs||[]).forEach(p => {
      const cl = gc(p.clientId), ts = pTasks(p.id);
      csv += `"${p.name}","${cl?.name||''}","${p.status}","${p.priority}",${pComp(p.id)}%,${ts.filter(t=>t.status==='Terminé').length},${ts.length}\n`;
    });
    dl(new Blob([csv],{type:'text/csv'}), 'projets-periode.csv');
  }
  showToast('📊', 'Export CSV terminé !', 'var(--accent)');
}

// ── INJECT ANIMATED ICONS OVER EACH CHART CARD ──
function injectChartIcons() {
  const iconMap = {
    'ch-bar':'📊','ch-status':'🥧','ch-line':'📈','ch-pieclient':'🎯',
    'ch-sector-needs':'🎨','ch-sector-budget':'💰',
    'ch-inv-client':'💳','ch-inv-status':'📋',
    'ch-workload':'⚖️','ch-todo':'✅'
  };
  Object.entries(iconMap).forEach(([id, icon]) => {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const card = canvas.closest('.card, .chart-card');
    if (!card || card.querySelector('.chart-icon-anim')) return;
    const el = document.createElement('div');
    el.className = 'chart-icon-anim';
    el.textContent = icon;
    el.style.animationDelay = (Math.random()*1.5).toFixed(1)+'s';
    card.appendChild(el);
  });
}

// ── PATCH initCharts to inject icons after rendering ──
(function() {
  const _origIC = initCharts;
  if (typeof _origIC === 'function') {
    initCharts = function() { _origIC(); setTimeout(injectChartIcons, 250); };
  }
  document.addEventListener('DOMContentLoaded', () => setTimeout(injectChartIcons, 900));
})();

// ── AUTO-SET REPORTS TO CURRENT MONTH ──
(function() {
  const _origRR = typeof renderReports === 'function' ? renderReports : null;
  if (_origRR) {
    renderReports = function() {
      _origRR();
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const fmt = d => d.toISOString().split('T')[0];
      const fromEl = document.getElementById('rpt-date-from');
      const toEl = document.getElementById('rpt-date-to');
      if (fromEl && !fromEl.value) fromEl.value = fmt(from);
      if (toEl && !toEl.value) toEl.value = fmt(now);
      renderFilteredReport();
    };
  }
})();

// ── FORM UX: Enter key to submit + auto-focus ──
document.addEventListener('DOMContentLoaded', () => {
  // Enter key on text inputs within modals
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    const overlay = document.querySelector('.overlay.open');
    if (!overlay) return;
    const target = e.target;
    if (target.tagName === 'TEXTAREA') return; // Allow newlines in textareas
    const submitBtn = overlay.querySelector('.btn-primary');
    if (submitBtn) { e.preventDefault(); submitBtn.click(); }
  });

  // Auto-focus first input when modal opens
  const observer = new MutationObserver(mutations => {
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.classList?.contains('open') || node.closest?.('.overlay.open')) {
          setTimeout(() => {
            const first = document.querySelector('.overlay.open .fin[type="text"], .overlay.open input.fin:not([type="color"]):not([type="date"])');
            if (first) first.focus();
          }, 60);
        }
      });
    });
    // Watch for class changes on overlays
    mutations.forEach(m => {
      if (m.type === 'attributes' && m.attributeName === 'class') {
        const el = m.target;
        if (el.classList?.contains('overlay') && el.classList?.contains('open')) {
          setTimeout(() => {
            const first = el.querySelector('.fin[id]:not([type="color"]):not([type="date"])');
            if (first) first.focus();
          }, 80);
        }
      }
    });
  });
  document.querySelectorAll('.overlay').forEach(o => observer.observe(o, {attributes: true, attributeFilter: ['class']}));

  // Debounce search input
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    let _searchTimer;
    const _origOnSearch = searchInput.getAttribute('oninput');
    searchInput.removeAttribute('oninput');
    searchInput.addEventListener('input', function() {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => onSearch(this.value), 180);
    });
  }

  // Limit toast stack to 4
  const _origShowToast = showToast;
  window.showToast = function(ico, msg, color) {
    const box = document.getElementById('toast-box');
    if (box && box.children.length >= 4) box.firstElementChild?.remove();
    _origShowToast(ico, msg, color);
  };

  // Keyboard shortcut: show hint on save button
  const saveBtn = document.getElementById('save-file-btn');
  if (saveBtn) {
    const hint = document.createElement('span');
    hint.className = 'kbd-hint';
    hint.textContent = 'Ctrl+S';
    hint.style.cssText = 'margin-left:auto;opacity:.6';
    saveBtn.appendChild(hint);
  }
});
