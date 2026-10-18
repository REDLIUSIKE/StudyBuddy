// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { VideoBody, type VideoBodyProps } from '../src/client/video/VideoBody.tsx'
import { videoBodyDefinition } from '../src/client/video/index.ts'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('registers streamed video and preserves image and text loading contracts', () => {
  expect(videoBodyDefinition(() => 'Video')).toMatchObject({ extensions: ['mp4', 'webm', 'm4v', 'mov', 'ogv'], loading: 'renderer', wrap: false })
})

it('plays only an addressed live resource and releases media on hidden ancestors, abort and replacement', async () => {
  const controller = new AbortController(), loaded = vi.fn(), failed = vi.fn()
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  const props = {
    resourceAddress: 'dsh-resource://file/session/video/clip.mp4',
    content: { kind: 'renderer', revision: 1, loaded, failed, reload: vi.fn() },
    useResource: () => ({ status: 'live', value: { absolutePath: '/project/clip.mp4', version: 'video-v1' } }),
    useTabInfo: () => ({ tab: { signal: controller.signal } }),
    t: (key: string) => key,
  } as unknown as VideoBodyProps
  const view = render(<div data-testid="ancestor"><VideoBody {...props} /></div>)
  const video = view.container.querySelector('video')!
  expect(video).not.toBeNull()
  const source = new URL(video.src)
  expect(source.pathname).toBe('/api/file')
  expect(source.searchParams.get('path')).toBe('/project/clip.mp4')
  expect(source.searchParams.get('media')).toBe('video')
  expect(video.controls).toBe(true)
  expect(video.autoplay).toBe(false)
  fireEvent.loadedMetadata(video)
  expect(loaded).toHaveBeenCalledWith('video-v1')
  fireEvent.error(video)
  expect(failed).toHaveBeenCalledOnce()
  await act(async () => { screen.getByTestId('ancestor').hidden = true })
  expect(pause).toHaveBeenCalled()
  await act(async () => { controller.abort() })
  expect(video.hasAttribute('src')).toBe(false)
  view.unmount()
})
