/** Shared Widget DOM control helpers. */

let controlSerial = 0;

export function nextControlId(prefix: string): string {
  controlSerial += 1;
  return `openkline-widget-${prefix}-${controlSerial}`;
}

export function field(document: Document, labelText: string, control: HTMLElement): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.dataset.openklineField = "";
  const label = document.createElement("label");
  const id = control.id || nextControlId("field");
  control.id = id;
  label.htmlFor = id;
  label.textContent = labelText;
  wrapper.append(label, control);
  return wrapper;
}

export function select(document: Document, label: string, values: readonly string[]): HTMLSelectElement {
  const element = document.createElement("select");
  element.setAttribute("aria-label", label);
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    element.append(option);
  }
  return element;
}

export function button(document: Document, label: string, text: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.setAttribute("aria-label", label);
  element.textContent = text;
  return element;
}
