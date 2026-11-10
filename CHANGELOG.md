# Changelog

## 0.13.0
- **Breaking:** `pushButton` returns the plain `<button>` or `<a>`; `press()` is gone. Return in an alert presses the focused button, which is the default when it opens.
- **Breaking:** `DesktopWindow.el` is a `<dialog>`.
- Behaviour the browser already has is now left to it:
  - Buttons and the close and zoom boxes act on the native `click` and look pressed while `:active`.
  - Windows are non-modal dialogs. The browser focuses their content when they open, and returns focus when they close.
  - Keys scroll a window because its content has focus.
  - Icons open on the native `dblclick`, which follows the system's double-click speed.
  - Menus are popovers their titles open. The browser closes them on Escape or a click elsewhere and returns focus to the title.
  - Drags capture the pointer.

## 0.12.1
- Alerts are built on a native modal `<dialog>`. The browser keeps everything else inert and returns focus when an alert closes. They look and behave as before.

## 0.12.0
- **Breaking:** bad input that was accepted before now throws before anything changes:
  - `setRect()` values and keys, and button `x` and `y`.
  - Item `kb`, and application items without an `href`.
  - A window opened by two icons, and a second disk or Trash.
- Folder windows, the Trash, text windows and the menu bar check all their input before building anything. `area()` returns a copy.
- Window content scrolls by wheel, touch and keyboard, with the browser's scroll bars hidden behind the window's own:
  - Touch pans only content that can scroll.
  - The thumb drags, and holding the gray track pages toward the pointer.
- `hide()` stops a window that is still zooming open.
- Drags follow only the pointer that started them, so a second finger no longer moves or ends them.
- A zoomed window keeps filling the screen when the screen changes size.
- Accented letters are drawn instead of question marks: all of Latin-1 and Latin Extended-A, Romanian ș and ț, and ¡ ¿ « » € £ °.
- Ctrl, Cmd, Shift or Alt with Enter on an application icon or an alert link button is left to the browser, so it opens a new tab or window.
- Alerts:
  - Keys act on the focused button, and Return elsewhere presses the default. Escape no longer presses it.
  - An action runs once, however quickly it is pressed, and focus goes back to where it was when the alert closes.
  - Windows opened while an alert is up are inert too, and nested alerts can close in any order.
- A window takes focus when it opens, and gives it back to where it came from when it closes.
- Left and Right with a menu open open the neighbouring menu.

## 0.11.0
- **Breaking:** `DesktopWindow` `rect` is read-only; move and resize with `setRect({ x, y, w, h })`. `layout()` is removed: scroll bars follow the content by themselves.
- A link `href` that is not a string is converted once, so the checked URL is the one used.

## 0.10.0
- Written in TypeScript. `dist/` holds the compiled JavaScript and generated type definitions.
- **Breaking:** `pushButton(parent, { label, rect, isDefault, action })`; with `href` instead of `action` it is a link. `linkButton` is removed.
- **Breaking:** `dangerouslyAllowSchemes` goes next to each `href` (text-window line, button, alert button, application item) instead of on the call.
- **Breaking:** `capacity` moves from `disk()` to `new Desktop({ capacity })`.
- Runtime checks that types make redundant are gone; text length, sizes, URLs and icon art are still checked.

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
