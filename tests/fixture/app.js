// Test page for tests/browser.test.js. The URL hash picks a scene; handles
// the tests need are exposed on window.t.

import {
  Desktop, DesktopWindow, menuBar, pushButton, bitmapText, crash, area, onResize,
} from '../../src/index.js';
import '../../src/bitpane.css';

const t = { pressed: 0, menuActions: [], resizes: 0, area, bitmapText };
window.t = t;

const scenes = {
  desktop() {
    const desktop = new Desktop();
    const readme = desktop.textWindow('Readme', [
      'Hello',
      { text: 'Link', href: 'https://example.com/' },
    ]);
    const photo = desktop.pictureWindow('Photo', { src: '/pixel.png', width: 40, height: 30, alt: 'A photo' });
    const projects = desktop.folderWindow('Projects', []);
    const hd = desktop.folderWindow('HD', [
      { label: 'Readme', kind: 'document', opens: readme, kb: 3 },
      { label: 'Projects', kind: 'folder', opens: projects },
    ]);
    desktop.disk('HD', hd, { capacity: 1000 });
    desktop.trash([{ label: 'Photo', kind: 'picture', kb: 7, opens: photo }]);
    // Consumer content that happens to use the library's class names.
    const decoy = document.createElement('div');
    decoy.className = 'icon win';
    Object.assign(decoy.style, { position: 'absolute', left: '150px', top: '10px', width: '120px', height: '60px' });
    projects.content.append(decoy);
    Object.assign(t, { desktop, hd, projects, readme, photo });
  },

  window() {
    const notes = new DesktopWindow('Notes', [240, 160]);
    notes.content.append(bitmapText('Hello'));
    pushButton(notes.content, 'OK', { x: 20, y: 40, w: 60, h: 20 }, true, () => t.pressed++);
    t.notes = notes;
    t.stopResize = onResize(() => t.resizes++);
    notes.show();
  },

  menu() {
    t.areaBefore = { ...area() };
    t.removeMenu = menuBar([
      { label: 'File', items: [
        { label: 'New', action: () => t.menuActions.push('new') },
        null,
        { label: 'Locked', action: () => t.menuActions.push('locked'), disabled: true },
        { label: 'Quit', action: () => t.menuActions.push('quit') },
      ] },
      { label: 'Edit', items: [{ label: 'Undo', action: () => t.menuActions.push('undo') }] },
    ]);
    t.areaWithMenu = { ...area() };
  },

  crash() {
    const notes = new DesktopWindow('Behind', [240, 160]);
    notes.show();
    t.restart = crash(42, '#restarted');
  },
};

scenes[location.hash.slice(1) || 'desktop']();
