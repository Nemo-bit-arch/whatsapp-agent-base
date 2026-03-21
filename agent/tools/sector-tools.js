/**
 * Sector Tools - Factory qui charge les tools selon le secteur detecte
 */

const pharmacieTools = [
  {
    definition: {
      name: 'verifier_disponibilite_medicament',
      description: 'Verifie si un medicament est disponible en stock. NE JAMAIS inventer la disponibilite.',
      input_schema: {
        type: 'object',
        properties: {
          medicament: {
            type: 'string',
            description: 'Nom du medicament a verifier'
          }
        },
        required: ['medicament']
      }
    },
    handler: async ({ medicament }) => {
      // A connecter a l'API stock de la pharmacie
      return {
        available: null,
        message: `Verification de disponibilite pour "${medicament}" - systeme de stock non connecte. Recommander au client d'appeler la pharmacie pour confirmer.`,
        medicament
      };
    }
  },
  {
    definition: {
      name: 'horaires_pharmacie',
      description: 'Retourne les horaires d\'ouverture de la pharmacie',
      input_schema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    handler: async () => {
      // A configurer par client
      return {
        message: 'Horaires non configures. A personnaliser dans sector-tools.js pour ce client.'
      };
    }
  }
];

const financeTools = [
  {
    definition: {
      name: 'info_marche',
      description: 'Recupere des informations sur le marche financier (BRVM, actions, indices). NE JAMAIS inventer de cours ou de prix.',
      input_schema: {
        type: 'object',
        properties: {
          symbole: {
            type: 'string',
            description: 'Symbole ou nom de l\'action/indice'
          }
        },
        required: ['symbole']
      }
    },
    handler: async ({ symbole }) => {
      // A connecter a une API financiere
      return {
        message: `Donnees de marche pour "${symbole}" - API financiere non connectee. Recommander de consulter le site officiel de la BRVM.`,
        symbole
      };
    }
  },
  {
    definition: {
      name: 'simuler_investissement',
      description: 'Simule un investissement simple (rendement estime). Toujours preciser que c\'est une simulation et non un conseil financier.',
      input_schema: {
        type: 'object',
        properties: {
          montant: {
            type: 'number',
            description: 'Montant a investir en FCFA'
          },
          duree_mois: {
            type: 'number',
            description: 'Duree en mois'
          },
          type_produit: {
            type: 'string',
            description: 'Type de produit (epargne, obligations, actions)',
            enum: ['epargne', 'obligations', 'actions']
          }
        },
        required: ['montant', 'duree_mois', 'type_produit']
      }
    },
    handler: async ({ montant, duree_mois, type_produit }) => {
      const taux = { epargne: 0.035, obligations: 0.06, actions: 0.10 };
      const t = taux[type_produit] || 0.035;
      const rendement = montant * t * (duree_mois / 12);
      return {
        montant,
        duree_mois,
        type_produit,
        taux_annuel_estime: `${(t * 100).toFixed(1)}%`,
        rendement_estime: Math.round(rendement),
        total_estime: Math.round(montant + rendement),
        disclaimer: 'Ceci est une simulation indicative, pas un conseil financier. Les rendements passes ne garantissent pas les rendements futurs.'
      };
    }
  }
];

const commerceTools = [
  {
    definition: {
      name: 'recherche_produit',
      description: 'Recherche un produit dans le catalogue. NE JAMAIS inventer de prix ou de disponibilite.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Nom ou description du produit recherche'
          }
        },
        required: ['query']
      }
    },
    handler: async ({ query }) => {
      // A connecter a l'API catalogue du client
      return {
        found: false,
        message: `Recherche pour "${query}" - catalogue non connecte. A configurer pour ce client.`,
        query
      };
    }
  }
];

const immobilierTools = [
  {
    definition: {
      name: 'recherche_bien',
      description: 'Recherche des biens immobiliers disponibles selon les criteres. NE JAMAIS inventer de biens.',
      input_schema: {
        type: 'object',
        properties: {
          type_bien: {
            type: 'string',
            description: 'Type de bien (appartement, maison, terrain, villa, studio)',
            enum: ['appartement', 'maison', 'terrain', 'villa', 'studio']
          },
          budget_max: {
            type: 'number',
            description: 'Budget maximum en FCFA'
          },
          quartier: {
            type: 'string',
            description: 'Quartier ou zone souhaitee'
          }
        },
        required: ['type_bien']
      }
    },
    handler: async ({ type_bien, budget_max, quartier }) => {
      // A connecter a l'API biens du client
      return {
        found: false,
        message: `Recherche ${type_bien}${quartier ? ' a ' + quartier : ''}${budget_max ? ' budget max ' + budget_max + ' FCFA' : ''} - base de biens non connectee.`,
        type_bien,
        budget_max,
        quartier
      };
    }
  },
  {
    definition: {
      name: 'prendre_rdv_visite',
      description: 'Programme un rendez-vous de visite pour un bien immobilier',
      input_schema: {
        type: 'object',
        properties: {
          phone: {
            type: 'string',
            description: 'Numero du client'
          },
          prenom: {
            type: 'string',
            description: 'Prenom du client'
          },
          date_souhaitee: {
            type: 'string',
            description: 'Date souhaitee pour la visite (format texte libre)'
          },
          type_bien: {
            type: 'string',
            description: 'Type de bien a visiter'
          }
        },
        required: ['phone', 'prenom', 'date_souhaitee']
      }
    },
    handler: async ({ phone, prenom, date_souhaitee, type_bien }) => {
      // A connecter au systeme de RDV (Google Calendar, etc.)
      return {
        success: true,
        message: `Demande de visite enregistree pour ${prenom} le ${date_souhaitee}. Un conseiller confirmera le creneau.`,
        phone,
        date_souhaitee,
        type_bien
      };
    }
  }
];

const SECTOR_TOOLS = {
  pharmacie: pharmacieTools,
  finance: financeTools,
  commerce: commerceTools,
  immobilier: immobilierTools,
  generic: []
};

/**
 * Retourne les tools pour un secteur donne
 * @param {string} sector
 * @returns {Array}
 */
function getSectorTools(sector) {
  return SECTOR_TOOLS[sector] || [];
}

module.exports = { getSectorTools };
