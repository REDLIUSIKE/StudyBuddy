/**
 * The app's update in Studio's top bar, beside the projects button (an app with updates: lib/host.ts `update`): once a
 * new version is downloaded, Restart to install it. Refused while an agent works or Studio exports, it says why beside
 * it and stays, ready; quitting installs it too.
 */
import { CircleArrowDown, Loader2 } from 'lucide-react';

import { useT } from '@/i18n';
import { useHostUpdate } from '../lib/host';
import { Tooltip } from './Tooltip';

const WAITING = { 'agent-busy': 'update.agentBusy', exporting: 'update.exporting', 'install-failed': 'update.installFailed' } as const;

export function UpdateButton() {
  const t = useT();
  const host = useHostUpdate();
  if (!host) return null;
  const { update, restart } = host;
  const words = (key: string) => t(key).replace('{version}', update.version);
  if (update.status === 'installing') {
    return (
      <span role="status" className="flex h-[26px] shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] text-[var(--text-dim)]">
        <Loader2 size={13} className="animate-spin" />
        {t('update.installing')}
      </span>
    );
  }
  const waiting = update.waiting ? words(WAITING[update.waiting]) : null;
  return (
    <>
      <Tooltip label={waiting ?? words('update.ready')} side="bottom">
        <button type="button" onClick={() => void restart()}
          className="flex h-[26px] shrink-0 items-center gap-1.5 rounded-md bg-[var(--accent-soft)] px-2 text-[12px] font-medium text-[var(--accent)] transition hover:brightness-110">
          <CircleArrowDown size={14} />
          {t('update.restart')}
        </button>
      </Tooltip>
      {waiting ? <span role="status" className="min-w-0 truncate text-[12px] text-[var(--text-dim)]">{waiting}</span> : null}
    </>
  );
}
