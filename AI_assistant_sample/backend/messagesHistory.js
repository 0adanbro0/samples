// server.js — единый файл для простоты, разбивай по файлам как было
import express from 'express';
import { fileURLToPath } from 'url';
import context from './chatContext.js';

setInterval(() => {
  const now = Date.now();
  for (const [id, h] of sessions.entries()) {
    const last = h.at(-1)?.time ?? 0;
    if (now - last > SESSION_TTL) sessions.delete(id);
  }
  if (sessions.size > MAX_SESSIONS) {
    // Сортируем по последней активности (last.time)
    const sorted = [...sessions.entries()].sort((a, b) => (a[1].at(-1)?.time ?? 0) - (b[1].at(-1)?.time ?? 0));
    sorted.slice(0, sessions.size - MAX_SESSIONS).forEach(([id]) => sessions.delete(id));
  }
}, 10 * 60 * 1000).unref();

const sessions = new Map();
const SYSTEM_PROMPT = context; // твой контент
const SESSION_TTL = 2 * 60 * 60 * 1000; // 2ч
const MAX_SESSIONS = 5000;
export const MAX_HISTORY = 30; // включая system

export function createHistory() {
  return [
    { role: 'system', content: SYSTEM_PROMPT, visible: false, time: Date.now() },
    { role: 'assistant', content: '👋 Привет! Я консультант SINTEX, помогаю клиентам выбрать идеальный сайт — будь то лендинг, визитка, интернет-магазин или что-то более сложное. 🚀 Объясню ваши варианты, дам прозрачный прайс и подберу оптимальный формат под ваши цели. Мы работаем официально: договор, чеки, быстрая загрузка и защита от взломов. 🌟 Что вы хотите создать?', visible: true, time: Date.now() }
  ];
}

export function getHistory(sessionId) {
  if (!sessions.has(sessionId)) sessions.set(sessionId, createHistory());
  return sessions.get(sessionId);
}

export function setHistory(sessionId, arr) { sessions.set(sessionId, arr); }

export function clientSafe(hist) { return hist.filter(m => m.role !== 'system'); }