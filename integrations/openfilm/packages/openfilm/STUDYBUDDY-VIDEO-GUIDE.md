# StudyBuddy video editing

This project runs inside the existing Harness Session. Use its native video tools and model picker. There is no
separate provider setup, agent process, API key or video command line to configure.

Read `video_read_project` before editing. It returns the current document, revision and Studio selection. Use
`video_read_file` for other project documents. Write through `video_edit` with the revision you just read; after a
conflict, read again. Never change the editor's private `.film` directory or overwrite a person's manual edits.

## Film document

The editable timeline is `film.html`. Its stage size is the viewport meta element. Body sections are tracks, from
top to bottom. A clip is an iframe (page), video, image or audio. Its `at` is the timeline start in seconds; its
source fragment `#t=in,out` selects source time. Images and pages without their own duration need an explicit end.
Put overlapping clips on different tracks. Preserve track/clip IDs, hidden, muted and locked state.

```html
<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=1920, height=1080"></head>
<body><section><iframe id="intro" src="shots/intro.html#t=0,3"></iframe></section></body>
</html>
```

Each page is ordinary local HTML and can use DOM, SVG or Canvas. Expose `window.film.frame(t)` to draw a complete,
deterministic frame at time `t`. It must also work when time moves backward. Do not rely on wall-clock timers or
ongoing playback. Optional `width`, `height`, `duration` and `ready` describe its size, length and loaded assets.

```js
window.film = {
  width: 1920, height: 1080, duration: 3,
  frame(t) { document.querySelector('h1').style.opacity = String(Math.min(1, t / 0.5)); }
};
```

Read `video_read_guide` with `guide: "spec"` for the complete film/page format, subtitle timings, clip attributes,
layout, overrides and rendering protocol. Keep project-relative local asset paths. External assets require the
person's existing import/admission flow; a document edit does not grant filesystem or network authority.

## Check, generate and export

Use `video_look` to inspect rendered frames, then `read_image` on the returned local image files. Check the actual
composition and text at representative times, including the beginning and end. Do not claim a preview was checked
until you have inspected its rendered result.

For generated media, first call `video_media_choices`. It reads the current account's native model catalog and
returns supported parameters and scoped `authorityRef` values. Pass one of those exact references to `video_get`,
with the requested operation, its native parameters, a project `assets/` output path and a stable UUIDv4 request ID.
If an outcome is unknown, keep that ID and inspect/recover the request; do not create another generation request.
Never substitute a model, provider, credential, unit, CLI or external service that was not in the native catalog.

Timed TTS creates its original word-timed VTT beside the audio when actual timings are available. Preserve existing
manual subtitles. Do not request another transcription to repair unchanged generated TTS. The person's explicit
subtitle action can use `video_transcribe`; translations use `video_translate` in the current native Session.
Music generation and online stock search are excluded; local music, images, video and audio can still be imported.

Use `video_export` for the existing video, GIF, audio, still, poster, subtitle, slides, interchange or project export.
Observe real progress and output paths with `video_export_status`. Use `video_cancel_export` to cancel this project's
job. These tools share Studio's project and history. Never report success from an uncompleted export job.
