# CLAUDE.md - WhatsApp Agent Base

## Description du projet

Agent WhatsApp IA universel multi-secteur. Architecture Node.js + Express qui recoit les messages via webhook (n8n ou direct Evolution API), les traite avec Claude API (claude-sonnet-4-6), et renvoie les reponses via Evolution API.

Inspire de l'agent Alex Immo - architecture **pre-fetch + post-detect**.

## Architecture

```
Evolution API → n8n Bridge (Li76DstxzCrFk00Q) → Express /webhook → Agent
                                                        ↓
                                              1. Typing indicator
                                              2. Transcription audio (si vocal)
                                              3. Pre-fetch contexte (catalogue, calendrier)
                                              4. Classifier (secteur + intention)
                                              5. Memory (historique session)
                                              6. Claude API + tools
                                              7. Post-process (tags LEAD_INFO, RDV_CONFIRME)
                                              8. Envoi reponse (texte + TTS optionnel)
```

### Composants cles

- **index.js** : Serveur Express. Endpoints: `/webhook` (via n8n), `/webhook/evolution` (direct), `/health`
- **agent/core/agent.js** : Logique principale. Pre-fetch + Claude API + post-detect
- **agent/core/prefetch.js** : Charge le contexte dynamique AVANT l'appel Claude (catalogue, calendrier, date). Pattern par secteur.
- **agent/core/postprocess.js** : Parse [RDV_CONFIRME] et [LEAD_INFO] APRES la reponse. Sauvegarde RDV, leads, Google Calendar via webhooks n8n.
- **agent/core/evolution.js** : Interface Evolution API (typing, sendText, sendAudio, transcription)
- **agent/core/tts.js** : Text-to-Speech ElevenLabs
- **agent/core/classifier.js** : Detection secteur + intention par mots-cles
- **agent/core/memory.js** : Sessions JSON par numero (20 derniers echanges)
- **agent/prompts/base.md** : Prompt systeme universel avec tags LEAD_INFO et RDV_CONFIRME
- **agent/prompts/overlays/*.md** : Overlays sectoriels
- **agent/tools/** : Tools Claude API par secteur
- **db/** : SQLite (conversations, leads, clients)

## Workflows n8n associes

- `Li76DstxzCrFk00Q` - [AGENT] WhatsApp Agent Bridge - Express (webhook → filtre → agent)
- Les workflows sauvegarde (immo-save), API biens (immo-biens) restent actifs et sont appeles via webhooks

## Ajouter un nouveau secteur

1. Creer `agent/prompts/overlays/{secteur}.md` (copier `_template.md`)
2. Ajouter les keywords dans `agent/core/classifier.js` (objet SECTORS)
3. Ajouter les tools dans `agent/tools/sector-tools.js` (objet SECTOR_TOOLS)
4. Ajouter le pre-fetch dans `agent/core/prefetch.js` (switch case)

## Deployer pour un nouveau client

1. Copier le projet
2. Modifier `.env` : CLIENT_NAME, CLIENT_DESCRIPTION, SECTOR, credentials
3. `npm install && npm run db:init && npm start`
4. Creer/adapter le workflow n8n bridge
5. Configurer le webhook Evolution API vers le workflow n8n

## Commandes npm

- `npm start` : Lancer en production
- `npm run dev` : Lancer en dev (auto-reload)
- `npm run db:init` : Initialiser la base de donnees
- `npm run test:curl` : Tester avec un message "Bonjour"

## Conventions de code

- JavaScript pur (Node.js 18+ avec fetch natif)
- Fonctions async/await partout
- Console.log avec prefixes : `[AGENT]`, `[DB]`, `[MEMORY]`, `[TOOL]`, `[TTS]`, `[TRANSCRIPTION]`, `[POSTPROCESS]`, `[ERROR]`
- Tools : objet `{ definition, handler }` — definition = schema Claude API, handler = async function
- Tags agent : `[RDV_CONFIRME|...]` et `[LEAD_INFO|...]` — nettoyes par postprocess.js

## Points d'extension prevus

- **RAG** : Remplacer le tool `recherche_faq` par une vraie recherche vectorielle
- **Multi-instance** : Env var `EVOLUTION_INSTANCE` permet de gerer plusieurs instances
- **Analytics** : Tables SQLite pretes pour un dashboard de suivi
- **Voice** : TTS ElevenLabs deja integre, activer via ELEVENLABS_API_KEY
