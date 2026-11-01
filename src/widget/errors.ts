/** Internal Widget lifecycle and validation errors. */
export class WidgetLifecycleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "WidgetLifecycleError";
  }
}

export class WidgetCompositionValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "WidgetCompositionValidationError";
  }
}
