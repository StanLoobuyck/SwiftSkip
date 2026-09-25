// In-player overlays built with DOM APIs (no innerHTML): the shortcut sheet
// shown with "?" and the "Resumed at …" toast. Styles live in style.css.

import { ACTIONS, bindingParts, groupLabel } from "../shared/shortcuts.js";
import { t } from "../shared/i18n.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function keyChips(binding) {
  const wrap = el("span", "swiftskip-keys");
  bindingParts(binding).forEach((part, i) => {
    if (i) wrap.append(el("span", "swiftskip-plus", "+"));
    wrap.append(el("kbd", null, part));
  });
  return wrap;
}

// ─── Shortcut sheet ───────────────────────────────────────────────────────────

let sheetEl = null;

export function isShortcutSheetOpen() {
  return Boolean(sheetEl && sheetEl.isConnected);
}

export function closeShortcutSheet() {
  if (sheetEl) sheetEl.remove();
  sheetEl = null;
}

// parent: where to attach (fullscreen element or <html>); place(el): positions it.
export function openShortcutSheet({ parent, place, shortcuts, skipSeconds }) {
  closeShortcutSheet();
  sheetEl = el("div", "swiftskip-sheet");
  sheetEl.setAttribute("role", "dialog");
  sheetEl.setAttribute("aria-label", t("sheetTitle"));

  const header = el("div", "swiftskip-sheet-header");
  header.append(el("span", "swiftskip-sheet-title", t("sheetTitle")));
  const close = el("button", "swiftskip-sheet-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", t("close"));
  close.addEventListener("click", closeShortcutSheet);
  header.append(close);
  sheetEl.append(header);

  const grid = el("div", "swiftskip-sheet-grid");
  const groups = [...new Set(ACTIONS.map((a) => a.group))].filter((g) => g !== "Jump");
  for (const group of groups) {
    const section = el("section", "swiftskip-sheet-group");
    section.append(el("h3", null, groupLabel(group)));
    for (const action of ACTIONS.filter((a) => a.group === group)) {
      const bindings = shortcuts[action.id] || [];
      if (!bindings.length) continue;
      const row = el("div", "swiftskip-sheet-row");
      const label =
        action.id === "skip_forward" ? t("forwardSeconds", { s: skipSeconds })
        : action.id === "skip_backward" ? t("backSeconds", { s: skipSeconds })
        : action.label;
      row.append(el("span", "swiftskip-sheet-label", label));
      const keys = el("span", "swiftskip-sheet-bindings");
      bindings.forEach((b) => keys.append(keyChips(b)));
      row.append(keys);
      section.append(row);
    }
    grid.append(section);
  }

  // The ten "jump to" keys collapse into one row when they're the defaults.
  const jumps = ACTIONS.filter((a) => a.group === "Jump");
  const jumpKeys = jumps.map((a) => (shortcuts[a.id] || [])[0]);
  const section = el("section", "swiftskip-sheet-group");
  section.append(el("h3", null, groupLabel("Jump")));
  if (jumpKeys.every((k, i) => k === String(i))) {
    const row = el("div", "swiftskip-sheet-row");
    row.append(el("span", "swiftskip-sheet-label", t("jumpRange")));
    const keys = el("span", "swiftskip-sheet-bindings");
    keys.append(keyChips("0"), el("span", "swiftskip-plus", "–"), keyChips("9"));
    row.append(keys);
    section.append(row);
  } else {
    jumps.forEach((a, i) => {
      if (!jumpKeys[i]) return;
      const row = el("div", "swiftskip-sheet-row");
      row.append(el("span", "swiftskip-sheet-label", a.label), keyChips(jumpKeys[i]));
      section.append(row);
    });
  }
  grid.append(section);
  sheetEl.append(grid);

  sheetEl.append(el("div", "swiftskip-sheet-footer", t("sheetFooter")));
  parent.append(sheetEl);
  place(sheetEl);
}

// ─── Toast ────────────────────────────────────────────────────────────────────

let toastEl = null;
let toastTimer = null;

export function hideToast() {
  clearTimeout(toastTimer);
  if (toastEl) toastEl.remove();
  toastEl = null;
}

// action: optional { label, onClick }. Stays up longer when there's a button.
export function showToast({ parent, place, message, action }) {
  hideToast();
  toastEl = el("div", "swiftskip-toast");
  toastEl.setAttribute("role", "status");
  toastEl.append(el("span", "swiftskip-toast-text", message));
  if (action) {
    const button = el("button", "swiftskip-toast-action", action.label);
    button.type = "button";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      action.onClick();
      hideToast();
    });
    toastEl.append(button);
  }
  parent.append(toastEl);
  place(toastEl);
  toastTimer = setTimeout(hideToast, action ? 8000 : 3000);
}

export function placeToastIfOpen(place) {
  if (toastEl && toastEl.isConnected) place(toastEl);
}

export function placeSheetIfOpen(place) {
  if (isShortcutSheetOpen()) place(sheetEl);
}
