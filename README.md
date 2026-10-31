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

**Windows**
- `new DesktopWindow(title, [w, h])`: draggable, resizable, zoomable window with scroll bars. Put your own DOM or canvas in `.content`.
  - `show()`, `hide()`, `activate()`, `toggleZoom()`
  - `layout()`: update the scroll bars after changing the content.

**Desktop** (one per page)
- `new Desktop()`
  - `disk(label, folder, { capacity })`: disk icon in the top right; `capacity` in K, default 20480.
  - `trash(items)`: Trash icon in the bottom right; looks full when it holds something.
  - `folderWindow(title, items, [w, h])`: folder window with icons.
  - `textWindow(title, lines)`: text document; a line is a string or `{ text, href }`.
  - `pictureWindow(title, { src, width, height, alt })`: picture document, loaded when first opened.
- Items: `{ label, kind, opens, kb }`.
  - `kind`: `document`, `picture` or `folder`.
  - `opens`: the window a double-click opens.
  - `kb`: size on disk in K.
- Icons can be dragged between the desktop, folders and the Trash. Folder windows show their item count and the disk's used and available space.

**Controls**
- `menuBar([{ label, items: [{ label, action, disabled }, null] }])`: menu bar; `null` is a separator. Returns a function that removes it.
- `pushButton(parent, label, { x, y, w, h }, isDefault, onPress)`: push button.
- `bitmapText(text, font)`: bitmap text that screen readers can read; `font` is `system` or `small`.

**Screen**
- `crash(id, href)`: system error dialog with a bomb. Restart is a plain link to `href`, drawn as a button; returns the link.
- `area()`: the visible screen area, clear of the menu bar and phone notches.
- `onResize(callback)`: called when `area()` changes; returns a function that stops it.
- `screen()`: the screen element.

Works with mouse, touch and keyboard.

## Tests

```sh
npm install
npx playwright install chromium
npm test
```

## License

MIT
