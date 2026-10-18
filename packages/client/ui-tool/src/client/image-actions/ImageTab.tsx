/** A pure image tab using the same lightbox as the Chat thumbnail. */
import { useState } from 'react'
import { ImageLightbox } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { MEDIA_NS } from '../generated-images/locale.ts'
import { parseImageAddress } from './definition.ts'
import css from './ImageTab.module.css'
export function ImageTab({ useTabInfo, sessionId, t }: PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<typeof MEDIA_NS>) {
  const { tab } = useTabInfo()
  const image = parseImageAddress(tab.contentId)
  const [enlarged, setEnlarged] = useState(false)
  const [failed, setFailed] = useState(false)
  if (image === undefined || image.sessionId !== sessionId) return <p>{t('image.failed')}</p>
  return <div className={css.root} data-chat-session={sessionId} data-conversation-image-tab="">
    {failed ? <p role="status">{t('image.failed')}</p> : <button type="button" className={css.imageButton} aria-label={t('image.open')}
      onClick={() => setEnlarged(true)}><img src={image.src} alt={image.name || t('image.alt')} onError={() => setFailed(true)} /></button>}
    {enlarged && <ImageLightbox src={image.src} alt={image.name || t('image.alt')} labels={{ dialog: t('image.open'), close: t('image.close') }} onClose={() => setEnlarged(false)} />}
  </div>
}
