"""JavaScript de la auditoria movil (compartido por audit-mobile.py y audit-android.py)."""

AUDIT = """(min) => {
  const issues = [];
  const name = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.dataset?.action ? '[data-action=' + el.dataset.action + ']' : '') + (el.dataset?.view ? '[data-view=' + el.dataset.view + ']' : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '');
  const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[hidden]'); };
  const doc = document.documentElement;
  if (doc.scrollWidth > window.innerWidth + 1) issues.push('desbordamiento horizontal: ancho de pagina ' + doc.scrollWidth + ' > ' + window.innerWidth);
  for (const el of document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button]')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (el.matches('input[type=checkbox], input[type=radio]')) continue;
    if (r.width < min - 0.5 || r.height < min - 0.5) issues.push('objetivo tactil pequeno (' + Math.round(r.width) + 'x' + Math.round(r.height) + '): ' + name(el) + ' "' + (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 30) + '"');
  }
  for (const el of document.querySelectorAll('input:not([type=hidden]):not([type=submit]), select, textarea')) {
    if (!visible(el)) continue;
    const labelled = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]')) || el.closest('label');
    if (!labelled) issues.push('campo sin etiqueta: ' + name(el));
  }
  for (const img of document.querySelectorAll('img')) if (visible(img) && !img.hasAttribute('alt')) issues.push('imagen sin alt: ' + (img.getAttribute('src') || ''));
  for (const wrap of document.querySelectorAll('.table-wrap')) { const s = getComputedStyle(wrap); if (wrap.scrollWidth > wrap.clientWidth + 1 && !['auto', 'scroll'].includes(s.overflowX)) issues.push('tabla desborda sin scroll propio: ' + name(wrap)); }
  const ids = [...document.querySelectorAll('[id]')].map(n => n.id);
  const dup = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (dup.length) issues.push('ids duplicados: ' + dup.join(', '));
  return issues;
}"""
