import { FetchUserData } from "./getChat";
// chat-widget.ts
// Строгий режим: noImplicitAny, strictNullChecks, noUnusedLocals

/**
 * ==========================================
 * ТИПЫ И КОНСТАНТЫ
 * ==========================================
 */
export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: ChatRole;
  content: string;
  visible: boolean;
  time?: number; // Опционально, бэкенд шлёт, фронт может не использовать
}

interface RenderChatOptions {
  messages: ChatMessage[];
}

interface ChatWidgetElementIds {
  triggerId: string;
  panelId: string;
  closeButtonId: string;
  messagesContainerId: string;
  inputId: string;
  sendButtonId: string;
}

const DEFAULT_IDS: ChatWidgetElementIds = {
  triggerId: 'chat-trigger',
  panelId: 'chat-panel',
  closeButtonId: 'chat-close',
  messagesContainerId: 'chat-messages',
  inputId: 'inputMessageToAI',
  sendButtonId: 'sendMessageToAI',
};

const BOLT_ICON_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
       class="w-4 h-4" aria-hidden="true">
    <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/>
  </svg>
`;

// CSS-классы для анимаций (должны быть в глобальном CSS или инжекчены сюда)
const TYPING_CURSOR_CLASS = 'typing-cursor';

/**
 * ==========================================
 * УТИЛИТЫ DOM И РЕНДЕРИНГ
 * ==========================================
 */
function isLeftAligned(role: ChatRole): boolean {
  return role === 'assistant' || role === 'system';
}

/**
 * Создаёт DOM-элемент для одного сообщения.
 * Возвращает wrapper (внешний flex-контейнер) и bubble (пузырьок с текстом) для возможного манипулирования.
 */
function createMessageElement(message: ChatMessage): { wrapper: HTMLElement; bubble: HTMLElement } {
  const left = isLeftAligned(message.role);

  const wrapper = document.createElement('div');
  wrapper.className = `flex w-full ${left ? 'justify-start' : 'justify-end'}`;
  wrapper.dataset.role = message.role; // Полезно для селекторов/дебага

  let bubble: HTMLElement;

  if (left) {
    // --- Assistant / System (слева с аватаром) ---
    const row = document.createElement('div');
    row.className = 'flex items-start gap-3 max-w-[85%]';

    const avatar = document.createElement('div');
    avatar.className = 'w-8 h-8 shrink-0 rounded-lg bg-black border border-white/15 flex items-center justify-center text-white';
    avatar.innerHTML = BOLT_ICON_SVG;
    avatar.setAttribute('aria-hidden', 'true');

    bubble = document.createElement('p');
    bubble.className = 'font-gilroy font-semibold text-[16px] leading-snug text-white whitespace-pre-wrap'; // whitespace-pre-wrap для переносов
    bubble.textContent = message.content;

    row.appendChild(avatar);
    row.appendChild(bubble);
    wrapper.appendChild(row);
  } else {
    // --- User (справа) ---
    bubble = document.createElement('div');
    bubble.className = 'max-w-[85%] rounded-2xl border border-brand/50 px-5 py-3.5 font-Unbounded text-[15px] text-white whitespace-pre-wrap';
    bubble.textContent = message.content;
    wrapper.appendChild(bubble);
  }

  return { wrapper, bubble };
}

/**
 * Полностью перерисовывает список сообщений.
 * Фильтрует `visible: false`.
 */
export function renderChatMessages(container: HTMLElement, options: RenderChatOptions): void {
  container.innerHTML = ''; // Полная очистка
  const visibleMessages = options.messages.filter((m) => m.visible);

  visibleMessages.forEach((message) => {
    const { wrapper } = createMessageElement(message);
    container.appendChild(wrapper);
  });

  // Автоскролл вниз
  container.scrollTop = container.scrollHeight;
}

/**
 * ==========================================
 * АНИМАЦИИ (Pure Functions)
 * ==========================================
 */

/** Создаёт элемент индикатора "Печатает..." (3 пульсирующие точки) */
function createTypingIndicatorElement(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'flex w-full justify-start';
  wrapper.dataset.typingIndicator = 'true'; // Марккер для легкого поиска/удаления

  const row = document.createElement('div');
  row.className = 'flex items-start gap-3 max-w-[85%]';

  const avatar = document.createElement('div');
  avatar.className = 'w-8 h-8 shrink-0 rounded-lg bg-black border border-white/15 flex items-center justify-center text-white';
  avatar.innerHTML = BOLT_ICON_SVG;
  avatar.setAttribute('aria-hidden', 'true');

  const bubble = document.createElement('div');
  bubble.className = 'font-gilroy font-semibold text-[16px] leading-snug text-white/70';
  // Инлайн SVG/HTML для точек, чтобы не зависеть от внешнего CSS keyframes, если его нет.
  // Но лучше использовать CSS классы. Здесь делаем инлайн-стили для гарантированной работы "из коробки".
  bubble.innerHTML = `
    <div style="display:inline-flex; gap:3px; padding:4px 0;" aria-label="ИИ печатает">
      <span style="width:6px; height:6px; background:#3B82F6; border-radius:50%; opacity:0.6; animation: typing-pulse 1.2s infinite ease-in-out;"></span>
      <span style="width:6px; height:6px; background:#3B82F6; border-radius:50%; opacity:0.6; animation: typing-pulse 1.2s infinite ease-in-out 0.2s;"></span>
      <span style="width:6px; height:6px; background:#3B82F6; border-radius:50%; opacity:0.6; animation: typing-pulse 1.2s infinite ease-in-out 0.4s;"></span>
    </div>
  `;

  row.appendChild(avatar);
  row.appendChild(bubble);
  wrapper.appendChild(row);
  return wrapper;
}

/**
 * Анимация "печатания" текста в элемент `bubble`.
 * @param bubble Целевой элемент (p или div), куда пишем текст.
 * @param fullText Полный текст для вывода.
 * @param baseSpeedMs Базовая задержка на символ (мс). Реальная = base + random(0..20).
 * @returns Promise, который резолвится когда печать завершена.
 */
function runTypewriterEffect(
  bubble: HTMLElement,
  fullText: string,
  baseSpeedMs = 12
): Promise<void> {
  return new Promise((resolve) => {
    // Очищаем контент пузырька
    bubble.textContent = '';
    bubble.style.minHeight = '1.5em'; // Чтобы не схлопывался пустой

    // Создаём курсор
    const cursor = document.createElement('span');
    cursor.className = TYPING_CURSOR_CLASS;
    // Инлайн стили для курсора, если нет глобального CSS
    cursor.style.cssText = `
      display: inline-block; width: 2px; height: 1em; 
      background-color: currentColor; margin-left: 2px; 
      vertical-align: text-bottom; animation: typing-blink 1s infinite;
    `;
    bubble.appendChild(cursor);

    let i = 0;

    function tick(): void {
      if (i < fullText.length) {
        // Вставляем текстовый узел ПЕРЕД курсором
        bubble.insertBefore(document.createTextNode(fullText[i]), cursor);
        i++;

        // Плавный скролл за курсором (requestAnimationFrame для плавности)
        requestAnimationFrame(() => {
           // Нужно найти скроллящий контейнер. 
           // Так как это коллбек, мы не знаем контейнер здесь. 
           // Лучше скроллить контейнер снаружи или передать его.
           // Для простоты: пузырьок скроллится сам если он overflow, но у нас скролл на контейнере.
           // Мы вернем управление в основной цикл для скролла.
        });

        // Случайная задержка для естественности
        const delay = baseSpeedMs + Math.random() * 20;
        setTimeout(tick, delay);
      } else {
        // Финал: убираем курсор
        cursor.remove();
        bubble.style.minHeight = '';
        resolve();
      }
    }

    tick();
  });
}

/**
 * Инжектим минимальный CSS для анимаций, если его нет в глобальных стилях.
 * Гарантирует работу анимаций без внешних зависимостей.
 */
function ensureAnimationStylesInjected(): void {
  if (document.getElementById('chat-widget-anim-styles')) return;

  const style = document.createElement('style');
  style.id = 'chat-widget-anim-styles';
  style.textContent = `
    @keyframes typing-blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
    @keyframes typing-pulse { 0%, 80%, 100% { transform: scale(1); opacity: 0.4; } 40% { transform: scale(1.3); opacity: 1; } }
    .${TYPING_CURSOR_CLASS} { animation: typing-blink 1s infinite; }
  `;
  document.head.appendChild(style);
}

/**
 * ==========================================
 * ГЛАВНЫЙ ВИДЖЕТ (Init Function)
 * ==========================================
 */
export function initChatWidget(
  options: { initialMessages?: ChatMessage[] } = {},
  ids: Partial<ChatWidgetElementIds> = {}
): void {
  // 1. Мержим ID
  const finalIds: ChatWidgetElementIds = { ...DEFAULT_IDS, ...ids };

  // 2. Находим элементы (строго типизируем через as)
  const trigger = document.getElementById(finalIds.triggerId) as HTMLButtonElement | null;
  const panel = document.getElementById(finalIds.panelId) as HTMLElement | null;
  const closeBtn = document.getElementById(finalIds.closeButtonId) as HTMLButtonElement | null;
  const messagesContainer = document.getElementById(finalIds.messagesContainerId) as HTMLElement | null;
  const input = document.getElementById(finalIds.inputId) as HTMLInputElement | null;
  const sendBtn = document.getElementById(finalIds.sendButtonId) as HTMLButtonElement | null;

  // 3. Валидация наличия элементов
  const missing = [
    !trigger && 'trigger',
    !panel && 'panel',
    !closeBtn && 'closeBtn',
    !messagesContainer && 'messagesContainer',
    !input && 'input',
    !sendBtn && 'sendBtn',
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`initChatWidget: Missing DOM elements: ${missing.join(', ')}. Check IDs.`);
  }

  // Теперь TS знает, что это не null
  const triggerEl = trigger!;
  const panelEl = panel!;
  const closeBtnEl = closeBtn!;
  const msgBox = messagesContainer!;
  const inputEl = input!;
  const sendBtnEl = sendBtn!;

  // 4. Состояние виджета (инкапсулировано в замыкании)
  let history: ChatMessage[] = options.initialMessages ?? [];
  let isLoading = false;

  // 5. Инициализация стилей анимаций
  ensureAnimationStylesInjected();

  // 6. Функция полной перерисовки + скролл
  const rerender = (): void => {
    renderChatMessages(msgBox, { messages: history });
  };

  // 7. Загрузка начальной истории (если не передана в options)
  async function loadInitialHistory(): Promise<void> {
    if (history.length > 0) {
      rerender();
      return;
    }
    try {
      history = await FetchUserData(''); // Пустое сообщение = запрос истории
      rerender();
    } catch (err) {
      console.error('Failed to load initial history:', err);
      history = []; // Чистый старт
      rerender();
    }
  }

  // 8. Обработчик отправки
  const handleSend = async (): Promise<void> => {
    if (isLoading) return;

    const text = inputEl.value.trim();
    if (!text) return;

    isLoading = true;
    sendBtnEl.disabled = true; // Блокируем кнопку
    inputEl.value = '';

    // --- Шаг 1: Оптимистичное добавление юзера ---
    history.push({ role: 'user', content: text, visible: true, time: Date.now() });
    rerender();

    // --- Шаг 2: Показ индикатора "Печатает..." ---
    const typingIndicator = createTypingIndicatorElement();
    msgBox.appendChild(typingIndicator);
    msgBox.scrollTop = msgBox.scrollHeight; // Скроллим к индикатору

    try {
      // --- Шаг 3: Запрос к серверу ---
      const updatedHistory = await FetchUserData(text);

      // --- Шаг 4: Удаляем индикатор ---
      typingIndicator.remove();

      // --- Шаг 5: Подготовка к анимации ---
      // Берем последнее сообщение ИИ из ответа сервера
      const lastAiMessage = updatedHistory[updatedHistory.length - 1];

      if (lastAiMessage && lastAiMessage.role === 'assistant') {
        // Создаём временную историю с ПУСТЫМ пузырьком ИИ для рендера
        const tempHistory = [...updatedHistory];
        tempHistory.pop(); // Удаляем готовое сообщение ИИ
        tempHistory.push({ ...lastAiMessage, content: '', visible: true }); // Пустой пузырьок
        history = tempHistory;
        rerender(); // Рендерим историю с пустым последним пузырьком

        // Находим только что созданный пузырьок в DOM
        // Это ПОСЛЕДНИЙ дочерний элемент msgBox (wrapper), ищем внутри него .bubble (p или div)
        const lastWrapper = msgBox.lastElementChild as HTMLElement | null;
        const targetBubble = lastWrapper?.querySelector(':scope > div > p, :scope > div') as HTMLElement | null;
        // Селектор: 
        // - Для ассистента: wrapper > div(row) > p
        // - Для юзера (на всякий): wrapper > div

        if (targetBubble) {
          // --- Шаг 6: Запуск печатания ---
          await runTypewriterEffect(targetBubble, lastAiMessage.content, 10);
          
          // Во время печатания скроллим контейнер (делаем это в тике или после)
          // runTypewriterEffect не имеет доступа к msgBox, сделаем финальный скролл тут
          msgBox.scrollTop = msgBox.scrollHeight;
        }
      }

      // --- Шаг 7: Финальная синхронизация истории ---
      history = updatedHistory;

    } catch (err) {
      console.error('Chat error:', err);
      typingIndicator.remove();

      // Показываем ошибку как сообщение ИИ
      history.push({
        role: 'assistant',
        content: 'Не удалось получить ответ. Проверьте соединение и попробуйте снова.',
        visible: true,
        time: Date.now(),
      });
    } finally {
      isLoading = false;
      sendBtnEl.disabled = false;
      inputEl.focus(); // Возврат фокуса
      rerender(); // Финальный рендер (восстанавливает полную историю без артефактов)
    }
  };

  // 9. Привязка событий
  sendBtnEl.addEventListener('click', handleSend);

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // Не переносить строку
      handleSend();
    }
  });

  triggerEl.addEventListener('click', () => {
    panelEl.classList.remove('hidden');
    triggerEl.classList.add('hidden');
    inputEl.focus();
  });

  closeBtnEl.addEventListener('click', () => {
    panelEl.classList.add('hidden');
    triggerEl.classList.remove('hidden');
  });

  // 10. Старт
  loadInitialHistory();
}