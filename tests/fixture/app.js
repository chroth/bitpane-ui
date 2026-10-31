// Test page for tests/browser.test.js. The URL hash picks a scene; handles
// the tests need are exposed on window.t.

import {
  Desktop, DesktopWindow, textWindow, pictureWindow, menuBar, pushButton, bitmapText, alert, area, onResize,
} from '../../src/index.js';
import '../../src/bitpane.css';

const t = { pressed: 0, menuActions: [], resizes: 0, area, bitmapText };
window.t = t;

const scenes = {
  desktop() {
    const desktop = new Desktop();
    const readme = textWindow('Readme', [
      'Hello',
      { text: 'Link', href: 'https://example.com/' },
    ]);
    const photo = pictureWindow('Photo', { src: '/pixel.png', width: 40, height: 30, alt: 'A photo' });
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

  // Applications: icons that launch a link, one with custom art.
  apps() {
    const desktop = new Desktop();
    const art = ['0110', '1111', '1111', '0110'];
    const apps = desktop.folderWindow('Apps', [
      { label: 'Game', kind: 'application', href: '#launched', art },
      { label: 'Tool', kind: 'application', href: '#tool' },
    ]);
    desktop.disk('HD', apps);
    Object.assign(t, { desktop, apps });
  },

  // A desktop in another language.
  swedish() {
    const desktop = new Desktop({
      text: { items: (n) => `${n} objekt`, used: (k) => `${k} på disken`, free: (k) => `${k} ledigt`, trash: 'Papperskorg' },
      labels: { close: 'Stäng', zoom: 'Zooma' },
    });
    const hd = desktop.folderWindow('HD', []);
    desktop.disk('HD', hd, { capacity: 1000 });
    desktop.trash([]);
    t.hd = hd;
  },

  window() {
    const notes = new DesktopWindow('Notes', [240, 160]);
    notes.content.append(bitmapText('Hello'));
    pushButton(notes.content, 'OK', { x: 20, y: 40, w: 60, h: 20 }, true, () => t.pressed++);
    t.notes = notes;
    t.shown = 0;
    t.hidden = 0;
    notes.onShow = () => t.shown++;
    notes.onHide = () => t.hidden++;
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
    ], { label: 'Main menu' });
    t.areaWithMenu = { ...area() };
  },

  // An alert with a link button, like a crash screen.
  linkAlert() {
    new DesktopWindow('Behind', [240, 160]).show();
    t.alert = alert({ icon: 'bomb', message: ['Something broke.', '', 'ID = 42'], buttons: [{ label: 'Restart', href: '#restarted' }] });
  },

  // An alert with two action buttons.
  actionAlert() {
    t.alert = alert({
      message: 'Save changes?',
      buttons: [
        { label: 'Discard', action: () => (t.choice = 'discard') },
        { label: 'Save', action: () => (t.choice = 'save') },
      ],
    });
  },
};

scenes[location.hash.slice(1) || 'desktop']();
