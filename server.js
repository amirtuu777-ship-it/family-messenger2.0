const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Pool } = require('pg');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const { 
  initializeDatabase, 
  findUserByPhone,
  findUserById, 
  createUser, 
  updateUserStatus, 
  getUsers,
  getMessagesBetweenUsers, 
  createMessage, 
  markMessagesAsRead, 
  getRecentChats,
  deleteMessagesBetweenUsers,
  updateUsername
} = require('./database');

// Константы
const app = express();

// Доверяем прокси (для Railway/Render)
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// ========== HELMET - ЗАЩИТНЫЕ ЗАГОЛОВКИ (ОБЛЕГЧЁННАЯ ВЕРСИЯ) ==========
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// ========== CORS - РАЗРЕШЁННЫЕ ДОМЕНЫ ==========
const allowedOrigins = [
    'https://family-messenger-production-e1a8.up.railway.app',
    'https://family-messenger20-production.up.railway.app',
    'http://localhost:3000',
    'http://localhost:5500',
    'https://shariq-messenger.up.railway.app'
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.log(`❌ CORS blocked: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// ========== RATE LIMITING - ЗАЩИТА ОТ DDoS И БРУТФОРСА ==========

// Общий лимит для всех запросов
const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { error: 'Слишком много запросов. Подождите немного.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Лимит для авторизации
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Слишком много попыток входа. Подождите 15 минут.' },
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false
});

// Лимит для отправки сообщений
const messageLimiter = rateLimit({
    windowMs: 10 * 1000,
    max: 30,
    message: { error: 'Слишком много сообщений. Подождите немного.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Лимит для загрузки файлов
const uploadLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: 'Слишком много файлов. Подождите немного.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Лимит для поиска
const searchLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: { error: 'Слишком много запросов поиска. Подождите.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Применяем лимиты
app.use('/api/', globalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/messages/send', messageLimiter);
app.use('/api/upload-file', uploadLimiter);
app.use('/api/upload-photo', uploadLimiter);
app.use('/api/auth/search', searchLimiter);

// ========== MIDDLEWARE ==========
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ========== СОЗДАЁМ ПАПКУ ДЛЯ ВРЕМЕННЫХ ФАЙЛОВ ==========
if (!fs.existsSync('./temp')) {
    fs.mkdirSync('./temp', { recursive: true });
    console.log('📁 Создана папка temp');
}

// ========== ПОДКЛЮЧЕНИЕ К БД ==========
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ========== НАСТРОЙКА MULTER ДЛЯ ФОТО ==========
const photoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'temp/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const uploadPhoto = multer({
    storage: photoStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Только изображения'), false);
        }
    }
});

// ========== НАСТРОЙКА MULTER ДЛЯ ФАЙЛОВ ==========
const fileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'temp/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const uploadFile = multer({
    storage: fileStorage,
    limits: { fileSize: 200 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml', 'image/x-icon',
            'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska',
            'audio/mpeg', 'audio/mp3', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-m4a', 'audio/flac',
            'application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain', 'text/html', 'text/css', 'text/javascript', 'text/xml',
            'application/json', 'application/xml', 'application/javascript',
            'application/zip', 'application/x-zip-compressed', 'application/x-rar-compressed',
            'application/x-7z-compressed', 'application/x-tar', 'application/gzip',
            'application/vnd.android.package-archive',
            'application/x-msdownload', 'application/x-msi', 'application/x-msdos-program',
            'application/x-executable', 'application/x-ms-shortcut', 'application/x-bat',
            'application/x-ms-dos-executable', 'application/octet-stream'
        ];
        
        const allowedExts = [
            '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico',
            '.mp4', '.webm', '.avi', '.mov', '.mkv', '.flv', '.m4v',
            '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac',
            '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods',
            '.txt', '.html', '.htm', '.css', '.js', '.json', '.xml', '.log', '.md',
            '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2',
            '.apk', '.exe', '.msi', '.bat', '.cmd', '.com', '.scr', '.dll', '.sys', '.bin'
        ];
        
        if (file.mimetype.startsWith('image/') || 
            file.mimetype.startsWith('video/') || 
            file.mimetype.startsWith('audio/') ||
            allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            const ext = path.extname(file.originalname).toLowerCase();
            if (allowedExts.includes(ext)) {
                cb(null, true);
            } else {
                cb(new Error(`Неподдерживаемый тип файла: ${file.originalname}`), false);
            }
        }
    }
});

// ========== МАРШРУТЫ ==========

// Статус
app.get('/api/status', (req, res) => {
    res.json({ uptime: process.uptime() });
});

// Загрузка файла
app.post('/api/upload-file', uploadFile.single('file'), async (req, res) => {
    console.log('📁 Получен запрос на загрузку файла');
    
    if (!req.file) {
        return res.status(400).json({ error: 'Файл не загружен' });
    }
    
    try {
        const fileBuffer = fs.readFileSync(req.file.path);
        const result = await pool.query(
            `INSERT INTO files (file_name, file_path, file_size, file_type, file_data, uploaded_at) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [req.file.originalname, `/api/file/${Date.now()}`, req.file.size, req.file.mimetype, fileBuffer, Date.now()]
        );
        
        fs.unlinkSync(req.file.path);
        
        res.json({
            success: true,
            fileId: result.rows[0].id,
            fileUrl: `/api/file/${result.rows[0].id}`,
            fileName: req.file.originalname,
            fileSize: req.file.size,
            fileType: req.file.mimetype
        });
    } catch (err) {
        console.error('❌ Ошибка сохранения файла:', err);
        try { fs.unlinkSync(req.file.path); } catch (e) {}
        res.status(500).json({ error: 'Ошибка сохранения файла' });
    }
});

// Получение файла
app.get('/api/file/:fileId', async (req, res) => {
    const { fileId } = req.params;
    
    try {
        const result = await pool.query(
            'SELECT file_name, file_type, file_data FROM files WHERE id = $1',
            [fileId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Файл не найден' });
        }
        
        const file = result.rows[0];
        const encodedFileName = encodeURIComponent(file.file_name);
        
        res.setHeader('Content-Type', file.file_type);
        res.setHeader('Content-Disposition', `attachment; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`);
        res.send(file.file_data);
    } catch (err) {
        console.error('❌ Ошибка получения файла:', err);
        res.status(500).json({ error: 'Ошибка получения файла' });
    }
});

// Загрузка фото
app.post('/api/upload-photo', uploadPhoto.single('photo'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Файл не загружен' });
    }
    
    try {
        const fileBuffer = fs.readFileSync(req.file.path);
        const result = await pool.query(
            `INSERT INTO photos (file_name, file_path, file_size, file_type, file_data, uploaded_at) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [req.file.originalname, `/api/photo/${Date.now()}`, req.file.size, req.file.mimetype, fileBuffer, Date.now()]
        );
        
        fs.unlinkSync(req.file.path);
        
        res.json({
            success: true,
            photoId: result.rows[0].id,
            photoUrl: `/api/photo/${result.rows[0].id}`,
            fileName: req.file.originalname,
            fileSize: req.file.size
        });
    } catch (err) {
        console.error('❌ Ошибка сохранения фото:', err);
        try { fs.unlinkSync(req.file.path); } catch (e) {}
        res.status(500).json({ error: 'Ошибка сохранения фото' });
    }
});

// Получение фото
app.get('/api/photo/:photoId', async (req, res) => {
    const { photoId } = req.params;
    
    try {
        const result = await pool.query(
            'SELECT file_name, file_type, file_data FROM photos WHERE id = $1',
            [photoId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Фото не найдено' });
        }
        
        const photo = result.rows[0];
        res.set('Content-Type', photo.file_type);
        res.send(photo.file_data);
    } catch (err) {
        console.error('❌ Ошибка получения фото:', err);
        res.status(500).json({ error: 'Ошибка получения фото' });
    }
});

// Аватарки
const uploadAvatar = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Только изображения'), false);
        }
    }
});

app.post('/api/avatar/upload', uploadAvatar.single('avatar'), async (req, res) => {
    const { userId } = req.body;
    
    if (!req.file || !userId) {
        return res.status(400).json({ error: 'Неверные данные' });
    }
    
    try {
        const existing = await pool.query('SELECT id FROM avatars WHERE user_id = $1', [userId]);
        
        if (existing.rows.length > 0) {
            await pool.query(
                'UPDATE avatars SET file_data = $1, file_type = $2, updated_at = $3 WHERE user_id = $4',
                [req.file.buffer, req.file.mimetype, Date.now(), userId]
            );
        } else {
            await pool.query(
                'INSERT INTO avatars (user_id, file_data, file_type, updated_at) VALUES ($1, $2, $3, $4)',
                [userId, req.file.buffer, req.file.mimetype, Date.now()]
            );
        }
        
        res.json({ success: true, message: 'Аватарка обновлена' });
    } catch (err) {
        console.error('❌ Ошибка сохранения аватарки:', err);
        res.status(500).json({ error: 'Ошибка сохранения аватарки' });
    }
});

app.get('/api/avatar/:userId', async (req, res) => {
    const { userId } = req.params;
    
    try {
        const result = await pool.query(
            'SELECT file_data, file_type FROM avatars WHERE user_id = $1',
            [userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Аватарка не найдена' });
        }
        
        res.set('Content-Type', result.rows[0].file_type);
        res.send(result.rows[0].file_data);
    } catch (err) {
        console.error('❌ Ошибка получения аватарки:', err);
        res.status(500).json({ error: 'Ошибка получения аватарки' });
    }
});

app.delete('/api/avatar/:userId', async (req, res) => {
    const { userId } = req.params;
    
    try {
        await pool.query('DELETE FROM avatars WHERE user_id = $1', [userId]);
        res.json({ success: true, message: 'Аватарка удалена' });
    } catch (err) {
        console.error('❌ Ошибка удаления аватарки:', err);
        res.status(500).json({ error: 'Ошибка удаления аватарки' });
    }
});

// ========== ПЕРЕСЫЛКА СООБЩЕНИЙ ==========

app.post('/api/messages/forward', async (req, res) => {
    const { originalMessageId, fromUserId, toUserId } = req.body;
    
    console.log('📨 Пересылка сообщения:', { originalMessageId, fromUserId, toUserId });
    
    if (!originalMessageId || !fromUserId || !toUserId) {
        return res.status(400).json({ error: 'Неверные данные' });
    }
    
    try {
        // Получаем оригинальное сообщение (без file_name, его нет в таблице messages)
        const originalMsg = await pool.query(
            'SELECT message, type, file_id FROM messages WHERE id = $1',
            [originalMessageId]
        );
        
        if (originalMsg.rows.length === 0) {
            return res.status(404).json({ error: 'Сообщение не найдено' });
        }
        
        const msg = originalMsg.rows[0];
        
        // Создаём новое сообщение с пометкой "переслано"
        let forwardedMessage = '';
        if (msg.type === 'text') {
            forwardedMessage = `📨 Переслано: ${msg.message}`;
        } else if (msg.type === 'image') {
            forwardedMessage = '📨 Переслано: 📷 Фото';
        } else if (msg.type === 'file') {
            forwardedMessage = '📨 Переслано: 📎 Файл';
        } else {
            forwardedMessage = '📨 Переслано: сообщение';
        }
        
        const result = await pool.query(
            `INSERT INTO messages (sender_id, receiver_id, message, type, file_id, timestamp, status) 
             VALUES ($1, $2, $3, $4, $5, $6, 'sent') RETURNING id`,
            [fromUserId, toUserId, forwardedMessage, msg.type, msg.file_id, Date.now()]
        );
        
        const messageData = {
            id: result.rows[0].id,
            senderId: fromUserId,
            receiverId: toUserId,
            message: forwardedMessage,
            type: msg.type,
            fileId: msg.file_id,
            timestamp: Date.now(),
            isForwarded: true
        };
        
        // Уведомляем получателя
        io.to(`user_${toUserId}`).emit('new_message', messageData);
        
        res.json({ success: true, message: messageData });
    } catch (err) {
        console.error('❌ Ошибка пересылки:', err);
        res.status(500).json({ error: 'Ошибка пересылки сообщения: ' + err.message });
    }
});

// Удалить сообщение
app.delete('/api/messages/:messageId', async (req, res) => {
    const { messageId } = req.params;
    const { userId } = req.query;
    
    try {
        // Проверяем, что сообщение принадлежит пользователю
        const result = await pool.query(
            'SELECT sender_id FROM messages WHERE id = $1',
            [messageId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Сообщение не найдено' });
        }
        
        if (result.rows[0].sender_id != userId) {
            return res.status(403).json({ error: 'Нет прав на удаление' });
        }
        
        await pool.query('DELETE FROM messages WHERE id = $1', [messageId]);
        
        res.json({ success: true, message: 'Сообщение удалено' });
    } catch (err) {
        console.error('❌ Ошибка удаления сообщения:', err);
        res.status(500).json({ error: 'Ошибка удаления сообщения' });
    }
});

// Подключаем маршруты
const authRoutes = require('./routes/auth')({ 
    findUserByPhone, 
    findUserById, 
    createUser, 
    updateUserStatus,
    getUsers,
    updateUsername
});

const messageRoutes = require('./routes/messages')({ 
    getMessagesBetweenUsers, 
    createMessage, 
    markMessagesAsRead, 
    getRecentChats,
    deleteMessagesBetweenUsers
});

app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);

// ========== ИНИЦИАЛИЗАЦИЯ ==========
console.log('🔄 Инициализация PostgreSQL...');
initializeDatabase().then(() => {
    console.log('✅ База данных PostgreSQL готова');
}).catch(err => {
    console.error('❌ Ошибка инициализации БД:', err);
    process.exit(1);
});

// Хранилище активных соединений
const activeSockets = new Map();

// ========== ОБРАБОТКА КЛИЕНТСКОЙ ЧАСТИ ==========
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
        return next();
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========== WEB SOCKET ==========
io.on('connection', (socket) => {
    console.log('🔵 Клиент подключен:', socket.id);

    socket.on('join', async (userId) => {
        socket.join(`user_${userId}`);
        activeSockets.set(socket.id, userId);
        console.log(`👤 Пользователь ${userId} присоединился к комнате`);

        try {
            await updateUserStatus(userId, 'online');
            socket.broadcast.emit('user_status', {
                userId: userId,
                status: 'online'
            });
        } catch (err) {
            console.error('Ошибка обновления статуса:', err);
        }
    });

    socket.on('send_message', async (data) => {
        const { senderId, receiverId, message, type = 'text', fileId, fileName, fileSize, fileType } = data;

        console.log(`📨 Server: sending ${type} from ${senderId} to ${receiverId}`);

        try {
            const messageData = await createMessage({
                senderId,
                receiverId,
                message: message || '',
                type,
                fileId
            });

            messageData.fileName = fileName;
            messageData.fileSize = fileSize;
            messageData.fileType = fileType;

            const user = await findUserById(senderId);
            if (user) {
                messageData.senderName = user.username;
            }

            io.to(`user_${receiverId}`).emit('new_message', messageData);
            socket.emit('message_sent', messageData);
        } catch (err) {
            console.error('❌ Ошибка сохранения сообщения:', err);
            socket.emit('error', { message: 'Не удалось отправить сообщение' });
        }
    });

    socket.on('chat_cleared', (data) => {
        const { userId, contactId } = data;
        io.to(`user_${contactId}`).emit('chat_cleared_by_other', {
            userId: userId,
            contactId: contactId
        });
    });

    socket.on('chat_deleted', (data) => {
        const { userId, contactId } = data;
        io.to(`user_${contactId}`).emit('chat_deleted_by_other', {
            userId: userId,
            contactId: contactId
        });
    });

    socket.on('typing', (data) => {
    socket.to(`user_${data.receiverId}`).emit('user_typing', {
        userId: data.senderId,
        isTyping: data.isTyping
    });
});
  
    socket.on('mark_read', async (data) => {
        const { messageId, userId, contactId } = data;

        try {
            await markMessagesAsRead(userId, contactId);
            io.to(`user_${contactId}`).emit('messages_read', {
                userId: userId,
                contactId: contactId
            });
        } catch (err) {
            console.error('Ошибка отметки прочитанных:', err);
        }
    });

    socket.on('disconnect', async () => {
        const userId = activeSockets.get(socket.id);
        console.log(`🔴 Клиент отключен: ${socket.id}, userId: ${userId}`);

        if (userId) {
            let hasOtherConnections = false;
            for (let [sockId, uid] of activeSockets.entries()) {
                if (uid === userId && sockId !== socket.id) {
                    hasOtherConnections = true;
                    break;
                }
            }

            if (!hasOtherConnections) {
                try {
                    await updateUserStatus(userId, 'offline');
                    socket.broadcast.emit('user_status', {
                        userId: userId,
                        status: 'offline'
                    });
                } catch (err) {
                    console.error('Ошибка обновления статуса:', err);
                }
            }
            activeSockets.delete(socket.id);
        }
    });
});

// ========== ПОЛУЧАЕМ ЛОКАЛЬНЫЙ IP ==========
const { networkInterfaces } = require('os');
const nets = networkInterfaces();
let localIP = '0.0.0.0';
for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
            localIP = net.address;
            break;
        }
    }
}

// ========== ЗАПУСК ==========
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
    console.log(`
╔══════════════════════════════════════════════╗
║ 🚀 СЕРВЕР SharIQ ЗАПУЩЕН                    ║
╚══════════════════════════════════════════════╝

📍 Локальный адрес: http://localhost:${PORT}
📍 Сеть (WiFi): http://${localIP}:${PORT}

📱 Для подключения с телефона:
http://${localIP}:${PORT}

📁 База данных: PostgreSQL
⚡ WebSocket готов к работе
    `);
});
