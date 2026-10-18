/**
 * Settings → Providers: the services `openfilm get` gets voices, music, sound effects, transcripts, images, video and
 * web searches from, one list in the order of their names, none put first.
 *
 * ElevenLabs, OpenAI, Google Gemini, fal.ai, Groq, Pexels, Pixabay, Brave Search and Tavily connect with the person's
 * own key, which pays that service directly when it charges (a key in the environment shows as such and stays there).
 * Which of them makes each kind of media, and with which model, is Settings → Models.
 *
 * Under them, the person's own services: any service at an address (one they run on this computer, their own voice,
 * an API not listed), with its key and a few words about what it does. Their agent reaches each with `openfilm get
 * call`; StudyBuddy knows nothing of what it answers (studio/server/custom-services.mjs).
 */
import React from 'react';
import { ExternalLink, Plus, Server } from 'lucide-react';
import { useT } from '@/i18n';
import { useProviders, type OwnProvider, type OwnService, type OwnServiceFields, type ProviderVerb, type ProvidersHook } from '@/lib/providers';
import { ProviderMark } from './ProviderMark';
import { SettingsButton, SettingsField, SettingsGroup, SettingsInset, SettingsItem, SettingsPage, SettingsStatus, settingsError, settingsLink } from './ui';

/** What a provider can make, in the order Models lists it (listing voices goes without saying with voice-over). */
const ABILITY_ORDER: ProviderVerb[] = ['tts', 'music', 'sfx', 'asr', 'image', 'image-search', 'video', 'translate', 'web-search'];


export function ProvidersSection() {
  const t = useT();
  const providers = useProviders();
  const rows = [...(providers.state?.providers ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <SettingsPage note={t('settings.providers.desc')}>
      <SettingsGroup footnote={t('settings.providers.keyNote')}>
        {rows.map((provider) => <KeyRow key={provider.id} provider={provider} hook={providers} />)}
      </SettingsGroup>
      <OwnServices hook={providers} />
      {/* a key that was refused says why under its own field (KeyRow), not down here past the list */}
      {providers.problem && !rows.some((p) => p.id === providers.problemFor) && !ownProblem(providers) ? <p className={settingsError}>{providers.problem}</p> : null}
    </SettingsPage>
  );
}

/** Whether the last change that failed was to one of the person's own services (it is said under its form). */
const ownProblem = (hook: ProvidersHook) => hook.problemFor === 'custom' || Boolean(hook.state?.custom.some((s) => s.id === hook.problemFor));

/** The person's own services: each with what it does, and a form to add one. */
function OwnServices({ hook }: { hook: ProvidersHook }) {
  const t = useT();
  const services = hook.state?.custom ?? [];
  const [open, setOpen] = React.useState<string | null>(null);
  if (!hook.state) return null;
  return (
    <SettingsGroup title={t('settings.providers.own.title')} footnote={t('settings.providers.own.note')}>
      {services.map((service) => (
        <SettingsItem
          key={service.id}
          mark={<Server size={16} />}
          title={service.name}
          badge={service.last4 ? <SettingsStatus tone="muted"><span className="font-mono tabular-nums">•••• {service.last4}</span></SettingsStatus> : null}
          description={(
            <>
              <span className="font-mono text-[13px] text-[var(--text-faint)]">{service.url}</span>
              {service.note ? <span className="mt-0.5 block whitespace-pre-line">{service.note}</span> : null}
            </>
          )}
          control={open === service.id ? null : (
            <>
              <SettingsButton variant="quiet" disabled={hook.busy === service.id} onClick={() => void hook.removeService(service.id)}>{t('settings.providers.own.remove')}</SettingsButton>
              <SettingsButton onClick={() => setOpen(service.id)}>{t('settings.providers.own.edit')}</SettingsButton>
            </>
          )}
        >
          {open === service.id ? <ServiceForm hook={hook} service={service} onDone={() => setOpen(null)} /> : null}
        </SettingsItem>
      ))}
      {open === '' ? (
        <div className="py-4"><ServiceForm hook={hook} service={null} onDone={() => setOpen(null)} /></div>
      ) : (
        <div className="py-4">
          <SettingsButton onClick={() => setOpen('')}><Plus size={15} strokeWidth={2} />{t('settings.providers.own.add')}</SettingsButton>
        </div>
      )}
    </SettingsGroup>
  );
}

/** A service's name, address, key, where the key goes and what it does: added (`service` null) or changed. */
function ServiceForm({ hook, service, onDone }: { hook: ProvidersHook; service: OwnService | null; onDone: () => void }) {
  const t = useT();
  const [fields, setFields] = React.useState<OwnServiceFields>({
    name: service?.name ?? '', url: service?.url ?? '', auth: service?.auth ?? DEFAULT_AUTH, note: service?.note ?? '',
  });
  const [key, setKey] = React.useState('');
  const [dropKey, setDropKey] = React.useState(false);
  const busy = hook.busy === (service?.id ?? 'custom');
  const set = (name: keyof OwnServiceFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFields((f) => ({ ...f, [name]: e.target.value }));
  const save = async () => {
    if (busy || !fields.name.trim() || !fields.url.trim()) return;
    /* changed without a key typed: the one it has stays (unless taken away) */
    const sent: OwnServiceFields = { ...fields, ...(key.trim() ? { key: key.trim() } : dropKey || !service ? { key: '' } : {}) };
    if (await hook.saveService(service?.id ?? null, sent)) onDone();
  };
  const label = (text: string, field: React.ReactNode) => (
    <label className="flex flex-col gap-1.5 text-[13.5px] text-[var(--text-muted)]">{text}{field}</label>
  );
  return (
    /* under its row, it lines up with the row's words; a new one stands on its own */
    <form className={service ? 'pl-[52px]' : ''} onSubmit={(e) => { e.preventDefault(); void save(); }} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onDone(); } }}>
      <SettingsInset>
        {label(t('settings.providers.own.name'), <SettingsField autoFocus value={fields.name} onChange={set('name')} placeholder={t('settings.providers.own.namePlaceholder')} />)}
        {label(t('settings.providers.own.url'), <SettingsField value={fields.url} onChange={set('url')} placeholder="http://localhost:8000" spellCheck={false} className="font-mono placeholder:font-sans" />)}
        {label(t('settings.providers.own.key'), (
          <SettingsField type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => { setKey(e.target.value); setDropKey(false); }}
            placeholder={service?.last4 && !dropKey ? t('settings.providers.own.keyKeep').replaceAll('{last4}', service.last4) : t('settings.providers.own.keyOptional')}
            className="font-mono placeholder:font-sans" />
        ))}
        {service?.last4 && !key && !dropKey ? (
          <button type="button" className={`${settingsLink} self-start text-[13.5px]`} onClick={() => setDropKey(true)}>{t('settings.providers.own.removeKey')}</button>
        ) : null}
        {label(t('settings.providers.own.auth'), <SettingsField value={fields.auth} onChange={set('auth')} spellCheck={false} className="font-mono" />)}
        {label(t('settings.providers.own.what'), (
          <textarea value={fields.note} onChange={set('note')} rows={3} maxLength={600} placeholder={t('settings.providers.own.whatPlaceholder')}
            className="w-full min-w-0 resize-y rounded-[8px] border border-[var(--border)] bg-transparent px-3 py-2 text-[14px] leading-[1.5] text-[var(--text)] outline-none transition placeholder:text-[var(--text-faint)] hover:border-[var(--border-strong)] focus:border-[var(--text-muted)]" />
        ))}
        {hook.problem && hook.problemFor === (service?.id ?? 'custom') ? <p className={settingsError} role="alert">{hook.problem}</p> : null}
        <div className="flex justify-end gap-2">
          <SettingsButton variant="quiet" onClick={onDone}>{t('settings.providers.cancel')}</SettingsButton>
          <SettingsButton type="submit" variant="primary" disabled={busy || !fields.name.trim() || !fields.url.trim()}>{t('settings.providers.save')}</SettingsButton>
        </div>
      </SettingsInset>
    </form>
  );
}

/** Where a key goes unless the person says otherwise (the server's DEFAULT_AUTH). */
const DEFAULT_AUTH = 'Authorization: Bearer {key}';

/** A provider in the list: its mark, its name (and what is next to it), a line about it, and what can be done. */
function Row({ id, name, badge, children, action, below }: {
  id: string;
  name: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  action: React.ReactNode;
  below?: React.ReactNode;
}) {
  return (
    <SettingsItem mark={<ProviderMark id={id} size={17} />} title={name} badge={badge} description={children} control={action}>
      {below}
    </SettingsItem>
  );
}

/** Shown beside a connected provider's name, with whatever tells which connection it is (a key's last four). */
function Connected({ children }: { children?: React.ReactNode }) {
  const t = useT();
  return <SettingsStatus>{t('settings.providers.connected')}{children}</SettingsStatus>;
}

/** What a provider makes, as a phrase: "Voice-over, music, sound effects and transcription". */
function abilityPhrase(verbs: readonly ProviderVerb[], t: (key: string) => string) {
  const words = verbs.map((v, i) => (i ? t(`settings.providers.verbs.${v}`).toLowerCase() : t(`settings.providers.verbs.${v}`)));
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} ${t('settings.providers.and')} ${words.at(-1)}` : words[0] ?? '';
}

/** A service paid with the person's own key: connected by pasting one (kept here, or read from the environment). */
function KeyRow({ provider, hook }: { provider: OwnProvider; hook: ProvidersHook }) {
  const t = useT();
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const saving = hook.busy === provider.id;

  const close = () => { setAdding(false); setDraft(''); };
  const save = async () => {
    if (!draft.trim() || saving) return;
    if (await hook.saveKey(provider.id, draft)) close();
  };
  const pasteLabel = t('settings.providers.pasteKey').replaceAll('{name}', provider.name);

  return (
    <Row
      id={provider.id}
      name={provider.name}
      badge={provider.source ? (
        <Connected>
          <span className="font-mono tabular-nums text-[var(--text-faint)]" aria-label={t('settings.providers.keyEnding').replaceAll('{last4}', provider.last4 ?? '')}>
            •••• {provider.last4}
          </span>
        </Connected>
      ) : null}
      action={provider.source ? (
        <SettingsButton variant="quiet" disabled={saving} onClick={() => void hook.removeKey(provider.id)}>{t('settings.providers.disconnect')}</SettingsButton>
      ) : adding ? null : (
        <SettingsButton onClick={() => setAdding(true)}>
          <Plus size={15} strokeWidth={2} />{t('settings.providers.connect')}
        </SettingsButton>
      )}
      below={adding && !provider.source ? (
        <form className="pl-[34px]" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <SettingsInset>
            <div className="flex items-center gap-2">
              <SettingsField
                type="password"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } }}
                placeholder={pasteLabel}
                aria-label={pasteLabel}
                className="flex-1 font-mono placeholder:font-sans"
              />
              <SettingsButton variant="quiet" onClick={close}>{t('settings.providers.cancel')}</SettingsButton>
              <SettingsButton type="submit" variant="primary" disabled={!draft.trim() || saving}>{t('settings.providers.save')}</SettingsButton>
            </div>
            {hook.problem && hook.problemFor === provider.id ? <p className={settingsError} role="alert">{hook.problem}</p> : null}
            {/* the environment has a key for it: connect with that one, nothing to paste */}
            {provider.envKey ? (
              <button type="button" disabled={saving} onClick={() => void hook.useEnvKey(provider.id).then((ok) => { if (ok) close(); })} className={`${settingsLink} self-start text-[14.5px]`}>
                {t('settings.providers.useEnv').replaceAll('{env}', provider.env)}
              </button>
            ) : null}
            <a href={provider.keysUrl} target="_blank" rel="noreferrer" className={`${settingsLink} text-[14.5px]`}>
              {t('settings.providers.getKey').replaceAll('{name}', provider.name)}<ExternalLink size={12} />
            </a>
          </SettingsInset>
        </form>
      ) : null}
    >
      {abilityPhrase(ABILITY_ORDER.filter((v) => provider.verbs.includes(v)), t)}
    </Row>
  );
}
