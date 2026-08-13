import type { ChatMessage } from './chat-widget';

export async function FetchUserData(message: string): Promise<ChatMessage[]> {
  const response = await fetch('http://localhost:3000/api/sintexAssistent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Критично для кук
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    // Пытаемся прочитать ошибку из JSON, иначе статус
    const errData = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
    throw new Error(errData.message || 'Network response was not ok');
  }

  const data = await response.json();

  if (data.status === 'success' && Array.isArray(data.message)) {
    // Валидация формы сообщений (защита от мусора)
    return data.message.filter((m: unknown): m is ChatMessage => 
      typeof m === 'object' && m !== null && 
      typeof (m as Record<string, unknown>).content === 'string' &&
      typeof (m as Record<string, unknown>).visible === 'boolean' &&
      ['user', 'assistant', 'system'].includes((m as Record<string, unknown>).role as string)
    );
  }

  throw new Error(data.message || 'Invalid server response format');
}