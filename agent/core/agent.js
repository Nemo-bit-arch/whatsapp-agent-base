/**
 * Agent - Logique principale : appel LLM via OpenRouter (format OpenAI)
 * SOLIDIFIE: timeout LLM, retry, catch global, prefetch timeout
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
const LLM_TIMEOUT_MS = 25000;
const LLM_MAX_RETRIES = 2;

function loadPrompt(filename) {
  const filePath = path.join(__dirname, '../prompts', filename);
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf-8');
}

function loadOverlay(sector) {
  const filePath = path.join(__dirname, '../prompts/overlays', `${sector}.md`);
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf-8');
}

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

async function callOpenRouter(messages, systemPrompt, tools, attempt = 1) {
  const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001';
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) throw new Error('OPENROUTER_API_KEY manquante');

  const body = {
    model,
    max_tokens: 1024,
    messages: [{ role: 'system', content: systemPrompt }, ...messages]
  };

  if (tools && tools.length > 0) body.tools = tools;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter ${res.status}: ${errText.substring(0, 200)}`);
    }

    return await res.json();
  } catch (err) {
    clearTimeout(timer);

    if (attempt < LLM_MAX_RETRIES) {
      const reason = err.name === 'AbortError' ? 'timeout' : err.message;
      console.log(`[AGENT] LLM tentative ${attempt} echouee (${reason}), retry...`);
      return callOpenRouter(messages, systemPrompt, tools, attempt + 1);
    }
    throw err;
  }
}

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

async function processMessage({ phone, message, pushName, inputType = 'text' }) {
  const startTime = Date.now();

  try {
    const { sector, intent } = classify(message, process.env.SECTOR);
    console.log(`[AGENT] ${phone} | secteur=${sector} intent=${intent} | "${message.substring(0, 50)}"`);

    const history = getHistory(phone);
    const metadata = getMetadata(phone);

    // Premier message + salutation = reponse directe sans LLM
    if (history.length === 0 && intent === 'salutation') {
      const nom = pushName || 'cher client';
      const heure = new Date().getHours();
      const salut = heure >= 18 || heure < 6 ? 'Bonsoir' : 'Bonjour';
      const greeting = `${salut} ${nom} ! 😊 Bienvenue chez ${process.env.CLIENT_NAME || 'nous'}. Comment puis-je vous aider ?`;

      saveExchange(phone, message, greeting, { pushName, sector, intent });
      saveLead({ phone, pushName, sector, firstMessage: message, intent });

      console.log(`[AGENT] Greeting en ${Date.now() - startTime}ms`);
      return { reply: greeting, isVocal: false };
    }

    // Pre-fetch contexte avec timeout de 8s
    let context = null;
    try {
      const prefetchPromise = prefetchContext(sector, pushName);
      const prefetchTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('prefetch timeout')), 8000)
      );
      context = await Promise.race([prefetchPromise, prefetchTimeout]);
    } catch (e) {
      console.log(`[AGENT] Prefetch skip: ${e.message}`);
    }

    const systemPrompt = buildSystemPrompt(sector, metadata);

    const baseTools = getBaseTools();
    const sectorTools = getSectorTools(sector);
    const allTools = [...baseTools, ...sectorTools];
    const toolDefinitions = allTools.map(t => t.definition);
    const openAITools = toOpenAITools(toolDefinitions);

    let chatInput = message;
    if (context) {
      chatInput = `${context}\n\nMessage du client: ${message}`;
    }

    if (history.length > 0) {
      chatInput += `\n\n[INSTRUCTION: Tu as DEJA echange avec ce client (${history.length} messages precedents). NE DIS PAS bonjour/bonsoir/salut. Reponds DIRECTEMENT au sujet sans salutation ni prenom en debut de phrase.]`;
    } else {
      chatInput += `\n\n[INSTRUCTION: C'est le PREMIER message de ce client. Tu DOIS commencer ta reponse par une salutation chaleureuse avec son prenom. Exemple: "Bonsoir ${pushName || 'cher client'} ! 😊 Comment puis-je vous aider ?"]`;
    }

    const messages = [...history, { role: 'user', content: chatInput }];

    let response = await callOpenRouter(messages, systemPrompt, openAITools);
    let choice = response.choices?.[0];

    // Boucle tool_call : max 3 iterations
    let toolIterations = 0;
    const MAX_TOOL_ITERATIONS = 3;
    while ((choice?.finish_reason === 'tool_calls' || choice?.message?.tool_calls?.length > 0) && toolIterations < MAX_TOOL_ITERATIONS) {
      toolIterations++;
      const toolCalls = choice.message.tool_calls || [];
      messages.push(choice.message);

      for (const tc of toolCalls) {
        const fnName = tc.function.name;
        const fnArgs = tc.function.arguments;
        console.log(`[TOOL] ${fnName}(${String(fnArgs).substring(0, 100)})`);
        const result = await executeTool(fnName, fnArgs, allTools);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
      }

      response = await callOpenRouter(messages, systemPrompt, openAITools);
      choice = response.choices?.[0];
    }

    if (toolIterations >= MAX_TOOL_ITERATIONS) {
      console.log(`[AGENT] Max tool iterations atteint (${MAX_TOOL_ITERATIONS})`);
    }

    let rawReply = choice?.message?.content || 'Je suis la pour vous aider. Comment puis-je vous assister ?';

    const { cleanReply, actions } = await postProcess(rawReply, phone, pushName, sector, message);

    const isNewLead = !metadata.leadCollected?.prenom;
    const isVocal = (isNewLead && inputType === 'audio') || inputType === 'audio';

    saveExchange(phone, message, cleanReply, {
      pushName, sector, intent,
      leadData: actions.leadData || undefined
    });

    if (isNewLead && pushName) {
      saveLead({ phone, pushName, sector, firstMessage: message, intent });
    }

    console.log(`[AGENT] Reponse en ${Date.now() - startTime}ms`);
    return { reply: cleanReply, isVocal };

  } catch (err) {
    console.error(`[AGENT] ERREUR FATALE pour ${phone}:`, err.message);

    const fallbackReply = 'Je suis desole, je rencontre un petit souci technique. Pouvez-vous reformuler votre message ?';
    try { saveExchange(phone, message, fallbackReply, { pushName }); } catch (e) {}

    return { reply: fallbackReply, isVocal: false };
  }
}

module.exports = { processMessage };
