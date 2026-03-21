/**
 * Pre-fetch - Charge le contexte dynamique AVANT l'appel LLM
 * Utilise la DB SQLite locale pour les RDV existants
 */

const { getDb } = require('../../db/database');

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
 * Recupere les RDV existants depuis SQLite pour les 7 prochains jours
 */
function getUpcomingRdv() {
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
 */
function prefetchImmobilier(pushName) {
  const rdvList = getUpcomingRdv();
  const conseiller = process.env.CONSEILLER_NAME || 'Conseiller';

  let context = `[CONTEXTE]\nDate du jour: ${dateJourFr()}\nPrenom client: ${pushName}\nConseiller: ${conseiller}`;

  if (rdvList) {
    context += `\n\nCreneaux deja occupes de ${conseiller}:\n${rdvList}`;
  } else {
    context += `\n\nAucun RDV planifie pour ${conseiller}. Tous les creneaux sont LIBRES (8h-18h lun-ven, 8h-13h samedi).`;
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
