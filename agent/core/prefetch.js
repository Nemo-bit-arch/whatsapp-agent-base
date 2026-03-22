/**
 * Pre-fetch - Charge le contexte dynamique AVANT l'appel LLM
 * Utilise la DB SQLite locale + Google Calendar reel pour les RDV existants
 */

const { getDb } = require('../../db/database');

const N8N_BASE = process.env.N8N_WEBHOOK_BASE || 'https://n8n.srv1332384.hstgr.cloud/webhook';

/**
 * Formate la date du jour en francais
 */
function dateJourFr() {
  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const mois = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
  const now = new Date();
  return `${jours[now.getDay()]} ${now.getDate()} ${mois[now.getMonth()]} ${now.getFullYear()}`;
}

/**
 * Recupere les events du vrai Google Calendar via webhook n8n
 * Retourne un tableau de { summary, start, end }
 */
async function getGoogleCalendarEvents() {
  try {
    const now = new Date();
    const timeMin = now.toISOString();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const timeMax = futureDate.toISOString();

    const res = await fetch(`${N8N_BASE}/agent-calendar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list', timeMin, timeMax })
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { return []; }

    if (data.events && Array.isArray(data.events)) {
      return data.events;
    }
    return [];
  } catch (e) {
    console.error(`[PREFETCH] Erreur Google Calendar:`, e.message);
    return [];
  }
}

/**
 * Formate un event Google Calendar en texte lisible pour l'agent
 */
function formatGcalEvent(event) {
  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const moisNoms = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];

  const startDate = new Date(event.start);
  const jour = jours[startDate.getDay()];
  const dateNum = startDate.getDate();
  const mois = moisNoms[startDate.getMonth()];
  const annee = startDate.getFullYear();
  const heure = `${String(startDate.getHours()).padStart(2, '0')}h${String(startDate.getMinutes()).padStart(2, '0')}`;

  const endDate = new Date(event.end);
  const heureFin = `${String(endDate.getHours()).padStart(2, '0')}h${String(endDate.getMinutes()).padStart(2, '0')}`;

  return `- ${jour} ${dateNum} ${mois} ${annee} de ${heure} a ${heureFin} : ${event.summary || '(occupe)'}`;
}

/**
 * Recupere les RDV existants depuis SQLite (backup si Calendar indisponible)
 */
function getUpcomingRdvFromDb() {
  try {
    const db = getDb();
    const rdvs = db.prepare(`
      SELECT nom_complet, date_rdv, heure_rdv, format_rdv, besoin, conseiller
      FROM rdv
      WHERE statut IN ('pending', 'confirmed')
      ORDER BY date_rdv ASC, heure_rdv ASC
    `).all();

    if (rdvs.length === 0) return '';

    return rdvs.map(r =>
      `- ${r.date_rdv} a ${r.heure_rdv} : ${r.nom_complet} (${r.format_rdv}) - ${r.besoin}`
    ).join('\n');
  } catch (e) {
    return '';
  }
}

/**
 * Pre-fetch pour le secteur immobilier
 * Lit les vrais events Google Calendar + SQLite en fallback
 */
async function prefetchImmobilier(pushName) {
  const conseiller = process.env.CONSEILLER_NAME || 'Conseiller';

  let context = `[CONTEXTE]\nDate du jour: ${dateJourFr()}\nPrenom client: ${pushName}\nConseiller: ${conseiller}`;

  // Tenter de lire le vrai Google Calendar
  const gcalEvents = await getGoogleCalendarEvents();

  if (gcalEvents.length > 0) {
    const eventsList = gcalEvents.map(e => formatGcalEvent(e)).join('\n');
    context += `\n\nCreneaux deja occupes de ${conseiller} (calendrier reel):\n${eventsList}`;
    context += `\n\nATTENTION: Ces creneaux incluent TOUS les RDV de ${conseiller} (clients + personnels). Ne propose JAMAIS un creneau qui chevauche un de ces creneaux.`;
    console.log(`[PREFETCH] ${gcalEvents.length} events Google Calendar charges`);
  } else {
    // Fallback: SQLite uniquement
    const rdvList = getUpcomingRdvFromDb();
    if (rdvList) {
      context += `\n\nCreneaux deja occupes de ${conseiller}:\n${rdvList}`;
    } else {
      context += `\n\nAucun RDV planifie pour ${conseiller}. Tous les creneaux sont LIBRES (8h-18h lun-ven, 8h-13h samedi).`;
    }
    console.log(`[PREFETCH] Google Calendar indisponible, fallback SQLite`);
  }

  context += '\n[/CONTEXTE]';
  return context;
}

/**
 * Pre-fetch generique
 */
function prefetchGeneric(pushName) {
  return `[CONTEXTE]\nDate du jour: ${dateJourFr()}\nPrenom client: ${pushName}\n[/CONTEXTE]`;
}

/**
 * Pre-fetch contexte selon le secteur
 */
async function prefetchContext(sector, pushName) {
  switch (sector) {
    case 'immobilier':
      return prefetchImmobilier(pushName);
    default:
      return prefetchGeneric(pushName);
  }
}

module.exports = { prefetchContext };
