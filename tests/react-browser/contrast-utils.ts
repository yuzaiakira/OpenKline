/** WCAG 2.2 relative-luminance / contrast helpers for Playwright page.evaluate scopes. */

export type Rgba = { readonly r: number; readonly g: number; readonly b: number; readonly a: number };

export const contrastPageHelpers = `(() => {
  const parseColor = (value) => {
    const values = String(value).match(/[\\d.]+/g)?.map(Number) ?? [];
    return { r: values[0] ?? 0, g: values[1] ?? 0, b: values[2] ?? 0, a: values[3] ?? 1 };
  };
  const composite = (foreground, background) => ({
    r: foreground.r * foreground.a + background.r * (1 - foreground.a),
    g: foreground.g * foreground.a + background.g * (1 - foreground.a),
    b: foreground.b * foreground.a + background.b * (1 - foreground.a),
    a: 1,
  });
  const luminance = (color) => {
    const channel = (value) => {
      const normalized = value / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
  };
  const contrast = (foreground, background) => {
    const text = composite(foreground, background);
    const foregroundLuminance = luminance(text);
    const backgroundLuminance = luminance(background);
    return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
  };
  const backgroundFor = (element) => {
    let current = element;
    while (current !== null) {
      const color = parseColor(getComputedStyle(current).backgroundColor);
      if (color.a > 0.001) {
        // Composite translucent backgrounds onto ancestors.
        if (color.a >= 0.999) return color;
        const under = backgroundFor(current.parentElement ?? document.documentElement);
        return composite(color, under);
      }
      current = current.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const sampleText = (name, element, options = {}) => {
    if (element === null) throw new Error("Missing contrast sample: " + name);
    const style = getComputedStyle(element, options.pseudo);
    const foreground = parseColor(style.color);
    const background = backgroundFor(element);
    const ratio = Number(contrast(foreground, background).toFixed(2));
    return {
      name,
      criterion: "1.4.3",
      threshold: options.threshold ?? 4.5,
      foreground: style.color,
      background: "rgb(" + Math.round(background.r) + ", " + Math.round(background.g) + ", " + Math.round(background.b) + ")",
      ratio,
      pass: ratio + 1e-9 >= (options.threshold ?? 4.5),
    };
  };
  const sampleNonText = (name, colorValue, adjacentBackground, threshold = 3) => {
    const foreground = parseColor(colorValue);
    const background = typeof adjacentBackground === "string" ? parseColor(adjacentBackground) : adjacentBackground;
    const ratio = Number(contrast(foreground, background).toFixed(2));
    return {
      name,
      criterion: "1.4.11",
      threshold,
      foreground: colorValue,
      background: "rgb(" + Math.round(background.r) + ", " + Math.round(background.g) + ", " + Math.round(background.b) + ")",
      ratio,
      pass: ratio + 1e-9 >= threshold,
    };
  };
  return { parseColor, composite, luminance, contrast, backgroundFor, sampleText, sampleNonText };
})()`;
