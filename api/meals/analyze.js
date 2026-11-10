/* Retake Gym — AI meal analysis.
 *
 * A meal comes in as a photo, a description, or both; the model returns the foods it sees with
 * a portion in grams and the energy and macros of that portion. The app shows the result for
 * review before anything is saved (frontend/src/views/MealLog.jsx), so this module never
 * writes to the user's state.
 *
 * Configuration (environment):
 *   GEMINI_API_KEY      Google Gemini key: the default provider when it is set
 *   ANTHROPIC_API_KEY   Claude key: used when there is no Gemini key (or MEAL_AI_PROVIDER=anthropic)
 *   MEAL_AI_PROVIDER    optional, 'gemini' or 'anthropic' to pick one when both keys are set
 *   MEAL_AI_MODEL       optional, the model name (defaults below, per provider)
 *   MEAL_AI_DAILY_CAP   optional, analyses per user per day (default 40)
 * Without any key the feature is off.
 *
 * The photo is passed through to the provider and not stored anywhere on this server.
 */
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';

export const DEFAULT_MODELS = { gemini: 'gemini-3.8-flash', anthropic: 'claude-opus-5-5' };
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_TEXT = 1000;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const has = v => typeof v === 'string' && !!v.trim();
/** 'gemini', 'anthropic', or null when no key is configured. */
export function providerOf(env = process.env) {
  const want = (env.MEAL_AI_PROVIDER || '').trim().toLowerCase();
  if (want === 'gemini' && has(env.GEMINI_API_KEY)) return 'gemini';
  if (want === 'anthropic' && has(env.ANTHROPIC_API_KEY)) return 'anthropic';
  if (has(env.GEMINI_API_KEY)) return 'gemini';
  if (has(env.ANTHROPIC_API_KEY)) return 'anthropic';
  return null;
}
export const isEnabled = (env = process.env) => providerOf(env) !== null;

// What Claude must return. Kept flat and small so it is cheap to generate and easy to validate.
export const MEAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'title', 'notes'],
  properties: {
    title: { type: 'string', description: 'Short name for the meal, in the requested language, e.g. "Arroz, feijão e frango grelhado".' },
    notes: { type: 'string', description: 'One short sentence on what was uncertain (hidden oil, sauce, portion), or empty.' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'grams', 'kcal', 'protein', 'carbs', 'fat', 'fiber', 'confidence'],
        properties: {
          name: { type: 'string', description: 'Food name in the requested language, with the preparation (e.g. "Frango grelhado").' },
          grams: { type: 'number', description: 'Estimated edible portion in grams (ml for drinks).' },
          kcal: { type: 'number' },
          protein: { type: 'number', description: 'grams' },
          carbs: { type: 'number', description: 'grams' },
          fat: { type: 'number', description: 'grams' },
          fiber: { type: 'number', description: 'grams' },
          confidence: { type: 'number', description: '0 to 1: how sure the identification and portion are.' }
        }
      }
    }
  }
};

export const SYSTEM_PROMPT = [
  'You are the meal logger of Retake Gym, a training and diet app used mostly in Brazil.',
  'From a photo of a meal and/or a short description, list each distinct food or drink with an estimated portion and its nutrition for that portion.',
  'Use Brazilian food composition data (TACO, Unicamp) for Brazilian foods and preparations when you know it, and common nutrition databases otherwise.',
  'Estimate portions from visual cues (plate size, cutlery, packaging) and the description. When the user states a quantity, use it.',
  'Account for visible or very likely cooking fat and sauces, and mention the uncertainty in notes.',
  'Make kcal consistent with the macros (4 kcal/g protein and carbs, 9 kcal/g fat, 7 kcal/g alcohol).',
  'If the input shows no food at all, return an empty items list and say so in notes.',
  'Write names, title and notes in the language requested.'
].join('\n');

/** The request body validated and reduced to what the analysis uses, or { error }. */
export function parseRequest(body) {
  if (!body || typeof body !== 'object') return { error: 'invalid body' };
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT) : '';
  let image = null;
  if (body.image != null) {
    const m = typeof body.image === 'string' && /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(body.image);
    if (!m || !IMAGE_TYPES.has(m[1])) return { error: 'image must be a base64 data URL (jpeg, png, webp or gif)' };
    if (Math.floor(m[2].length * 3 / 4) > MAX_IMAGE_BYTES) return { error: 'image too large' };
    image = { mediaType: m[1], data: m[2] };
  }
  if (!text && !image) return { error: 'send a photo, a description, or both' };
  const lang = typeof body.lang === 'string' && /^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})?$/.test(body.lang) ? body.lang : 'pt-BR';
  return { text, image, lang };
}

/** The messages for one analysis. */
export function buildMessages({ text, image, lang }) {
  const content = [];
  if (image) content.push({ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } });
  content.push({ type: 'text', text: `Language: ${lang}\n` + (text ? `Description from the user: ${text}` : 'No description, use the photo.') });
  return [{ role: 'user', content }];
}

const num = (v, max) => Math.min(max, Math.max(0, Math.round((Number(v) || 0) * 10) / 10));

/** Claude's answer made safe for the app: bounded numbers, at most 30 items. */
export function normalize(out) {
  const items = (Array.isArray(out?.items) ? out.items : []).slice(0, 30).map(it => ({
    name: String(it?.name || '').trim().slice(0, 80),
    grams: num(it?.grams, 5000),
    kcal: num(it?.kcal, 10000),
    protein: num(it?.protein, 1000),
    carbs: num(it?.carbs, 1000),
    fat: num(it?.fat, 1000),
    fiber: num(it?.fiber, 300),
    confidence: Math.min(1, Math.max(0, Number(it?.confidence) || 0))
  })).filter(it => it.name);
  return {
    title: String(out?.title || '').trim().slice(0, 120),
    notes: String(out?.notes || '').trim().slice(0, 300),
    items
  };
}

const failed = e => (console.error('meal AI error:', e?.status || '', String(e?.message || e).slice(0, 300)), e?.status === 429
  ? { ok: false, status: 429, error: 'the meal AI is busy, try again in a minute' }
  : { ok: false, status: 502, error: 'the meal AI could not be reached' });

const parsedMeal = text => {
  try { return { ok: true, meal: normalize(JSON.parse(text)) }; }
  catch { console.error('meal AI unreadable answer:', String(text).slice(0, 200)); return { ok: false, status: 502, error: 'the meal AI answered in an unexpected format' }; }
};

let anthropicClient = null;
const geminiClients = {};
let geminiBackend = null;   // the one that last answered: 'gemini' (AI Studio) or 'vertex'

/**
 * Which Google backend a key belongs to. AI Studio keys ("AIza…") call the Gemini API; Google
 * Cloud / Vertex AI express-mode keys ("AQ.…") only work against Vertex AI. GEMINI_BACKEND
 * (gemini | vertex) overrides the guess.
 */
export function geminiBackendFor(env = process.env) {
  const want = (env.GEMINI_BACKEND || '').trim().toLowerCase();
  if (want === 'vertex' || want === 'gemini') return want;
  return /^AQ\./.test((env.GEMINI_API_KEY || '').trim()) ? 'vertex' : 'gemini';
}

/** One generateContent call; an auth refusal from the guessed backend is retried on the other. */
async function geminiCall(env, params) {
  const apiKey = env.GEMINI_API_KEY.trim();
  const client = b => (geminiClients[b] ||= new GoogleGenAI(b === 'vertex' ? { vertexai: true, apiKey } : { apiKey }));
  const first = geminiBackend || geminiBackendFor(env);
  try {
    const r = await client(first).models.generateContent(params);
    geminiBackend = first;
    return r;
  } catch (e) {
    const st = e?.status ?? e?.code;
    if (env.GEMINI_BACKEND || ![400, 401, 403].includes(st)) throw e;
    const other = first === 'vertex' ? 'gemini' : 'vertex';
    console.error(`meal AI: ${first} refused the key (${st}), trying ${other}`);
    const r = await client(other).models.generateContent(params);
    geminiBackend = other;
    return r;
  }
}

/** Claude, with structured outputs. `create` is injectable for tests. */
async function viaAnthropic(req, env, create) {
  const call = create || (params => (anthropicClient ||= new Anthropic()).beta.messages.create(params));
  let res;
  try {
    res = await call({
      model: (env.MEAL_AI_MODEL || '').trim() || DEFAULT_MODELS.anthropic,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: buildMessages(req),
      output_config: { effort: 'low', format: { type: 'json_schema', schema: MEAL_SCHEMA } },
      // On a policy decline, re-run on the fallback model the API picks for that category.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default'
    });
  } catch (e) { return failed(e); }
  if (res?.stop_reason === 'refusal') return { ok: false, status: 422, error: 'the meal AI could not analyse this input' };
  if (res?.stop_reason === 'max_tokens') return { ok: false, status: 502, error: 'the meal AI answer was cut off' };
  return parsedMeal((res?.content || []).filter(b => b.type === 'text').map(b => b.text).join(''));
}

/** Gemini, with a JSON response schema. `create` is injectable for tests. */
async function viaGemini(req, env, create) {
  const call = create || (params => geminiCall(env, params));
  const parts = [];
  if (req.image) parts.push({ inlineData: { mimeType: req.image.mediaType, data: req.image.data } });
  parts.push({ text: buildMessages({ ...req, image: null })[0].content[0].text });
  let res;
  try {
    res = await call({
      model: (env.MEAL_AI_MODEL || '').trim() || DEFAULT_MODELS.gemini,
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseJsonSchema: MEAL_SCHEMA,
        maxOutputTokens: 4000
      }
    });
  } catch (e) { return failed(e); }
  const reason = res?.candidates?.[0]?.finishReason;
  if (reason && reason !== 'STOP') console.error('meal AI gemini finish:', reason, res?.promptFeedback?.blockReason || '');
  if (res?.promptFeedback?.blockReason || reason === 'SAFETY' || reason === 'PROHIBITED_CONTENT') {
    return { ok: false, status: 422, error: 'the meal AI could not analyse this input' };
  }
  if (reason === 'MAX_TOKENS') return { ok: false, status: 502, error: 'the meal AI answer was cut off' };
  return parsedMeal(res?.text || '');
}

/**
 * Runs one analysis with the configured provider. Resolves to { ok: true, meal } or
 * { ok: false, status, error }. `provider` and `create` are injectable for tests.
 */
export async function analyzeMeal(req, { env = process.env, provider = providerOf(env), create } = {}) {
  if (provider === 'gemini') return viaGemini(req, env, create);
  if (provider === 'anthropic') return viaAnthropic(req, env, create);
  return { ok: false, status: 503, error: 'meal AI is not set up on this server' };
}

/* ---------- per-user daily cap ---------- */
const used = new Map();   // `${uid}|${day}` -> count
export function takeQuota(uid, env = process.env, now = new Date()) {
  const cap = Math.max(1, parseInt(env.MEAL_AI_DAILY_CAP, 10) || 40);
  const day = now.toISOString().slice(0, 10);
  const key = `${uid}|${day}`;
  for (const k of used.keys()) if (!k.endsWith('|' + day)) used.delete(k);
  const n = used.get(key) || 0;
  if (n >= cap) return false;
  used.set(key, n + 1);
  return true;
}
