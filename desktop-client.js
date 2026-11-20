(() => {
  if (location.hostname !== '127.0.0.1') return;
  const sessionKey = 'darkDesktopToken';
  const incoming = new URLSearchParams(location.hash.slice(1)).get('desktop');
  let token = incoming;
  try {
    if (incoming) sessionStorage.setItem(sessionKey, incoming);
    token = token || sessionStorage.getItem(sessionKey);
  } catch {}
  if (!token) return;
  if (incoming) history.replaceState(null, '', location.pathname);
  document.getElementById('desktopPanel').hidden = false;
  const button = document.getElementById('desktopStart');
  const status = document.getElementById('desktopStatus');
  button.onclick = async () => {
    button.disabled = true;
    status.textContent = 'جارٍ تجهيز وحدة التحكم…';
    try {
      const result = await fetch('/desktop/controller', {
        method: 'POST', headers: {'X-Dark-Session': token}
      });
      status.textContent = (await result.json()).message;
    } catch {
      status.textContent = 'أعد فتح DARK_TRACKING.cmd ثم جرّب مجددًا.';
    } finally {
      button.disabled = false;
    }
  };
})();
