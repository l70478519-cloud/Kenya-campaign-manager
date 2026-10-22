(() => {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {});
  let pending;
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const panel = document.createElement('div');
  panel.className = 'phone-app-tools';
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = 'Install phone app';
  button.hidden = standalone();
  const help = document.createElement('p');
  help.hidden = true; help.id = 'phone-install-help';
  button.setAttribute('aria-controls', help.id);
  button.setAttribute('aria-expanded', 'false');
  button.addEventListener('click', async () => {
    if (pending) {
      const event = pending; pending = undefined;
      await event.prompt();
      const result = await event.userChoice;
      if (result.outcome === 'accepted') button.hidden = true;
    } else {
      help.hidden = !help.hidden;
      button.setAttribute('aria-expanded', String(!help.hidden));
      help.textContent = /iPad|iPhone|iPod/.test(navigator.userAgent)
        ? 'In Safari, tap Share, then Add to Home Screen and Open as Web App.'
        : 'Open your browser menu and choose Install app or Add to Home screen. If unavailable, open this site in Chrome, Edge or Safari.';
    }
  });
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const update = () => { status.hidden = navigator.onLine; status.textContent = 'Offline — live records and saving need a connection. Keep open forms open until you reconnect.'; };
  window.addEventListener('online', update); window.addEventListener('offline', update); update();
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); pending = event; button.hidden = standalone(); });
  window.addEventListener('appinstalled', () => { pending = undefined; button.hidden = true; help.hidden = true; });
  panel.append(button, help, status); document.body.append(panel);
})();
