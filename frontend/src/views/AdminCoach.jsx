import { useEffect, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { useStore } from '../store/useStore.js'
import { api } from '../lib/api.js'
import Icon from '../components/Icon.jsx'
import { Button, Switch, TextArea, TextField } from '../components/ui.jsx'
import { confirmSheet } from '../sheets.jsx'

/* The operator's side of the Coach, laid out as a guided setup: one master switch, numbered
   steps that each say what they are for, and everything an owner rarely needs folded away
   under "Avançado" and "Atividade". Like the rest of the admin dashboard, Retake Gym writes it in
   Brazilian Portuguese directly, outside the string packs.

   What it never shows: anybody's intake answers, payloads or proposals. An admin can enable
   the feature and see that jobs ran; they cannot read what their users asked it.

   This is the ONLY place the Coach can be switched off for everyone. Users can decline the
   consent screen for themselves, but they cannot disable the feature — that is an operator
   decision, so it lives with the operator. */

const rel = ts => {
  if (!ts) return 'nunca'
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60) return 'agora'
  if (s < 3600) return 'há ' + Math.floor(s / 60) + ' min'
  if (s < 86400) return 'há ' + Math.floor(s / 3600) + ' h'
  return 'há ' + Math.floor(s / 86400) + ' d'
}

// Extra static headers for the endpoint, one `Name: value` per line — e.g. a gateway's
// routing/session header (opencode Go's `x-opencode-session`). Parsed client-side so a
// typo reads as a message on the card, not a 400 the admin has to decode. Empty clears.
export const headersToText = h => h && typeof h === 'object'
  ? Object.entries(h).map(([k, v]) => `${k}: ${v}`).join('\n')
  : ''
export function parseHeadersText(text) {
  const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean)
  if (!lines.length) return { headers: null }
  const out = {}
  for (const line of lines) {
    const i = line.indexOf(':')
    if (i < 1) return { error: `linha fora do formato Nome: valor: ${line.slice(0, 40)}` }
    const name = line.slice(0, i).trim()
    const value = line.slice(i + 1).trim()
    if (!name || !value) return { error: `linha fora do formato Nome: valor: ${line.slice(0, 40)}` }
    out[name] = value
  }
  return { headers: out }
}

// Which chips go under which heading. Runtime-backed providers are the ones that need the
// bigger `coach` image; the fixture exists so the whole loop can be walked without any account.
const RUNTIME_IDS = ['claude', 'codex']
const TESTING_IDS = ['fixture']

export default function AdminCoach() {
  const toast = useUI(s => s.toast)
  const openSheet = useUI(s => s.openSheet)
  const [d, setD] = useState(null)
  const [busy, setBusy] = useState(false)
  // The models the endpoint serves, fetched on demand. Seeded from the status call when the
  // stored key already let it list them.
  const [models, setModels] = useState(null)
  // The last "Test the Coach" outcome, shown inline where the button is rather than only as a
  // toast that is gone before anyone has read the provider's reason.
  const [testResult, setTestResult] = useState(null)

  // Every change on this card ends in load(), so load() also re-reads /api/config. The app reads
  // that once per boot, and the Plan tab's Coach card hangs off it: without the re-read, an admin
  // who has just switched the Coach on and connected it finds no Coach anywhere until a reload,
  // which reads as a setup that failed (Discord #install-help, 2026-09-19).
  const load = () => api('/api/admin/coach').then(r => { setD(r); setModels(r.knownModels || null); useStore.getState().refreshConfig() }).catch(e => toast(e.message || 'Não deu para carregar'))
  useEffect(() => { load() }, [])

  const patch = async body => {
    setBusy(true)
    try { await api('/api/admin/coach/config', { method: 'POST', body: JSON.stringify(body) }); await load() }
    catch (e) { toast(e.message) }
    setBusy(false)
  }
  const loadModels = async () => {
    setBusy(true)
    try {
      const r = await api('/api/admin/coach/models', { method: 'POST', body: '{}' })
      if (r.ok) { setModels(r.models); toast(r.models.length + ' modelos') } else toast(r.error || 'Não deu para listar os modelos')
    } catch (e) { toast(e.message) }
    setBusy(false)
  }
  const test = async () => {
    setBusy(true); setTestResult({ pending: true })
    try {
      // The server gives the provider up to 90 s for this round-trip (api/coach/jobs.js testRun),
      // longer than api()'s default for a request; a slow local model must still get its answer.
      const r = await api('/api/admin/coach/test', { method: 'POST', body: '{}', timeout: 150000 })
      setTestResult(r)
      toast(r.ok ? 'Teste do Coach passou ✅' : 'O teste falhou')
      await load()
    } catch (e) { setTestResult({ ok: false, error: e.message }); toast(e.message) }
    setBusy(false)
  }
  // A number input hands back "" for anything it cannot parse, and +"" is 0, which the hint on
  // this card calls "no limit". So an admin who cleared the box to retype and clicked elsewhere
  // had just uncapped daily spend on their API key, silently. An empty box is no change now: the
  // stored value goes back into it and nothing is written. Removing the cap takes typing a 0.
  const capBlur = key => e => {
    if (e.target.value.trim() === '') { e.target.value = d.caps[key]; return }
    if (+e.target.value !== d.caps[key]) patch({ caps: { ...d.caps, [key]: +e.target.value } })
  }
  const disconnect = async () => {
    setBusy(true)
    try { await api('/api/admin/coach/disconnect', { method: 'POST', body: JSON.stringify({ provider: d.provider }) }); toast('Credencial removida'); await load() }
    catch (e) { toast(e.message) }
    setBusy(false)
  }

  if (!d) return <div className="card"><div className="muted small">Carregando o status do Coach…</div></div>

  if (d.disabledByEnv) return <div className="card">
    <h2 style={{ margin: '0 0 6px' }}>Coach de IA</h2>
    <div className="adm-lead">Desligado à força por <code>COACH_DISABLED</code> no ambiente do servidor. Tire essa variável e reinicie para configurar o Coach aqui.</div>
  </div>

  const meta = d.providers.find(p => p.id === d.provider) || {}
  const authState = d.auth?.state
  const authed = authState === 'connected' || authState === 'not-required' || authState === 'optional'
  const needsEndpoint = !!meta.baseUrl
  const hasEndpoint = !needsEndpoint || !!d.baseUrl
  const live = d.enabled && d.runtime.ok && authed && hasEndpoint

  const status = !d.enabled ? 'Desligado. Ninguém vê o Coach em nenhum lugar do app.'
    : live ? <>Ligado · {meta.label}{d.model ? ' · ' + d.model : ''}</>
      : !hasEndpoint ? 'Ligado, mas ainda sem endpoint. Termine o passo 2.'
        : !authed ? 'Ligado, mas ainda sem credencial. Termine o passo Credencial.'
          : !d.runtime.ok ? 'Ligado, mas o provedor não responde. Veja o passo Teste.'
            : 'Ligado'

  // Chips, grouped.
  const groups = [
    { title: 'Colar uma chave de API', hint: 'HTTPS direto para o provedor. Funciona com a imagem padrão, sem instalar nada.', items: d.providers.filter(p => p.http) },
    { title: 'Roda uma IA local', hint: 'Precisa da imagem maior, construída com --target coach.', items: d.providers.filter(p => RUNTIME_IDS.includes(p.id)) },
    { title: 'Teste', hint: 'Um simulador que responde na hora, para testar tudo sem conta em nenhum provedor.', items: d.providers.filter(p => TESTING_IDS.includes(p.id)) }
  ]

  const hasCredentialStep = !!(meta.setupToken || meta.apiKey)
  // The model this provider was explicitly GIVEN — as opposed to `d.model`, which falls back to
  // the provider's own default. Both halves of the Model step (the dropdown and the free-text
  // box) read this one value, so they cannot disagree about what is configured.
  const chosenModel = d.models?.[d.provider] || ''
  const step1Done = !!d.provider
  const step2Done = hasEndpoint
  const step3Done = authed
  const step4Done = !!d.model
  const step5Done = !!testResult?.ok || !!d.lastSuccess
  // Step numbers only count the steps this provider actually shows — and like any wizard,
  // only the first unfinished step stands open; everything done folds to its summary line.
  const flags = [step1Done, ...(needsEndpoint ? [step2Done] : []), ...(hasCredentialStep ? [step3Done] : []), step4Done, step5Done]
  const doneCount = flags.filter(Boolean).length
  const firstTodo = flags.indexOf(false)
  let n = 1
  let idx = 0
  const num = () => n++
  const stepAt = () => { const i = idx++; return { open: i === (firstTodo === -1 ? -1 : firstTodo), stepKey: i + ':' + (i === firstTodo) } }

  // Off = a quiet, optional feature: one clean pitch and one button, no half-dimmed controls.
  if (!d.enabled) return <div className="card">
    <div className="adm-hero">
      <div className="adm-hero-av"><Icon name="sparkles" /></div>
      <h2>Coach de IA</h2>
      <p>Um treinador opcional que monta planos de treino e revisa o que as pessoas registram. Está desligado, então ninguém vê o Coach no app.</p>
      <div className="adm-hero-feats">
        <div><Icon name="key" /><span><b>Use a IA que quiser.</b> Uma chave da Anthropic, OpenAI ou Gemini, ou um modelo local grátis pelo Ollama.</span></div>
        <div><Icon name="shield" /><span><b>Privado por padrão.</b> Uma lista fechada decide o que sai do servidor; toda mudança precisa do sim da pessoa e pode ser desfeita.</span></div>
        <div><Icon name="person" /><span><b>Cada pessoa decide.</b> Ligar aqui só deixa o Coach disponível; cada um aceita por conta própria.</span></div>
      </div>
      <Button variant="primary" icon="sparkles" disabled={busy} onClick={() => patch({ enabled: true })}>Configurar o Coach</Button>
    </div>
  </div>

  return <div className="card" style={{ borderColor: live ? 'var(--acc)' : undefined }}>
    <div className="row between" style={{ marginBottom: 2 }}>
      <h2 style={{ margin: 0 }}>Coach de IA</h2>
      <Switch checked={!!d.enabled} disabled={busy} onChange={v => patch({ enabled: v })} />
    </div>
    <div className="adm-status">
      <span className={'adm-pill ' + (live ? 'ok' : 'warn')}>{live ? 'pronto' : 'não pronto'}</span>
      <span>{status}</span>
    </div>
    {!live && <div className="adm-progress" aria-hidden="true"><i style={{ width: Math.round(doneCount / flags.length * 100) + '%' }} /></div>}
    <div className="adm-lead">
      {live ? 'As pessoas acham o Coach em Plano → Coach. Esta chave é o único lugar onde ele pode ser desligado para todos.'
        : `${doneCount} de ${flags.length} passos feitos. Termine o passo aberto e o próximo aparece.`}
    </div>

    {d.enabled && <>
      {/* ---------- provider ---------- */}
      <Step n={num()} title="Provedor" hint={meta.label || 'Qual IA responde pelo Coach'} done={step1Done} {...stepAt()}>
        <div className="adm-hint">Escolha quem responde. A chave que você salvar fica guardada com o provedor, então dá para trocar sem colar de novo.</div>
        {groups.map(g => !!g.items.length && <div key={g.title} className="adm-group">
          <div className="adm-group-t">{g.title}</div>
          <div className="adm-chips">
            {g.items.map(p => <button key={p.id} className={'chip' + (p.id === d.provider ? ' on' : '')} disabled={busy}
              onClick={() => { setTestResult(null); patch({ provider: p.id }) }}>
              {p.label}{p.connected && <span className="adm-chip-key">chave salva</span>}
            </button>)}
          </div>
          <div className="adm-hint" style={{ margin: '6px 0 0' }}>{g.hint}</div>
        </div>)}
      </Step>

      {/* ---------- endpoint (compatible only) ---------- */}
      {needsEndpoint && <Step n={num()} title="Endpoint" hint={d.baseUrl || 'Onde o modelo roda'} done={step2Done} {...stepAt()}>
        <div className="adm-hint">O endereço de qualquer servidor compatível com a API de chat da OpenAI: <b>Ollama</b>, <b>LM Studio</b>, <b>vLLM</b>, <b>OpenRouter</b> ou um gateway seu. O endereço base como o provedor documenta, com ou sem a versão (<code>/v1</code>, <code>/v4</code>), e sem chave na URL.</div>
        <div className="adm-field">
          <label>URL base</label>
          <TextField key={d.baseUrl || ''} defaultValue={d.baseUrl || ''} placeholder="http://ollama:11434  or  https://openrouter.ai/api" inputMode="url" autoCapitalize="none" autoCorrect="off"
            onBlur={e => e.target.value !== (d.baseUrl || '') && patch({ baseUrl: e.target.value })} />
        </div>
        <div className="adm-hint" style={{ margin: 0 }}>O endereço fica no registro de jobs, para você sempre saber para onde as requisições foram.</div>
        <div className="adm-field">
          <label>Cabeçalhos extras (opcional)</label>
          <TextArea key={headersToText(d.headers)} defaultValue={headersToText(d.headers)} placeholder={'x-opencode-session: 550e8400-…'} autoCapitalize="none" autoCorrect="off" rows={2}
            onBlur={e => {
              const cur = headersToText(d.headers)
              if (e.target.value === cur) return
              const p = parseHeadersText(e.target.value)
              if (p.error) { toast(p.error); e.target.value = cur; return }
              patch({ headers: p.headers })
            }} />
        </div>
        <div className="adm-hint" style={{ margin: 0 }}>Um <code>Nome: valor</code> por linha, enviado em toda requisição para este endpoint. Para gateways que exigem cabeçalhos de roteamento. Nunca <code>Authorization</code> nem <code>Content-Type</code>: esses são recusados.</div>
      </Step>}

      {/* ---------- credential ---------- */}
      {hasCredentialStep && <Step n={num()} title="Credencial" hint={credentialHint(d.auth, meta)} done={step3Done} {...stepAt()}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <CredentialPill auth={d.auth} />
        </div>
        {authState === 'connected' ? <>
          <div className="adm-hint">Conectado{d.auth.account ? ' como ' + d.auth.account : ''} via {credentialLabel(d.auth.type)}{d.auth.connectedAt ? ' · adicionado ' + rel(d.auth.connectedAt) : ''}. A chave fica guardada criptografada e nunca aparece de novo.</div>
          <div className="adm-actions">
            {meta.apiKey && <Button size="sm" variant="tinted" icon="lock" disabled={busy}
              onClick={() => openSheet(close => <ApiKeySheet close={close} onDone={load} label={meta.label} placeholder={meta.keyPlaceholder} optional={meta.keyOptional} />)}>Trocar chave</Button>}
            {/* The key is encrypted at rest and never shown again, so this is the one action on the
                card that cannot be walked back. Every other irreversible action in the app asks first;
                until 2026-09-22 this one did not. */}
            <Button size="sm" variant="danger" disabled={busy} onClick={() => confirmSheet({
              title: 'Remover esta credencial?',
              message: 'O Coach para de funcionar para todos neste servidor até uma chave nova ser adicionada. A chave guardada não pode ser recuperada.',
              confirmText: 'Remover', danger: true, onConfirm: disconnect,
            })}>Remover</Button>
          </div>
        </> : <>
          {authState === 'unreadable' && <div className="adm-hint" style={{ color: 'var(--red)' }}>
            Não deu para descriptografar a credencial guardada. Normalmente isso quer dizer que a pasta <code>./data</code> foi restaurada sem o arquivo <code>secret</code>. Adicione a chave de novo para resolver.
          </div>}
          {authState === 'optional' && <div className="adm-hint">Este endpoint funciona sem chave. Adicione uma só se o servidor pedir (o OpenRouter pede; um modelo na sua própria rede normalmente não).</div>}
          {authState === 'none' && <div className="adm-hint">{meta.setupToken
            ? 'Cole um token de configuração do Claude Code (sua assinatura) ou uma chave de API da Anthropic (paga por uso).'
            : 'Cole uma chave de API do painel do provedor. Ela fica guardada criptografada neste servidor e só é enviada ao provedor enquanto um job roda.'}</div>}
          <div className="adm-actions">
            {meta.setupToken && <Button size="sm" variant="primary" icon="key" disabled={busy}
              onClick={() => openSheet(close => <SetupTokenSheet close={close} onDone={load} label={meta.label} />)}>Adicionar token do Claude Code</Button>}
            {meta.apiKey && <Button size="sm" variant={meta.setupToken ? undefined : 'primary'} icon="lock" disabled={busy}
              onClick={() => openSheet(close => <ApiKeySheet close={close} onDone={load} label={meta.label} placeholder={meta.keyPlaceholder} optional={meta.keyOptional} />)}>
              {meta.keyOptional ? 'Adicionar chave de API (opcional)' : 'Adicionar chave de API'}</Button>}
          </div>
        </>}
      </Step>}

      {/* ---------- model ---------- */}
      <Step n={num()} title="Modelo" hint={d.model || (meta.defaultModel ? 'padrão: ' + meta.defaultModel : 'ainda não escolhido')} done={step4Done} {...stepAt()}>
        <div className="adm-hint">{meta.http
          ? 'Qual modelo o provedor deve usar. "Listar modelos" pede a lista atual ao provedor, então nada aqui fica desatualizado.'
          : 'Opcional. Deixe vazio para usar o padrão do runtime.'}</div>
        <div className="adm-field">
          <label>Modelo</label>
          {models && models.length
            ? <select className="adm-select" value={chosenModel} disabled={busy} onChange={e => patch({ model: e.target.value })}>
              <option value="">{meta.defaultModel ? `Padrão (${meta.defaultModel})` : 'Escolha um modelo…'}</option>
              {chosenModel && !models.includes(chosenModel) && <option value={chosenModel}>{chosenModel} (fora da lista)</option>}
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            : <TextField key={d.provider} defaultValue={chosenModel} placeholder={meta.defaultModel ? `Padrão: ${meta.defaultModel}` : needsEndpoint ? 'ex.: qwen2.5:3b, ou toque em "Listar modelos"' : '(padrão do runtime)'}
              onBlur={e => e.target.value !== chosenModel && patch({ model: e.target.value })} />}
        </div>
        {meta.http && <div className="adm-actions">
          <Button size="sm" variant="tinted" icon="reset" disabled={busy} onClick={loadModels}>{models ? 'Atualizar lista' : 'Listar modelos'}</Button>
          {models && models.length ? <span className="dim small" style={{ alignSelf: 'center' }}>{models.length} disponíveis no provedor</span> : null}
        </div>}
      </Step>

      {/* ---------- test ---------- */}
      <Step n={num()} title="Teste" hint={step5Done ? 'passou' : 'uma pergunta real, sem dados de ninguém'} done={step5Done} {...stepAt()} forceOpen={!!testResult}>
        <div className="adm-hint">Manda uma pergunta curtinha ao provedor e confere a resposta. Nenhum dado de treino é usado. Faça isso depois de cada mudança acima.</div>
        <div className="adm-actions">
          <Button size="sm" variant="primary" icon="check" disabled={busy || !authed || !hasEndpoint} onClick={test}>Testar o Coach</Button>
        </div>
        {(!authed || !hasEndpoint) && <div className="adm-hint" style={{ margin: '6px 0 0' }}>
          {!hasEndpoint ? 'Termine o passo Endpoint primeiro.' : 'Termine o passo Credencial primeiro.'}
        </div>}
        {testResult && <div className={'adm-result ' + (testResult.pending ? '' : testResult.ok ? 'ok' : 'bad')}>
          {testResult.pending ? 'Perguntando ao provedor…'
            : testResult.ok ? <><b>Passou</b>{testResult.version ? 'Provedor: ' + testResult.version : 'O provedor respondeu como esperado.'}</>
              : <><b>Falhou</b>{testResult.error || 'O provedor não respondeu.'}</>}
        </div>}
        <div className="adm-kv" style={{ marginTop: 10 }}>
          <span className="k">Runtime</span>
          <span className="v">{d.runtime.ok ? <span className="adm-pill ok">pronto</span> : <span className="adm-pill bad">faltando</span>}{d.runtime.version ? <div className="dim small">{d.runtime.version}</div> : null}{!d.runtime.ok && d.runtime.error ? <div className="small" style={{ color: 'var(--red)' }}>{d.runtime.error}</div> : null}</span>
        </div>
      </Step>

      {/* ---------- advanced ---------- */}
      <details className="adm-fold">
        <summary>Avançado <Icon name="chevronRight" className="chev" /></summary>
        <div className="adm-fold-b">
          <div className="adm-group-t">Limites</div>
          <div className="adm-hint">Quantas vezes o Coach pode rodar por dia. Cada vez é uma requisição na conta do provedor acima. 0 quer dizer sem limite.</div>
          <div className="adm-kv"><span className="k">Por pessoa, por dia</span>
            <span className="v"><input className="num" type="number" min="0" max="200" defaultValue={d.caps.perProfileDaily} disabled={busy}
              onBlur={capBlur('perProfileDaily')} /></span></div>
          <div className="adm-kv"><span className="k">Servidor inteiro, por dia</span>
            <span className="v"><input className="num" type="number" min="0" max="5000" defaultValue={d.caps.instanceDaily} disabled={busy}
              onBlur={capBlur('instanceDaily')} /></span></div>
          <div className="adm-hint" style={{ marginTop: 10 }}>O tamanho máximo de uma mensagem no chat, ajuste ou nota de revisão. O app e o servidor respeitam esse limite.</div>
          <div className="adm-kv"><span className="k">Tamanho máximo da mensagem</span>
            <span className="v"><input className="num" type="number" min="200" max="4000" defaultValue={d.maxMessageLen} disabled={busy}
              onBlur={e => +e.target.value !== d.maxMessageLen && patch({ maxMessageLen: +e.target.value })} /></span></div>
          <div className="adm-hint" style={{ marginTop: 10 }}>O teto de uma única resposta do provedor. Modelos que "pensam" (DeepSeek, ou Gemini/OpenAI com raciocínio) gastam esse teto com o raciocínio escondido, então um plano pode falhar com "a resposta foi cortada no limite de saída" mesmo sendo curto. Aumente se isso acontecer, sem passar do limite do próprio modelo.</div>
          <div className="adm-kv"><span className="k">Máximo de tokens na resposta</span>
            <span className="v"><input className="num" type="number" min="1024" max="65536" defaultValue={d.maxOutputTokens} disabled={busy}
              onBlur={e => +e.target.value !== d.maxOutputTokens && patch({ maxOutputTokens: +e.target.value })} /></span></div>

          <div className="adm-group-t" style={{ marginTop: 14 }}>Comparar com os outros</div>
          <div className="row between" style={{ gap: 12, alignItems: 'flex-start' }}>
            <div className="adm-hint" style={{ margin: 0 }}>
              <b>Deixar as pessoas se compararem.</b> Medianas anônimas (1RM estimado, treinos por semana) entre os perfis que aceitarem; pelo menos três precisam participar antes de alguém ver um número. Cada pessoa liga isso no chat do Coach, e só vê se ligar.
            </div>
            <Switch checked={!!d.community} disabled={busy} onChange={v => patch({ community: v })} />
          </div>

          <div className="adm-group-t" style={{ marginTop: 14 }}>Quem paga a conta</div>
          <div className="adm-hint">{d.authMode === 'profile'
            ? 'Cada perfil entra com a própria conta.'
            : d.auth?.type === 'apikey' || meta.http
              ? 'Uma chave de API para o servidor inteiro: todos os perfis podem usar o Coach com ela, e os limites diários acima seguram o gasto.'
              : d.boundUid
                ? 'Uma conta pessoal, já em uso por um perfil. Os outros perfis são recusados, para ninguém gastar a assinatura de outra pessoa.'
                : 'Uma conta pessoal. O primeiro perfil que usar vira o único permitido; os outros são recusados. Cole uma chave de API se o servidor inteiro deve ter o Coach.'}</div>

          <div className="adm-group-t" style={{ marginTop: 14 }}>Isolamento</div>
          <div className="adm-hint">{d.unprivileged && !d.unprivileged.ok
            ? <span style={{ color: 'var(--red)' }}>Os jobs estão bloqueados: {d.unprivileged.why}. Nada roda até isso ser resolvido.</span>
            : d.unprivileged?.dropped
              ? 'Os jobs rodam com um usuário separado, sem permissão para ler a pasta de dados nem os segredos.'
              : d.unprivileged?.why?.includes('no child process')
                ? 'Não é preciso para este provedor. Ele só faz uma requisição HTTPS e não abre nenhum programa neste servidor.'
                : 'Os jobs rodam com o próprio usuário do servidor nesta máquina (não há um usuário separado).'}</div>
        </div>
      </details>

      {/* ---------- activity ---------- */}
      <details className="adm-fold">
        <summary>Atividade <Icon name="chevronRight" className="chev" /></summary>
        <div className="adm-fold-b">
          <div className="tiles" style={{ textAlign: 'start', marginBottom: 10 }}>
            <div className="tile"><div className="l">Jobs hoje</div><div className="v v-sm">{d.jobsToday}</div></div>
            <div className="tile"><div className="l">Último sucesso</div><div className="v" style={{ fontSize: 'var(--fs-footnote)' }}>{rel(d.lastSuccess?.at)}</div></div>
          </div>
          {d.lastError && <>
            <div className="adm-group-t">Última falha</div>
            <div className="adm-result bad" style={{ marginTop: 0, marginBottom: 10 }}>
              <b>{failureTitle(d.lastError.errorClass)}</b>
              {d.lastError.detail ? <span className="small">{d.lastError.detail}</span> : null}
              <div className="dim" style={{ fontSize: 'var(--fs-caption2)', marginTop: 4 }}>{rel(d.lastError.at)}</div>
            </div>
          </>}
          <div className="adm-group-t">Jobs recentes</div>
          {d.recent?.length ? <div className="adm-log">
            {d.recent.slice(0, 10).map((e, i) => <div key={i} className="adm-log-row">
              <span>{e.kind === 'create' ? 'Plano' : 'Revisão'}{e.trigger === 'scheduled' ? ' · agendado' : ''} · <span style={{ color: e.outcome === 'failed' ? 'var(--red)' : e.outcome === 'ready' ? 'var(--acc)' : 'var(--label-2)' }}>{e.outcome}</span>{e.ms ? ' · ' + Math.round(e.ms / 1000) + ' s' : ''}</span>
              <span className="when">{rel(e.at)}</span>
            </div>)}
          </div> : <div className="adm-empty">Nenhum job ainda.</div>}
          <div className="adm-hint" style={{ margin: '8px 0 0' }}>Só contagens e resultados. O que as pessoas perguntaram ao Coach e o que ele respondeu nunca aparece aqui.</div>
        </div>
      </details>
    </>}
  </div>
}

/* ---------------------------------- pieces ---------------------------------- */

function Step({ n, title, hint, done, open, forceOpen, stepKey, children }) {
  // `stepKey` remounts the <details> when the wizard advances, so the next step unfolds itself.
  // On the element itself: React wants a key written out, not spread in with the other props.
  return <details key={stepKey} className={'adm-step ' + (done ? 'done' : 'todo')} open={open || forceOpen}>
    <summary>
      <span className="adm-num">{done ? <Icon name="check" /> : n}</span>
      <span className="adm-step-t"><b>{title}</b><span>{hint}</span></span>
      <Icon name="chevronRight" className="chev" />
    </summary>
    <div className="adm-step-b">{children}</div>
  </details>
}

function CredentialPill({ auth }) {
  const s = auth?.state
  if (s === 'connected') return <span className="adm-pill ok">conectado{auth.account ? ' · ' + auth.account : ''}</span>
  if (s === 'not-required') return <span className="adm-pill">não precisa</span>
  if (s === 'optional') return <span className="adm-pill">opcional, nenhuma salva</span>
  if (s === 'unreadable') return <span className="adm-pill bad">ilegível</span>
  return <span className="adm-pill warn">necessária</span>
}

const credentialHint = (auth, meta) => {
  const s = auth?.state
  if (s === 'connected') return 'Conectado' + (auth.account ? ' como ' + auth.account : '')
  if (s === 'not-required') return 'Não precisa'
  if (s === 'optional') return 'Opcional para este endpoint'
  if (s === 'unreadable') return 'A chave guardada está ilegível. Adicione de novo'
  return meta.setupToken ? 'Precisa de um token ou chave de API' : 'Precisa de uma chave de API'
}

const credentialLabel = type => ({
  'cli-token': 'token do Claude Code', 'chatgpt-cli': 'login do ChatGPT CLI', oauth: 'token antigo', apikey: 'chave de API'
}[type] || 'credencial')

// The failure classes jobs.js emits, in words an operator can act on.
const failureTitle = cls => ({
  timeout: 'O provedor demorou mais que o tempo do job (COACH_JOB_TIMEOUT_MS, padrão 5 minutos)',
  missing: 'Falta o runtime ou a chave do provedor',
  auth: 'O provedor recusou a credencial',
  provider: 'O provedor devolveu um erro',
  unusable: 'O modelo respondeu, mas num formato que o app não consegue usar',
  restart: 'O servidor reiniciou enquanto um job rodava',
  nostate: 'Não deu para ler os dados de treino da pessoa',
  off: 'O Coach estava desligado quando o job rodou',
  toolarge: 'Os dados de treino da pessoa deixaram a requisição grande demais, então nenhum provedor foi chamado',
  internal: 'Algo deu errado no servidor'
}[cls] || cls || 'Falhou')

/* ------------------------------- setup token -------------------------------- */

function SetupTokenSheet({ close, onDone, label }) {
  const toast = useUI(s => s.toast)
  const [token, setToken] = useState('')
  // Which account this token belongs to. Optional, and stored as a plain label — it is what the
  // admin card and the user's Coach screen both show when they name whose account is spent.
  const [account, setAccount] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      const r = await api('/api/admin/coach/connect', { method: 'POST', body: JSON.stringify({ type: 'cli-token', token: token.trim(), account: account.trim() }) })
      setToken('')
      toast(r.test?.ok ? 'Conectado ✅' : 'Token salvo')
      close(); onDone()
    } catch (e) { toast(e.message); setBusy(false) }
  }

  return <>
    <h3>Conectar {label}</h3>
    <div className="muted small" style={{ lineHeight: 1.5, marginBottom: 12 }}>
      Num computador de confiança onde você usa o Claude Code, rode <code>claude setup-token</code>, faça o login normal no navegador e cole aqui o token que ele mostrar. Este app nunca abre nem mexe no login do Claude.
    </div>
    <TextField value={token} autoFocus type="password" placeholder="cole o token" onChange={e => setToken(e.target.value)} />
    <div style={{ height: 8 }} />
    <TextField value={account} placeholder="de quem é esta conta? (ex.: voce@exemplo.com)" onChange={e => setAccount(e.target.value)} />
    <div style={{ height: 12 }} />
    <Button variant="primary" disabled={busy || !token.trim()} onClick={save}>Salvar token</Button>
    <div style={{ height: 8 }} />
  </>
}

function ApiKeySheet({ close, onDone, label, placeholder, optional }) {
  const toast = useUI(s => s.toast)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      const r = await api('/api/admin/coach/connect', { method: 'POST', body: JSON.stringify({ type: 'apikey', token: key.trim() }) })
      toast(r.test?.ok ? 'Chave salva ✅' : 'Chave salva')
      close(); onDone()
    } catch (e) { toast(e.message); setBusy(false) }
  }
  return <>
    <h3>Chave de API do {label}</h3>
    <div className="muted small" style={{ lineHeight: 1.5, marginBottom: 12 }}>
      Fica guardada criptografada neste servidor e só vai para o provedor enquanto um job roda. Nunca aparece de novo e não sai do servidor{optional ? '. Para um endpoint que não usa chave, pode deixar vazio e fechar.' : '.'}
    </div>
    <TextField value={key} autoFocus type="password" placeholder={placeholder || 'sk-…'} autoCapitalize="none" autoCorrect="off" onChange={e => setKey(e.target.value)} />
    <div style={{ height: 12 }} />
    <Button variant="primary" disabled={busy || !key.trim()} onClick={save}>Salvar chave</Button>
    <div style={{ height: 8 }} />
  </>
}
