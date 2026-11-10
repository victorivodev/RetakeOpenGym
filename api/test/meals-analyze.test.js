import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRequest, buildMessages, normalize, analyzeMeal, takeQuota, isEnabled, providerOf, DEFAULT_MODELS } from '../meals/analyze.js';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('parseRequest wants a photo or a description', () => {
  assert.ok(parseRequest({}).error);
  assert.ok(parseRequest({ text: '   ' }).error);
  assert.ok(parseRequest({ image: 'http://x/y.png' }).error);
  assert.ok(parseRequest({ image: 'data:image/svg+xml;base64,AAAA' }).error);
  const r = parseRequest({ text: ' 2 ovos ', image: PNG, lang: 'xx"; drop' });
  assert.equal(r.text, '2 ovos');
  assert.equal(r.image.mediaType, 'image/png');
  assert.equal(r.lang, 'pt-BR');
});

test('buildMessages puts the image before the text', () => {
  const m = buildMessages(parseRequest({ text: 'arroz', image: PNG, lang: 'en' }));
  assert.equal(m[0].content[0].type, 'image');
  assert.match(m[0].content[1].text, /Language: en/);
});

test('normalize bounds numbers and drops nameless items', () => {
  const out = normalize({ title: 'x', items: [{ name: 'Arroz', grams: '120', kcal: -5, protein: 3, carbs: 34, fat: 0.3, fiber: 1, confidence: 7 }, { name: '' }] });
  assert.equal(out.items.length, 1);
  assert.deepEqual(out.items[0], { name: 'Arroz', grams: 120, kcal: 0, protein: 3, carbs: 34, fat: 0.3, fiber: 1, confidence: 1 });
});

test('analyzeMeal sends structured-output params and reads the JSON back', async () => {
  let sent;
  const create = async p => { sent = p; return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ title: 'Ovos', notes: '', items: [{ name: 'Ovo mexido', grams: 100, kcal: 150, protein: 10, carbs: 1, fat: 11, fiber: 0, confidence: 0.8 }] }) }] }; };
  const r = await analyzeMeal(parseRequest({ text: '2 ovos' }), { env: {}, provider: 'anthropic', create });
  assert.equal(sent.model, DEFAULT_MODELS.anthropic);
  assert.equal(sent.output_config.format.type, 'json_schema');
  assert.equal(sent.fallbacks, 'default');
  assert.ok(r.ok);
  assert.equal(r.meal.items[0].name, 'Ovo mexido');
});

test('analyzeMeal maps refusals and failures to errors', async () => {
  const provider = 'anthropic';
  assert.equal((await analyzeMeal(parseRequest({ text: 'x' }), { provider, create: async () => ({ stop_reason: 'refusal', content: [] }) })).status, 422);
  assert.equal((await analyzeMeal(parseRequest({ text: 'x' }), { provider, create: async () => { throw Object.assign(new Error('rl'), { status: 429 }); } })).status, 429);
  assert.equal((await analyzeMeal(parseRequest({ text: 'x' }), { provider, create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] }) })).status, 502);
});

test('takeQuota caps per user per day', () => {
  const env = { MEAL_AI_DAILY_CAP: '2' };
  const day = new Date('2026-11-10T12:00:00Z');
  assert.ok(takeQuota('u1', env, day));
  assert.ok(takeQuota('u1', env, day));
  assert.equal(takeQuota('u1', env, day), false);
  assert.ok(takeQuota('u2', env, day));
  assert.ok(takeQuota('u1', env, new Date('2026-11-11T12:00:00Z')));
});

test('the provider follows the keys, Gemini first', () => {
  assert.equal(isEnabled({}), false);
  assert.equal(providerOf({ ANTHROPIC_API_KEY: 'sk-ant-x' }), 'anthropic');
  assert.equal(providerOf({ GEMINI_API_KEY: 'AIza', ANTHROPIC_API_KEY: 'sk-ant-x' }), 'gemini');
  assert.equal(providerOf({ GEMINI_API_KEY: 'AIza', ANTHROPIC_API_KEY: 'sk-ant-x', MEAL_AI_PROVIDER: 'anthropic' }), 'anthropic');
  assert.equal(providerOf({ GEMINI_API_KEY: ' ', MEAL_AI_PROVIDER: 'gemini' }), null);
});

test('Gemini gets the photo inline, the schema, and the JSON back', async () => {
  let sent;
  const create = async p => { sent = p; return { candidates: [{ finishReason: 'STOP' }], text: JSON.stringify({ title: 'Prato', notes: '', items: [{ name: 'Arroz', grams: 150, kcal: 192, protein: 3.8, carbs: 42, fat: 0.3, fiber: 2, confidence: 0.8 }] }) }; };
  const r = await analyzeMeal(parseRequest({ text: 'arroz', image: PNG }), { env: {}, provider: 'gemini', create });
  assert.equal(sent.model, DEFAULT_MODELS.gemini);
  assert.equal(sent.contents[0].parts[0].inlineData.mimeType, 'image/png');
  assert.match(sent.contents[0].parts[1].text, /arroz/);
  assert.equal(sent.config.responseMimeType, 'application/json');
  assert.ok(sent.config.responseJsonSchema.properties.items);
  assert.ok(r.ok);
  assert.equal(r.meal.items[0].name, 'Arroz');
});

test('Gemini blocks and cut-offs become errors', async () => {
  const provider = 'gemini';
  assert.equal((await analyzeMeal(parseRequest({ text: 'x' }), { provider, create: async () => ({ promptFeedback: { blockReason: 'SAFETY' } }) })).status, 422);
  assert.equal((await analyzeMeal(parseRequest({ text: 'x' }), { provider, create: async () => ({ candidates: [{ finishReason: 'MAX_TOKENS' }], text: '{' }) })).status, 502);
  assert.equal((await analyzeMeal(parseRequest({ text: 'x' }), { provider, create: async () => { throw Object.assign(new Error('q'), { status: 429 }); } })).status, 429);
});

test('a Google Cloud express key goes to Vertex, an AI Studio key to the Gemini API', async () => {
  const { geminiBackendFor } = await import('../meals/analyze.js');
  assert.equal(geminiBackendFor({ GEMINI_API_KEY: 'AIzaSyX' }), 'gemini');
  assert.equal(geminiBackendFor({ GEMINI_API_KEY: ' AQ.Ab8RN6L_x' }), 'vertex');
  assert.equal(geminiBackendFor({ GEMINI_API_KEY: 'AQ.x', GEMINI_BACKEND: 'gemini' }), 'gemini');
});
