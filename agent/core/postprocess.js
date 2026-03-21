/**
 * Post-process - Parse les tags de la sortie agent et execute les actions
 * Pattern inspire d'Alex Immo: [RDV_CONFIRME], [LEAD_INFO]
 *
 * L'agent Claude genere des tags invisibles dans sa reponse.
 * Ce module les detecte, execute les actions associees, et nettoie la sortie.
 */

const N8N_BASE = process.env.N8N_WEBHOOK_BASE || 'https://n8n.srv1332384.hstgr.cloud/webhook';
const { getDb } = require('../../db/database');

/**
 * Parse les mois en francais vers un numero
 */
const MOIS_FR = {
  'janvier': '01', 'fevrier': '02', 'mars': '03', 'avril': '04',
  'mai': '05', 'juin': '06', 'juillet': '07', 'aout': '08',
  'septembre': '09', 'octobre': '10', 'novembre': '11', 'decembre': '12'
};

/**
 * Parse une date en francais vers ISO (ex: "vendredi 20 mars 2026" -> "2026-03-20")
 */
function parseDateFr(dateStr) {
  // Essayer format "jour DD mois YYYY"
  const match = dateStr.match(/(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(\d{4})/i);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = MOIS_FR[match[2].toLowerCase()];
    const year = match[3];
    return `${year}-${month}-${day}`;
  }
  return null;
}

/**
 * Parse l'heure (ex: "10h00" -> "10:00")
 */
function parseHeure(heureStr) {
  const match = heureStr.match(/(\d{1,2})h(\d{2})?/);
  if (match) {
    const h = match[1].padStart(2, '0');
    const m = match[2] || '00';
    return `${h}:${m}`;
  }
  return '10:00';
}

/**
 * Fetch silencieux vers n8n webhook
 */
async function n8nWebhook(path, body) {
  try {
    const res = await fetch(`${N8N_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return await res.json();
  } catch (e) {
    console.error(`[POSTPROCESS] Erreur webhook ${path}:`, e.message);
    return null;
  }
}

/**
 * Envoie un message WhatsApp au conseiller via Evolution API
 */
async function notifyConseiller(text) {
  const EVO_URL = process.env.EVOLUTION_API_URL;
  const EVO_KEY = process.env.EVOLUTION_API_KEY;
  const INSTANCE = process.env.EVOLUTION_INSTANCE || 'N8Nbot';
  const CONSEILLER_JID = process.env.CONSEILLER_WHATSAPP || '24107454275@s.whatsapp.net';

  if (!EVO_URL || !EVO_KEY) return;

  try {
    await fetch(`${EVO_URL}/message/sendText/${INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVO_KEY },
      body: JSON.stringify({ number: CONSEILLER_JID, text })
    });
    console.log(`[POSTPROCESS] Notification envoyee au conseiller`);
  } catch (e) {
    console.error(`[POSTPROCESS] Erreur notification conseiller:`, e.message);
  }
}

/**
 * Traite le tag [RDV_CONFIRME|nom_complet|date|heure|format|besoin]
 */
async function handleRdvConfirme(match, phone) {
  const conseiller = process.env.CONSEILLER_NAME || 'Conseiller';
  const rdv = {
    nom_complet: match[1].trim(),
    telephone: phone,
    date_rdv: match[2].trim(),
    heure_rdv: match[3].trim(),
    format_rdv: match[4].trim(),
    conseiller,
    resume_besoin: match[5].trim()
  };

  console.log(`[POSTPROCESS] RDV detecte: ${rdv.nom_complet} le ${rdv.date_rdv} a ${rdv.heure_rdv}`);

  // 1. Sauvegarder le RDV en SQLite
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO rdv (lead_phone, nom_complet, date_rdv, heure_rdv, format_rdv, besoin, conseiller, statut)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(phone, rdv.nom_complet, rdv.date_rdv, rdv.heure_rdv, rdv.format_rdv, rdv.resume_besoin, conseiller);

    // Mettre a jour le statut du lead
    db.prepare('UPDATE leads SET status = ?, updated_at = datetime("now") WHERE phone = ?')
      .run('rdv_pris', phone);

    console.log(`[POSTPROCESS] RDV sauvegarde en SQLite`);
  } catch (dbErr) {
    console.error(`[POSTPROCESS] Erreur SQLite RDV:`, dbErr.message);
  }

  // 2. Notifier le conseiller par WhatsApp
  const notifText = `📅 NOUVEAU RDV\n\nClient: ${rdv.nom_complet}\nTel: +${phone}\nDate: ${rdv.date_rdv} a ${rdv.heure_rdv}\nFormat: ${rdv.format_rdv}\nBesoin: ${rdv.resume_besoin}`;
  await notifyConseiller(notifText);

  return rdv;
}

/**
 * Traite le tag [LEAD_INFO|prenom|nom|type_bien|type_projet|villes|quartiers|budget|urgence]
 */
async function handleLeadInfo(match, phone) {
  const leadData = {
    prenom: match[1].trim(),
    nom: match[2].trim(),
    type_bien: match[3].trim(),
    type_projet: match[4].trim(),
    villes: match[5].trim(),
    quartiers: match[6].trim(),
    budget: match[7].trim(),
    urgence: match[8].trim()
  };

  // Filtrer les champs vides
  const nonEmpty = {};
  for (const [k, v] of Object.entries(leadData)) {
    if (v) nonEmpty[k] = v;
  }

  // Filtrer les valeurs parasites (ex: "|" seul)
  for (const [k, v] of Object.entries(nonEmpty)) {
    if (v === '|' || v === '||') delete nonEmpty[k];
  }

  if (Object.keys(nonEmpty).length > 0) {
    console.log(`[POSTPROCESS] LEAD_INFO detecte:`, nonEmpty);
    nonEmpty.telephone = phone;

    // Sauvegarder en SQLite local
    try {
      const db = getDb();
      db.prepare(`
        INSERT INTO leads (phone, push_name, prenom, besoin, sector, first_message, intent, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(phone) DO UPDATE SET
          prenom = COALESCE(?, prenom),
          besoin = COALESCE(?, besoin),
          updated_at = datetime('now')
      `).run(
        phone, nonEmpty.prenom || '', nonEmpty.prenom || '',
        JSON.stringify(nonEmpty), 'immobilier', '', 'lead_info',
        nonEmpty.prenom || null, JSON.stringify(nonEmpty)
      );
      console.log(`[POSTPROCESS] Lead sauvegarde en SQLite pour ${phone}`);
    } catch (dbErr) {
      console.error(`[POSTPROCESS] Erreur SQLite:`, dbErr.message);
    }
  }

  return nonEmpty;
}

/**
 * Post-processing principal
 * @param {string} rawReply - Reponse brute de l'agent (avec tags)
 * @param {string} phone - Numero de telephone
 * @param {string} pushName - Nom WhatsApp
 * @param {string} sector - Secteur detecte
 * @returns {{ cleanReply: string, actions: Object }}
 */
async function postProcess(rawReply, phone, pushName, sector) {
  let cleanReply = rawReply;
  const actions = { rdv: null, leadData: null };

  // 1. Detecter et traiter [RDV_CONFIRME|...]
  const rdvMatch = rawReply.match(
    /\[RDV_CONFIRME\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^\]]+)\]/
  );
  if (rdvMatch) {
    actions.rdv = await handleRdvConfirme(rdvMatch, phone);
    cleanReply = cleanReply.replace(rdvMatch[0], '').trim();
  }

  // 2. Detecter et traiter [LEAD_INFO|...]
  const leadMatch = rawReply.match(
    /\[LEAD_INFO\|([^|\]]*)\|([^|\]]*)\|([^|\]]*)\|([^|\]]*)\|([^|\]]*)\|([^|\]]*)\|([^|\]]*)\|([^|\]]*)\]/
  );
  if (leadMatch) {
    actions.leadData = await handleLeadInfo(leadMatch, phone);
    cleanReply = cleanReply.replace(leadMatch[0], '').trim();
  }

  // 3. Nettoyer les patterns residuels (tags casses, code, etc.)
  cleanReply = cleanReply
    .replace(/\[RDV_CONFIRME[^\]]*\]?/g, '')
    .replace(/\[LEAD_INFO[^\]]*\]?/g, '')
    .replace(/\[CONTEXTE\][\s\S]*?\[\/CONTEXTE\]/g, '')
    .replace(/\[\/CONTEXTE\]/g, '')
    .replace(/\[CONTEXTE\]/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // 4. Si la reponse est vide apres nettoyage, message par defaut
  if (!cleanReply) {
    cleanReply = 'Comment puis-je vous aider ?';
  }

  return { cleanReply, actions };
}

module.exports = { postProcess };
