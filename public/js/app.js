// Глобальные настройки
let settings = {
    privacy: {
        phoneVisibility: localStorage.getItem('settings_phone_visibility') || 'all'
    }
};

// Функция обновления настроек
window.updateSettings = function(newSettings) {
    settings = { ...settings, ...newSettings };
};

// Основные настройки
const SERVER_URL = window.location.origin;
let socket = null;
let currentUser = null;
let currentChat = null;
let typingTimeout = null;
let statusUpdateInterval = null;
const app = document.getElementById('app');

// Тема
let currentTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', currentTheme);

function toggleTheme() {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);
    
    const themeText = document.getElementById('theme-text');
    if (themeText) {
        themeText.textContent = `Тема: ${currentTheme === 'light' ? 'Светлая' : 'Тёмная'}`;
    }
}

// Функции для выдвижной панели
function openDrawer() {
    const drawer = document.getElementById('drawer');
    const overlay = document.getElementById('drawer-overlay');
    if (drawer && overlay) {
        drawer.classList.add('open');
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
}

function closeDrawer() {
    const drawer = document.getElementById('drawer');
    const overlay = document.getElementById('drawer-overlay');
    if (drawer && overlay) {
        drawer.classList.remove('open');
        overlay.classList.remove('open');
        document.body.style.overflow = '';
    }
}

function updateDrawerInfo() {
    if (!currentUser) return;
    
    const avatarEl = document.getElementById('drawer-avatar');
    const nameEl = document.getElementById('drawer-name');
    const phoneEl = document.getElementById('drawer-phone');
    
    if (avatarEl) avatarEl.textContent = currentUser.username[0].toUpperCase();
    if (nameEl) nameEl.textContent = currentUser.username;
    if (phoneEl) phoneEl.textContent = currentUser.phone;
}

function navigateToProfile() { closeDrawer(); showProfile(); }
function navigateToSettings() { closeDrawer(); alert('Настройки в разработке'); }
function navigateToTheme() { toggleTheme(); closeDrawer(); }
function navigateToLogout() { closeDrawer(); logout(); }

// Инициализация
async function init() {
    console.log('🚀 init started');
    
    app.innerHTML = `
        <div class="loading-screen">
            <div class="loading-spinner"></div>
            <div>Загрузка SharIQ...</div>
        </div>
    `;
    
    try {
        const test = await fetch(`${SERVER_URL}/api/auth/users`);
        if (!test.ok) throw new Error('Server error');
    } catch (error) {
        app.innerHTML = `
            <div class="auth-screen">
                <h1>SharIQ</h1>
                <p style="color:red">Ошибка подключения к серверу</p>
                <button onclick="init()">Повторить</button>
            </div>
        `;
        return;
    }
    
    const savedUser = localStorage.getItem('shariq_user');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            const response = await fetch(`${SERVER_URL}/api/auth/users?exclude=${currentUser.id}`);
            if (response.ok) {
                connectSocket();
                loadChats();
                return;
            }
        } catch (error) {
            localStorage.removeItem('shariq_user');
        }
    }
    
    showAuthScreen();
}

// Экран авторизации
function showAuthScreen() {
    app.innerHTML = `
        <div class="auth-screen">
            <div class="auth-header">
                <h1>SharIQ</h1>
                <p>Умный мессенджер для умных людей</p>
            </div>
            <div class="auth-tabs">
                <button class="auth-tab active" onclick="showLogin()">Вход</button>
                <button class="auth-tab" onclick="showRegister()">Регистрация</button>
            </div>
            <div id="auth-content">
                ${renderLoginForm()}
            </div>
        </div>
    `;
}

function renderLoginForm() {
    return `
        <div class="auth-form">
            <div class="phone-input">
                <select id="login-country">
                    <option value="+7" selected>+7 🇷🇺</option>
                    <option value="+375">+375 🇧🇾</option>
                    <option value="+380">+380 🇺🇦</option>
                    <option value="+1">+1 🇺🇸</option>
                    <option value="+49">+49 🇩🇪</option>
                </select>
                <input type="tel" id="login-phone" placeholder="Номер телефона" style="flex:1;">
            </div>
            <input type="password" id="login-password" placeholder="Пароль">
            <button onclick="login()">Войти</button>
        </div>
    `;
}

function renderRegisterForm() {
    return `
        <div class="auth-form">
            <div class="phone-input">
                <select id="reg-country">
                    <option value="+7" selected>+7 🇷🇺</option>
                    <option value="+375">+375 🇧🇾</option>
                    <option value="+380">+380 🇺🇦</option>
                    <option value="+1">+1 🇺🇸</option>
                    <option value="+49">+49 🇩🇪</option>
                </select>
                <input type="tel" id="reg-phone" placeholder="Номер телефона" style="flex:1;">
            </div>
            <input type="text" id="reg-username" placeholder="Имя пользователя">
            <input type="password" id="reg-password" placeholder="Пароль">
            <button onclick="register()">Зарегистрироваться</button>
        </div>
    `;
}

function showLogin() {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('auth-content').innerHTML = renderLoginForm();
}

function showRegister() {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('auth-content').innerHTML = renderRegisterForm();
}

async function login() {
    const countryCode = document.getElementById('login-country').value;
    const phoneNumber = document.getElementById('login-phone').value;
    const password = document.getElementById('login-password').value;
    
    const fullPhone = countryCode + phoneNumber.replace(/[^0-9]/g, '');
    
    const response = await fetch(`${SERVER_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fullPhone, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
        currentUser = data.user;
        localStorage.setItem('shariq_user', JSON.stringify(currentUser));
        
        registerServiceWorker();
        
        connectSocket();
        loadChats();
    } else {
        alert('Ошибка: ' + data.error);
    }
}

async function register() {
    const countryCode = document.getElementById('reg-country').value;
    const phoneNumber = document.getElementById('reg-phone').value;
    const username = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;
    
    const fullPhone = countryCode + phoneNumber.replace(/[^0-9]/g, '');
    
    const response = await fetch(`${SERVER_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fullPhone, username, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
        alert('Регистрация успешна!');
        showLogin();
    } else {
        alert('Ошибка: ' + data.error);
    }
}

// Подключение к сокету
function connectSocket() {
    console.log('🔌 Connecting socket...');
    
    if (socket) socket.disconnect();
    
    socket = io(SERVER_URL);
    
    socket.on('connect', () => {
        console.log('✅ Socket connected');
        socket.emit('join', currentUser.id);
        setupStatusUpdates();
    });
    
    // Обработчик новых сообщений
socket.on('new_message', (message) => {
  console.log('📨 NEW MESSAGE RECEIVED:', message);
  
  // Добавляем имя отправителя
  if (!message.senderName && currentChat && message.senderId === currentChat.id) {
    message.senderName = currentChat.username;
  }
  
  const isCurrentChat = currentChat && (
    (message.senderId === currentChat.id && message.receiverId === currentUser.id) ||
    (message.senderId === currentUser.id && message.receiverId === currentChat.id)
  );
  
  if (isCurrentChat) {
    // Если мы в этом чате - добавляем сообщение
    console.log('✅ Adding to current chat');
    if (typeof window.addMessageToChat === 'function') {
      window.addMessageToChat(message);
    }
    
    if (message.senderId !== currentUser.id) {
      socket.emit('mark_read', {
        messageId: message.id,
        userId: currentUser.id,
        contactId: currentChat.id
      });
    }
  } else {
    // ========== ДОБАВЛЯЕМ АВТОСОХРАНЕНИЕ ДЛЯ ФОТО ==========
        // Если это фото и отправитель не текущий пользователь
        if (message.type === 'image' && message.senderId !== currentUser.id) {
            console.log('📸 Получено фото вне чата, проверяем автосохранение...');
            if (typeof window.autoSavePhotoIfNeeded === 'function') {
                window.autoSavePhotoIfNeeded(message.message);
            }
        }
      
    // Если мы не в чате - обновляем список чатов
    console.log('📨 New message from ' + (message.senderName || 'пользователя'));
    
    // ВАЖНО: принудительно обновляем список чатов
    if (typeof window.loadChats === 'function') {
      // Если мы в списке чатов - перезагружаем его
      if (!currentChat) {
        window.loadChats();
      } else {
        // Если мы в другом чате - обновляем в фоне
        if (typeof window.updateChatsList === 'function') {
          window.updateChatsList();
        }
      }
    }
    
    // Показываем уведомление
    showNotification(`Новое сообщение от ${message.senderName || 'пользователя'}`);
  }
});
    
    socket.on('message_sent', (message) => {
        console.log('✅ Message sent confirmation:', message);
        if (currentChat && message.senderId === currentUser.id && message.receiverId === currentChat.id) {
            if (typeof window.addMessageToChat === 'function') {
                window.addMessageToChat(message);
            }
        }
    });
    
    socket.on('user_typing', (data) => {
    if (currentChat && data.userId === currentChat.id) {
        const typingDiv = document.getElementById('typing-indicator');
        const statusDiv = document.getElementById('chat-status');
        
        if (typingDiv) {
            if (data.isTyping) {
                typingDiv.style.display = 'block';
                if (statusDiv) statusDiv.style.display = 'none';
            } else {
                typingDiv.style.display = 'none';
                if (statusDiv) statusDiv.style.display = 'block';
            }
        }
    }
});
    
    socket.on('user_status', (data) => {
        updateUserStatus(data.userId, data.status);
    });
    
    socket.on('messages_read', (data) => {
    console.log('📖 Сообщения прочитаны:', data);
    
    // Если мы в чате с тем, кто прочитал сообщения
    if (currentChat && currentChat.id === data.userId) {
        // Обновляем все сообщения, отправленные нами, на "прочитано"
        document.querySelectorAll('.message.sent').forEach(msg => {
            const statusEl = msg.querySelector('.message-status');
            if (statusEl) {
                statusEl.textContent = '✓✓';
            }
        });
    }
    
    // Также можно обновить в списке чатов
    if (typeof updateChatsList === 'function') {
        updateChatsList();
    }
});
    
    socket.on('disconnect', () => {
        console.log('🔴 Socket disconnected');
    });

// Обработчик очистки чата другим пользователем
socket.on('chat_cleared_by_other', (data) => {
    console.log('📨 Chat cleared by other user:', data);
    
    // Если мы сейчас в этом чате - перезагружаем его (он станет пустым)
    if (currentChat && currentChat.id === data.userId) {
        openChat(currentChat.id, currentChat.username);
    } else {
        // Иначе просто обновляем список чатов
        if (typeof updateChatsList === 'function') {
            updateChatsList();
        }
    }
});

// Обработчик удаления чата другим пользователем
socket.on('chat_deleted_by_other', (data) => {
    console.log('📨 Chat deleted by other user:', data);
    
    // Если мы сейчас в этом чате - возвращаемся к списку
    if (currentChat && currentChat.id === data.userId) {
        alert('Собеседник удалил этот чат');
        loadChats();
    } else {
        // Иначе просто обновляем список чатов
        if (typeof updateChatsList === 'function') {
            updateChatsList();
        }
    }
});
    
// Настройка обработчиков звонков
if (typeof setupCallHandlers === 'function') {
    setupCallHandlers();
}

}

function setupStatusUpdates() {
    if (statusUpdateInterval) clearInterval(statusUpdateInterval);
    
    statusUpdateInterval = setInterval(async () => {
        if (currentUser) {
            try {
                const response = await fetch(`${SERVER_URL}/api/auth/users?exclude=${currentUser.id}`);
                const users = await response.json();
                
                const statusMap = new Map(users.map(u => [u.id, u.status]));
                
                document.querySelectorAll('.chat-item').forEach(item => {
                    const onclick = item.getAttribute('onclick');
                    if (onclick) {
                        const match = onclick.match(/openChat\((\d+)/);
                        if (match) {
                            const userId = parseInt(match[1]);
                            const status = statusMap.get(userId);
                            const avatar = item.querySelector('.chat-avatar');
                            if (avatar) {
                                if (status === 'online') avatar.classList.add('online');
                                else avatar.classList.remove('online');
                            }
                        }
                    }
                });
                
                if (currentChat) {
                    const status = statusMap.get(currentChat.id);
                    const statusEl = document.getElementById('chat-status');
                    const avatar = document.querySelector('.chat-header-avatar');
                    
                    if (statusEl) {
                        statusEl.textContent = status === 'online' ? 'в сети' : 'был(а) недавно';
                    }
                    if (avatar) {
                        if (status === 'online') avatar.classList.add('online');
                        else avatar.classList.remove('online');
                    }
                }
            } catch (error) {
                console.error('Error updating statuses:', error);
            }
        }
    }, 10000);
}

function updateUserStatus(userId, status) {
    document.querySelectorAll('.chat-item').forEach(item => {
        const onclick = item.getAttribute('onclick');
        if (onclick && onclick.includes(`openChat(${userId}`)) {
            const avatar = item.querySelector('.chat-avatar');
            if (avatar) {
                if (status === 'online') avatar.classList.add('online');
                else avatar.classList.remove('online');
            }
        }
    });
    
    if (currentChat && currentChat.id === userId) {
        const statusEl = document.getElementById('chat-status');
        const avatar = document.querySelector('.chat-header-avatar');
        
        if (statusEl) {
            statusEl.textContent = status === 'online' ? 'в сети' : 'был(а) недавно';
        }
        if (avatar) {
            if (status === 'online') avatar.classList.add('online');
            else avatar.classList.remove('online');
        }
    }
}

function showNotification(text) {
    if (Notification.permission === 'granted') {
        new Notification('SharIQ', { body: text });
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
}

// Форматирование времени (УНИВЕРСАЛЬНАЯ ВЕРСИЯ)
function formatTime(timestamp) {
    if (!timestamp) return '';
    
    // Пробуем преобразовать в число
    let ts = timestamp;
    if (typeof timestamp === 'string') {
        ts = parseInt(timestamp);
    }
    
    // Проверяем, в секундах или миллисекундах
    let date;
    if (ts > 1000000000000) {
        // Если больше 1 триллиона - это миллисекунды
        date = new Date(ts);
    } else {
        // Если меньше - это секунды, умножаем на 1000
        date = new Date(ts * 1000);
    }
    
    // Проверка на валидность даты
    if (isNaN(date.getTime())) {
        console.error('Invalid date:', timestamp);
        return '';
    }
    
    const now = new Date();
    
    // Если сегодня
    if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // Если вчера
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
        return 'вчера';
    }
    
    // Если в этом году
    if (date.getFullYear() === now.getFullYear()) {
        return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
    }
    
    // Если в прошлом году
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function logout() {
    if (currentUser) {
        await fetch(`${SERVER_URL}/api/auth/logout/${currentUser.id}`, { method: 'POST' });
        if (socket) socket.disconnect();
        localStorage.removeItem('shariq_user');
        currentUser = null;
        currentChat = null;
    }
    showAuthScreen();
}

if (Notification.permission === 'default') {
    Notification.requestPermission();
}

// ========== ЗАПУСК ==========
window.addEventListener('beforeunload', () => {
    if (currentUser && socket) {
        navigator.sendBeacon(`${SERVER_URL}/api/auth/logout/${currentUser.id}`, '');
    }
    if (statusUpdateInterval) {
        clearInterval(statusUpdateInterval);
    }
});

// Запуск приложения
document.addEventListener('DOMContentLoaded', init);
