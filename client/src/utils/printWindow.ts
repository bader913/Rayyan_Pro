export type PrintWindowHtmlOptions = {
  width?: number;
  height?: number;
};

export function openPrintWindowHtml(
  html: string,
  options: PrintWindowHtmlOptions = {}
): Window | null {
  const { width = 900, height = 800 } = options;

  const win = window.open('', '_blank', `width=${width},height=${height}`);
  if (!win) return null;

  win.document.open();
  win.document.write(html);
  win.document.close();

  return win;
}