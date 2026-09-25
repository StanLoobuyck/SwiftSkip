// Segmented control that behaves like a radio group for keyboard and screen
// reader users: one Tab stop (the selected option), arrow keys move and
// select, Home/End jump to the ends.

export function radioGroup(container, options, current, label, onPick) {
  const buttons = options.map((value) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "radio");
    const selected = value === current;
    button.setAttribute("aria-checked", String(selected));
    button.tabIndex = selected ? 0 : -1;
    button.textContent = label(value);
    button.addEventListener("click", () => onPick(value));
    return button;
  });
  if (!buttons.some((b) => b.tabIndex === 0) && buttons[0]) buttons[0].tabIndex = 0;

  container.onkeydown = (event) => {
    const index = buttons.indexOf(document.activeElement);
    if (index === -1) return;
    const last = buttons.length - 1;
    const next = {
      ArrowRight: Math.min(index + 1, last),
      ArrowDown: Math.min(index + 1, last),
      ArrowLeft: Math.max(index - 1, 0),
      ArrowUp: Math.max(index - 1, 0),
      Home: 0,
      End: last,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    if (next !== index) {
      onPick(options[next]);
      // onPick re-renders; focus the newly selected option.
      container.querySelectorAll('[role="radio"]')[next]?.focus();
    }
  };

  const hadFocus = container.contains(document.activeElement);
  container.replaceChildren(...buttons);
  if (hadFocus) buttons.find((b) => b.tabIndex === 0)?.focus();
}
