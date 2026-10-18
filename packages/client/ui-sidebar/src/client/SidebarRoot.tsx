/**
 * Sidebar shell: column geometry and global panel navigation.
 * Collapse is a slide plus crossfade:
 * content freezes at its expanded width (inline style) and fades out in place
 * while the sliding column (AppFrame grid tracks) clips it — nothing reflows
 * mid-slide. At settle the wide-only content unmounts and the upper
 * controls enter the 56px rail from the same horizontal offset (one icon each,
 * same top-down order) on one fade that ends with the slide. The bottom-pinned
 * settings and management controls only fade. The workspace/session browsing region between
 * global panel rows and the foot is the `sidebar.workspaces` registrant's,
 * and the foot holds `sidebar.settings`, `sidebar.footer.action`, and bottom panel rows; the shell
 * hands them the wide flag (plus an expand request callback for the browser).
 *
 * The column also owns whether the scroll regions nested in it draw a
 * scrollbar at all: the shell tracks the pointer and rebinds ui-theme's
 * scrollbar indirection away while it is elsewhere, so a list the user is not
 * pointing at carries no bar.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  FishLogo, IconNewChatOutlineMedium, IconNewChatOutlineRegular, IconPanelLeftOutlineRegular, isDarwinDesktop, ShortcutKeys, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  SidebarPanelMetadata, SidebarRootComponentProps, SidebarRootInjected, SidebarSectionOwnerProps,
} from './contract/slots.ts'
import css from './SidebarRoot.module.css'

/** Wide-content unmount delay; matches the 150ms wide-content fade-out. */
const COLLAPSE_SETTLE_MS = 150

/** Management destinations stay above the bottom-pinned Settings entry. */
const BOTTOM_PANEL_IDS = ['schedules', 'plugins'] as const

/**
 * How long the column's scrollbars stay drawn after the pointer leaves it.
 * The bar is a pointer affordance here, and hiding it on the leave event
 * itself makes it blink out while the pointer is only crossing the column's
 * edge — on the way to the conversation, or around a portalled menu.
 */
const SCROLLBAR_LINGER_MS = 2000

/** Format complete-build metadata for the local brand badge. */
function localBuildVersion(): string | undefined {
  const version = process.env.DSH_CLIENT_VERSION
  if (version === undefined) return undefined
  const commit = process.env.DSH_CLIENT_COMMIT_HASH
  return version
    + (commit === undefined ? '' : `-${commit}`)
    + (process.env.DSH_CLIENT_GIT_DIRTY === 'true' ? '-dirty' : '')
}

type PanelRowProps =
  Pick<SidebarPanelMetadata, 'id' | 'label'>
  & { covered?: boolean }
  & Pick<SidebarSectionOwnerProps, 'wide'>
  & Pick<PropsRuntime<'sidebar'>, 'usePanelInfo'>
  & Pick<InjectFace<SidebarRootInjected>, 'selectPanel'>
  & PropsRenderSlots<'sidebar.panellist'>

/** Each panel row subscribes only to its own selection state. */
function PanelRow({ id, label, wide, covered = false, usePanelInfo, selectPanel, renderSlot }: PanelRowProps) {
  const active = usePanelInfo(info => info.activePanelId === id)
  return (
    <Tooltip label={label} delayMs={500} disabled={wide}>
      <button
        type="button"
        className={clsx(css.panelRow, active && css.panelActive)}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        aria-hidden={covered || undefined}
        tabIndex={covered ? -1 : undefined}
        {...(covered ? { inert: '' } : {})}
        onClick={() => { selectPanel(id) }}
      >
        <span className={css.panelGlyph} aria-hidden="true">
          {renderSlot('sidebar.panellist', { size: wide ? 16 : 18, active }, { only: id })}
        </span>
        {wide && (
          <span className={clsx(css.panelTitle, css.wide)}>
            {label}
          </span>
        )}
      </button>
    </Tooltip>
  )
}

/**
 * Render the sidebar column shell.
 * @param props - composed slot props (runtime share + injected callbacks, contract/slots.ts).
 * @returns the sidebar element tree.
 */
export function SidebarRoot({
  collapsed,
  width,
  startSession,
  toggleSidebar,
  selectPanel,
  usePanels,
  useShortcuts,
  usePanelInfo,
  t,
  renderSlot,
}: SidebarRootComponentProps) {
  const panels = usePanels(snapshot => snapshot)
  const upperPanels = panels.filter(({ id }) => !BOTTOM_PANEL_IDS.some(bottomId => bottomId === id))
  const bottomPanels = BOTTOM_PANEL_IDS.flatMap(id => panels.filter(panel => panel.id === id))
  const shortcut = useShortcuts(rows => rows.find(row => row.id === 'sidebar.left.toggle'))
  const newShortcut = useShortcuts(rows => rows.find(row => row.id === 'session.new'))
  const toggleLabel = collapsed ? t('toggle.open') : t('toggle.collapse')
  // Wide content stays mounted while the collapse animates (fading via
  // .collapsed .wide), unmounts at settle, and remounts right away on expand.
  const [settled, setSettled] = useState(collapsed)
  useEffect(() => {
    if (!collapsed) { setSettled(false); return }
    const timer = window.setTimeout(() => { setSettled(true) }, COLLAPSE_SETTLE_MS)
    return () => { window.clearTimeout(timer) }
  }, [collapsed])
  const windowsTitlebar = document.documentElement.hasAttribute('data-windows-titlebar')
  const wide = windowsTitlebar ? !collapsed : !collapsed || !settled
  const upperNavigation = useRef<HTMLElement>(null)
  const [workspaceHeight, setWorkspaceHeight] = useState(0)
  const [workspaceGeometry, setWorkspaceGeometry] = useState({ maxHeight: 0, rowBottoms: [] as number[] })
  const upperPanelKey = upperPanels.map(({ id }) => id).join('\0')
  // Keep the feature rows in place and enlarge the same browser over their
  // lower edge. The measured limit protects the brand and New Session.
  useLayoutEffect(() => {
    if (!wide || collapsed) return
    const navigation = upperNavigation.current
    const measure = (): void => {
      const rect = navigation?.getBoundingClientRect()
      const margin = navigation === null ? 0 : Number.parseFloat(getComputedStyle(navigation).marginBottom) || 0
      const maxHeight = Math.max(0, (rect?.height ?? 0) + margin)
      const rowBottoms = navigation === null ? [] : Array.from(navigation.querySelectorAll('button'))
        .map(row => row.getBoundingClientRect().bottom - (rect?.top ?? 0))
      setWorkspaceGeometry(previous => previous.maxHeight === maxHeight
        && previous.rowBottoms.length === rowBottoms.length
        && previous.rowBottoms.every((bottom, index) => bottom === rowBottoms[index])
        ? previous : { maxHeight, rowBottoms })
      setWorkspaceHeight(previous => Math.min(previous, maxHeight))
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
    if (navigation !== null) observer?.observe(navigation)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [wide, collapsed, width, upperPanelKey])
  const expandedHeight = wide && !collapsed ? Math.min(workspaceHeight, workspaceGeometry.maxHeight) : 0
  // Caption controls share a row with the native menus. Keep their bubbles
  // below that row, clear of menu text and the window controls.
  const captionTooltipSide = windowsTitlebar ? 'bottom' : 'right'
  // Freeze the content at its expanded width while it fades out (collapsed
  // && wide): the sliding column then clips it instead of reflowing it. The
  // rail layout (.collapsed styles) only applies once the fade settles.
  const lastWideWidth = useRef(width)
  if (!collapsed) lastWideWidth.current = width

  // Rail-in only crossfades a live collapse: a refresh straight into the
  // collapsed state renders the rail statically (no delay-hidden icons).
  const everWide = useRef(!collapsed)
  if (!collapsed) everWide.current = true

  // Scrollbars in the column follow the pointer (.quietBars rebinds them
  // away): drawn while it is inside, and for SCROLLBAR_LINGER_MS after it
  // leaves. A pointer that returns within that window cancels the pending
  // hide rather than restarting from a hidden bar.
  const column = useRef<HTMLDivElement>(null)
  const [pointerInside, setPointerInside] = useState(false)
  const lingerTimer = useRef<number | undefined>(undefined)
  const armLinger = (): void => {
    if (lingerTimer.current !== undefined) return
    lingerTimer.current = window.setTimeout(() => {
      lingerTimer.current = undefined
      setPointerInside(false)
    }, SCROLLBAR_LINGER_MS)
  }
  const cancelLinger = (): void => {
    window.clearTimeout(lingerTimer.current)
    lingerTimer.current = undefined
  }
  // Leaving is decided by the column's BOX, not by DOM containment, and only
  // while the bars are drawn. ui-settings renders its full-viewport panel as a
  // fixed-position DESCENDANT of this column, so a pointer moved onto that
  // panel — or onto the conversation once it closes — fires no `pointerleave`
  // here, and the bars would stay drawn over a column nobody is pointing at.
  // The element's own leave stays as the one signal geometry cannot give: a
  // pointer that leaves the window emits no further moves.
  useEffect(() => {
    if (!pointerInside) return
    const onMove = (event: PointerEvent): void => {
      const rect = column.current?.getBoundingClientRect()
      /* v8 ignore next -- the listener only exists while the column is mounted and revealed. */
      if (rect === undefined) return
      const inside = event.clientX >= rect.left && event.clientX < rect.right
        && event.clientY >= rect.top && event.clientY < rect.bottom
      if (inside) cancelLinger()
      else armLinger()
    }
    document.addEventListener('pointermove', onMove)
    return () => {
      document.removeEventListener('pointermove', onMove)
      cancelLinger()
    }
  }, [pointerInside])

  const buildVersion = localBuildVersion()

  const darwinDesktop = isDarwinDesktop()
  // Rail resting state is the whale mark; hovering swaps in the panel icon
  // (the expand affordance, figma sidebar-hover flow). Expanded it is a plain
  // panel icon.
  const toggle = (
    <Tooltip label={toggleLabel} shortcutKeys={shortcut?.keys} delayMs={500} side={captionTooltipSide}>
      <button
        type="button"
        className={clsx(css.iconButton, css.toggle)}
        aria-label={toggleLabel}
        aria-keyshortcuts={shortcut?.aria}
        onClick={() => { toggleSidebar() }}
      >
        {!wide && !windowsTitlebar && (
          <span className={css.railMark} aria-hidden="true">
            {renderSlot('sidebar.brand.mark', { size: 24, wide: false }, { fallback: <FishLogo size={24} /> })}
          </span>
        )}
        {/* Rail icons render at 18 (figma rail spec); expanded keeps the glyph-native sizes. */}
        <IconPanelLeftOutlineRegular className={css.panelIcon} size={wide || windowsTitlebar ? 16 : 18} />
        {!wide && renderSlot('sidebar.toggle.badge', {})}
      </button>
    </Tooltip>
  )

  return (
    <div
      ref={column}
      className={clsx(
        css.root, !wide && css.collapsed, !wide && everWide.current && css.railIn,
        collapsed && wide && css.fading, !pointerInside && css.quietBars,
      )}
      style={wide ? { width: collapsed ? lastWideWidth.current : width } : undefined}
      onPointerEnter={() => {
        cancelLinger()
        setPointerInside(true)
      }}
      onPointerLeave={() => { armLinger() }}
    >
      {/* macOS hiddenInset titlebar: the strip shares the row with the
          traffic lights and keeps the toggle at the sidebar's top-right. */}
      {darwinDesktop && <div className={css.topStrip} data-window-drag>{toggle}{renderSlot('sidebar.header.action', {})}</div>}
      <div className={css.logoRow} data-window-drag>
        {/* Expanded, the brand doubles as a New Session shortcut — except on
            macOS, where it stays part of the logo row's window-drag surface
            (a button would subtract itself through the global no-drag rule);
            the collapsed rail's logo is the expand toggle below instead. */}
        {wide && (() => {
          const identity = (
            <span className={css.brandIdentity} aria-hidden="true">
              <span className={css.brandMark}>
                {renderSlot('sidebar.brand.mark', { size: 24, wide: true }, { fallback: <FishLogo size={24} /> })}
              </span>
              <span className={css.brandName}>
                {renderSlot('sidebar.brand.name', {}, {
                  fallback: buildVersion === undefined
                    ? <span className={css.fallbackBrandName}>{t('brand.localBuild')}</span>
                    : (
                      <span className={css.localBuildBrand}>
                        <span className={css.localBuildTitle}>{t('brand.localBuild')}</span>
                        <span className={css.buildVersion}>{buildVersion}</span>
                      </span>
                    ),
                })}
              </span>
            </span>
          )
          return darwinDesktop
            ? <span className={clsx(css.brand, css.wide)}>{identity}</span>
            : (
              <button
                type="button"
                className={clsx(css.brand, css.wide)}
                aria-label={t('session.new.label')}
                aria-keyshortcuts={newShortcut?.aria}
                onClick={() => { startSession() }}
              >
                {identity}
              </button>
            )
        })()}
        {!darwinDesktop && toggle}
        {!darwinDesktop && <span className={css.headerActions}>{renderSlot('sidebar.header.action', {})}</span>}
      </div>

      {/* The label fades before the hover/focus shortcut, including on translucent backgrounds. */}
      <Tooltip label={t('session.new.label')} shortcutKeys={newShortcut?.keys} delayMs={500} side={captionTooltipSide} disabled={wide}>
        <button
          type="button"
          className={css.newSession}
          aria-label={t('session.new.label')}
          aria-keyshortcuts={newShortcut?.aria}
          onClick={() => { startSession() }}
        >
          <span className={css.newSessionLabelMask}><span className={css.newSessionContent}>
            {wide
              ? <IconNewChatOutlineMedium size={14} />
              : <IconNewChatOutlineRegular size={windowsTitlebar ? 16 : 18} />}
            {wide && <span className={clsx(css.newSessionLabel, css.wide)}>{t('session.new')}</span>}
          </span></span>
          {wide && newShortcut !== undefined && newShortcut.keys.length > 0 && <span className={css.newSessionShortcut} aria-hidden="true">
            <ShortcutKeys keys={newShortcut.keys} />
          </span>}
        </button>
      </Tooltip>

      {upperPanels.length > 0 && (
        <nav ref={upperNavigation} className={css.panelList} aria-label={t('panels.label')}>
          {upperPanels.map(({ id, label }, index) => (
            <PanelRow
              key={id}
              id={id}
              label={label}
              wide={wide}
              covered={expandedHeight > 0 && (expandedHeight >= workspaceGeometry.maxHeight
                || (workspaceGeometry.rowBottoms[index] ?? 0) > workspaceGeometry.maxHeight - expandedHeight)}
              usePanelInfo={usePanelInfo}
              selectPanel={selectPanel}
              renderSlot={renderSlot}
            />
          ))}
        </nav>
      )}

      {/* The browsing region fills the column between the controls and the
          foot in both states; its rail icon column rides the same slot. */}
      <div
        className={clsx(css.regionArea, expandedHeight > 0 && css.regionExpanded)}
        style={workspaceGeometry.maxHeight > 0 ? { marginTop: -expandedHeight } : undefined}
      >
        {renderSlot('sidebar.workspaces', {
          wide,
          expandSidebar: () => { if (collapsed) toggleSidebar() },
          workspaceExpansion: wide && !collapsed ? {
            height: expandedHeight,
            maxHeight: workspaceGeometry.maxHeight,
            setHeight: height => {
              if (Number.isFinite(height)) setWorkspaceHeight(Math.max(0, Math.min(height, workspaceGeometry.maxHeight)))
            },
          } : undefined,
        })}
      </div>

      {/* The account/settings entry stays last in both sidebar widths. */}
      <div className={css.footArea}>
        <div className={css.footerActions}>
          {renderSlot('sidebar.footer.action', { wide })}
        </div>
        {bottomPanels.length > 0 && (
          <nav className={css.bottomPanelList} aria-label={t('panels.label')}>
            {bottomPanels.map(({ id, label }) => (
              <PanelRow
                key={id} id={id} label={label} wide={wide}
                usePanelInfo={usePanelInfo} selectPanel={selectPanel} renderSlot={renderSlot}
              />
            ))}
          </nav>
        )}
        <div className={css.settingsArea}>
          {renderSlot('sidebar.settings', { wide })}
        </div>
      </div>
    </div>
  )
}
