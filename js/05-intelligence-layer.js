(function(){
  'use strict';

  function classifyClients(){
    const active = DB.clients.filter(c => c.type !== 'prospect' && c.type !== 'appeloffre' && !c.closedAt);
    const prospects = getProspects().filter(c => !c.closedAt);
    const appels = DB.clients.filter(c => c.type === 'appeloffre' && !c.closedAt);
    const closed = DB.clients.filter(c => !!c.closedAt);
    return { active, prospects, appels, closed };
  }

  function computeIntelligence(){
    const tasks = DB.tasks||[];
    const invoices = DB.invoices||[];
    const team = DB.team||[];
    const now = new Date();

    const doneTasks = tasks.filter(t=>t.status==='Terminé');
    const activeTasks = tasks.filter(t=>t.status!=='Terminé');
    const lateActiveTasks = activeTasks.filter(t=>t.endDate && new Date(t.endDate) < now);
    const { active, prospects, appels, closed } = classifyClients();

    const ratedTasks = doneTasks.filter(t=>typeof t.qualityRating === 'number' && !isNaN(t.qualityRating));
    const revTasks = doneTasks.filter(t=>typeof t.revisions === 'number' && !isNaN(t.revisions));

    // 1. Creative Quality Score
    let creativeQuality = null;
    if (ratedTasks.length) {
      creativeQuality = Math.round(ratedTasks.reduce((s,t)=>s+t.qualityRating,0)/ratedTasks.length/5*100);
    } else if (revTasks.length) {
      const avgRev = revTasks.reduce((s,t)=>s+(t.revisions||0),0)/revTasks.length;
      creativeQuality = Math.round(Math.max(0,100-avgRev*18));
    }

    // 2. Brief Quality Score
    // STRATEGIE-PRODUIT.md C.8 : la longueur brute d'un champ texte libre est
    // un proxy grossier ("un brief long est-il vraiment un bon brief ?").
    // Un brief structuré (objectifs/audience/ton/contraintes/échéance,
    // formulaire dédié dans le modal client) donne une mesure réelle de
    // complétude. Les clients jamais migrés vers ce formulaire retombent sur
    // l'ancien calcul par longueur, plafonné plus bas — pour ne pas les
    // pénaliser à zéro, tout en incitant à migrer.
    const briefPool = [...active,...prospects,...appels];
    let briefQuality = null;
    if (briefPool.length) {
      const scored = briefPool.map(c=>{
        let s=0;
        const hasStructuredBrief = !!(c.briefObjectives || c.briefAudience || c.briefTone || c.briefConstraints || c.briefDeadline);
        if (hasStructuredBrief) {
          if ((c.briefObjectives||'').trim()) s+=25;
          if ((c.briefAudience||'').trim()) s+=20;
          if ((c.briefTone||'').trim()) s+=10;
          if ((c.briefConstraints||'').trim()) s+=10;
          if (c.briefDeadline) s+=10;
        } else {
          const briefLen = (c.brief||'').trim().length;
          if (briefLen>=200) s+=55; else if(briefLen>=80) s+=35; else if(briefLen>=20) s+=15;
        }
        if ((c.needs||[]).length>=2) s+=15; else if((c.needs||[]).length===1) s+=7;
        if (c.budget) s+=10;
        return Math.min(100,s);
      });
      briefQuality = Math.round(scored.reduce((a,b)=>a+b,0)/scored.length);
    }

    // 3. Concept Strength
    let conceptStrength = null;
    if (revTasks.length) {
      conceptStrength = Math.round(revTasks.filter(t=>(t.revisions||0)<=1).length/revTasks.length*100);
    }

    // 4. Validation Efficiency
    const effTasks = doneTasks.filter(t=>t.estimatedHours && t.realHours);
    let validationEfficiency = null;
    if (effTasks.length) {
      const ratios = effTasks.map(t=>Math.min(100, Math.round(t.estimatedHours/t.realHours*100)));
      validationEfficiency = Math.round(ratios.reduce((a,b)=>a+b,0)/ratios.length);
    }

    // 5. Revision Rate (raw avg, not %)
    let revisionRate = null;
    if (revTasks.length) {
      revisionRate = +(revTasks.reduce((s,t)=>s+(t.revisions||0),0)/revTasks.length).toFixed(1);
    }

    // 6. First-Time-Right Rate
    let firstTimeRight = null;
    if (revTasks.length) {
      firstTimeRight = Math.round(revTasks.filter(t=>(t.revisions||0)===0).length/revTasks.length*100);
    }

    // 7. Creative Bottleneck Index (higher = worse)
    const bottleneckIndex = activeTasks.length ? Math.round(lateActiveTasks.length/activeTasks.length*100) : 0;

    // 8. Client Friction Index (higher = worse)
    const lateInvoices = invoices.filter(i=>i.status==='En retard');
    const lateInvoiceRatio = invoices.length ? lateInvoices.length/invoices.length : 0;
    let highFrictionClients = 0, frictionEligible = 0;
    active.forEach(c=>{
      const ts = revTasks.filter(t=>t.clientId===c.id);
      if (ts.length) {
        frictionEligible++;
        const avg = ts.reduce((s,t)=>s+(t.revisions||0),0)/ts.length;
        if (avg>=2) highFrictionClients++;
      }
    });
    const clientRevRatio = frictionEligible ? highFrictionClients/frictionEligible : 0;
    const clientFriction = Math.round(lateInvoiceRatio*60 + clientRevRatio*40);

    // 9. SLA Compliance
    const slaDoneTasks = doneTasks.filter(t=>t.completedDate && t.endDate);
    const totalConsidered = slaDoneTasks.length + activeTasks.length;
    let slaCompliance = null;
    if (totalConsidered) {
      const onTimeDone = slaDoneTasks.filter(t=>new Date(t.completedDate) <= new Date(t.endDate)).length;
      const onTimeActive = activeTasks.length - lateActiveTasks.length;
      slaCompliance = Math.round((onTimeDone+onTimeActive)/totalConsidered*100);
    }

    // 10. Creative Capacity (utilization %, ~100 = balanced)
    const openHours = activeTasks.reduce((s,t)=>s+(t.estimatedHours||0),0);
    const teamSize = Math.max(1, team.length);
    const weeklyBenchmarkHours = teamSize*35;
    const creativeCapacity = Math.round(Math.min(220, (openHours/Math.max(1,weeklyBenchmarkHours))*100));

    // 11. Creative ROI (relative to 15 000 XOF/h benchmark)
    const paidRevenue = invoices.filter(i=>i.status==='Payée').reduce((s,i)=>s+i.amount,0);
    const totalHoursSpent = tasks.reduce((s,t)=>s+(t.realHours||t.estimatedHours||0),0);
    let creativeROI = null;
    if (totalHoursSpent>0) {
      creativeROI = Math.round(Math.min(150, (paidRevenue/totalHoursSpent)/15000*100));
    }

    // 12. Innovation Score
    let innovationScore = null;
    {
      const parts = [firstTimeRight, conceptStrength].filter(v=>v!==null);
      if (parts.length) innovationScore = Math.round(parts.reduce((a,b)=>a+b,0)/parts.length);
    }

    // 13. Team Creative Health
    const capacityBalance = 100 - Math.abs(100-creativeCapacity);
    const healthParts = [100-bottleneckIndex, slaCompliance, capacityBalance].filter(v=>v!==null && !isNaN(v));
    const teamHealth = healthParts.length ? Math.round(healthParts.reduce((a,b)=>a+b,0)/healthParts.length) : null;

    // 14. Predictive Risk (higher = more risk)
    const riskParts = [
      bottleneckIndex,
      clientFriction,
      slaCompliance!==null ? 100-slaCompliance : null,
      creativeCapacity>100 ? Math.min(100,creativeCapacity-100) : 0
    ].filter(v=>v!==null && !isNaN(v));
    const predictiveRisk = riskParts.length ? Math.round(riskParts.reduce((a,b)=>a+b,0)/riskParts.length) : null;

    return {
      creativeQuality, briefQuality, conceptStrength, validationEfficiency, revisionRate,
      firstTimeRight, bottleneckIndex, clientFriction, slaCompliance, creativeCapacity,
      creativeROI, innovationScore, teamHealth, predictiveRisk,
      raw: { tasks, doneTasks, activeTasks, lateActiveTasks, active, prospects, appels, closed,
             lateInvoices, invoices, openHours, teamSize, weeklyBenchmarkHours, paidRevenue,
             totalHoursSpent, revTasks, ratedTasks, highFrictionClients, frictionEligible }
    };
  }

  // ── Metric configuration: display + status thresholds + why/next/decision templates ──
  const METRICS = [
    { key:'creativeQuality', label:'Creative Quality Score', icon:'🎨', unit:'%', dir:'high',
      note:(v,r)=> r.ratedTasks.length ? `Basé sur ${r.ratedTasks.length} évaluation(s) créative(s).` : (r.revTasks.length ? `Estimé à partir des révisions (aucune note qualité saisie).` : `Pas encore de données — notez la qualité en clôturant une tâche.`) },
    { key:'briefQuality', label:'Brief Quality Score', icon:'📝', unit:'%', dir:'high',
      note:(v,r)=> `Basé sur ${r.active.length+r.prospects.length+r.appels.length} brief(s) client.` },
    { key:'conceptStrength', label:'Concept Strength', icon:'💡', unit:'%', dir:'high',
      note:(v,r)=> `Part des concepts validés en 0-1 aller-retour.` },
    { key:'validationEfficiency', label:'Validation Efficiency', icon:'✅', unit:'%', dir:'high',
      note:(v,r)=> `Ratio heures estimées / heures réelles sur les tâches closes.` },
    { key:'revisionRate', label:'Revision Rate', icon:'🔁', unit:'/tâche', dir:'low-raw',
      note:(v,r)=> `Moyenne de révisions client par tâche livrée.` },
    { key:'firstTimeRight', label:'First-Time-Right Rate', icon:'🎯', unit:'%', dir:'high',
      note:(v,r)=> `Tâches livrées sans aucune révision.` },
    { key:'creativeBottleneck', srcKey:'bottleneckIndex', label:'Creative Bottleneck Index', icon:'🚧', unit:'%', dir:'low',
      note:(v,r)=> `${r.lateActiveTasks.length} tâche(s) en cours dépassent leur échéance.` },
    { key:'clientFriction', label:'Client Friction Index', icon:'⚡', unit:'%', dir:'low',
      note:(v,r)=> `${r.lateInvoices.length} facture(s) en retard, ${r.highFrictionClients} client(s) à fortes révisions.` },
    { key:'slaCompliance', label:'SLA Compliance', icon:'⏱️', unit:'%', dir:'high',
      note:(v,r)=> `Respect des échéances sur tâches actives + clôturées.` },
    { key:'creativeCapacity', label:'Creative Capacity', icon:'📦', unit:'%', dir:'target100',
      note:(v,r)=> `${r.openHours}h de travail ouvert pour ${r.teamSize} membre(s) (~${r.weeklyBenchmarkHours}h/sem. dispo).` },
    { key:'creativeROI', label:'Creative ROI', icon:'💰', unit:'%', dir:'high',
      note:(v,r)=> `Indice vs. benchmark de 15 000 XOF/heure facturée.` },
    { key:'innovationScore', label:'Innovation Score', icon:'✨', unit:'%', dir:'high',
      note:(v,r)=> `Combine concepts justes du 1er coup + solidité conceptuelle.` },
    { key:'teamHealth', label:'Team Creative Health', icon:'🧑‍🤝‍🧑', unit:'%', dir:'high',
      note:(v,r)=> `Synthèse charge / retards / respect des délais de l'équipe.` },
    { key:'predictiveRisk', label:'Predictive Risk', icon:'🔮', unit:'%', dir:'low',
      note:(v,r)=> `Risque composite qu'un délai ou un client se dégrade sous 2-3 semaines.` },
  ];

  function statusOf(dir, v){
    if (v===null || v===undefined || isNaN(v)) return 'na';
    if (dir==='high') return v>=70?'healthy':v>=40?'watch':'critical';
    if (dir==='low')  return v<=20?'healthy':v<=45?'watch':'critical';
    if (dir==='low-raw') return v<=1?'healthy':v<=2.5?'watch':'critical'; // revision rate, raw count
    if (dir==='target100') return (v>=80&&v<=115)?'healthy':((v>=60&&v<130)?'watch':'critical');
    return 'na';
  }

  function fmtVal(m, v){
    if (v===null || v===undefined || isNaN(v)) return '—';
    return m.unit==='/tâche' ? v.toFixed(1) : Math.round(v);
  }

  function computeDisplayMetrics(intel){
    return METRICS.map(m=>{
      const v = intel[m.srcKey||m.key];
      return { ...m, value:v, status: statusOf(m.dir, v) };
    });
  }

  function renderCard(m, raw){
    const pillLabel = {healthy:'Sain', watch:'À surveiller', critical:'Critique', na:'N/A'}[m.status];
    return `<div class="mcps-card">
      <div class="mcps-card-top">
        <span class="mcps-card-icon">${m.icon}</span>
        <span class="mcps-pill ${m.status}">${pillLabel}</span>
      </div>
      <div class="mcps-card-val">${fmtVal(m,m.value)}<span>${m.value!==null&&!isNaN(m.value)?m.unit:''}</span></div>
      <div class="mcps-card-lbl">${m.label}</div>
      <div class="mcps-card-note">${m.note(m.value, raw)}</div>
    </div>`;
  }

  // ── Diagnostic engine: "Pourquoi / Ce qui va suivre / Décision" ──
  function diagnosticFor(m, raw){
    const v = m.value;
    const key = m.srcKey||m.key;
    const bank = {
      creativeQuality:{
        critical:{why:`Le score qualité créative est bas (${fmtVal(m,v)}%) : les tâches closes cumulent trop de révisions ou des notes faibles.`,
          next:`Sans intervention, les prochains livrables client risquent le même niveau d'insatisfaction et davantage d'allers-retours.`,
          decision:`Instaurer une relecture créative interne avant envoi client sur les prochains livrables.`},
        watch:{why:`La qualité créative est correcte mais irrégulière (${fmtVal(m,v)}%).`,
          next:`Le score peut basculer côté positif ou négatif selon les 2-3 prochaines livraisons.`,
          decision:`Cibler un brief de cadrage plus poussé sur les tâches à fort enjeu client.`},
        healthy:{why:`Les tâches closes montrent peu de révisions et/ou de bonnes notes qualité (${fmtVal(m,v)}%).`,
          next:`Ce niveau de qualité, s'il est maintenu, renforce la confiance client sur les prochains cycles.`,
          decision:`Documenter ce qui fonctionne (brief, process) pour le répliquer sur les nouveaux comptes.`} },
      briefQuality:{
        critical:{why:`Beaucoup de briefs clients sont incomplets ou trop courts (${fmtVal(m,v)}%).`,
          next:`Des briefs faibles entraînent mécaniquement plus de révisions et un Concept Strength plus bas dans les semaines à venir.`,
          decision:`Imposer un template de brief obligatoire (besoins, budget, contraintes) avant tout démarrage de projet.`},
        watch:{why:`La qualité des briefs est hétérogène selon les clients (${fmtVal(m,v)}%).`,
          next:`Les projets démarrés sur un brief faible sont ceux qui risquent le plus de dériver en heures.`,
          decision:`Auditer les 2-3 briefs les plus courts avant leur passage en production.`},
        healthy:{why:`Les briefs sont globalement complets et détaillés (${fmtVal(m,v)}%).`,
          next:`Cette base solide limite le risque de dérive créative sur les projets en cours.`,
          decision:`Maintenir l'exigence de brief structuré sur les nouveaux clients entrants.`} },
      conceptStrength:{
        critical:{why:`Peu de concepts sont validés du premier coup (${fmtVal(m,v)}%) : trop d'allers-retours dès la phase concept.`,
          next:`Ce schéma tend à s'aggraver si le cadrage initial (brief, objectifs) n'est pas renforcé en amont.`,
          decision:`Ajouter une étape de validation de direction créative avant développement complet du concept.`},
        watch:{why:`Les concepts tiennent la route dans l'ensemble, avec quelques dérapages (${fmtVal(m,v)}%).`,
          next:`Une dérive reste possible sur les projets sans brief solide.`,
          decision:`Renforcer le brief sur les projets où le Brief Quality Score est faible.`},
        healthy:{why:`La grande majorité des concepts sont validés dès le premier ou deuxième tour (${fmtVal(m,v)}%).`,
          next:`Cette solidité conceptuelle réduit la charge de révision à venir.`,
          decision:`Capitaliser sur cette méthode de cadrage pour les futurs pitchs.`} },
      validationEfficiency:{
        critical:{why:`Le temps réel dépasse largement le temps estimé sur les tâches closes (${fmtVal(m,v)}%).`,
          next:`Si l'écart persiste, la rentabilité des projets en cours va se dégrader et les délais vont glisser.`,
          decision:`Revoir les estimations d'heures sur le type de tâches concerné et resserrer le suivi en cours de route.`},
        watch:{why:`L'efficacité de validation est correcte mais avec de la marge (${fmtVal(m,v)}%).`,
          next:`Un dérapage modéré est probable sur les tâches les plus complexes si rien n'est ajusté.`,
          decision:`Repérer les 2-3 tâches avec le plus grand écart heures réelles/estimées et comprendre pourquoi.`},
        healthy:{why:`Le temps réel colle bien aux estimations (${fmtVal(m,v)}%).`,
          next:`Les délais et marges restent prévisibles sur cette dynamique.`,
          decision:`Utiliser ce référentiel d'heures pour chiffrer les prochains devis similaires.`} },
      revisionRate:{
        critical:{why:`Chaque tâche livrée génère en moyenne ${fmtVal(m,v)} révision(s) client — c'est élevé.`,
          next:`À ce rythme, la charge de retouche va continuer à grignoter la capacité de l'équipe.`,
          decision:`Ajouter un point de validation intermédiaire avec le client avant la livraison finale.`},
        watch:{why:`Le taux de révision est modéré (${fmtVal(m,v)}/tâche) mais perfectible.`,
          next:`Une légère hausse du cadrage amont peut encore faire baisser ce chiffre.`,
          decision:`Renforcer le brief sur les tâches où plus d'une révision a déjà eu lieu.`},
        healthy:{why:`Le taux de révision est bas (${fmtVal(m,v)}/tâche) — les livrables sont validés rapidement.`,
          next:`Ce rythme soutient une meilleure marge et une meilleure capacité disponible.`,
          decision:`Rien à corriger — surveiller que ce niveau se maintienne avec la charge à venir.`} },
      firstTimeRight:{
        critical:{why:`Seules ${fmtVal(m,v)}% des tâches sont validées sans aucune révision.`,
          next:`Le volume de retouches va continuer à consommer du temps équipe si le cadrage ne change pas.`,
          decision:`Mettre en place une checklist de pré-validation interne avant envoi au client.`},
        watch:{why:`Un peu moins de la moitié à la majorité des tâches passent du premier coup (${fmtVal(m,v)}%).`,
          next:`Ce taux peut encore progresser avec un cadrage plus précis en amont.`,
          decision:`Identifier les tâches récurrentes avec révision et ajuster leur processus de brief.`},
        healthy:{why:`La majorité des tâches sont validées du premier coup (${fmtVal(m,v)}%).`,
          next:`Cette efficacité libère du temps équipe pour plus de projets ou plus de qualité.`,
          decision:`Documenter le process actuel comme standard interne.`} },
      bottleneckIndex:{
        critical:{why:`${fmtVal(m,v)}% des tâches en cours ont dépassé leur échéance — un vrai goulot d'étranglement.`,
          next:`Sans réaffectation, les retards vont s'accumuler sur les projets en aval et les prochaines échéances.`,
          decision:`Réaffecter en priorité les tâches en retard vers les membres disponibles dès aujourd'hui.`},
        watch:{why:`Quelques tâches commencent à accumuler du retard (${fmtVal(m,v)}%).`,
          next:`Le risque de blocage grandit si ces tâches restent sans mise à jour.`,
          decision:`Faire un point rapide sur les tâches en retard avant qu'elles ne bloquent la suite.`},
        healthy:{why:`Très peu de tâches sont en retard (${fmtVal(m,v)}%) — le flux de travail est fluide.`,
          next:`Ce rythme laisse de la marge pour absorber un imprévu sans dérailler.`,
          decision:`Rien d'urgent — garder ce niveau de suivi actuel.`} },
      clientFriction:{
        critical:{why:`Facturation en retard et clients à fortes révisions se cumulent (indice ${fmtVal(m,v)}%).`,
          next:`Ce niveau de friction précède souvent un risque de perte de client ou de tension sur le renouvellement.`,
          decision:`Programmer un point client sur les comptes les plus en tension (factures en retard + révisions élevées).`},
        watch:{why:`Une friction modérée apparaît sur certains clients (indice ${fmtVal(m,v)}%).`,
          next:`Sans ajustement, ces comptes peuvent glisser vers un niveau de friction critique.`,
          decision:`Relancer les factures en retard et clarifier les attentes avec les clients concernés.`},
        healthy:{why:`Peu de tension côté clients : factures à jour et révisions maîtrisées (indice ${fmtVal(m,v)}%).`,
          next:`La relation client reste sur une trajectoire saine.`,
          decision:`Poursuivre le rythme de facturation et de communication actuel.`} },
      slaCompliance:{
        critical:{why:`Le respect des échéances est faible (${fmtVal(m,v)}%).`,
          next:`Les prochains délais annoncés aux clients risquent également de ne pas être tenus.`,
          decision:`Revoir les échéances des tâches les plus à risque et communiquer proactivement si nécessaire.`},
        watch:{why:`Le respect des délais est correct mais fragile (${fmtVal(m,v)}%).`,
          next:`Un pic de charge pourrait faire basculer ce chiffre en zone critique.`,
          decision:`Prioriser les tâches proches de leur échéance dans les prochains jours.`},
        healthy:{why:`Les échéances sont largement tenues (${fmtVal(m,v)}%).`,
          next:`Les engagements clients restent fiables sur cette trajectoire.`,
          decision:`Maintenir le processus de suivi actuel des délais.`} },
      creativeCapacity:{
        critical:{why: v>115 ? `La charge ouverte dépasse largement la capacité de l'équipe (${fmtVal(m,v)}% d'utilisation).` : `L'équipe est en sous-charge (${fmtVal(m,v)}% d'utilisation) : peu de travail ouvert par rapport à sa capacité.`,
          next: v>115 ? `Sans arbitrage, les délais vont se dégrader sur l'ensemble des projets en cours.` : `Ce temps disponible non utilisé représente un manque à gagner s'il n'est pas réorienté.`,
          decision: v>115 ? `Prioriser ou reporter certaines tâches, ou renforcer temporairement l'équipe sur les projets en tension.` : `Avancer des tâches à venir ou lancer une prospection commerciale pour occuper cette capacité.`},
        watch:{why:`L'utilisation de la capacité s'écarte légèrement de l'équilibre (${fmtVal(m,v)}%).`,
          next:`Une charge supplémentaire ou un imprévu pourrait faire basculer la situation.`,
          decision:`Surveiller la répartition de charge par membre d'équipe sur les 2 prochaines semaines.`},
        healthy:{why:`La charge de travail ouverte est équilibrée avec la capacité de l'équipe (${fmtVal(m,v)}%).`,
          next:`Cet équilibre soutient à la fois les délais et la qualité créative.`,
          decision:`Rien à ajuster — reconduire la répartition de charge actuelle.`} },
      creativeROI:{
        critical:{why:`Le revenu généré par heure travaillée est faible par rapport au benchmark (${fmtVal(m,v)}%).`,
          next:`Sans ajustement tarifaire ou d'efficacité, la rentabilité des projets va rester sous pression.`,
          decision:`Revoir la grille tarifaire ou le temps alloué sur les prestations les moins rentables.`},
        watch:{why:`Le ROI créatif est dans la moyenne, avec de la marge de progression (${fmtVal(m,v)}%).`,
          next:`De petits gains d'efficacité peuvent significativement améliorer ce chiffre.`,
          decision:`Identifier les projets les plus chronophages par rapport à leur facturation.`},
        healthy:{why:`Le revenu généré par heure travaillée dépasse le benchmark (${fmtVal(m,v)}%).`,
          next:`Cette rentabilité soutient la capacité à réinvestir (recrutement, outils, formation).`,
          decision:`Répliquer le modèle de tarification/efficacité des projets les plus rentables.`} },
      innovationScore:{
        critical:{why:`Les concepts peinent à convaincre du premier coup (${fmtVal(m,v)}%), signe d'un manque de solidité créative en amont.`,
          next:`Sans renforcement du cadrage, la capacité à proposer des concepts différenciants va rester limitée.`,
          decision:`Organiser une session de brainstorming cadrée avant le prochain brief à fort enjeu.`},
        watch:{why:`La capacité d'innovation est présente mais inégale (${fmtVal(m,v)}%).`,
          next:`Les prochains projets à fort enjeu créatif méritent une attention particulière au cadrage.`,
          decision:`Allouer plus de temps de recherche créative sur les projets stratégiques.`},
        healthy:{why:`Les concepts sont solides et bien reçus dès le départ (${fmtVal(m,v)}%).`,
          next:`Cette dynamique renforce le positionnement créatif de l'agence auprès des clients.`,
          decision:`Valoriser ces cas auprès des prospects comme preuve de savoir-faire.`} },
      teamHealth:{
        critical:{why:`Plusieurs signaux se dégradent en même temps (retards, délais, charge) — santé créative de l'équipe fragile (${fmtVal(m,v)}%).`,
          next:`Sans action, le risque d'épuisement ou de baisse de qualité augmente sur les prochaines semaines.`,
          decision:`Faire un point d'équipe pour rééquilibrer la charge et clarifier les priorités immédiates.`},
        watch:{why:`La santé de l'équipe est correcte mais sous tension sur certains points (${fmtVal(m,v)}%).`,
          next:`Un cumul de charge et de retards pourrait faire basculer la situation.`,
          decision:`Vérifier la répartition de charge individuelle et ajuster si un membre est en surcharge.`},
        healthy:{why:`Charge, délais et qualité sont globalement équilibrés (${fmtVal(m,v)}%).`,
          next:`Cette stabilité soutient la capacité de l'équipe à absorber de nouveaux projets.`,
          decision:`Maintenir le rythme et la répartition de charge actuels.`} },
      predictiveRisk:{
        critical:{why:`Plusieurs signaux (retards, friction client, charge) pointent dans la même direction : risque élevé (${fmtVal(m,v)}%).`,
          next:`Sans action, un ou plusieurs projets risquent concrètement de déraper dans les 2 à 3 prochaines semaines.`,
          decision:`Prioriser dès aujourd'hui les tâches en retard sur les comptes les plus à risque et en informer les clients concernés.`},
        watch:{why:`Certains signaux méritent une surveillance rapprochée (risque à ${fmtVal(m,v)}%).`,
          next:`Sans dérive supplémentaire, la situation devrait rester gérable.`,
          decision:`Revoir ce tableau de bord dans les prochains jours pour confirmer la tendance.`},
        healthy:{why:`Les indicateurs de risque restent bas (${fmtVal(m,v)}%).`,
          next:`Aucun signal ne laisse présager de dérive imminente.`,
          decision:`Poursuivre le pilotage actuel, sans action corrective nécessaire.`} },
    };
    const entry = bank[key];
    if (!entry || m.status==='na') return null;
    return entry[m.status] || null;
  }

  function pickDiagnostic(displayMetrics, raw){
    const dataPoints = raw.tasks.length + raw.invoices.length + raw.active.length + raw.prospects.length + raw.appels.length;
    const withData = dataPoints >= 3 ? displayMetrics.filter(m=>m.status!=='na') : [];
    if (!withData.length) return null;
    const rank = {critical:0, watch:1, healthy:2};
    const sorted = [...withData].sort((a,b)=>rank[a.status]-rank[b.status]);
    const worst = sorted[0];
    const second = sorted.find(m=>m!==worst && m.status!=='healthy') || sorted[1];
    const best = [...sorted].reverse().find(m=>m.status==='healthy');
    const worstDiag = diagnosticFor(worst, raw);
    const secondDiag = second && second!==worst ? diagnosticFor(second, raw) : null;
    const bestDiag = best ? diagnosticFor(best, raw) : null;
    const overallBadge = worst.status==='critical' ? {c:'critical',l:'Attention requise'} : worst.status==='watch' ? {c:'watch',l:'À surveiller'} : {c:'healthy',l:'Situation saine'};
    return { worst, second, best, worstDiag, secondDiag, bestDiag, overallBadge };
  }

  function renderDiagnostic(displayMetrics, raw){
    const picked = pickDiagnostic(displayMetrics, raw);
    if (!picked) {
      return `<div class="mcps-diag">
        <div class="mcps-diag-hd">🧠 Diagnostic MCPS</div>
        <div class="mcps-diag-col-body" style="color:var(--text-muted)">Pas encore assez de données pour un diagnostic. Renseignez quelques tâches (heures, révisions, qualité) et factures pour activer l'analyse.</div>
      </div>`;
    }
    const { worst, second, best, worstDiag, secondDiag, bestDiag, overallBadge } = picked;

    const whyLines = [worstDiag, secondDiag].filter(Boolean).map((d,i)=>{
      const m = i===0?worst:second;
      return `<div class="mcps-metric-tag">${m.label}</div><div>${d.why}</div>`;
    }).join('<div style="height:8px"></div>');

    const nextLines = [worstDiag, secondDiag].filter(Boolean).map(d=>`<div>${d.next}</div>`).join('<div style="height:8px"></div>');

    const decisionLines = [worstDiag, secondDiag].filter(Boolean).map((d,i)=>`<div>${i+1}. ${d.decision}</div>`).join('');
    const bestLine = bestDiag ? `<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);color:var(--green)">✓ Point fort : ${best.label} — ${bestDiag.decision}</div>` : '';

    return `<div class="mcps-diag">
      <div class="mcps-diag-hd">🧠 Diagnostic MCPS <span class="mcps-diag-badge" style="background:var(--${overallBadge.c==='healthy'?'green':overallBadge.c==='watch'?'amber':'red'}-dim);color:var(--${overallBadge.c==='healthy'?'green':overallBadge.c==='watch'?'amber':'red'})">${overallBadge.l}</span></div>
      <div class="mcps-diag-grid">
        <div class="mcps-diag-col"><div class="mcps-diag-col-ttl">🔍 Pourquoi</div><div class="mcps-diag-col-body">${whyLines}</div></div>
        <div class="mcps-diag-col"><div class="mcps-diag-col-ttl">📈 Ce qui va probablement se passer</div><div class="mcps-diag-col-body">${nextLines}</div></div>
        <div class="mcps-diag-col"><div class="mcps-diag-col-ttl">✔️ Décision à prendre maintenant</div><div class="mcps-diag-col-body">${decisionLines}${bestLine}</div></div>
      </div>
    </div>`;
  }

  function renderIntelligence(){
    const view = document.getElementById('view-intelligence');
    if (!view) return;
    const intel = computeIntelligence();
    const displayMetrics = computeDisplayMetrics(intel);

    view.innerHTML = `
      <div class="mcps-hero">
        <div class="mcps-hero-icon">🧠</div>
        <div>
          <div class="mcps-hero-title">MCPS Intelligence Layer</div>
          <div class="mcps-hero-sub">14 indicateurs de performance créative — calculés en continu à partir de vos données opérationnelles.</div>
        </div>
      </div>
      <!-- STEP 08/09 (Intelligence) : boucle conceptuelle du système, rendue visible.
           Purement présentationnel — chaque étape pointe vers ce qui existe déjà
           plus bas sur la page, aucune nouvelle donnée ni logique. -->
      <div class="mcps-loop">
        <div class="mcps-loop-step"><span class="mcps-loop-num">1</span><div><div class="mcps-loop-ttl">Observe</div><div class="mcps-loop-desc">Données opérationnelles réelles</div></div></div>
        <div class="mcps-loop-arrow">→</div>
        <div class="mcps-loop-step"><span class="mcps-loop-num">2</span><div><div class="mcps-loop-ttl">Interpret</div><div class="mcps-loop-desc">Détection de ce qui pose problème</div></div></div>
        <div class="mcps-loop-arrow">→</div>
        <div class="mcps-loop-step"><span class="mcps-loop-num">3</span><div><div class="mcps-loop-ttl">Decide</div><div class="mcps-loop-desc">Priorisation, recommandation</div></div></div>
        <div class="mcps-loop-arrow">→</div>
        <div class="mcps-loop-step"><span class="mcps-loop-num">4</span><div><div class="mcps-loop-ttl">Act</div><div class="mcps-loop-desc">Action prise dans le cockpit</div></div></div>
        <div class="mcps-loop-arrow">→</div>
        <div class="mcps-loop-step"><span class="mcps-loop-num">5</span><div><div class="mcps-loop-ttl">Measure</div><div class="mcps-loop-desc">Résultat visible au prochain calcul</div></div></div>
      </div>
      <div class="card" style="padding:20px 22px;margin-bottom:18px">
        <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-muted);font-family:var(--mono);margin-bottom:10px">Vue d'ensemble <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-dim)">— étape 1 : Observe</span></div>
        <div id="mcps-radar-chart"></div>
      </div>
      ${renderDiagnostic(displayMetrics, intel.raw)}
      <div class="mcps-grid">
        ${displayMetrics.map(m=>renderCard(m, intel.raw)).join('')}
      </div>
    `;
    _renderIntelligenceRadar(displayMetrics);
  }

  let _mcpsRadarInstance = null;
  function _renderIntelligenceRadar(displayMetrics){
    const el = document.getElementById('mcps-radar-chart');
    if (!el || typeof ApexCharts === 'undefined') return;
    const pctMetrics = displayMetrics.filter(m => m.unit === '%' && m.value !== null && !isNaN(m.value));
    if (_mcpsRadarInstance) { try { _mcpsRadarInstance.destroy(); } catch(e){} _mcpsRadarInstance = null; }
    if (!pctMetrics.length) {
      el.innerHTML = '<div style="color:var(--text-muted);font-size:12.5px;padding:20px 4px">Pas encore assez de données pour la vue d’ensemble — renseignez quelques tâches et clients.</div>';
      return;
    }
    const d = cDef();
    const options = {
      chart: { type:'radar', height: 320, toolbar:{show:false}, background:'transparent', animations:{speed:400} },
      series: [{ name:'Score', data: pctMetrics.map(m=>Math.round(m.value)) }],
      labels: pctMetrics.map(m=>m.label),
      colors: ['#00c8ff'],
      stroke: { width:2 },
      fill: { opacity:0.25 },
      markers: { size:3, colors:['#00c8ff'], strokeWidth:0 },
      yaxis: { max:100, min:0, show:false },
      plotOptions: { radar: { polygons: { strokeColors: d.grid, connectorColors: d.grid } } },
      xaxis: { labels: { style: { colors: pctMetrics.map(()=>d.text), fontSize:'10.5px' } } },
      tooltip: { theme: document.documentElement.getAttribute('data-theme')==='dark'?'dark':'light', y:{ formatter: v => v+'%' } },
      grid: { show:false },
    };
    _mcpsRadarInstance = new ApexCharts(el, options);
    _mcpsRadarInstance.render();
  }

  window.computeIntelligence = computeIntelligence;
  window.renderIntelligence = renderIntelligence;

  function buildFirestoreSummary(){
    const intel = computeIntelligence();
    const displayMetrics = computeDisplayMetrics(intel);
    const picked = pickDiagnostic(displayMetrics, intel.raw);
    const metrics = displayMetrics.map(m=>({key:m.key,label:m.label,icon:m.icon,unit:m.unit,value:(m.value===null||m.value===undefined||isNaN(m.value))?null:m.value,status:m.status}));
    const diagnostic = picked ? {
      badge: picked.overallBadge.l,
      badgeColor: picked.overallBadge.c,
      items: [
        picked.worstDiag ? {label:picked.worst.label, why:picked.worstDiag.why, next:picked.worstDiag.next, decision:picked.worstDiag.decision} : null,
        (picked.secondDiag && picked.second!==picked.worst) ? {label:picked.second.label, why:picked.secondDiag.why, next:picked.secondDiag.next, decision:picked.secondDiag.decision} : null
      ].filter(Boolean),
      best: picked.bestDiag ? {label:picked.best.label, decision:picked.bestDiag.decision} : null
    } : null;
    return {
      updatedAt: new Date().toISOString(),
      kpis: {
        activeClients: intel.raw.active.length,
        activeProjects: (DB.projects||[]).filter(p=>p.status==='En cours').length,
        lateTasks: intel.raw.lateActiveTasks.length,
        lateInvoices: intel.raw.lateInvoices.length
      },
      metrics,
      diagnostic
    };
  }

  let _fbDb = null;
  function _initFirebase(){
    if (_fbDb) return _fbDb;
    if (!MCPS_CONFIG.firebase.apiKey || !MCPS_CONFIG.firebase.projectId) return null; // sync désactivé : aucune config renseignée
    try {
      if (typeof firebase === 'undefined') return null;
      const app = (firebase.apps && firebase.apps.length) ? firebase.apps[0] : firebase.initializeApp(MCPS_CONFIG.firebase);
      _fbDb = firebase.firestore();
      return _fbDb;
    } catch(e) { console.error('MCPS Firebase init error:', e); return null; }
  }

  function syncToCloud(){
    try {
      const db = _initFirebase();
      if (!db) return;
      const payload = buildFirestoreSummary();
      db.collection('cockpit').doc('live').set(payload)
        .catch(e=>console.error('MCPS cloud sync error:', e));
      // Historique : un point horodaté par sauvegarde, pour les tendances dans le temps
      db.collection('cockpit_history').add(payload)
        .catch(e=>console.error('MCPS history sync error:', e));
      maybeSendCriticalAlert(payload);
    } catch(e) { console.error('MCPS cloud sync error:', e); }
  }
  window.syncToCloud = syncToCloud;

  // ── Alerte Slack quand le diagnostic passe en Critique ──
  const SLACK_WEBHOOK_URL = ''; // ex: 'https://hooks.slack.com/services/XXX/YYY/ZZZ' — laisser vide pour désactiver
  let _lastAlertBadge = null;
  function maybeSendCriticalAlert(payload){
    if (!SLACK_WEBHOOK_URL) return;
    const d = payload.diagnostic;
    if (!d || d.badgeColor !== 'critical') { _lastAlertBadge = d ? d.badgeColor : null; return; }
    if (_lastAlertBadge === 'critical') return; // déjà alerté sur cet état, évite le spam
    _lastAlertBadge = 'critical';
    const lines = (d.items||[]).map(it=>`• *${it.label}* — ${it.why}`).join('\n');
    const text = `🔴 *MCPS — Attention requise*\n${lines}`;
    fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({text})
    }).catch(e=>console.error('MCPS Slack alert error:', e));
  }

  // PATCH #2 : les deux anciens wrappers window.saveDB de ce bloc (l'un mort —
  // sync cloud déjà remplacée, l'autre rafraîchissant l'Intelligence Layer)
  // sont remplacés par un hook post-sauvegarde unique et explicite.
  window._mcpsPostSaveHooks.push(() => {
    if (state && state.view === 'intelligence' && typeof renderIntelligence === 'function') renderIntelligence();
  });
})();
