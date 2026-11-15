// Demo cursor: a visible surgical crosshair that follows the real mouse. Headless recordings don't draw the OS
// cursor, so the demo video loads this with ?democursor=1. Pure DOM, pointer-events:none, never shown otherwise.
export function installDemoCursor() {
  if (document.getElementById('sh-demo-cursor')) return;
  const el = document.createElement('div');
  el.id = 'sh-demo-cursor';
  el.innerHTML = `<svg width="44" height="44" viewBox="-22 -22 44 44" fill="none">
    <circle r="9" stroke="#fff" stroke-width="3" opacity=".55"/>
    <circle class="ring" r="9" stroke="#1d7fd1" stroke-width="1.6"/>
    <g stroke="#fff" stroke-width="3.2" stroke-linecap="round" opacity=".55">
      <path d="M0-19V-12M0 12V19M-19 0H-12M12 0H19"/></g>
    <g stroke="#13324d" stroke-width="1.6" stroke-linecap="round">
      <path d="M0-19V-12M0 12V19M-19 0H-12M12 0H19"/></g>
    <circle class="dot" r="1.8" fill="#13324d"/></svg>`;
  el.style.cssText = 'position:fixed;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;pointer-events:none;' +
    'z-index:2147483647;transition:transform .08s ease-out;will-change:left,top;display:none';
  document.body.appendChild(el);
  const ring = el.querySelector('.ring'), dot = el.querySelector('.dot');
  const move = (e) => { el.style.display = 'block'; el.style.left = e.clientX + 'px'; el.style.top = e.clientY + 'px'; };
  const press = (on) => {
    el.style.transform = on ? 'scale(.78)' : 'scale(1)';
    ring.setAttribute('stroke', on ? '#d13a2f' : '#1d7fd1');
    ring.setAttribute('fill', on ? 'rgba(209,58,47,.18)' : 'none');
    dot.setAttribute('fill', on ? '#d13a2f' : '#13324d');
  };
  addEventListener('pointermove', move, true);
  addEventListener('pointerdown', (e) => { move(e); press(true); }, true);
  addEventListener('pointerup', () => press(false), true);
  const st = document.createElement('style');
  st.textContent = 'html.sh-democursor, html.sh-democursor * { cursor: none !important; }';
  document.head.appendChild(st);
  document.documentElement.classList.add('sh-democursor');
}
installDemoCursor();
