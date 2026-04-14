const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

let pool;

async function initializeDatabase() {
  console.log('🔄 Подключение к PostgreSQL...');

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ DATABASE_URL не задан!');
    console.log('📌 Создайте базу данных в Railway');
    process.exit(1);
  }

  pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await pool.query('SELECT 1');
    console.log('✅ Подключено к PostgreSQL');

    await createTables();

    const result = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(result.rows[0].count) === 0) {
      console.log('👤 Создание тестовых пользователей...');
      await createTestUsers();
    } else {
      console.log(`👥 В базе уже есть ${result.rows[0].count} пользователей`);
    }

  } catch (error) {
    console.error('❌ Ошибка подключения к БД:', error);
    process.exit(1);
  }
}

async function createTables() {
  // Таблица пользователей
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      phone VARCHAR(20) UNIQUE NOT NULL,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(100),
      password TEXT NOT NULL,
      avatar TEXT DEFAULT 'default.png',
      status TEXT DEFAULT 'offline',
      last_seen BIGINT,
      created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
    )
  `);
  console.log('✅ Таблица users готова');

  // Таблица сообщений
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      message TEXT,
      type TEXT DEFAULT 'text',
      timestamp BIGINT NOT NULL,
      status TEXT DEFAULT 'sent',
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  console.log('✅ Таблица messages готова');

  // Таблица для фото (в БД, а не в файловой системе)
await pool.query(`
    CREATE TABLE IF NOT EXISTS photos (
        id SERIAL PRIMARY KEY,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER,
        file_type TEXT,
        file_data BYTEA NOT NULL,
        uploaded_at BIGINT,
        user_id INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
`);
console.log('✅ Таблица photos готова');
  
  // Таблица файлов (для всех типов файлов)
await pool.query(`
    CREATE TABLE IF NOT EXISTS files (
        id SERIAL PRIMARY KEY,
        message_id INTEGER,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER,
        file_type TEXT,
        file_data BYTEA NOT NULL,
        uploaded_at BIGINT,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    )
`);
console.log('✅ Таблица files готова');
  
  // Таблица для аватарок пользователей
await pool.query(`
    CREATE TABLE IF NOT EXISTS avatars (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE NOT NULL,
        file_data BYTEA NOT NULL,
        file_type TEXT NOT NULL,
        updated_at BIGINT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
`);
console.log('✅ Таблица avatars готова');
  
  // Индексы
  await pool.query('CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)');

  console.log('✅ Индексы созданы');
}

async function createTestUsers() {
  const saltRounds = 10;
  const testUsers = [
    { phone: '+79991234567', username: 'user1', email: 'user1@example.com', password: '123456' },
    { phone: '+79991234568', username: 'user2', email: 'user2@example.com', password: '123456' },
    { phone: '+79991234569', username: 'user3', email: 'user3@example.com', password: '123456' }
  ];

  for (const user of testUsers) {
    const hashedPassword = await bcrypt.hash(user.password, saltRounds);
    await pool.query(
      'INSERT INTO users (phone, username, email, password, status, last_seen) VALUES ($1, $2, $3, $4, $5, $6)',
      [user.phone, user.username, user.email, hashedPassword, 'offline', Date.now()]
    );
    console.log(`✅ Создан тестовый пользователь: ${user.username}`);
  }

  console.log('📝 Создание тестовых сообщений...');
  await createTestMessages();
}

async function createTestMessages() {
  const users = await pool.query('SELECT id, username FROM users');
  const user1 = users.rows.find(u => u.username === 'user1');
  const user2 = users.rows.find(u => u.username === 'user2');

  if (!user1 || !user2) return;

  const now = Date.now();
  const hour = 3600000;

  const testMessages = [
    { sender_id: user1.id, receiver_id: user2.id, message: 'Привет! Как дела?', timestamp: now - 5 * hour, status: 'read' },
    { sender_id: user2.id, receiver_id: user1.id, message: 'Привет! Всё отлично', timestamp: now - 4.5 * hour, status: 'read' },
    { sender_id: user1.id, receiver_id: user2.id, message: 'Круто!', timestamp: now - 4 * hour, status: 'read' }
  ];

  for (const msg of testMessages) {
    await pool.query(
      'INSERT INTO messages (sender_id, receiver_id, message, timestamp, status) VALUES ($1, $2, $3, $4, $5)',
      [msg.sender_id, msg.receiver_id, msg.message, msg.timestamp, msg.status]
    );
  }

  console.log('✅ Создано тестовых сообщений');
}

// Функции для работы с пользователями
async function findUserByPhone(phone) {
  const result = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
  return result.rows[0];
}

async function findUserById(id) {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0];
}

async function createUser(userData) {
  const hashedPassword = await bcrypt.hash(userData.password, 10);
  const result = await pool.query(
    'INSERT INTO users (phone, username, email, password, status, last_seen) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [userData.phone, userData.username, userData.email, hashedPassword, 'offline', Date.now()]
  );
  return { id: result.rows[0].id, ...userData };
}

async function updateUserStatus(userId, status) {
  await pool.query(
    'UPDATE users SET status = $1, last_seen = $2 WHERE id = $3',
    [status, Date.now(), userId]
  );
}

async function getUsers() {
    const result = await pool.query(`
        SELECT u.id, u.phone, u.username, u.avatar, u.status, u.last_seen,
               CASE WHEN a.id IS NOT NULL THEN true ELSE false END as has_avatar
        FROM users u
        LEFT JOIN avatars a ON u.id = a.user_id
    `);
    return result.rows;
}

// Функции для работы с сообщениями
async function getMessagesBetweenUsers(userId1, userId2) {
  const result = await pool.query(
    `SELECT * FROM messages 
     WHERE (sender_id = $1 AND receiver_id = $2) 
        OR (sender_id = $2 AND receiver_id = $1) 
     ORDER BY timestamp ASC`,
    [userId1, userId2]
  );
  return result.rows.map(msg => ({
    ...msg,
    timestamp: msg.timestamp
  }));
}

async function createMessage(messageData) {
  const timestamp = Date.now();
  const result = await pool.query(
    `INSERT INTO messages (sender_id, receiver_id, message, type, timestamp, status) 
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [messageData.senderId, messageData.receiverId, messageData.message, 
     messageData.type || 'text', timestamp, 'sent']
  );
  return { id: result.rows[0].id, ...messageData, timestamp: timestamp };
}

async function markMessagesAsRead(userId, contactId) {
  await pool.query(
    `UPDATE messages SET status = 'read' 
     WHERE receiver_id = $1 AND sender_id = $2 AND status != 'read'`,
    [userId, contactId]
  );
}

async function getRecentChats(userId) {
  try {
    const contacts = await pool.query(
      `SELECT DISTINCT 
         CASE 
           WHEN sender_id = $1 THEN receiver_id 
           ELSE sender_id 
         END as contact_id
       FROM messages 
       WHERE sender_id = $1 OR receiver_id = $1`,
      [userId]
    );
    
    if (contacts.rows.length === 0) {
      return [];
    }
    
    const results = [];
    
    for (const contact of contacts.rows) {
      const contactId = contact.contact_id;
      
      const lastMsg = await pool.query(
                `SELECT message, timestamp, status, type 
                 FROM messages 
                 WHERE (sender_id = $1 AND receiver_id = $2) 
                    OR (sender_id = $2 AND receiver_id = $1) 
                 ORDER BY timestamp DESC 
                 LIMIT 1`,
                [userId, contactId]
            );
            
            // Получаем информацию о пользователе
            const userInfo = await pool.query(
                `SELECT username, status FROM users WHERE id = $1`,
                [contactId]
            );
            
            // Форматируем последнее сообщение для отображения в списке
            let lastMessageText = '';
            if (lastMsg.rows[0]) {
                const msg = lastMsg.rows[0];
                if (msg.type === 'text') {
                    lastMessageText = msg.message;
                } else if (msg.type === 'image') {
                    lastMessageText = '📷 Фото';
                } else if (msg.type === 'file') {
                    lastMessageText = '📎 Файл';
                } else if (msg.type === 'audio') {
                    lastMessageText = '🎤 Голосовое';
                } else {
                    lastMessageText = '📨 Сообщение';
                }
            }
            
            results.push({
                contact_id: contactId,
                contact_name: userInfo.rows[0]?.username || 'Пользователь',
                contact_status: userInfo.rows[0]?.status || 'offline',
                last_message: lastMessageText,
                last_timestamp: lastMsg.rows[0]?.timestamp || null,
                last_status: lastMsg.rows[0]?.status || '',
                last_type: lastMsg.rows[0]?.type || 'text',
                last_message_raw: lastMsg.rows[0]?.message || '' // сохраняем оригинал для других нужд
            });
        }
        
        results.sort((a, b) => (b.last_timestamp || 0) - (a.last_timestamp || 0));
        return results;
        
    } catch (error) {
        console.error('❌ Ошибка в getRecentChats:', error);
        return [];
    }
}

async function deleteMessagesBetweenUsers(userId1, userId2) {
  const result = await pool.query(
    'DELETE FROM messages WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)',
    [userId1, userId2]
  );
  return result.rowCount;
}

async function updateUsername(userId, newUsername) {
  const result = await pool.query(
    'UPDATE users SET username = $1 WHERE id = $2 RETURNING *',
    [newUsername, userId]
  );
  return result.rows[0];
}

async function cleanupOldMessages(daysOld = 30) {
  const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
  const result = await pool.query('DELETE FROM messages WHERE timestamp < $1', [cutoffTime]);
  console.log(`🧹 Удалено ${result.rowCount} старых сообщений`);
}

// Сохранить аватарку
async function saveAvatar(userId, fileData, fileType) {
    // Проверяем, есть ли уже аватарка у пользователя
    const existing = await pool.query('SELECT id FROM avatars WHERE user_id = $1', [userId]);
    
    if (existing.rows.length > 0) {
        // Обновляем существующую
        await pool.query(
            'UPDATE avatars SET file_data = $1, file_type = $2, updated_at = $3 WHERE user_id = $4',
            [fileData, fileType, Date.now(), userId]
        );
    } else {
        // Создаём новую
        await pool.query(
            'INSERT INTO avatars (user_id, file_data, file_type, updated_at) VALUES ($1, $2, $3, $4)',
            [userId, fileData, fileType, Date.now()]
        );
    }
}

// Получить аватарку
async function getAvatar(userId) {
    const result = await pool.query(
        'SELECT file_data, file_type FROM avatars WHERE user_id = $1',
        [userId]
    );
    return result.rows[0] || null;
}

// Удалить аватарку (сбросить на дефолтную)
async function deleteAvatar(userId) {
    await pool.query('DELETE FROM avatars WHERE user_id = $1', [userId]);
}

module.exports = {
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
  updateUsername,
  cleanupOldMessages,
  saveAvatar,
  getAvatar,
  deleteAvatar
};
