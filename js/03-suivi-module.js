// ══════════════════════════════════════════════════════════════
// MODULE — SUIVI TÂCHES TERMINÉES & HISTORIQUE CLIENT
// Injection pure — aucun code existant modifié
// ══════════════════════════════════════════════════════════════

// ── A. STAMP completedDate quand une tâche passe en "Terminé" ──
(function() {
  function stamp(tid) {
    const t = DB.tasks.find(t => t.id === tid);
    if (t && t.status !== 'Terminé') {
      t.completedDate = new Date().toISOString().split('T')[0];
    }
  }
  const _origUTS = updateTaskStatus;
  updateTaskStatus = function(tid, st) {
    if (st === 'Terminé') stamp(tid);
    _origUTS(tid, st);
  };
  const _origUTSD = updateTaskStatusFromDetail;
  updateTaskStatusFromDetail = function(tid, st, cid) {
    if (st === 'Terminé') stamp(tid);
    _origUTSD(tid, st, cid);
  };
  const _origST = submitTask;
  submitTask = function(existingId) {
    if (existingId) {
      const t = DB.tasks.find(t => t.id === existingId);
      const newSt = document.getElementById('ft-status')?.value;
      if (t && newSt === 'Terminé' && t.status !== 'Terminé')
        t.completedDate = new Date().toISOString().split('T')[0];
    }
    _origST(existingId);
  };
})();

// ── B. PATCH openClientDetail — section "Historique tâches terminées" ──
(function() {
  const _origOCD = openClientDetail;
  openClientDetail = function(cid) {
    _origOCD(cid);
    const cdContent = document.getElementById('cd-content');
    if (!cdContent) return;

    const doneTasks = cTasks(cid)
      .filter(t => t.status === 'Terminé')
      .sort((a, b) => {
        const da = a.completedDate || a.endDate || '';
        const db = b.completedDate || b.endDate || '';
        return db.localeCompare(da);
      });

    if (!doneTasks.length) {
      cdContent.insertAdjacentHTML('beforeend', `
        <div class="card" style="margin-top:16px;border-top:2px solid var(--green)">
          <div class="card-hd"><div class="card-title">📚 Historique — Tâches terminées</div></div>
          <div style="color:var(--text-muted);font-size:12px;padding:10px 0">Aucune tâche terminée pour ce client.</div>
        </div>`);
      return;
    }

    const totalH   = doneTasks.reduce((s, t) => s + (t.realHours || t.estimatedHours || 0), 0);
    const lastDate = doneTasks[0]?.completedDate || doneTasks[0]?.endDate;

    const histHtml = `
      <div style="margin-top:16px">
        <!-- Mini KPIs -->
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
          <div class="mstat"><span>✅</span><span class="mstat-lbl">Tâches terminées</span>
            <span class="mstat-val" style="color:var(--green)">${doneTasks.length}</span></div>
          <div class="mstat"><span>⏱</span><span class="mstat-lbl">H. cumulées</span>
            <span class="mstat-val" style="color:var(--purple)">${totalH}h</span></div>
          ${lastDate ? `<div class="mstat"><span>📅</span><span class="mstat-lbl">Dernière livraison</span>
            <span class="mstat-val" style="font-size:11px">${fmtDate(lastDate)}</span></div>` : ''}
        </div>
        <!-- Table -->
        <div class="tbl-wrap">
          <div class="tbl-bar">
            <div class="tbl-ttl">📚 Historique — Tâches terminées (${doneTasks.length})</div>
            <button class="btn btn-ghost btn-sm" onclick="exportClientHistoCSV(${cid})">⬇ CSV</button>
          </div>
          <table>
            <thead><tr>
              <th>Tâche</th><th>Projet</th>
              <th>Date terminée</th><th>Assigné</th>
              <th>H. Est.</th><th>H. Réelles</th><th>Perf.</th>
            </tr></thead>
            <tbody>
              ${doneTasks.map(t => {
                const pj    = gp(t.projectId);
                const dateT = t.completedDate || t.endDate;
                const perf  = (t.realHours && t.estimatedHours)
                  ? Math.round(t.estimatedHours / t.realHours * 100) : null;
                const pc = perf === null ? 'var(--text-dim)'
                  : perf >= 100 ? 'var(--green)' : perf >= 80 ? 'var(--accent)' : 'var(--amber)';
                return `<tr class="task-done-row">
                  <td><strong>${esc(t.name)}</strong></td>
                  <td style="font-size:11.5px;color:var(--text-muted)">${esc(pj?.name || '—')}</td>
                  <td style="font-family:var(--mono);font-size:12px;color:var(--green)">${dateT ? fmtDate(dateT) : '—'}</td>
                  <td>${t.assignedTo
                    ? `<span class="team-tag" style="font-size:11px">👤 ${esc(t.assignedTo)}</span>`
                    : '<span style="color:var(--text-dim)">—</span>'}</td>
                  <td style="font-family:var(--mono);font-size:12px">${t.estimatedHours || 0}h</td>
                  <td style="font-family:var(--mono);font-size:12px;color:var(--accent)">
                    ${t.realHours ? t.realHours + 'h' : '—'}</td>
                  <td style="font-family:var(--mono);font-size:12px;color:${pc}">
                    ${perf !== null ? perf + '%' : '—'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
    cdContent.insertAdjacentHTML('beforeend', histHtml);
  };
})();

function exportClientHistoCSV(cid) {
  const doneTasks = cTasks(cid).filter(t => t.status === 'Terminé')
    .sort((a,b)=>((b.completedDate||b.endDate||'')).localeCompare(a.completedDate||a.endDate||''));
  let csv = 'Tâche,Projet,Date terminée,Assigné,H.Est.,H.Réelles,Perf.\n';
  doneTasks.forEach(t => {
    const pj = gp(t.projectId);
    const dt = t.completedDate || t.endDate || '';
    const perf = (t.realHours && t.estimatedHours) ? Math.round(t.estimatedHours/t.realHours*100)+'%' : '';
    csv += `"${t.name}","${pj?.name||''}","${dt}","${t.assignedTo||''}",${t.estimatedHours||0},${t.realHours||''},"${perf}"\n`;
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download = `historique-${gc(cid)?.name||cid}.csv`;
  a.click();
  showToast('📊','Export CSV terminé !','var(--accent)');
}

// ── C. INJECT VUE "SUIVI TÂCHES" + NAV ──
document.addEventListener('DOMContentLoaded', function() {

  // ── Ajouter nav item ──
  // nav item already present in HTML sidebar

  // ── Ajouter view div ──
  const contentEl = document.querySelector('.main .content') || document.querySelector('.content');
  if (contentEl && !document.getElementById('view-suivi')) {
    const vd = document.createElement('div');
    vd.id        = 'view-suivi';
    vd.className = 'view';
    vd.innerHTML = _suiviViewHTML();
    contentEl.appendChild(vd);
  }

  // ── Patch go() ──
  PAGE['suivi'] = { title: 'Suivi des Tâches', sub: 'Volume & historique de tâches terminées par client' };
  const _origGo = go;
  go = function(view) {
    _origGo(view);
    if (view === 'suivi') {
      document.getElementById('pageTitle').textContent = 'Suivi des Tâches';
      document.getElementById('pageSub').textContent   = 'Volume & historique de tâches terminées par client';
      _initSuiviFilters();
      renderSuivi();
    }
  };
});

// ── HTML de la vue Suivi ──
function _suiviViewHTML() {
  return `
  <!-- Filters + Tab switcher -->
  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:18px">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <label style="font-size:11.5px;color:var(--text-muted);font-weight:600">Du</label>
      <input type="date" id="sv-date-from" class="flt" onchange="renderSuivi()">
      <label style="font-size:11.5px;color:var(--text-muted);font-weight:600">au</label>
      <input type="date" id="sv-date-to" class="flt" onchange="renderSuivi()">
      <select id="sv-client" class="flt" onchange="renderSuivi()">
        <option value="all">Tous les clients</option>
      </select>
      <button class="btn btn-ghost btn-sm" onclick="resetSuiviFilter()">↺ Reset</button>
    </div>
    <div style="display:flex;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm);overflow:hidden">
      <button id="sv-tab-table"   class="gran-btn active" onclick="setSuiviTab('table')">📋 Tableau</button>
      <button id="sv-tab-clients" class="gran-btn"        onclick="setSuiviTab('clients')">👥 Par client</button>
      <button id="sv-tab-chart"   class="gran-btn"        onclick="setSuiviTab('chart')">📊 Évolution</button>
    </div>
  </div>

  <!-- KPI strip -->
  <div class="g g4" id="sv-kpis" style="margin-bottom:18px"></div>

  <!-- Vue Tableau -->
  <div id="sv-view-table">
    <div class="tbl-wrap">
      <div class="tbl-bar">
        <div class="tbl-ttl">📋 Tâches terminées</div>
        <button class="btn btn-ghost btn-sm" onclick="exportSuiviCSV()">⬇ Exporter CSV</button>
      </div>
      <table><thead><tr>
        <th>Tâche</th><th>Client</th><th>Projet</th>
        <th>Date terminée</th><th>Assigné</th>
        <th>H. Est.</th><th>H. Réelles</th><th>Perf.</th>
      </tr></thead>
      <tbody id="sv-tbody"></tbody></table>
    </div>
  </div>

  <!-- Vue Par client -->
  <div id="sv-view-clients" style="display:none">
    <div class="g g-auto" id="sv-client-grid"></div>
  </div>

  <!-- Vue Évolution -->
  <div id="sv-view-chart" style="display:none">
    <div class="card" style="margin-bottom:14px">
      <div class="card-hd" style="flex-wrap:wrap;gap:8px">
        <div class="card-title">Tâches terminées par client — Évolution mensuelle</div>
        <div style="display:flex;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm);overflow:hidden">
          <button id="sv-chart-bar"  class="gran-btn active" onclick="setSuiviChartType('bar')">Barres</button>
          <button id="sv-chart-line" class="gran-btn"        onclick="setSuiviChartType('line')">Ligne</button>
        </div>
      </div>
      <canvas id="sv-chart" style="max-height:320px"></canvas>
    </div>
    <!-- Top clients ranking -->
    <div class="card">
      <div class="card-hd"><div class="card-title">🏆 Classement clients — volume période</div></div>
      <div id="sv-ranking"></div>
    </div>
  </div>
  `;
}

// ── Init filters (current month) ──
function _initSuiviFilters() {
  const fEl = document.getElementById('sv-date-from');
  const tEl = document.getElementById('sv-date-to');
  if (!fEl || !tEl || fEl.value) return;        // already initialised
  const now  = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  fEl.value = from.toISOString().split('T')[0];
  tEl.value = now.toISOString().split('T')[0];
}

// ── State ──
window._suiviTab       = 'table';
window._suiviChartType = 'bar';
window._suiviChart     = null;
window._suiviDone      = [];

function setSuiviTab(tab) {
  window._suiviTab = tab;
  ['table','clients','chart'].forEach(t => {
    const btn  = document.getElementById('sv-tab-' + t);
    const view = document.getElementById('sv-view-' + t);
    if (btn)  btn.classList.toggle('active', t === tab);
    if (view) view.style.display = t === tab ? '' : 'none';
  });
  renderSuivi();
}

function setSuiviChartType(type) {
  window._suiviChartType = type;
  ['bar','line'].forEach(t => {
    const btn = document.getElementById('sv-chart-' + t);
    if (btn) btn.classList.toggle('active', t === type);
  });
  _renderChart(window._suiviDone);
}

function resetSuiviFilter() {
  const now  = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const fEl = document.getElementById('sv-date-from');
  const tEl = document.getElementById('sv-date-to');
  if (fEl) fEl.value = from.toISOString().split('T')[0];
  if (tEl) tEl.value = now.toISOString().split('T')[0];
  const cEl = document.getElementById('sv-client');
  if (cEl) cEl.value = 'all';
  renderSuivi();
}

// ── Populate client select once ──
function _populateClientSelect() {
  const csel = document.getElementById('sv-client');
  if (!csel || csel.options.length > 1) return;
  DB.clients.filter(c => c.type !== 'prospect').forEach(c => {
    const o = document.createElement('option');
    o.value = c.id; o.textContent = c.name;
    csel.appendChild(o);
  });
}

// ── MAIN RENDER ──
function renderSuivi() {
  _populateClientSelect();

  const from = document.getElementById('sv-date-from')?.value || '';
  const to   = document.getElementById('sv-date-to')?.value   || '';
  const cid  = document.getElementById('sv-client')?.value    || 'all';

  const done = DB.tasks.filter(t => {
    if (t.status !== 'Terminé') return false;
    const dt = t.completedDate || t.endDate || '';
    if (from && dt && dt < from) return false;
    if (to   && dt && dt > to)   return false;
    if (cid !== 'all' && String(t.clientId) !== String(cid)) return false;
    return true;
  }).sort((a, b) =>
    ((b.completedDate || b.endDate || '')).localeCompare(a.completedDate || a.endDate || '')
  );
  window._suiviDone = done;

  // ── KPIs ──
  const totalH   = done.reduce((s, t) => s + (t.realHours || t.estimatedHours || 0), 0);
  const clientsS = new Set(done.map(t => t.clientId));
  const avgH     = done.length ? (totalH / done.length).toFixed(1) : '0';
  const onTime   = done.filter(t => t.realHours && t.estimatedHours && t.realHours <= t.estimatedHours).length;
  const pctOT    = done.length ? Math.round(onTime / done.length * 100) : 0;

  document.getElementById('sv-kpis').innerHTML = `
    <div class="kpi" style="--kpi-c:var(--green)">
      <div class="kpi-icon">✅</div>
      <div class="kpi-val" style="color:var(--green)">${done.length}</div>
      <div class="kpi-lbl">Tâches terminées</div>
    </div>
    <div class="kpi" style="--kpi-c:var(--accent)">
      <div class="kpi-icon">👥</div>
      <div class="kpi-val" style="color:var(--accent)">${clientsS.size}</div>
      <div class="kpi-lbl">Clients servis</div>
    </div>
    <div class="kpi" style="--kpi-c:var(--purple)">
      <div class="kpi-icon">⏱</div>
      <div class="kpi-val" style="color:var(--purple)">${totalH}h</div>
      <div class="kpi-lbl">Heures réalisées</div>
    </div>
    <div class="kpi" style="--kpi-c:var(--amber)">
      <div class="kpi-icon">🎯</div>
      <div class="kpi-val" style="color:var(--amber)">${pctOT}%</div>
      <div class="kpi-lbl">Livrées à temps</div>
    </div>
  `;

  if (window._suiviTab === 'table')   _renderTable(done);
  else if (window._suiviTab === 'clients') _renderByClient(done);
  else                                _renderChart(done);
}

// ── Vue Tableau ──
function _renderTable(done) {
  const tbody = document.getElementById('sv-tbody');
  if (!tbody) return;
  tbody.innerHTML = done.map(t => {
    const pj    = gp(t.projectId);
    const dateT = t.completedDate || t.endDate;
    const perf  = (t.realHours && t.estimatedHours)
      ? Math.round(t.estimatedHours / t.realHours * 100) : null;
    const pc = perf === null ? 'var(--text-dim)'
      : perf >= 100 ? 'var(--green)' : perf >= 80 ? 'var(--accent)' : 'var(--amber)';
    return `<tr class="task-done-row">
      <td><strong>${esc(t.name)}</strong></td>
      <td>${ctag(t.clientId)}</td>
      <td style="font-size:11.5px;color:var(--text-muted)">${esc(pj?.name || '—')}</td>
      <td style="font-family:var(--mono);font-size:12px;color:var(--green)">${dateT ? fmtDate(dateT) : '—'}</td>
      <td>${t.assignedTo
        ? `<span class="team-tag" style="font-size:11px">👤 ${esc(t.assignedTo)}</span>`
        : '<span style="color:var(--text-dim)">—</span>'}</td>
      <td style="font-family:var(--mono);font-size:12px">${t.estimatedHours || 0}h</td>
      <td style="font-family:var(--mono);font-size:12px;color:var(--accent)">${t.realHours ? t.realHours + 'h' : '—'}</td>
      <td style="font-family:var(--mono);font-size:12px;font-weight:700;color:${pc}">${perf !== null ? perf + '%' : '—'}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="8"><div class="empty">
    <div class="empty-ico">✅</div>
    <div class="empty-txt">Aucune tâche terminée sur cette période</div>
  </div></td></tr>`;
}

// ── Vue Par client ──
function _renderByClient(done) {
  const grid = document.getElementById('sv-client-grid');
  if (!grid) return;

  const byClient = {};
  done.forEach(t => {
    const k = t.clientId;
    if (!byClient[k]) byClient[k] = [];
    byClient[k].push(t);
  });

  if (!Object.keys(byClient).length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <div class="empty-ico">✅</div>
      <div class="empty-txt">Aucune tâche terminée sur cette période</div>
    </div>`;
    return;
  }

  grid.innerHTML = Object.entries(byClient)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([cidStr, tasks]) => {
      const c = gc(parseInt(cidStr));
      if (!c) return '';
      const totalForClient = cTasks(c.id).length || 1;
      const pct     = Math.round(tasks.length / totalForClient * 100);
      const hours   = tasks.reduce((s, t) => s + (t.realHours || t.estimatedHours || 0), 0);
      const lastD   = tasks[0]?.completedDate || tasks[0]?.endDate;
      const onTime  = tasks.filter(t => t.realHours && t.estimatedHours && t.realHours <= t.estimatedHours).length;
      const onTimePct = tasks.length ? Math.round(onTime / tasks.length * 100) : 0;
      const meta    = SECTORS_META[c.sector] || { icon:'◈' };

      // mini timeline (last 5)
      const last5 = tasks.slice(0, 5);
      const timelineHTML = last5.map(t => {
        const dt = t.completedDate || t.endDate;
        return `<div style="padding:6px 10px;background:var(--surface2);border-radius:6px;border-left:2px solid ${c.color};font-size:11.5px">
          <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.name)}</div>
          <div style="color:var(--text-muted);font-size:10.5px;margin-top:2px">
            ${dt ? fmtDate(dt) : '—'} ${t.assignedTo ? '· 👤 ' + esc(t.assignedTo) : ''}
          </div>
        </div>`;
      }).join('');

      return `<div class="card" style="border-top:3px solid ${c.color}">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <div class="cc-avatar" style="background:${c.color};width:38px;height:38px;font-size:12px">${esc(c.avatar)}</div>
          <div style="flex:1">
            <div style="font-family:var(--head);font-size:14px;font-weight:700">${esc(c.name)}</div>
            <div style="font-size:11px;color:var(--text-muted)">${meta.icon} ${esc(c.sector)}</div>
          </div>
          <div style="font-family:var(--mono);font-size:26px;font-weight:700;color:${c.color}">${tasks.length}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px;margin-bottom:12px">
          <div class="mstat"><span>✅</span><span class="mstat-lbl">Tâches livrées</span>
            <span class="mstat-val" style="color:var(--green)">${tasks.length}</span></div>
          <div class="mstat"><span>⏱</span><span class="mstat-lbl">Heures réalisées</span>
            <span class="mstat-val" style="color:var(--purple)">${hours}h</span></div>
          <div class="mstat"><span>🎯</span><span class="mstat-lbl">À temps</span>
            <span class="mstat-val" style="color:${onTimePct>=80?'var(--green)':'var(--amber)'}">${onTimePct}%</span></div>
          ${lastD ? `<div class="mstat"><span>📅</span><span class="mstat-lbl">Dernière livraison</span>
            <span class="mstat-val" style="font-size:11px">${fmtDate(lastD)}</span></div>` : ''}
        </div>
        <!-- Barre complétion -->
        <div style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:4px">
            <span>Taux complétion total</span>
            <span style="color:${c.color};font-family:var(--mono);font-weight:700">${pct}%</span>
          </div>
          <div class="pbar" style="height:6px">
            <div class="pfill" style="width:${pct}%;background:linear-gradient(90deg,${c.color},${c.color}88)"></div>
          </div>
        </div>
        <!-- Mini timeline -->
        ${tasks.length ? `<div>
          <div style="font-size:10.5px;color:var(--text-muted);font-family:var(--mono);letter-spacing:.5px;margin-bottom:6px">
            DERNIÈRES LIVRAISONS</div>
          <div style="display:flex;flex-direction:column;gap:5px">${timelineHTML}</div>
        </div>` : ''}
        <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:12px;justify-content:center"
          onclick="openClientDetail(${c.id})">🔍 Voir la fiche client</button>
      </div>`;
    }).join('');
}

// ── Vue Évolution (Chart) ──
function _renderChart(done) {
  // Build last 6 months labels
  const now    = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key:   d.toISOString().slice(0, 7),
      label: d.toLocaleDateString('fr', { month: 'short', year: '2-digit' })
    });
  }

  // Clients impliqués
  const activeCids = [...new Set(done.map(t => t.clientId))];
  const clients    = DB.clients.filter(c => activeCids.includes(c.id));

  const type = window._suiviChartType || 'bar';

  const datasets = clients.map(c => ({
    label:           c.name,
    data:            months.map(m =>
      done.filter(t => t.clientId === c.id && (t.completedDate || t.endDate || '').startsWith(m.key)).length
    ),
    backgroundColor: type === 'line' ? c.color + '33' : c.color + 'bb',
    borderColor:     c.color,
    borderWidth:     2,
    borderRadius:    type === 'bar' ? 5 : 0,
    fill:            type === 'line',
    tension:         0.35,
    pointRadius:     type === 'line' ? 4 : 0,
  }));

  if (window._suiviChart) { window._suiviChart.destroy(); window._suiviChart = null; }
  const ctx = document.getElementById('sv-chart');
  if (!ctx) return;
  const d = cDef();
  window._suiviChart = new Chart(ctx, {
    type:    type,
    data:    { labels: months.map(m => m.label), datasets },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: d.text, font: { size: 11 }, padding: 14 }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label} : ${ctx.parsed.y} tâche${ctx.parsed.y > 1 ? 's' : ''}`
          }
        }
      },
      scales: {
        x: { grid: { color: d.grid }, ticks: { color: d.text } },
        y: { grid: { color: d.grid }, ticks: { color: d.text, stepSize: 1 }, beginAtZero: true }
      }
    }
  });

  // ── Ranking panel ──
  const rankEl = document.getElementById('sv-ranking');
  if (!rankEl) return;
  const ranked = clients
    .map(c => ({ c, count: done.filter(t => t.clientId === c.id).length }))
    .sort((a, b) => b.count - a.count);
  const maxCount = ranked[0]?.count || 1;
  rankEl.innerHTML = ranked.map((row, i) => {
    const pct = Math.round(row.count / maxCount * 100);
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:16px;width:26px;text-align:center">${medal}</span>
      <div class="cc-avatar" style="background:${row.c.color};width:28px;height:28px;font-size:10px;border-radius:6px">${esc(row.c.avatar)}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700">${esc(row.c.name)}</div>
        <div style="height:5px;background:var(--surface2);border-radius:3px;margin-top:4px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${row.c.color};border-radius:3px;transition:width .8s ease"></div>
        </div>
      </div>
      <span style="font-family:var(--mono);font-size:13px;font-weight:700;color:${row.c.color}">${row.count}</span>
    </div>`;
  }).join('') || '<div style="color:var(--text-muted);font-size:12px;padding:12px">Aucune donnée sur cette période.</div>';
}

// ── Export CSV global ──
function exportSuiviCSV() {
  const done = window._suiviDone || [];
  let csv = 'Tâche,Client,Projet,Date terminée,Assigné,H.Est.,H.Réelles,Perf.\n';
  done.forEach(t => {
    const c = gc(t.clientId), pj = gp(t.projectId);
    const dt   = t.completedDate || t.endDate || '';
    const perf = (t.realHours && t.estimatedHours)
      ? Math.round(t.estimatedHours / t.realHours * 100) + '%' : '';
    csv += `"${t.name}","${c?.name||''}","${pj?.name||''}","${dt}","${t.assignedTo||''}",${t.estimatedHours||0},${t.realHours||''},"${perf}"\n`;
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'suivi-taches.csv';
  a.click();
  showToast('📊', 'Export CSV terminé !', 'var(--accent)');
}
