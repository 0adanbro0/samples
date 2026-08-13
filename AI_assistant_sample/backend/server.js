import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import chatHandler from './aiChat.controller.js';
import SendTG from './sendTG.controller.js';
import { messageValidation } from './messageValidation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, './../.env') });

const app = express();
const PORT = process.env.PORT || 3000;

// ──────────────────────────────────────────────
// 4. Middleware
// ──────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '2kb' }));
app.use(cookieParser(process.env.COOKIE_SECRET)); // ОДИН РАЗ, С СЕКРЕТОМ

// Сессия по куке
app.use((req, res, next) => {
  // БЫЛО: req.cookies?.sintexSessionId
  // СТАЛО:
  let sid = req.signedCookies?.sintexSessionId; // <── ВОТ ОН, БАГ
  
  if (!sid) {
    sid = crypto.randomUUID();
    res.cookie('sintexSessionId', sid, {
      httpOnly: true,
      signed: true,              // ← мы подписали
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      secure: process.env.NODE_ENV === 'production', // false на локалке!
    });
  }
  req.sessionId = sid;
  next();
});

const formLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 3,
  message: { status: 'error', message: 'Слишком много отправок. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const RPMChat = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.sessionId, // <-- КЛЮЧЕВОЕ ИЗМЕНЕНИЕ
  message: { status: 'error', message: 'Слишком много отправок в AI чат. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/api/send-telegram', formLimiter, SendTG);
app.post('/api/sintexAssistent', RPMChat, messageValidation, chatHandler);

app.listen(PORT, () => {
  console.log(`Сервер успешно запущен на порту ${PORT}`);
});