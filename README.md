# Bitpane UI

A 1-bit retro desktop UI for the web: windows, icons, menus, dialogs and bitmap fonts. No dependencies, no images.

## Install

```sh
npm install github:chroth/bitpane-ui#<commit>
```

Pin a commit so updates are deliberate.

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

## Example

```js
import { DesktopWindow, bitmapText } from 'bitpane-ui';
import 'bitpane-ui/style.css';

const notes = new DesktopWindow('Notes', [320, 200]);
notes.content.append(bitmapText('Hello'));
notes.show();
```

## API

Sizes and positions are in screen pixels; the screen is scaled up by a whole number to fill the page.

**Screen**
- `screen()`: the screen element.
- `area()`: the visible screen area, clear of the menu bar and phone notches.
- `onResize(callback)`: called when `area()` changes; returns a function that stops it.

**Controls**
- `bitmapText(text, font)`: bitmap text that screen readers can read; `font` is `system` or `small`.
- `pushButton(parent, { label, rect, isDefault, action })`: push button. With `href` instead of `action`, it is a plain link. Returns the element.
- `menuBar([{ label, items: [{ label, action, disabled }, null] }], { label })`: menu bar; `null` is a separator. Returns a function that removes it.
- `alert({ icon, message, buttons })`: modal alert. A button is `{ label, href }` or `{ label, action }`; action buttons close the alert. The last button is the default. Returns `{ buttons, close }`.

**Windows**
- `new DesktopWindow(title, [w, h], { info, labels })`: draggable, resizable, zoomable window with scroll bars. Put your own DOM or canvas in `.content`.
  - `show()`, `hide()`, `activate()`, `toggleZoom()`
  - `onShow`, `onHide`: called after the window opens and closes.
  - `rect`, `setRect({ x, y, w, h })`: the window's position and size; pass only what changes.
  - `setInfo([left, centre, right])`: the info line under the title bar, with `info: true`.
  - `labels`: screen-reader names for the close and zoom boxes.
- `textWindow(title, lines)`: text document; a line is a string or `{ text, href }`.
- `pictureWindow(title, { src, width, height, alt })`: picture, loaded when first opened.

**Finder** (one per page)
- `new Desktop({ capacity, text, labels })`: `capacity` is the disk size in K, default 20480.
  - `disk(label, folder)`: disk icon in the top right.
  - `trash(items)`: Trash icon in the bottom right; looks full when it holds something.
  - `folderWindow(title, items, [w, h])`: folder window with icons.
  - `text`: replaces the English wording: `{ items(n), used(k), free(k), trash }`.
- Items: `{ label, kind, opens, href, kb, art }`.
  - `kind`: `document`, `picture`, `folder` or `application`.
  - `opens`: the window a double-click opens; it zooms open from the icon.
  - `href`: for applications. The icon is a plain link: a click selects, a double-click or Enter launches, modified clicks open a new tab.
  - `kb`: size on disk in K.
  - `art`: custom icon, up to 32 rows of up to 32 `0`/`1` characters.
- Icons can be dragged between the desktop, folders and the Trash. Folder windows show their item count and the disk's used and available space.

Works with mouse, touch and keyboard.

## Security

Secure by design: no HTML or code from strings, strict input checks that throw before anything changes, inert backgrounds behind alerts, no network, storage or cookies, and no runtime dependencies. Works under a strict Content Security Policy with Trusted Types.

Links accept only `http:`, `https:`, `mailto:` and relative URLs. To use another scheme on purpose, list it next to the `href`, e.g. `{ href, dangerouslyAllowSchemes: ['javascript:'] }`.

See [SECURITY.md](SECURITY.md) for the security model and how to report a vulnerability.

## Tests

```sh
npm install
npx playwright install chromium
npm test
```

Set `CHROMIUM_PATH` to run them on an already installed Chromium instead.

## License

MIT
