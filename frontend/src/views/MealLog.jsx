// Retake Gym — log or edit one meal. With the server's meal AI on (GET /api/config `meal_ai`), a
// photo and/or a description is analysed into foods with portions and macros
// (POST /api/meals/analyze); every item can then be corrected before saving. Without it, or
// offline, items are entered by hand.
import { useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, getLang } from '../lib/i18n.js'
import { api } from '../lib/api.js'
import { fmtNum, todayISO, uid } from '../lib/format.js'
import { MEAL_SLOTS, cleanItem, scaleItem, sumMacros } from '../lib/nutrition.js'
import Icon from '../components/Icon.jsx'
import { slotName } from './Diet.jsx'
import { Button, NumberField, Section, SelectRow } from '../components/ui.jsx'

const toast = m => useUI.getState().toast(m)

/** The slot a meal logged now most likely belongs to. */
export function slotForHour(h) {
  if (h < 10) return 'breakfast'
  if (h < 15) return 'lunch'
  if (h < 18) return 'snack'
  if (h < 22) return 'dinner'
  return 'supper'
}

/** A picked photo shrunk to at most `max` px on its long side, as a JPEG data URL. */
export function shrinkPhoto(file, max = 1024) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')) }
    img.src = url
  })
}

function ItemRow({ item, onChange, onRemove }) {
  const low = item.confidence != null && item.confidence < 0.5
  const field = (key, label, unit, tone) => <label className={'meal-num meal-num-' + tone}>
    <span className="meal-num-l">{label}</span>
    <span className="meal-num-v">
      <NumberField value={item[key]} nullable onChange={v => onChange({ ...item, [key]: v || 0 })} />
      <i>{unit}</i>
    </span>
  </label>
  return <div className="meal-item">
    <div className="meal-item-top">
      <input className="meal-item-name" value={item.name} maxLength={80} placeholder={t('Food')}
        onChange={e => onChange({ ...item, name: e.target.value })} />
      <button className="iconbtn meal-item-del" onClick={onRemove} aria-label={t('Remove')}><Icon name="trash" /></button>
    </div>
    <div className="meal-item-nums">
      <label className="meal-num meal-num-grams">
        <span className="meal-num-l">{t('Grams')}</span>
        <span className="meal-num-v">
          <NumberField value={item.grams} nullable decimal={false}
            onChange={g => onChange(item.grams > 0 && g > 0 ? scaleItem(item, g) : { ...item, grams: g || 0 })} />
          <i>g</i>
        </span>
      </label>
      {field('kcal', 'kcal', '', 'kcal')}
      {field('protein', 'P', 'g', 'p')}
      {field('carbs', 'C', 'g', 'c')}
      {field('fat', 'G', 'g', 'f')}
    </div>
    {low && <div className="small meal-item-warn">{t('Not sure about this one: check the portion.')}</div>}
  </div>
}

function MealLog({ meal, date, slot, close }) {
  const aiOn = !!useStore(s => s.config)?.meal_ai
  const [items, setItems] = useState(() => (meal?.items || []).map(i => ({ ...i })))
  const [title, setTitle] = useState(meal?.title || '')
  const [mealSlot, setSlot] = useState(meal?.slot || slot || slotForHour(new Date().getHours()))
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notes, setNotes] = useState('')
  const [source, setSource] = useState(meal?.source || 'manual')
  const fileRef = useRef(null)

  const pick = async e => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try { setPhoto(await shrinkPhoto(f)) } catch { toast(t('Could not read that photo')) }
  }

  const analyse = async () => {
    if (!photo && !text.trim()) { toast(t('Add a photo or describe the meal')); return }
    setBusy(true)
    try {
      const r = await api('/api/meals/analyze', {
        method: 'POST', timeout: 90000,
        body: JSON.stringify({ text: text.trim() || undefined, image: photo || undefined, lang: getLang() })
      })
      const got = (r.items || []).map(cleanItem).filter(Boolean)
      if (!got.length) { toast(r.notes || t('No food found. Try another photo or describe it.')); return }
      setItems(list => [...list, ...got])
      if (!title && r.title) setTitle(r.title)
      setNotes(r.notes || '')
      setSource(photo ? 'ai-photo' : 'ai-text')
      setPhoto(null); setText('')
    } catch (e) {
      toast(e?.message || t('The meal AI could not be reached'))
    } finally { setBusy(false) }
  }

  const addManual = () => setItems(list => [...list, { name: '', grams: 100, kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }])

  const save = () => {
    const clean = items.map(cleanItem).filter(Boolean)
    if (!clean.length) { toast(t('Add at least one food')); return }
    const id = meal?.id || uid()
    const now = Date.now()
    useStore.getState().update(s => {
      s.meals = s.meals || {}
      s.meals[id] = {
        id, date: meal?.date || date || todayISO(), slot: mealSlot, title: title.trim().slice(0, 120),
        items: clean, source, at: meal?.at || now, _ts: now
      }
    })
    close()
    toast(t('Meal saved'))
  }

  const tot = sumMacros(items)

  return <>
    <h3>{meal ? t('Edit meal') : t('Log a meal')}</h3>
    <Section>
      <SelectRow title={t('Meal')} value={mealSlot} onChange={setSlot}
        options={MEAL_SLOTS.map(s => ({ value: s, label: slotName(s) }))} />
    </Section>

    {aiOn ? <div className="card meal-ai">
      <div className="row" style={{ gap: 8, marginBottom: 8 }}><Icon name="sparkles" /><b>{t('Log with AI')}</b></div>
      <div className="muted small" style={{ marginBottom: 10 }}>{t('Take a photo of the plate or describe what you ate. You can fix anything before saving.')}</div>
      {photo && <div className="meal-photo"><img src={photo} alt="" /><button className="iconbtn" onClick={() => setPhoto(null)} aria-label={t('Remove photo')}><Icon name="trash" /></button></div>}
      <textarea className="input" rows={2} maxLength={1000} value={text} onChange={e => setText(e.target.value)}
        placeholder={t('e.g. 2 scrambled eggs, a bread roll with butter and a coffee with milk')} />
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <Button variant="tinted" icon="camera" onClick={() => fileRef.current?.click()} disabled={busy}>{t('Photo')}</Button>
        <Button variant="primary" icon="sparkles" onClick={analyse} disabled={busy}>{busy ? t('Analysing…') : t('Analyse')}</Button>
      </div>
      {notes && <div className="small muted" style={{ marginTop: 8 }}>{notes}</div>}
    </div> : <div className="muted small" style={{ margin: '4px 0 12px' }}>{t('AI meal logging is not set up on this server, so add the foods by hand.')}</div>}

    {items.length > 0 && <>
      <input className="input" style={{ marginBottom: 10 }} value={title} maxLength={120} placeholder={t('Name of the meal (optional)')}
        onChange={e => setTitle(e.target.value)} />
      {items.map((it, i) => <ItemRow key={i} item={it}
        onChange={next => setItems(list => list.map((x, j) => (j === i ? next : x)))}
        onRemove={() => setItems(list => list.filter((_, j) => j !== i))} />)}
      <div className="meal-total small">
        <b>{fmtNum(Math.round(tot.kcal))} kcal</b> · P {fmtNum(Math.round(tot.protein))} g · C {fmtNum(Math.round(tot.carbs))} g · G {fmtNum(Math.round(tot.fat))} g
      </div>
    </>}

    <Button variant="ghost" icon="plus" onClick={addManual}>{t('Add food by hand')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="primary" onClick={save} disabled={busy || !items.length}>{t('Save')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>
}

export const mealLogSheet = (props = {}) => useUI.getState().openSheet(close => <MealLog {...props} close={close} />)
