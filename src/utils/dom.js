export function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === "class") e.className = attrs[k];
    else if (k === "html") e.innerHTML = attrs[k];
    else if (k.startsWith("on") && typeof attrs[k] === "function") e.addEventListener(k.slice(2), attrs[k]);
    else if (k === "style" && typeof attrs[k] === "object") Object.assign(e.style, attrs[k]);
    else e.setAttribute(k, attrs[k]);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null) return;
    e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return e;
}

export function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}
