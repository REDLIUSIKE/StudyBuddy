/**
 * How full the agent's context is in this conversation, as its own chat shows it: a small ring beside the composer's
 * tools, its share of the context window filled, the numbers on hover. Shown once the agent has said (after its first
 * turn in the conversation); the agent compacts it itself as it fills, or the person runs its own /compact.
 */
import { useT } from '@/i18n';
import type { AgentContext } from '@/lib/local-agent-run';
import { Tooltip } from './Tooltip';

const R = 6;
const AROUND = 2 * Math.PI * R;

const tokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

export function ContextMeter({ context }: { context: AgentContext | null }) {
  const t = useT();
  if (!context) return null;
  const share = Math.min(1, Math.max(0, context.used / context.size));
  const percent = Math.round(share * 100);
  const label = t('composer.context').replace('{percent}', String(percent)).replace('{used}', tokens(context.used)).replace('{size}', tokens(context.size));
  /* nearly full: in the warning color, as the agent will soon compact it */
  const tone = share >= 0.85 ? 'var(--warn)' : 'var(--text-muted)';
  return (
    <Tooltip label={label}>
      <span role="img" aria-label={label} className="flex h-8 w-8 items-center justify-center">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <circle cx="8" cy="8" r={R} fill="none" stroke="var(--border-strong)" strokeWidth="2" />
          <circle cx="8" cy="8" r={R} fill="none" stroke={tone} strokeWidth="2" strokeLinecap="round"
            strokeDasharray={`${share * AROUND} ${AROUND}`} transform="rotate(-90 8 8)" />
        </svg>
      </span>
    </Tooltip>
  );
}
