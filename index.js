require('dotenv').config();
const express = require('express');
const { processMessage } = require('./agent/core/agent');
const { sendTypingIndicator, sendTextMessage, sendAudioMessage, transcribeAudio } = require('./agent/core/evolution');
const { initDatabase } = require('./db/database');
const { textToSpeech } = require('./agent/core/tts');

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET;

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

/**
 * Webhook principal - recoit les messages de n8n
 * Format attendu: { phone, message, pushName, messageType, remoteJid, audioBase64?, mimetype? }
 */
app.post('/webhook', async (req, res) => {
  // Verification du secret si configure
  if (WEBHOOK_SECRET && WEBHOOK_SECRET !== 'change-me-to-a-random-string') {
    const secret = req.headers['x-webhook-secret'];
    if (secret !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const { phone, message, pushName, messageType, remoteJid, audioBase64, mimetype } = req.body;

  if (!phone || !message) {
    return res.status(400).json({ error: 'phone et message sont requis' });
  }

  const jid = remoteJid || `${phone}@s.whatsapp.net`;

  try {
    // 1. Envoyer le typing indicator (comme Alex)
    const presenceType = messageType === 'audio' ? 'recording' : 'composing';
    await sendTypingIndicator(jid, presenceType);

    // 2. Si audio, transcrire d'abord
    let textMessage = message;
    let inputType = messageType || 'text';
    if (messageType === 'audio' && audioBase64) {
      const transcription = await transcribeAudio(audioBase64, mimetype);
      if (transcription) {
        textMessage = transcription;
      }
    }

    // 3. Traiter le message avec l'agent
    const { reply, isVocal } = await processMessage({
      phone,
      message: textMessage,
      pushName,
      inputType
    });

    // 4. Envoyer la reponse via Evolution API
    // Toujours envoyer le texte
    await sendTextMessage(jid, reply);

    // Si reponse vocale demandee, envoyer aussi l'audio TTS
    if (isVocal && process.env.ELEVENLABS_API_KEY) {
      try {
        const audioBase64Result = await textToSpeech(reply);
        if (audioBase64Result) {
          await sendAudioMessage(jid, audioBase64Result);
        }
      } catch (ttsErr) {
        console.error('[TTS] Erreur:', ttsErr.message);
        // Le texte est deja envoye, pas grave si le TTS echoue
      }
    }

    res.json({ reply, phone, isVocal });
  } catch (err) {
    console.error(`[ERROR] ${phone}:`, err.message);

    // Envoyer un message fallback via Evolution API
    const fallback = 'Desole, je rencontre un probleme technique. Un conseiller va prendre le relais rapidement.';
    try {
      await sendTextMessage(jid, fallback);
    } catch (e) {
      console.error('[ERROR] Fallback send failed:', e.message);
    }

    res.json({ reply: fallback, phone, error: true });
  }
});

/**
 * Webhook direct - recoit les messages bruts d'Evolution API (sans passer par n8n)
 * Utile pour un deploiement sans n8n comme intermediaire
 */
app.post('/webhook/evolution', async (req, res) => {
  const data = req.body.data || req.body;
  const key = data.key || {};
  const msg = data.message || {};

  // Ignorer: messages sortants, groupes, status broadcast
  if (key.fromMe || key.remoteJid === 'status@broadcast' || key.remoteJid?.endsWith('@g.us')) {
    return res.json({ ignored: true });
  }

  // Extraire les donnees
  const remoteJid = key.remoteJid || '';
  const phone = remoteJid.replace('@s.whatsapp.net', '');
  const pushName = data.pushName || 'Client';

  let messageType = 'text';
  let messageContent = '';

  if (msg.conversation || msg.extendedTextMessage) {
    messageContent = msg.conversation || msg.extendedTextMessage?.text || '';
  } else if (msg.audioMessage) {
    messageType = 'audio';
    // Transcrire le message vocal
    try {
      const { getMediaBase64, transcribeAudio } = require('./agent/core/evolution');
      const messageId = key.id;
      console.log(`[VOCAL] Recuperation audio pour message ${messageId}`);
      const base64Audio = await getMediaBase64(messageId);
      if (base64Audio) {
        const mimetype = msg.audioMessage.mimetype || 'audio/ogg';
        console.log(`[VOCAL] Transcription en cours (${mimetype})...`);
        const transcription = await transcribeAudio(base64Audio, mimetype);
        if (transcription) {
          messageContent = transcription;
          console.log(`[VOCAL] Transcrit: "${transcription.substring(0, 80)}"`);
        } else {
          messageContent = '[Message vocal non transcrit]';
          console.log('[VOCAL] Transcription echouee');
        }
      } else {
        messageContent = '[Message vocal non transcrit]';
        console.log('[VOCAL] Impossible de recuperer le media base64');
      }
    } catch (e) {
      console.error('[VOCAL] Erreur transcription:', e.message);
      messageContent = '[Message vocal non transcrit]';
    }
  } else if (msg.imageMessage) {
    messageContent = msg.imageMessage.caption || '[Image envoyee]';
  } else {
    return res.json({ ignored: true, reason: 'unsupported message type' });
  }

  if (!messageContent || !phone) {
    return res.json({ ignored: true });
  }

  // Rediriger vers le webhook principal
  try {
    const { processMessage: pm } = require('./agent/core/agent');
    const { sendTypingIndicator: st, sendTextMessage: stm } = require('./agent/core/evolution');

    await st(remoteJid, messageType === 'audio' ? 'recording' : 'composing');
    const { reply } = await pm({ phone, message: messageContent, pushName, inputType: messageType });
    await stm(remoteJid, reply);

    res.json({ reply, phone });
  } catch (err) {
    console.error(`[ERROR] ${phone}:`, err.message);
    res.json({ error: err.message });
  }
});

// Initialisation
async function start() {
  initDatabase();
  app.listen(PORT, () => {
    console.log(`[AGENT] Serveur demarre sur le port ${PORT}`);
    console.log(`[AGENT] Secteur: ${process.env.SECTOR || 'generic'}`);
    console.log(`[AGENT] Client: ${process.env.CLIENT_NAME || 'Non configure'}`);
    console.log(`[AGENT] Endpoints:`);
    console.log(`  POST /webhook           - Messages via n8n`);
    console.log(`  POST /webhook/evolution  - Messages directs Evolution API`);
    console.log(`  GET  /health            - Health check`);
  });
}

start();
