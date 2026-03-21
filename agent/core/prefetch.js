/**
 * Pre-fetch - Charge le contexte dynamique AVANT l'appel Claude
 * Pattern inspire d'Alex Immo: catalogue + calendrier + date du jour
 *
 * Chaque secteur peut definir ses propres sources de contexte.
 * Le contexte est injecte dans le chatInput sous forme [CONTEXTE]...[/CONTEXTE]
 */

const N8N_BASE = process.env.N8N_WEBHOOK_BASE || 'https://n8n.srv1332384.hstgr.cloud/webhook';

/**
 * Fetch HTTP avec timeout et fallback silencieux
 */
async function safeFetch(url, body, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timer);
    return await res.json();
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

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
 * Pre-fetch pour le secteur immobilier
 * Charge le catalogue de biens + les creneaux calendrier
 */
async function prefetchImmobilier(pushName) {
  const [catResult, calResult] = await Promise.all([
    safeFetch(`${N8N_BASE}/immo-biens`, { action: 'get_biens' }),
    safeFetch(`${N8N_BASE}/immo-save`, { type: 'get_events' })
  ]);

  let catalogueBiens = '';
  let calendarSlots = '';

  // Format catalogue
  if (catResult) {
    const biens = (catResult.biens || []).filter(b => b.statut === 'disponible');
    if (biens.length > 0) {
      catalogueBiens = biens.map(b =>
        `- ${b.nom} | ${b.type_bien} | ${b.quartier}, ${b.ville} | ${b.chambres}ch | ${b.surface}m2 | ${b.prix} FCFA/${b.transaction === 'location' ? 'mois' : ''} | Meuble: ${b.meuble || 'non'} | ${b.description || ''}`
      ).join('\n');
    }
  }

  // Format calendrier
  if (calResult) {
    const items = calResult.items || [];
    if (items.length > 0) {
      calendarSlots = items.map(ev => {
        const start = ev.start?.dateTime || ev.start?.date || '';
        const end = ev.end?.dateTime || ev.end?.date || '';
        const summary = ev.summary || 'RDV';
        return `- ${summary}: ${start} → ${end}`;
      }).join('\n');
    }
  }

  let context = `[CONTEXTE]\nDate du jour: ${dateJourFr()}\nPrenom client: ${pushName}`;
  if (catalogueBiens) {
    context += `\n\nCatalogue des biens disponibles:\n${catalogueBiens}`;
  }
  if (calendarSlots) {
    context += `\n\nCreneaux deja occupes de Marianne:\n${calendarSlots}`;
  }
  context += '\n[/CONTEXTE]';

  return context;
}

/**
 * Pre-fetch generique (date + prenom uniquement)
 */
function prefetchGeneric(pushName) {
  return `[CONTEXTE]\nDate du jour: ${dateJourFr()}\nPrenom client: ${pushName}\n[/CONTEXTE]`;
}

/**
 * Pre-fetch contexte selon le secteur
 * @param {string} sector - Secteur detecte
 * @param {string} pushName - Nom du client
 * @returns {string|null} Bloc de contexte a injecter dans le chatInput
 */
async function prefetchContext(sector, pushName) {
  switch (sector) {
    case 'immobilier':
      return await prefetchImmobilier(pushName);
    default:
      return prefetchGeneric(pushName);
  }
}

module.exports = { prefetchContext };
