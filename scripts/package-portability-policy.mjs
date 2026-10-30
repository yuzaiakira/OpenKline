const FORBIDDEN_PROVIDER_TEXT = /binance|alpaca|oanda|api\.binance|openkline\.com/i;

export function findProviderSpecificText(files) {
  return files.filter((file) => FORBIDDEN_PROVIDER_TEXT.test(file.contents)).map((file) => file.path);
}
