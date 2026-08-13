import { OpenRouter } from '@openrouter/sdk';

import { getHistory, clientSafe } from './messagesHistory.js';

let orClient;
function getOR() {
  if (!orClient) orClient = new OpenRouter({ apiKey: process.env.TOKEN_OPEN_ROUTER_AI });
  return orClient;
}

async function chatHandler(req, res) {
  const sid = req.sessionId;
  const userMsg = req.body.message.trim();
  const hist = getHistory(sid);

  // 1. Пушим юзера
  hist.push({ role: 'user', content: userMsg, visible: true, time: Date.now() });

  try {
    // 2. Зовём ИИ
    const resp = await getOR().chat.send({
      chatRequest: {
        model: process.env.CURRENT_MODEL,
        temperature: 0.5,
        max_tokens: 800,
        stream: false,
        messages: hist.map(({ role, content }) => ({ role, content }))
      }
    });

    const aiText = resp?.choices?.[0]?.message?.content;
    if (!aiText) throw new Error('Empty AI response');

    // 3. Пушим ответ ИИ — только после успеха
    hist.push({ role: 'assistant', content: aiText, visible: true, time: Date.now() });

    return res.json({ status: 'success', message: clientSafe(hist) });

  } catch (e) {
    // 4. Откат: удаляем юзера, если ИИ упал
    hist.pop();
    console.error('AI error:', e.message);
    const code = e.name === 'AbortError' ? 504 : 500;
    return res.status(code).json({ status: 'error', message: 'Ошибка ИИ, попробуйте ещё раз' });
  }
}

export default chatHandler