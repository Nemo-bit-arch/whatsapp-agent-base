/**
 * Memory - Gestion de la memoire de session par numero de telephone
 * Stocke les 20 derniers echanges dans un fichier JSON par numero
 */

const fs = require('fs');
const path = require('path');

const SESSIONS_DIR = path.join(__dirname, '../../memory/sessions');
const MAX_MESSAGES = 20;

// Assurer que le dossier sessions existe
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

/**
 * Nettoie le numero de telephone pour l'utiliser comme nom de fichier
 */
function sanitizePhone(phone) {
  return phone.replace(/[^0-9+]/g, '');
}

/**
 * Chemin du fichier de session pour un numero
 */
function sessionPath(phone) {
  return path.join(SESSIONS_DIR, `${sanitizePhone(phone)}.json`);
}

/**
 * Charge la session d'un utilisateur
 * @param {string} phone - Numero de telephone
 * @returns {{ messages: Array, metadata: Object }}
 */
function loadSession(phone) {
  const filePath = sessionPath(phone);

  if (!fs.existsSync(filePath)) {
    return {
      messages: [],
      metadata: {
        phone: sanitizePhone(phone),
        firstContact: new Date().toISOString(),
        lastContact: new Date().toISOString(),
        pushName: null,
        sector: null,
        leadCollected: {}
      }
    };
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return data;
  } catch (err) {
    console.error(`[MEMORY] Erreur lecture session ${phone}:`, err.message);
    return {
      messages: [],
      metadata: {
        phone: sanitizePhone(phone),
        firstContact: new Date().toISOString(),
        lastContact: new Date().toISOString(),
        pushName: null,
        sector: null,
        leadCollected: {}
      }
    };
  }
}

/**
 * Sauvegarde un echange dans la session
 * @param {string} phone - Numero de telephone
 * @param {string} userMessage - Message de l'utilisateur
 * @param {string} assistantReply - Reponse de l'agent
 * @param {Object} extra - Donnees supplementaires (pushName, sector, intent)
 */
function saveExchange(phone, userMessage, assistantReply, extra = {}) {
  const session = loadSession(phone);

  // Ajouter l'echange
  session.messages.push({
    role: 'user',
    content: userMessage,
    timestamp: new Date().toISOString()
  });
  session.messages.push({
    role: 'assistant',
    content: assistantReply,
    timestamp: new Date().toISOString()
  });

  // Garder uniquement les N derniers messages (paires)
  if (session.messages.length > MAX_MESSAGES * 2) {
    session.messages = session.messages.slice(-MAX_MESSAGES * 2);
  }

  // Mettre a jour les metadata
  session.metadata.lastContact = new Date().toISOString();
  if (extra.pushName) session.metadata.pushName = extra.pushName;
  if (extra.sector) session.metadata.sector = extra.sector;
  if (extra.leadData) {
    session.metadata.leadCollected = {
      ...session.metadata.leadCollected,
      ...extra.leadData
    };
  }

  // Ecrire le fichier
  const filePath = sessionPath(phone);
  fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
}

/**
 * Convertit l'historique en format messages Claude API
 * @param {string} phone - Numero de telephone
 * @returns {Array} Messages au format Claude API
 */
function getHistory(phone) {
  const session = loadSession(phone);
  return session.messages.map(msg => ({
    role: msg.role,
    content: msg.content
  }));
}

/**
 * Recupere les metadata d'un contact
 */
function getMetadata(phone) {
  const session = loadSession(phone);
  return session.metadata;
}

module.exports = { loadSession, saveExchange, getHistory, getMetadata };
