// The in-player download control: a "Download" pill that can be collapsed to
// a small round button (with a progress ring while downloading), plus a
// detail card with progress / errors. Pure UI — content.js wires it to the
// background. Built with DOM APIs; styles in style.css (.ss-*).

import { errorText, phaseLabel, t } from "../shared/i18n.js";
import { formatBytesPerSecond, formatEta } from "../shared/format.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// Tiny SVG builder: [tag, attrs, children?]
function svg(spec) {
  const [tag, attrs = {}, children = []] = spec;
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  for (const child of children) node.append(svg(child));
  return node;
}

const stroke = { fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" };
const ICONS = {
  download: ["svg", { viewBox: "0 0 24 24", ...stroke }, [["path", { d: "M12 4v11" }], ["path", { d: "m7 10 5 5 5-5" }], ["path", { d: "M5 20h14" }]]],
  collapse: ["svg", { viewBox: "0 0 24 24", ...stroke }, [["path", { d: "m15 6-6 6 6 6" }]]],
  cancel: ["svg", { viewBox: "0 0 24 24", ...stroke }, [["path", { d: "M7 7l10 10M17 7 7 17" }]]],
  done: ["svg", { viewBox: "0 0 24 24", ...stroke, "stroke-width": "2.4" }, [["path", { d: "m5 12.5 4.5 4.5L19 7.5" }]]],
  failed: ["svg", { viewBox: "0 0 24 24", ...stroke }, [["circle", { cx: "12", cy: "12", r: "9" }], ["path", { d: "M12 7.5v5.5" }], ["path", { d: "M12 16.5h.01" }]]],
  retry: ["svg", { viewBox: "0 0 24 24", ...stroke }, [["path", { d: "M20 11a8 8 0 1 0-2.3 5.7" }], ["path", { d: "M20 5v6h-6" }]]],
};

function icon(name) {
  const node = svg(ICONS[name]);
  node.setAttribute("aria-hidden", "true");
  node.classList.add("ss-icon");
  return node;
}

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

// Circular progress: around the collapsed button (size 36) and as the small
// indicator in the pill (size 16). Returns { el, set(fraction) }.
function progressRing(size, strokeWidth, className) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const fillCircle = ["circle", { class: "ss-ring-fill", cx: size / 2, cy: size / 2, r, "stroke-dasharray": c, "stroke-dashoffset": c, "stroke-width": strokeWidth }];
  const el = svg(["svg", { class: `ss-ring ${className}`, viewBox: `0 0 ${size} ${size}`, "aria-hidden": "true" }, [
    ["circle", { class: "ss-ring-track", cx: size / 2, cy: size / 2, r, "stroke-width": strokeWidth }],
    fillCircle,
  ]]);
  const fill = el.querySelector(".ss-ring-fill");
  return { el, set: (fraction) => fill.setAttribute("stroke-dashoffset", String(c * (1 - fraction))) };
}

export function createDownloadControl({ onDownload, onCancel, onCollapseChange }) {
  const root = el("div", "ss-dl");
  root.id = "swiftskip-download";

  // Collapsed: a round button (icon + ring).
  const orb = el("button", "ss-dl-orb ss-glass");
  orb.type = "button";
  const orbRing = progressRing(36, 2.5, "ss-dl-orb-ring");
  const orbIcon = el("span", "ss-dl-orb-icon");
  orb.append(orbRing.el, orbIcon);
  // Small ring in the pill while downloading (the % stays in the text).
  const miniRing = progressRing(16, 2.25, "ss-dl-mini-ring");

  // Expanded: pill with the main button + a side button (collapse / cancel).
  const pill = el("div", "ss-dl-pill ss-glass");
  const main = el("button", "ss-dl-main");
  main.type = "button";
  const mainIcon = el("span", "ss-dl-main-icon");
  const mainLabel = el("span", "ss-dl-main-label");
  main.append(mainIcon, mainLabel);
  const side = el("button", "ss-dl-side");
  side.type = "button";
  pill.append(main, el("span", "ss-dl-divider"), side);

  // Detail card: progress bar + speed / time left, or the error.
  const card = el("div", "ss-dl-card ss-glass");
  card.setAttribute("role", "status");
  const track = el("div", "ss-dl-track");
  const fill = el("div", "ss-dl-fill");
  track.append(fill);
  const meta = el("div", "ss-dl-meta");
  const cancel = el("button", "ss-dl-cancel");
  cancel.type = "button";
  cancel.append(icon("cancel"));
  const cardRow = el("div", "ss-dl-card-row");
  cardRow.append(meta, cancel);
  card.append(track, cardRow);

  root.append(orb, pill, card);

  let state = { mode: "idle", percent: 0 };
  let collapsed = false;

  function setIcon(slot, name) {
    slot.replaceChildren(icon(name));
  }

  function render() {
    const { mode, percent } = state;
    root.dataset.mode = mode;
    root.classList.toggle("is-collapsed", collapsed);

    // Main button
    const busy = mode === "busy";
    main.disabled = busy;
    if (mode === "idle") {
      setIcon(mainIcon, "download");
      mainLabel.textContent = t("downloadLecture");
      main.title = t("downloadLectureTitle");
    } else if (busy) {
      // No percentage yet (preparing, reading the playlist): spinner.
      if (percent > 0 || state.phase === "Downloading") {
        miniRing.set(percent / 100);
        if (mainIcon.firstChild !== miniRing.el) mainIcon.replaceChildren(miniRing.el);
      } else {
        mainIcon.replaceChildren(el("span", "ss-spinner"));
      }
      mainLabel.textContent =
        state.phase === "Downloading" ? t("downloadingPercent", { percent }) : phaseLabel(state.phase);
      main.title = "";
    } else if (mode === "done") {
      setIcon(mainIcon, "done");
      mainLabel.textContent = t("downloadSavedShort");
      main.title = t("savedToDownloads");
    } else if (mode === "failed") {
      setIcon(mainIcon, "retry");
      mainLabel.textContent = t("tryAgain");
      main.title = t("tryAgain");
    }

    // Side button: always collapse (also while downloading).
    setIcon(side, "collapse");
    side.title = t("minimize");
    side.setAttribute("aria-label", t("minimize"));
    cancel.hidden = !busy;
    cancel.title = t("cancelDownload");
    cancel.setAttribute("aria-label", t("cancelDownload"));

    // Orb (collapsed)
    setIcon(orbIcon, mode === "done" ? "done" : mode === "failed" ? "failed" : "download");
    orbRing.set(busy ? Math.max(0.02, percent / 100) : 0);
    const orbLabel = busy
      ? `${t("downloadingPercent", { percent })} · ${t("expand")}`
      : `${t("downloadLectureTitle")} · ${t("expand")}`;
    orb.title = orbLabel;
    orb.setAttribute("aria-label", orbLabel);

    // Card
    const showCard = busy || mode === "failed";
    card.hidden = !showCard;
    fill.style.width = `${mode === "failed" ? 100 : percent}%`;
    meta.textContent = mode === "failed" ? errorText(state) || t("errUnknown") : busyDetail(state);
  }

  // The pill already says "Downloading 45%"; the card adds speed + time left
  // (or, for the other steps, how far along that step is).
  function busyDetail({ phase, percent, speed, eta }) {
    if (phase === "Downloading") {
      if (!(speed > 0)) return phaseLabel("Preparing");
      return [formatBytesPerSecond(speed), formatEta(eta)].filter(Boolean).join(" \u00b7 ");
    }
    return percent > 0 ? `${percent}%` : "";
  }

  main.addEventListener("click", () => {
    if (state.mode === "idle" || state.mode === "failed") onDownload();
  });
  // event.detail is 0 when a click came from the keyboard (Enter/Space):
  // only then move focus along, so mouse users don't get a focus ring.
  side.addEventListener("click", (event) => {
    event.stopPropagation();
    setCollapsed(true, true, event.detail === 0);
  });
  cancel.addEventListener("click", (event) => {
    event.stopPropagation();
    onCancel();
  });
  orb.addEventListener("click", (event) => setCollapsed(false, true, event.detail === 0));

  function setCollapsed(value, byUser = false, moveFocus = false) {
    if (collapsed === value) return;
    collapsed = value;
    render();
    if (byUser) onCollapseChange(value);
    if (moveFocus) (value ? orb : main.disabled ? side : main).focus({ preventScroll: true });
  }

  // progress: the background's download state for this tab.
  function update(progress) {
    const phase = progress.phase || "Preparing";
    const active = progress.active !== false && !["Complete", "Canceled", "Download failed"].includes(phase);
    const mode = active ? "busy" : phase === "Complete" ? "done" : phase === "Download failed" ? "failed" : "idle";
    const percent = Math.max(0, Math.min(100, Math.round(Number(progress.percent) || 0)));
    state = { ...progress, phase, mode, percent };
    render();
  }

  function reset() {
    state = { mode: "idle", percent: 0 };
    render();
  }

  render();
  return {
    el: root,
    update,
    reset,
    setCollapsed,
    relabel: render,
    get mode() {
      return state.mode;
    },
  };
}
