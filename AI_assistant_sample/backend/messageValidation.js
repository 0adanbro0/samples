import { OpenRouter } from '@openrouter/sdk';

import { getHistory, setHistory, clientSafe, MAX_HISTORY } from './messagesHistory.js';

export function messageValidation(req, res, next) {
  const { message } = req.body;
  const hist = getHistory(req.sessionId);

  // Обрезка: оставляем system + последние MAX_HISTORY-1 сообщений
  if (hist.length >= MAX_HISTORY) {
    const system = hist[0];
    const tail = hist.slice(-(MAX_HISTORY - 1));
    setHistory(req.sessionId, [system, { role: 'assistant', content: 'Мы общаемся с тобой слишком долго. В целях оптимизации разговор был сброшен', visible: true, time: Date.now() }]);
  }

  if (typeof message !== 'string' || !message.trim()) {
    return res.status(200).json({ status: 'success', message: clientSafe(getHistory(req.sessionId)) });
  }
  if (message.length > 2000) {
    const h = getHistory(req.sessionId);
    h.push({ role: 'assistant', content: 'Слишком длинное сообщение.', visible: true, time: Date.now() });
    return res.status(200).json({ status: 'success', message: clientSafe(h) });
  }
  next();
}