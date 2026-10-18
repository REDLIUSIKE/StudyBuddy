/** Illustrated chapters occupy the idle native column without starting research work. */
import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  Button, Menu, Modal, Tooltip, IconChevronLeftOutlineRegular, IconChevronRightOutlineRegular,
  IconFlatListOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { researchGuideChapters } from './research-guide-content.ts'
import { researchGuideFigures } from './research-guide-figures.ts'
import css from './ResearchGuide.module.css'

type Props = PropsLocale<'studybuddy.research'> & { visible: boolean }
type LoadedFigure = { id: string; source: string; detail?: string }

/** @param props - Localized copy and current column visibility. @returns A retained chapter reader with image locations and an expandable figure. */
export function ResearchGuide({ t, visible }: Props) {
  const [page, setPage] = useState(0), [menuOpen, setMenuOpen] = useState(false)
  const [point, setPoint] = useState(0), [zoomOpen, setZoomOpen] = useState(false)
  const [image, setImage] = useState<LoadedFigure>(), [imageFailed, setImageFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const body = useRef<HTMLDivElement>(null), heading = useId(), explanation = useId()
  const chapter = researchGuideChapters[page]!, last = researchGuideChapters.length - 1
  const figure = researchGuideFigures[chapter.id], section = chapter.sections[point]!
  const loaded = image?.id === figure.id ? image : undefined
  useEffect(() => { if (!visible) { setMenuOpen(false); setZoomOpen(false) } }, [visible])
  useEffect(() => { setPoint(0); setZoomOpen(false); if (body.current) body.current.scrollTop = 0 }, [page])
  useEffect(() => {
    if (!visible || loaded) return
    let current = true
    setImageFailed(false)
    Promise.all([figure.load(), figure.detail?.load()]).then(([main, detail]) => {
      if (current) setImage({ id: figure.id, source: main.default, ...(detail ? { detail: detail.default } : {}) })
    }).catch(() => { if (current) setImageFailed(true) })
    return () => { current = false }
  }, [figure, visible, retry, loaded])
  const move = (delta: number) => setPage(current => Math.max(0, Math.min(last, current + delta)))
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (menuOpen || zoomOpen || event.defaultPrevented || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey) return
    if (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.closest('input,textarea,select,[role="menu"]'))) return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1) }
  }
  return <section className={css.guide} role="region" aria-label={t('guideTitle')} hidden={!visible} tabIndex={0} onKeyDown={onKeyDown}>
    <header className={css.header}>
      <span>{t('guideTitle')}</span>
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} align="end" portal
        selectedId={chapter.id} items={researchGuideChapters.map(row => ({ id: row.id, label: t(row.title) }))}
        onSelect={id => { const index = researchGuideChapters.findIndex(row => row.id === id); if (index >= 0) setPage(index); setMenuOpen(false) }}
        anchor={<Button variant="ghost" size="sm" icon={<IconFlatListOutlineRegular size={16} />} aria-expanded={menuOpen} aria-haspopup="menu" onClick={() => setMenuOpen(open => !open)}>{t('guideContents')}</Button>} />
    </header>
    <div ref={body} className={css.body}>
      <article key={chapter.id} className={css.chapter} aria-labelledby={heading}>
        <p className={css.eyebrow}>{t(page === 0 ? 'guideOverviewLabel' : 'guideFeatureLabel')}</p>
        <h2 id={heading}>{t(chapter.title)}</h2>
        <p className={css.intro}>{t(chapter.text)}</p>
        <figure className={css.figure}>
          <div className={css.imageFrame} data-bottom-markers={figure.bottomMarkers} style={{ aspectRatio: `${figure.width}/${figure.height}`, maxWidth: (figure.width / figure.height) * 270 }}>
            {loaded ? <>
              <Button className={css.imageButton} aria-label={t('guideExpandImage')} onClick={() => setZoomOpen(true)}>
                <img src={loaded.source} alt={t(chapter.title)} width={figure.width} height={figure.height} decoding="async" />
                <span className={css.zoomLabel}>{t('guideExpandImage')}</span>
              </Button>
              {figure.points.map((location, index) => <Tooltip key={index} label={t(chapter.sections[index]!.title)} side="top" portal>
                <Button className={css.point} style={{ left: `${location.x}%`, top: `${location.y}%` }}
                  aria-label={t('guidePointLabel').replace('{number}', String(index + 1)).replace('{title}', t(chapter.sections[index]!.title))}
                  aria-controls={explanation} aria-pressed={point === index} onClick={() => setPoint(index)}>{index + 1}</Button>
              </Tooltip>)}
            </> : <div className={css.imagePending} role="status">
              {imageFailed ? <><span>{t('guideImageFailed')}</span><Button size="sm" onClick={() => setRetry(value => value + 1)}>{t('retry')}</Button></> : t('guideImageLoading')}
            </div>}
          </div>
          <figcaption><span className={css.figureKind}>{t(figure.kind === 'snapshot' ? 'guideFigurePhoto' : 'guideFigureDiagram')}</span><span>{t('guideImageHelp')}</span></figcaption>
        </figure>
        <div className={css.locations}>
          {chapter.sections.map((row, index) => <Button key={row.title} className={css.location} data-active={point === index} aria-pressed={point === index}
            onClick={() => setPoint(index)}><span aria-hidden="true">{index + 1}</span>{t(row.title)}</Button>)}
        </div>
        <section className={css.explanation} id={explanation} role="region" aria-label={t('guideImageExplanation')} aria-live="polite">
          <h3>{t(section.title)}</h3><p>{t(section.body)}</p>
          {chapter.id === 'settings-billing' && point === 2 && loaded?.detail && <img className={css.detailImage} src={loaded.detail} alt={t('guideBudgetImage')} width={figure.detail!.width} height={figure.detail!.height} />}
        </section>
      </article>
    </div>
    <p className={css.hint}>{t('guideOpenProjectHint')}</p>
    <footer className={css.footer}>
      <Tooltip label={t('guidePrevious')} side="top" portal><Button className={css.arrow} aria-label={t('guidePrevious')} disabled={page === 0} onClick={() => move(-1)}><IconChevronLeftOutlineRegular size={22} /></Button></Tooltip>
      <div className={css.position}>
        <span role="status" aria-live="polite">{t('guidePagePosition').replace('{current}', String(page + 1)).replace('{total}', String(last + 1))}</span>
        <div className={css.dots} aria-hidden="true">{researchGuideChapters.map((row, index) => <span key={row.id} data-current={index === page} />)}</div>
      </div>
      <Tooltip label={t('guideNext')} side="top" portal><Button className={css.arrow} aria-label={t('guideNext')} disabled={page === last} onClick={() => move(1)}><IconChevronRightOutlineRegular size={22} /></Button></Tooltip>
    </footer>
    <Modal open={zoomOpen && visible && !!loaded} title={t(chapter.title)} description={t(figure.kind === 'snapshot' ? 'guideFigurePhoto' : 'guideFigureDiagram')}
      onClose={() => setZoomOpen(false)} closeLabel={t('guideCloseImage')}
      {...(css.imageModal === undefined ? {} : { className: css.imageModal })}
      {...(css.imageModalContent === undefined ? {} : { contentClassName: css.imageModalContent })}>
      {loaded && <img className={css.enlargedImage} src={loaded.source} alt={t(chapter.title)} width={figure.width} height={figure.height} />}
    </Modal>
  </section>
}
