# Bitpane UI

A small, dependency-free ES module library for a 1-bit retro desktop UI.
Includes bitmap fonts and artwork, a desktop pattern, integer screen scaling,
safe-area handling, windows, desktop folders/icons, buttons, a system error dialog,
and optional application menus. Window content and application behavior are
supplied by the consumer.

## Usage

Bundle the JavaScript and CSS with your application's build tool:

```ts
import { DesktopWindow, bitmapText, menuBar, pushButton } from 'bitpane-ui';
import 'bitpane-ui/style.css';

const window = new DesktopWindow('Example', [320, 200]);
window.content.append(bitmapText('Hello'));

const open = () => { void window.show(); };
const removeMenu = menuBar([
  { label: 'File', items: [
    { label: 'Open', action: open },
    null,
    { label: 'Close', action: () => window.hide() },
  ] },
]);
pushButton(window.content, 'OK', { x: 12, y: 32, w: 70, h: 20 }, false, () => window.hide());
open();

// Later: removeMenu() removes the bar and releases its reserved space.
```

Append DOM elements or a canvas to `window.content` to provide your own content.
Use `Desktop` for disk and Trash icons, folders, or text/picture documents.
Folder windows show their item count plus disk-wide used and available space:
give items a size with `kb` and the disk a `capacity` (both in K) to make the
numbers match your files.
Windows and menus can also be used without a `Desktop`. Nothing is mounted on import.
See `index.d.ts` for the supported API; modules below `src/` are internal.
`bitmapText()` provides accessible text using the same bitmap renderer.

## Menus

Menu items support pointer/touch, Enter/Space, Up/Down, Home/End, Escape, Tab,
and Left/Right between headings. `null` creates a separator; `disabled: true`
creates an unavailable item. The menu bar is optional and only mounted by
`menuBar()`. Windows and desktop icons avoid its reserved area.

## Layout and lifecycle

This is a **full-page desktop**, with document-level CSS and a single screen/`Desktop`
per page. Include the CSS once. Use a separate page or iframe if you need isolation
from another UI. Multiple independent desktops on one page are not supported.

Coordinates are logical pixels; screen scaling uses whole numbers. The consumer
owns application state, rendering, input, and sound. Hiding a window removes it
from view; it does not stop timers, event listeners, or rendering loops.
`area()` and `onResize()` expose the usable logical rectangle. Window `.content`
is a clipped DOM container with classic scroll controls. Size content to fit
or call `.layout()` after content changes. To let browser touch gestures handle
content, explicitly override the desktop's `touch-action: none` in your application.

Include this viewport declaration in the containing HTML:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

## Package format

JavaScript and CSS ship as readable source with TypeScript declarations. There is
no package build step or runtime dependency. Consumers resolve the ES module and
CSS exports through their build tool.

To create an installable tarball from the package directory, run `npm pack`.
Install that tarball in a consumer with:

```sh
npm install /path/to/bitpane-ui-0.2.0.tgz
```

## License

MIT. See `LICENSE`.
