/** Saved image results in the completed reply, independent of Tool process folding. */
import { useState } from 'react'
import { ImageLightbox } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { mediaTaskUrl, type MediaTaskModel } from '../tool/models/media-generation-model.ts'
import { MEDIA_NS } from './locale.ts'
import { imagesForClosing } from './turn-images.ts'
import css from './GeneratedImageTail.module.css'

function GeneratedImage({ task, t }: { task: MediaTaskModel } & PropsLocale<typeof MEDIA_NS>) {
  const [failed, setFailed] = useState(false), [open, setOpen] = useState(false), [attempt, setAttempt] = useState(0)
  const url = mediaTaskUrl(task, 'content')
  return <figure className={css.image} data-generated-image={task.requestId}>
    {failed ? <div className={css.failure} role="status">
      <span>{t('image.failed')}</span>
      <button type="button" onClick={() => { setFailed(false); setAttempt(value => value + 1) }}>{t('image.retry')}</button>
    </div> : <button className={css.preview} type="button" aria-label={t('image.open')} onClick={() => { setOpen(true) }}>
      <img key={attempt} src={url} alt={t('image.alt')} loading="lazy" onError={() => { setFailed(true); setOpen(false) }} />
    </button>}
    <a className={css.download} href={url} download>{t('image.download')}</a>
    {open && <ImageLightbox src={url} alt={t('image.alt')}
      labels={{ dialog: t('image.alt'), close: t('image.close') }} onClose={() => { setOpen(false) }} />}
  </figure>
}

/** Render this Turn's saved images below its final reply.
 * @param props - completed Turn, viewed Session and localized image controls.
 * @returns visible image results, or no contribution when the Turn has none.
 */
export function GeneratedImageTail(props: PropsRuntime<'conversation.chat.turnTail'> & PropsLocale<typeof MEDIA_NS>) {
  const images = imagesForClosing(props, props.sessionId, document.baseURI)
  return images.length === 0 ? null : <div className={css.root} data-generated-images>
    {images.map(task => <GeneratedImage key={task.requestId} task={task} t={props.t} />)}
  </div>
}
