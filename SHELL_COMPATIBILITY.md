# Shell compatibility notes

This fork now uses upstream's provider-based shell hook at `src/common/Platform/shell/useShell.ts`.

## Supported transports

- New WebView2/QWebChannel-style JSON messages:
  - app sends `{ id, type: 3 }` to initialize
  - method calls use `{ id, type: 6, args: [method, ...args] }`
  - signals arrive as `{ id, type: 1, args: [eventName, payload] }`
- Older WebView shell messages:
  - app exposes `window.initShellComm()`
  - method calls also send legacy `{ id, event, args }`
  - native events may arrive as plain objects with string `type`
- Legacy Qt transport:
  - uses `window.qt.webChannelTransport`
  - app sends Qt init/connect/invoke messages against object id `transport`

## Shell events handled in the web app

- `open-media`: deep-link routing from upstream.
- `ReplaceLocation`: `stremio://` to hash route.
- `FileDropped`, `OpenFile`: local file playback.
- `AddonInstall`: addon install modal or detail route.
- `OpenTorrent`: streaming-server torrent creation.
- `ServerStarted`: streaming-server reload.
- `SubtitleDropped`: toast notification.
- `ShellToast`: generic toast passthrough.
- `showPictureInPicture`, `hidePictureInPicture`: toggles `#pip-overlay`.
- `media-key`, `media.status`, `media.metadata`: player media-session integration.
- `seek-hover`, `seek-leave`, `mpv-command`, `start-drag`: shell-fix player features.

## Older shell risks

- If the shell only understands `{ event, args }`, it should continue to work because `shell.send()` emits that shape while the protocol is unknown or legacy.
- If the shell only understands `{ type: 6, args: [...] }`, it should continue to work through the upstream path.
- `AddonInstall` now uses `#/addons?addon=...`; old `addon_url` is not used by the refactored upstream route.
- `app-ready` can be sent by either protocol path. Older shells should ignore duplicate `app-ready` safely.
