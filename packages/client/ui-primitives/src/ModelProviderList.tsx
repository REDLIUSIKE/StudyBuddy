/** Provider-list display extracted from the native Models settings section. */
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { IconPlusOutlineRegular } from './icons/index.tsx'
import styles from './ModelProviderList.module.css'

/** Pure provider display; credential dots describe only the supplied credential fact. */
export interface ModelProviderRowProps {
  name: string
  tag?: string | undefined
  credential?: { configured: boolean; label: string } | undefined
  /** Current model availability, supplied by the account's revision-bound authority. */
  readiness?: { state: 'ready' | 'failed' | 'pending' | 'unknown'; label: string } | undefined
  status?: ReactNode
  editLabel: string
  editAccessibleLabel: string
  editDisabled?: boolean | undefined
  onEdit: () => void
  extraActions?: ReactNode
  children?: ReactNode
}

/**
 * Render the native single-column provider list without settings or credential operations.
 * @param props - provider rows, including any owner-rendered setup card.
 * @returns the list with the native Models spacing.
 */
export function ModelProviderList({ children }: { children: ReactNode }) {
  return <ul className={styles.rows}>{children}</ul>
}

/**
 * Render one provider row with owner-supplied status and edit behavior.
 * @param props - display facts, localized labels and callbacks belonging to the caller.
 * @returns a native provider row; a configured credential does not imply model readiness.
 */
export function ModelProviderRow({
  name, tag, credential, readiness, status, editLabel, editAccessibleLabel, editDisabled, onEdit, extraActions, children,
}: ModelProviderRowProps) {
  return <li className={styles.rowCard}>
    <div className={styles.rowHead}>
      <div className={styles.rowSummary}>
        <span className={styles.rowIdentity}>
          <span className={styles.rowName}>{name}</span>
          {tag === undefined ? null : <span className={styles.rowTag}>{tag}</span>}
          {readiness !== undefined ? <span
            className={`${styles.credentialDot} ${styles['readiness_' + readiness.state]}`}
            data-model-readiness={readiness.state} role="img" aria-label={readiness.label} title={readiness.label}
          /> : credential === undefined ? null : <span
            className={`${styles.credentialDot} ${credential.configured ? styles.credentialDotConfigured : styles.credentialDotMissing}`}
            role="img" aria-label={credential.label} title={credential.label}
          />}
        </span>
        {status === undefined ? null : <div className={styles.rowStatus}>{status}</div>}
      </div>
      <span className={styles.rowActions}>
        <button type="button" className={styles.editButton} aria-label={editAccessibleLabel} disabled={editDisabled} onClick={onEdit}>{editLabel}</button>
        {extraActions}
      </span>
    </div>
    {children}
  </li>
}

/**
 * Render the original full-width dashed add entry.
 * @param props - localized text and native button attributes; the caller owns creation.
 * @returns the add row with the original plus icon and keyboard behavior.
 */
export function ModelProviderAddButton({ label, ...props }: { label: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'>) {
  return <div className={styles.addActions}>
    <button {...props} type="button" className={styles.addButton}><IconPlusOutlineRegular size={14} />{label}</button>
  </div>
}
