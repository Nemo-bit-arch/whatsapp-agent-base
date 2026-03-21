/**
 * Base Tools - Tools universels disponibles pour tous les secteurs
 */

const { getDb } = require('../../db/database');

function getBaseTools() {
  return [
    {
      definition: {
        name: 'recherche_faq',
        description: 'Recherche dans la base de connaissances / FAQ du business. Utilise cet outil quand le client pose une question sur les services, horaires, tarifs ou fonctionnement.',
        input_schema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'La question ou les mots-cles a rechercher'
            }
          },
          required: ['query']
        }
      },
      handler: async ({ query }) => {
        // Pour l'instant, retourne un message indiquant que la FAQ n'est pas encore configuree
        // A connecter a une vraie base de donnees ou API selon le client
        return {
          found: false,
          message: 'La base de connaissances n\'est pas encore configuree pour ce client. Propose de mettre en relation avec un conseiller humain.',
          query
        };
      }
    },
    {
      definition: {
        name: 'sauvegarder_contact',
        description: 'Sauvegarde les informations de contact collectees (prenom, besoin, moyen de contact prefere). Utilise cet outil quand tu as collecte des informations sur le client.',
        input_schema: {
          type: 'object',
          properties: {
            phone: {
              type: 'string',
              description: 'Numero de telephone du contact'
            },
            prenom: {
              type: 'string',
              description: 'Prenom du contact'
            },
            besoin: {
              type: 'string',
              description: 'Besoin principal exprime par le contact'
            },
            contact_prefere: {
              type: 'string',
              description: 'Moyen de contact prefere (whatsapp, appel, email)',
              enum: ['whatsapp', 'appel', 'email']
            }
          },
          required: ['phone']
        }
      },
      handler: async ({ phone, prenom, besoin, contact_prefere }) => {
        try {
          const db = getDb();
          db.prepare(`
            INSERT INTO leads (phone, prenom, besoin, contact_prefere, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(phone) DO UPDATE SET
              prenom = COALESCE(?, prenom),
              besoin = COALESCE(?, besoin),
              contact_prefere = COALESCE(?, contact_prefere),
              updated_at = datetime('now')
          `).run(phone, prenom, besoin, contact_prefere, prenom, besoin, contact_prefere);

          return { success: true, message: 'Contact sauvegarde' };
        } catch (err) {
          return { success: false, error: err.message };
        }
      }
    },
    {
      definition: {
        name: 'demander_humain',
        description: 'Escalade la conversation a un conseiller humain. Utilise cet outil quand la demande depasse tes capacites ou quand le client le demande explicitement.',
        input_schema: {
          type: 'object',
          properties: {
            phone: {
              type: 'string',
              description: 'Numero de telephone du contact'
            },
            raison: {
              type: 'string',
              description: 'Raison de l\'escalade'
            },
            resume: {
              type: 'string',
              description: 'Resume de la conversation pour le conseiller'
            }
          },
          required: ['phone', 'raison']
        }
      },
      handler: async ({ phone, raison, resume }) => {
        try {
          const db = getDb();
          db.prepare(`
            INSERT INTO conversations (phone, type, content, created_at)
            VALUES (?, 'escalade', ?, datetime('now'))
          `).run(phone, JSON.stringify({ raison, resume }));

          return {
            success: true,
            message: 'Escalade enregistree. Un conseiller prendra contact rapidement.'
          };
        } catch (err) {
          return { success: false, error: err.message };
        }
      }
    }
  ];
}

module.exports = { getBaseTools };
