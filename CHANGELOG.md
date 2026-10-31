# Changelog

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
