/**
 * Classifier - Detecte le secteur et l'intention du message
 */

const SECTORS = {
  pharmacie: {
    keywords: ['medicament', 'pharmacie', 'ordonnance', 'sirop', 'comprime', 'douleur',
      'fievre', 'paracetamol', 'antibiotique', 'pilule', 'vaccination', 'vaccin',
      'prescription', 'posologie', 'effet secondaire', 'allergie', 'rhume', 'grippe',
      'toux', 'mal de tete', 'tension', 'diabete', 'vitamine'],
    label: 'pharmacie'
  },
  finance: {
    keywords: ['action', 'bourse', 'brvm', 'investir', 'investissement', 'portefeuille',
      'dividende', 'obligation', 'epargne', 'credit', 'pret', 'taux', 'interet',
      'banque', 'compte', 'virement', 'mobile money', 'transfert', 'assurance',
      'placement', 'rendement', 'capital', 'titre'],
    label: 'finance'
  },
  commerce: {
    keywords: ['produit', 'prix', 'commande', 'commander', 'acheter', 'achat', 'livraison',
      'stock', 'disponible', 'catalogue', 'promotion', 'solde', 'remise', 'facture',
      'paiement', 'retour', 'echange', 'garantie', 'boutique', 'magasin', 'article'],
    label: 'commerce'
  },
  immobilier: {
    keywords: ['appartement', 'maison', 'terrain', 'villa', 'louer', 'location', 'vendre',
      'vente', 'achat immobilier', 'bail', 'loyer', 'chambre', 'studio', 'duplex',
      'quartier', 'superficie', 'visite', 'agence immobiliere', 'bien immobilier',
      'constructeur', 'promoteur'],
    label: 'immobilier'
  }
};

const INTENTS = {
  salutation: ['bonjour', 'salut', 'bonsoir', 'hello', 'hi', 'hey', 'coucou', 'yo', 'wesh'],
  question: ['comment', 'pourquoi', 'quand', 'ou', 'quel', 'quelle', 'est-ce que', 'combien',
    'c\'est quoi', 'qu\'est-ce'],
  achat: ['acheter', 'commander', 'je veux', 'je voudrais', 'prix', 'combien coute',
    'disponible', 'en stock'],
  rdv: ['rendez-vous', 'rdv', 'rencontrer', 'disponibilite', 'quand', 'creneau',
    'prendre rdv', 'fixer un rdv', 'consultation'],
  plainte: ['probleme', 'plainte', 'reclamation', 'pas satisfait', 'defectueux',
    'rembourser', 'remboursement', 'arnaque', 'nul', 'mauvais'],
  remerciement: ['merci', 'thanks', 'thank you', 'super', 'parfait', 'genial', 'excellent'],
  fin: ['au revoir', 'bye', 'a bientot', 'bonne journee', 'bonne soiree', 'a plus']
};

/**
 * Detecte le secteur du message
 * @param {string} message - Le message de l'utilisateur
 * @param {string} forcedSector - Secteur force par env
 * @returns {string} Le secteur detecte
 */
function detectSector(message, forcedSector) {
  // Si un secteur est force dans le .env, l'utiliser
  if (forcedSector && forcedSector !== 'generic' && SECTORS[forcedSector]) {
    return forcedSector;
  }

  const lower = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let bestMatch = { sector: 'generic', score: 0 };

  for (const [sector, config] of Object.entries(SECTORS)) {
    let score = 0;
    for (const keyword of config.keywords) {
      const normalizedKeyword = keyword.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (lower.includes(normalizedKeyword)) {
        score++;
      }
    }
    if (score > bestMatch.score) {
      bestMatch = { sector, score };
    }
  }

  return bestMatch.sector;
}

/**
 * Detecte l'intention du message
 * @param {string} message - Le message de l'utilisateur
 * @returns {string} L'intention detectee
 */
function detectIntent(message) {
  const lower = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  let bestMatch = { intent: 'question', score: 0 };

  for (const [intent, keywords] of Object.entries(INTENTS)) {
    let score = 0;
    for (const keyword of keywords) {
      const normalizedKeyword = keyword.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (lower.includes(normalizedKeyword)) {
        score++;
      }
    }
    if (score > bestMatch.score) {
      bestMatch = { intent, score };
    }
  }

  return bestMatch.intent;
}

/**
 * Classifie un message (secteur + intention)
 */
function classify(message, forcedSector) {
  return {
    sector: detectSector(message, forcedSector),
    intent: detectIntent(message)
  };
}

module.exports = { classify, detectSector, detectIntent };
