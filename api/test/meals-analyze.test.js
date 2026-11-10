import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRequest, buildMessages, normalize, analyzeMeal, takeQuota, isEnabled, DEFAULT_MODEL } from '../meals/analyze.js';

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
  const r = await analyzeMeal(parseRequest({ text: '2 ovos' }), { env: {}, create });
  assert.equal(sent.model, DEFAULT_MODEL);
  assert.equal(sent.output_config.format.type, 'json_schema');
  assert.equal(sent.fallbacks, 'default');
  assert.ok(r.ok);
  assert.equal(r.meal.items[0].name, 'Ovo mexido');
});

test('analyzeMeal maps refusals and failures to errors', async () => {
  assert.equal((await analyzeMeal(parseRequest({ text: 'x' }), { create: async () => ({ stop_reason: 'refusal', content: [] }) })).status, 422);
  assert.equal((await analyzeMeal(parseRequest({ text: 'x' }), { create: async () => { throw Object.assign(new Error('rl'), { status: 429 }); } })).status, 429);
  assert.equal((await analyzeMeal(parseRequest({ text: 'x' }), { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] }) })).status, 502);
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

test('isEnabled follows ANTHROPIC_API_KEY', () => {
  assert.equal(isEnabled({}), false);
  assert.equal(isEnabled({ ANTHROPIC_API_KEY: 'sk-ant-x' }), true);
});
