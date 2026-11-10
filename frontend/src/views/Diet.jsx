// Retake Gym — the Diet tab: today's calories and macros against the goal, water, the meals by
// slot, and the way into logging a meal (MealLog.jsx, by photo or text with the AI, or by hand).
import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { fmtDate, fmtNum, todayISO } from '../lib/format.js'
import {
  MEAL_SLOTS, ACTIVITY, GOALS, dailyTargets, dayTotals, remaining, mealsList, targetsFor, latestWeightKg,
  waterTarget, dailyIntakes, adaptiveTdee, sumMacros
} from '../lib/nutrition.js'
import Icon from '../components/Icon.jsx'
import { Button, NumberField, Section, SelectRow } from '../components/ui.jsx'
import { mealLogSheet } from './MealLog.jsx'
import { confirmSheet } from '../sheets.jsx'
import { socialApi } from '../lib/api.js'

// Functions, so the words are looked up in the language showing at the time.
export const slotName = s => ({ breakfast: t('Breakfast'), lunch: t('Lunch'), snack: t('Snack'), dinner: t('Dinner'), supper: t('Supper') })[s] || s
const goalName = g => ({ lose: t('Lose weight'), maintain: t('Maintain weight'), gain: t('Gain muscle'), recomp: t('Recomposition') })[g] || g
const activityName = a => ({
  sedentary: t('Sedentary'), light: t('Light (1-3 sessions a week)'), moderate: t('Moderate (3-5 sessions a week)'),
  active: t('Active (6-7 sessions a week)'), athlete: t('Athlete (twice a day)')
})[a] || a

const update = fn => useStore.getState().update(fn)
const toast = m => useUI.getState().toast(m)
const shiftDay = (iso, n) => {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function Bar({ label, value, target, unit = 'g', color }) {
  const p = target > 0 ? Math.min(1, value / target) : 0
  const over = target > 0 && value > target * 1.05
  return <div className="diet-bar">
    <div className="pbar-t small"><span>{label}</span>
      <span className="pbar-n" style={over ? { color: 'var(--orange)' } : undefined}>{fmtNum(Math.round(value))}{target ? ' / ' + fmtNum(target) : ''} {unit}</span></div>
    <span className="pbar"><i style={{ '--p': p, background: color }} /></span>
  </div>
}

function DietGoals({ close }) {
  const S = useStore(s => s.S)
  const d = S.diet || {}
  const knownKg = latestWeightKg(S)
  const [form, setForm] = useState({
    sex: d.sex || (S.body === 'female' ? 'female' : 'male'),
    heightCm: d.heightCm || null, birthYear: d.birthYear || null, weightKg: d.weightKg || null,
    activity: d.activity || 'moderate', goal: d.goal || 'maintain',
    ratePerWeekKg: d.ratePerWeekKg ?? 0.5, freeMealsPerWeek: d.freeMealsPerWeek ?? 1
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  // The sum as it stands, so the numbers change while the form is filled in.
  const preview = dailyTargets({
    ...form, weightKg: knownKg ?? form.weightKg,
    ageYears: form.birthYear ? new Date().getFullYear() - form.birthYear : null
  })
  const kc = v => fmtNum(Math.round(v)) + ' kcal'
  const save = () => {
    const year = new Date().getFullYear()
    if (!(form.heightCm >= 100 && form.heightCm <= 250)) { toast(t('Enter your height in cm')); return }
    if (!(form.birthYear >= year - 100 && form.birthYear <= year - 12)) { toast(t('Enter your year of birth')); return }
    if (!knownKg && !(form.weightKg >= 30 && form.weightKg <= 300)) { toast(t('Enter your weight in kg')); return }
    update(s => { s.diet = { ...form, weightKg: knownKg ? null : form.weightKg } })
    close()
  }
  return <>
    <h3>{t('Your diet goal')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>{t('Used to work out your daily calories and macros. Your weight comes from your latest weigh-in.')}</div>
    <Section>
      <SelectRow title={t('Goal')} value={form.goal} onChange={v => set('goal', v)}
        options={GOALS.map(g => ({ value: g, label: goalName(g) }))} />
      {(form.goal === 'lose' || form.goal === 'gain') && <SelectRow title={t('Pace')} value={form.ratePerWeekKg} onChange={v => set('ratePerWeekKg', v)}
        options={[0.25, 0.5, 0.75, 1].map(v => ({ value: v, label: t('{0} kg per week', fmtNum(v)) }))} />}
      {form.goal === 'lose' && <SelectRow title={t('Free meals per week')} value={form.freeMealsPerWeek} onChange={v => set('freeMealsPerWeek', v)}
        options={[0, 1, 2].map(v => ({ value: v, label: v ? fmtNum(v) : t('No free meal') }))} />}
      <SelectRow title={t('Activity level')} value={form.activity} onChange={v => set('activity', v)}
        options={Object.keys(ACTIVITY).map(a => ({ value: a, label: activityName(a) }))} />
      <SelectRow title={t('Sex')} value={form.sex} onChange={v => set('sex', v)}
        options={[{ value: 'male', label: t('Male') }, { value: 'female', label: t('Female') }]} />
      <div className="lrow"><span className="lrow-t">{t('Height (cm)')}</span>
        <NumberField value={form.heightCm} nullable decimal={false} onChange={v => set('heightCm', v)} /></div>
      <div className="lrow"><span className="lrow-t">{t('Year of birth')}</span>
        <NumberField value={form.birthYear} nullable decimal={false} onChange={v => set('birthYear', v)} /></div>
      {!knownKg && <div className="lrow"><span className="lrow-t">{t('Weight (kg)')}</span>
        <NumberField value={form.weightKg} nullable onChange={v => set('weightKg', v)} /></div>}
    </Section>
    {preview && <>
      <div style={{ height: 14 }} />
      <Section>
        <div className="lrow"><span className="lrow-t">{t('Basal metabolism')}</span><b>{kc(preview.bmr)}</b></div>
        <div className="lrow"><span className="lrow-t">{t('Daily burn with activity')}</span><b>{kc(preview.tdee)}</b></div>
        {preview.deficit != null && <div className="lrow"><span className="lrow-t">{t('Deficit on diet days')}</span><b>−{kc(preview.deficit)}</b></div>}
        <div className="lrow"><span className="lrow-t">{t('Daily target')}</span><b style={{ color: 'var(--blue)' }}>{kc(preview.kcal)}</b></div>
      </Section>
      {preview.dietDays != null && <div className="muted small" style={{ marginTop: 8 }}>
        {preview.dietDays < 7
          ? t('Deficit spread over {0} diet days a week; on the free meal day you eat about your daily burn. Includes a 10% margin.', preview.dietDays)
          : t('Deficit spread over the 7 days of the week. Includes a 10% margin.')}
      </div>}
      {preview.limited && <div className="small" style={{ marginTop: 8, color: 'var(--orange)' }}>
        {t('At this pace the target would fall below the safe minimum ({0}). The most you can lose safely is about {1} kg per week.', kc(preview.kcal), fmtNum(preview.reachableRatePerWeekKg))}
      </div>}
    </>}
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
  </>
}

export const dietGoalsSheet = () => useUI.getState().openSheet(close => <DietGoals close={close} />)

export default function Diet() {
  const S = useStore(s => s.S)
  const [shareCalories, setShareCalories] = useState(false)
  const [date, setDate] = useState(todayISO())
  const meals = useMemo(() => mealsList(S.meals), [S.meals])
  const targets = targetsFor(S)
  const day = dayTotals(meals, date)
  const left = remaining(targets, day.total)
  const weightKg = latestWeightKg(S) ?? S.diet?.weightKg
  const water = S.water?.[date]?.ml || 0
  const waterGoal = waterTarget(weightKg)
  const week = dailyIntakes(S.meals, 7)
  const weekAvg = week.length ? Math.round(week.reduce((a, d) => a + d.kcal, 0) / week.length) : null
  const real = useMemo(() => {
    const ws = (S.bodyweight || []).map(e => ({ date: e.d, kg: S.unit === 'lb' ? e.w * 0.45359237 : e.w }))
    const from = shiftDay(todayISO(), -28)
    return adaptiveTdee(dailyIntakes(S.meals, 28), ws.filter(w => w.date >= from))
  }, [S.meals, S.bodyweight, S.unit])

  const addWater = ml => update(s => {
    s.water = s.water || {}
    s.water[date] = { ml: Math.max(0, (s.water[date]?.ml || 0) + ml), _ts: Date.now() }
  })
  const removeMeal = m => confirmSheet({
    title: t('Delete meal?'), message: m.title || slotName(m.slot), confirmText: t('Delete'), danger: true,
    onConfirm: () => { update(s => { s.meals[m.id] = { _ts: Date.now(), gone: true } }); toast(t('Meal deleted')) }
  })

  const kcal = Math.round(day.total.kcal)
  const p = targets ? Math.min(1, kcal / targets.kcal) : 0

  return <div className="narrow diet">
    <div className="hdr">
      <div style={{ flex: 1 }}><h1>{t('Diet')}</h1><div className="sub">{date === todayISO() ? t('Today') : fmtDate(date, true)}</div></div>
      <div className="hdr-actions">
        <button className="iconbtn" onClick={() => setDate(shiftDay(date, -1))} aria-label={t('Previous day')}><Icon name="chevronLeft" /></button>
        <button className="iconbtn" disabled={date >= todayISO()} onClick={() => setDate(shiftDay(date, 1))} aria-label={t('Next day')}><Icon name="chevronRight" /></button>
        <button className="iconbtn" onClick={dietGoalsSheet} aria-label={t('Your diet goal')}><Icon name="gear" /></button>
      </div>
    </div>

    {!targets && <div className="card">
      <b>{t('Set your goal')}</b>
      <div className="muted small" style={{ margin: '4px 0 12px' }}>{t('Tell us your goal, height and age and we work out your daily calories and macros.')}</div>
      <Button variant="primary" onClick={dietGoalsSheet}>{t('Set your goal')}</Button>
    </div>}

    <div className="card diet-summary">
      <div className="diet-ring" style={{ '--p': p }}>
        <div><div className="big">{fmtNum(kcal)}</div><div className="small muted">{targets ? t('of {0} kcal', fmtNum(targets.kcal)) : 'kcal'}</div></div>
      </div>
      <div className="diet-bars">
        {targets && <div className="small" style={{ marginBottom: 8, color: left.kcal < 0 ? 'var(--orange)' : 'var(--label-2)' }}>
          {left.kcal >= 0 ? t('{0} kcal left', fmtNum(Math.round(left.kcal))) : t('{0} kcal over', fmtNum(Math.round(-left.kcal)))}</div>}
        <Bar label={t('Protein')} value={day.total.protein} target={targets?.protein} color="var(--retake-sky, var(--blue))" />
        <Bar label={t('Carbs')} value={day.total.carbs} target={targets?.carbs} color="var(--acc)" />
        <Bar label={t('Fat')} value={day.total.fat} target={targets?.fat} color="var(--orange)" />
      </div>
    </div>

    <Button variant="primary" icon="sparkles" className="diet-cta" onClick={() => mealLogSheet({ date })}>{t('Log a meal')}</Button>
    {useStore.getState().user && <label className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}><input type="checkbox" checked={shareCalories} onChange={e => setShareCalories(e.target.checked)} />{t('Include calories when sharing meals')}</label>}

    <div className="card diet-water">
      <Icon name="drop" />
      <div style={{ flex: 1 }}>
        <div><b>{fmtNum(water)}</b> / {fmtNum(waterGoal)} ml</div>
        <span className="pbar" style={{ marginTop: 6 }}><i style={{ '--p': Math.min(1, water / waterGoal), background: 'var(--retake-sky, var(--blue))' }} /></span>
      </div>
      <button className="iconbtn" onClick={() => addWater(-250)} disabled={!water} aria-label={t('Remove a glass of water')}>−</button>
      <Button size="sm" variant="tinted" onClick={() => addWater(250)}>+250 ml</Button>
    </div>

    {MEAL_SLOTS.map(slot => {
      const list = meals.filter(m => m.date === date && m.slot === slot)
      const tot = day.bySlot[slot]
      return <Section key={slot} title={slotName(slot) + (list.length ? ' · ' + fmtNum(Math.round(tot.kcal)) + ' kcal' : '')}>
        {list.map(m => {
          const s = sumMacros(m.items)
          return <div className="lrow diet-meal" key={m.id}>
            <button className="diet-meal-b" onClick={() => mealLogSheet({ meal: m })}>
              <span className="lrow-t">{m.title || m.items.map(i => i.name).join(', ')}</span>
              <span className="small muted">{fmtNum(Math.round(s.kcal))} kcal · P {fmtNum(Math.round(s.protein))} · C {fmtNum(Math.round(s.carbs))} · G {fmtNum(Math.round(s.fat))}</span>
            </button>
            <button className="iconbtn" style={{ color: 'var(--red)' }} onClick={() => removeMeal(m)} aria-label={t('Delete')}><Icon name="trash" /></button>
            {useStore.getState().user && <button className="iconbtn" onClick={async () => {
              const text = `${m.title || m.items.map(i => i.name).join(', ')} · ${m.date}${shareCalories ? ` · ${Math.round(s.kcal)} kcal` : ''}`
              try { await socialApi.publish({ kind: 'meal', text, scope: 'friends' }); toast(t('Meal shared with friends')) } catch (e) { toast(e.message) }
            }} aria-label={t('Share meal')}><Icon name="share" /></button>}
          </div>
        })}
        <button className="lrow tap diet-add" onClick={() => mealLogSheet({ date, slot })}><Icon name="plus" /><span className="lrow-t">{t('Add')}</span></button>
      </Section>
    })}

    {(weekAvg || real) && <Section title={t('Last days')}>
      {weekAvg != null && <div className="lrow"><span className="lrow-t">{t('Average per day (7 days)')}</span><span className="lrow-v">{fmtNum(weekAvg)} kcal</span></div>}
      {real && <div className="lrow"><span className="lrow-t">{t('Your real daily burn (from intake and weight)')}</span><span className="lrow-v">{fmtNum(real.tdee)} kcal</span></div>}
    </Section>}
  </div>
}
