import { parseExcelFile as parseExcelFileFallback } from './excelParser.js';

export function parseExcelFile(file, onProgress = () => {}) {
  if (typeof Worker === 'undefined') {
    return parseExcelFileFallback(file, onProgress);
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/excelParser.worker.js', import.meta.url), { type: 'module' });

    worker.onmessage = (event) => {
      const message = event.data ?? {};

      if (message.type === 'progress') {
        onProgress(message.progress);
        return;
      }

      if (message.type === 'done') {
        worker.terminate();
        resolve(message.result);
        return;
      }

      if (message.type === 'error') {
        worker.terminate();
        reject(new Error(message.error || 'Nao foi possivel processar o arquivo.'));
      }
    };

    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'Nao foi possivel iniciar a leitura em segundo plano.'));
    };

    worker.postMessage({ type: 'parse', file });
  });
}
