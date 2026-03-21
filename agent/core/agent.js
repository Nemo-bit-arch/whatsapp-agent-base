/**
 * Agent - Logique principale : appel LLM via OpenRouter (format OpenAI)
 * Inspire de l'architecture Alex Immo : pre-fetch + post-detect
 */

const fs = require('fs');
const path = require('path');
const { classify } = require('./classifier');
const { getHistory, saveExchange, getMetadata } = require('./memory');
const { getBaseTools } = require('../tools/base-tools');
const { getSectorTools } = require('../tools/sector-tools');
const { saveLead } = require('../../db/database');
const { prefetchContext } = require('./prefetch');
const { postProcess } = require('./postprocess');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Charge un fichier prompt .md
 */
function loadPrompt(filename) {
  const filePath = path.join(__dirname, '../prompts', filename);
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Charge l'overlay sectoriel
 */
function loadOverlay(sector) {
  const filePath = path.join(__dirname, '../prompts/overlays', `${sector}.md`);
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Construit le prompt systeme complet
 */
function buildSystemPrompt(sector, metadata) {
  const base = loadPrompt('base.md');
  const overlay = loadOverlay(sector);

  const clientName = process.env.CLIENT_NAME || 'Notre entreprise';
  const clientDescription = process.env.CLIENT_DESCRIPTION || '';

  let systemPrompt = base
    .replace(/\{\{CLIENT_NAME\}\}/g, clientName)
    .replace(/\{\{CLIENT_DESCRIPTION\}\}/g, clientDescription)
    .replace(/\{\{SECTOR\}\}/g, sector);

  if (overlay) {
    systemPrompt += '\n\n---\n\n' + overlay;
  }

  if (metadata.pushName) {
    systemPrompt += `\n\nLe contact s'appelle ${metadata.pushName}.`;
  }
  if (metadata.leadCollected && Object.keys(metadata.leadCollected).length > 0) {
    systemPrompt += `\nInformations deja collectees sur ce contact: ${JSON.stringify(metadata.leadCollected)}`;
  }

  return systemPrompt;
}

/**
 * Convertit les tool definitions du format Claude vers le format OpenAI/OpenRouter
 * Claude: { name, description, input_schema }
 * OpenAI: { type: "function", function: { name, description, parameters } }
 */
function toOpenAITools(toolDefs) {
  return toolDefs.map(def => ({
    type: 'function',
    function: {
      name: def.name,
      description: def.description,
      parameters: def.input_schema
    }
  }));
}

/**
 * Appel OpenRouter (format OpenAI)
 */
async function callOpenRouter(messages, systemPrompt, tools) {
  const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001';
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY manquante dans le .env');
  }

  const body = {
    model,
    max_tokens: 1024,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages
    ]
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${errText.substring(0, 200)}`);
  }

  return await res.json();
}

/**
 * Execute un tool call et retourne le resultat
 */
async function executeTool(toolName, toolArgs, allTools) {
  const tool = allTools.find(t => t.definition.name === toolName);
  if (!tool || !tool.handler) {
    return JSON.stringify({ error: `Tool ${toolName} non trouve` });
  }
  try {
    const input = typeof toolArgs === 'string' ? JSON.parse(toolArgs) : toolArgs;
    const result = await tool.handler(input);
    return JSON.stringify(result);
  } catch (err) {
    return JSON.stringify({ error: err.message });
  }
}

/**
 * Traite un message entrant et retourne la reponse
 */
async function processMessage({ phone, message, pushName, inputType = 'text' }) {
  // 1. Classifier le message
  const { sector, intent } = classify(message, process.env.SECTOR);
  console.log(`[AGENT] ${phone} | secteur=${sector} intent=${intent} | "${message.substring(0, 50)}"`);

  // 2. Charger l'historique et les metadata
  const history = getHistory(phone);
  const metadata = getMetadata(phone);

  // 3. Pre-fetch contexte (catalogue, calendrier, etc.)
  const context = await prefetchContext(sector, pushName);

  // 4. Construire le prompt systeme
  const systemPrompt = buildSystemPrompt(sector, metadata);

  // 5. Preparer les tools (format OpenAI)
  const baseTools = getBaseTools();
  const sectorTools = getSectorTools(sector);
  const allTools = [...baseTools, ...sectorTools];
  const toolDefinitions = allTools.map(t => t.definition);
  const openAITools = toOpenAITools(toolDefinitions);

  // 6. Construire le chatInput avec contexte injecte
  let chatInput = message;
  if (context) {
    chatInput = `${context}\n\nMessage du client: ${message}`;
  }

  // 7. Construire les messages
  const messages = [
    ...history,
    { role: 'user', content: chatInput }
  ];

  // 8. Appeler OpenRouter
  let response = await callOpenRouter(messages, systemPrompt, openAITools);
  let choice = response.choices?.[0];

  // 9. Boucle tool_call : executer les tools jusqu'a obtenir une reponse texte
  while (choice?.finish_reason === 'tool_calls' || choice?.message?.tool_calls?.length > 0) {
    const toolCalls = choice.message.tool_calls || [];

    // Ajouter le message assistant avec les tool_calls
    messages.push(choice.message);

    // Executer chaque tool et ajouter les resultats
    for (const tc of toolCalls) {
      const fnName = tc.function.name;
      const fnArgs = tc.function.arguments;
      console.log(`[TOOL] ${fnName}(${String(fnArgs).substring(0, 100)})`);

      const result = await executeTool(fnName, fnArgs, allTools);
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: result
      });
    }

    // Relancer l'appel
    response = await callOpenRouter(messages, systemPrompt, openAITools);
    choice = response.choices?.[0];
  }

  // 10. Extraire la reponse texte
  let rawReply = choice?.message?.content || 'Je suis la pour vous aider. Comment puis-je vous assister ?';

  // 11. Post-processing : parse tags, save RDV/leads, clean output
  const { cleanReply, actions } = await postProcess(rawReply, phone, pushName, sector);

  // 12. Determiner si reponse vocale
  const isNewLead = !metadata.leadCollected?.prenom;
  const isVocal = (isNewLead && inputType === 'audio') || inputType === 'audio';

  // 13. Sauvegarder l'echange
  saveExchange(phone, message, cleanReply, {
    pushName,
    sector,
    intent,
    leadData: actions.leadData || undefined
  });

  // 14. Sauvegarder comme lead si premier contact
  if (isNewLead && pushName) {
    saveLead({ phone, pushName, sector, firstMessage: message, intent });
  }

  return { reply: cleanReply, isVocal };
}

module.exports = { processMessage };
