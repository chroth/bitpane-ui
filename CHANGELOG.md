# Changelog

## 0.9.1
- A window may have an empty title again (0.8.0 rejected it); it then gets no `aria-label`, so the page can set its own.

## 0.9.0
- **Breaking:** the opt-in for other link schemes is renamed `dangerouslyAllowSchemes` (was `unsafeAllowSchemes`), so the call itself reads as a warning.

## 0.8.0
- **Breaking:** links are safe by default. `textWindow` links, `linkButton`, alert link buttons and application items accept only `http:`, `https:`, `mailto:` and relative URLs; other schemes throw unless the call passes `unsafeAllowSchemes`.
- **Breaking:** every public function checks its input (text, sizes, positions, callbacks) and throws a clear error before changing anything.
- `bitmapText` creates text elements only (no `<script>`, `<iframe>` and so on).
- While an alert is open, everything else is `inert`.
- Pictures load with `referrerPolicy="no-referrer"`.
- Tests fail the build if the source uses HTML or code injection sinks, network, storage, cookies or cross-window messaging.
- CI installs without lifecycle scripts, verifies npm registry signatures, and runs CodeQL. `.npmrc` disables install scripts locally too.
- SECURITY.md describes the security model.

## 0.7.0
- `DesktopWindow` `onShow` and `onHide` callbacks, called after a window opens and closes.

## 0.6.0
- `application` items: icons that are plain links (`href`). A click selects, a double-click or Enter zooms out and launches, modified clicks open a new tab.
- Custom icon art for any item: `art`, rows of `0`/`1`.
- Items without a window (or applications without an `href`) are rejected with a clear error.

## 0.5.0
- The code is split into layers: screen, controls, windows, documents, Finder.
- **Breaking:** `crash()` is replaced by `alert({ icon, message, buttons })`.
- **Breaking:** `textWindow()` and `pictureWindow()` are standalone functions instead of `Desktop` methods.
- **Breaking:** folder items can only be `document`, `picture` or `folder`.
- `linkButton()` is exported.
- Configurable wording: `Desktop({ text, labels })`, `DesktopWindow` `labels`, `menuBar` `label`.
- Windows place and zoom from any `opener` with `rect()`, `placeWindow()` and `setOpen()`.

## 0.4.0
- **Breaking:** `restart()` is removed; `crash(id, href)` makes Restart a plain link.

## 0.3.1
- `area()` creates the screen on first use; unknown icon kinds and fonts throw clear errors; drag and drop ignores consumer elements that share class names.

## 0.3.0
- Folder windows show disk-wide used and available space; items take `kb`, `disk()` takes `capacity`.

## 0.2.0
- **Breaking:** `Finder` is renamed `Desktop`.
