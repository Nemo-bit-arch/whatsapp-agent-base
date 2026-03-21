/**
 * Evolution API - Interface pour envoyer des messages et interagir avec WhatsApp
 * Reproduit les fonctionnalites d'Alex: typing, sendText, sendAudio, transcription
 */

const EVO_URL = process.env.EVOLUTION_API_URL || 'https://preuve-evolution-api.edlus3.easypanel.host';
const EVO_KEY = process.env.EVOLUTION_API_KEY || '';
const INSTANCE = process.env.EVOLUTION_INSTANCE || 'N8Nbot';

/**
 * Envoie un indicateur de typing (composing ou recording)
 */
async function sendTypingIndicator(remoteJid, presence = 'composing') {
  try {
    await fetch(`${EVO_URL}/chat/sendPresence/${INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVO_KEY },
      body: JSON.stringify({
        number: remoteJid,
        delay: 10000,
        presence
      })
    });
  } catch (e) {
    // Silencieux - le typing n'est pas critique
  }
}

/**
 * Envoie un message texte via Evolution API
 */
async function sendTextMessage(remoteJid, text) {
  if (!text || text.trim().length === 0) return null;

  const res = await fetch(`${EVO_URL}/message/sendText/${INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': EVO_KEY },
    body: JSON.stringify({ number: remoteJid, text })
  });

  if (!res.ok) {
    throw new Error(`Evolution API sendText failed: ${res.status}`);
  }

  return await res.json();
}

/**
 * Envoie un message audio via Evolution API
 * @param {string} remoteJid - JID WhatsApp
 * @param {string} base64Audio - Audio encode en base64 (pas de prefix data:)
 */
async function sendAudioMessage(remoteJid, base64Audio) {
  if (!base64Audio || base64Audio.length < 200) return null;

  const res = await fetch(`${EVO_URL}/message/sendWhatsAppAudio/${INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': EVO_KEY },
    body: JSON.stringify({
      number: remoteJid,
      audio: base64Audio
    })
  });

  if (!res.ok) {
    throw new Error(`Evolution API sendAudio failed: ${res.status}`);
  }

  return await res.json();
}

/**
 * Recupere un media en base64 depuis Evolution API
 */
async function getMediaBase64(messageId) {
  try {
    const res = await fetch(`${EVO_URL}/chat/getBase64FromMediaMessage/${INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVO_KEY },
      body: JSON.stringify({ message: { key: { id: messageId } } })
    });
    const data = await res.json();
    return data.base64 || null;
  } catch (e) {
    console.error('[EVOLUTION] getBase64 failed:', e.message);
    return null;
  }
}

/**
 * Transcrit un audio via OpenRouter (Gemini Flash) - meme methode qu'Alex
 */
async function transcribeAudio(base64Audio, mimetype = 'audio/ogg') {
  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
  if (!OPENROUTER_KEY || !base64Audio) return null;

  let audioFormat = 'ogg';
  if (mimetype?.includes('mp3') || mimetype?.includes('mpeg')) audioFormat = 'mp3';
  else if (mimetype?.includes('wav')) audioFormat = 'wav';
  else if (mimetype?.includes('mp4') || mimetype?.includes('m4a')) audioFormat = 'm4a';

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Transcris ce message audio en texte. Retourne UNIQUEMENT la transcription mot pour mot, sans commentaire, sans guillemets, sans formatage.'
            },
            {
              type: 'input_audio',
              input_audio: {
                data: base64Audio,
                format: audioFormat
              }
            }
          ]
        }]
      })
    });

    const data = await res.json();
    const transcription = data.choices?.[0]?.message?.content;
    if (transcription) {
      console.log(`[TRANSCRIPTION] ${transcription.substring(0, 80)}`);
      return transcription;
    }
    return null;
  } catch (e) {
    console.error('[TRANSCRIPTION] Erreur:', e.message);
    return null;
  }
}

module.exports = {
  sendTypingIndicator,
  sendTextMessage,
  sendAudioMessage,
  getMediaBase64,
  transcribeAudio
};
