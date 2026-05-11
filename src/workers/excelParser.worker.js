import { parseExcelFile } from '../services/excelParser.js';

self.onmessage = async (event) => {
  const message = event.data ?? {};
  if (message.type !== 'parse') return;

  try {
    const result = await parseExcelFile(message.file, (progress) => {
      self.postMessage({ type: 'progress', progress });
    });
    self.postMessage({ type: 'done', result });
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error?.message ?? 'Nao foi possivel processar o arquivo.',
    });
  }
};
