/**
 * TTS - Text-to-Speech via ElevenLabs
 * Reproduit la logique TTS d'Alex: texte -> base64 audio pour Evolution API
 */

const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY || '';
const ELEVENLABS_VOICE = process.env.ELEVENLABS_VOICE_ID || 'onwK4e9ZLuTAKqWW03F9'; // Daniel

/**
 * Convertit du texte en audio base64 via ElevenLabs
 * @param {string} text - Texte a convertir (max 2000 chars)
 * @returns {string|null} Base64 audio brut (pas de prefix data:)
 */
async function textToSpeech(text) {
  if (!ELEVENLABS_KEY || !text || text.trim().length < 2) return null;

  // Limiter a 2000 caracteres (limite ElevenLabs free tier)
  const truncated = text.substring(0, 2000);

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        body: JSON.stringify({
          text: truncated,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        })
      }
    );

    if (!res.ok) {
      console.error(`[TTS] ElevenLabs error: ${res.status}`);
      return null;
    }

    // Convertir ArrayBuffer -> base64 brut (pas de data URI prefix)
    const buffer = Buffer.from(await res.arrayBuffer());
    const base64Audio = buffer.toString('base64');

    if (base64Audio.length < 200) {
      console.error('[TTS] Audio trop court, ignore');
      return null;
    }

    console.log(`[TTS] Audio genere: ${Math.round(base64Audio.length / 1024)}KB`);
    return base64Audio;
  } catch (e) {
    console.error('[TTS] Erreur:', e.message);
    return null;
  }
}

module.exports = { textToSpeech };
