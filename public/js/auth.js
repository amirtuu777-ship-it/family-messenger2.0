// Показать экран авторизации
function showAuthScreen() {
    app.innerHTML = `
        <div class="auth-screen">
            <div class="auth-header">
                <h1>SharIQ</h1>
                <p>Умный мессенджер для умных людей</p>
            </div>
            <div class="auth-tabs">
                <button class="auth-tab active" onclick="switchTab('login')">Вход</button>
                <button class="auth-tab" onclick="switchTab('register')">Регистрация</button>
            </div>
            <div id="auth-content">
                ${renderLoginForm()}
            </div>
        </div>
    `;
}

// Переключение между вкладками
function switchTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    
    const content = document.getElementById('auth-content');
    if (tab === 'login') {
        content.innerHTML = renderLoginForm();
    } else {
        content.innerHTML = renderRegisterForm();
    }
}

// Форма входа (исправленная)
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

// Форма регистрации (исправленная)
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

// Функция входа
async function login() {
    const countryCode = document.getElementById('login-country').value;
    const phoneNumber = document.getElementById('login-phone').value;
    const password = document.getElementById('login-password').value;
    
    // Формируем полный номер телефона
    const fullPhone = countryCode + phoneNumber.replace(/[^0-9]/g, '');
    
    if (!fullPhone || !password) {
        alert('Введите телефон и пароль');
        return;
    }
    
    try {
        const response = await fetch(`${SERVER_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: fullPhone, password })
        });

        const data = await response.json();
        
        if (response.ok) {
            currentUser = data.user;
            localStorage.setItem('shariq_user', JSON.stringify(currentUser));
            console.log('✅ Вход выполнен:', currentUser);
            connectSocket();
            loadChats();
        } else {
            alert('❌ Ошибка: ' + data.error);
        }
    } catch (error) {
        console.error('Ошибка входа:', error);
        alert('Ошибка соединения с сервером');
    }
}

// Функция регистрации
async function register() {
    const countryCode = document.getElementById('reg-country').value;
    const phoneNumber = document.getElementById('reg-phone').value;
    const username = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;
    
    // Формируем полный номер телефона
    const fullPhone = countryCode + phoneNumber.replace(/[^0-9]/g, '');
    
    if (!fullPhone || !username || !password) {
        alert('Заполните все поля');
        return;
    }
    
    if (username.length < 3) {
        alert('Имя пользователя должно быть не менее 3 символов');
        return;
    }
    
    if (password.length < 6) {
        alert('Пароль должен быть не менее 6 символов');
        return;
    }
    
    try {
        const response = await fetch(`${SERVER_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                phone: fullPhone, 
                username, 
                password 
            })
        });

        const data = await response.json();
        
        if (response.ok) {
            alert('✅ Регистрация успешна! Теперь войдите.');
            switchTab('login');
        } else {
            alert('❌ Ошибка: ' + data.error);
        }
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        alert('Ошибка соединения с сервером');
    }
}

// Выход из системы
async function logout() {
    if (currentUser) {
        try {
            // Отправляем запрос на сервер
            const response = await fetch(`${SERVER_URL}/api/auth/logout/${currentUser.id}`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                console.log('✅ Выход выполнен');
            }
        } catch (error) {
            console.error('❌ Ошибка при выходе:', error);
        }
        
        // Отключаем сокет
        if (socket) {
            socket.disconnect();
            socket = null;
        }
        
        // Удаляем сохраненного пользователя
        localStorage.removeItem('shariq_user');
        
        // Очищаем все данные
        currentUser = null;
        currentChat = null;
        
        // Показываем экран входа
        showAuthScreen();
    } else {
        showAuthScreen();
    }
}

// Добавить обработчик для кнопки выхода
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('logout-btn') || e.target.closest('button[onclick="logout()"]')) {
        e.preventDefault();
        logout();
    }
});

// Поиск пользователей
async function searchUser() {
    const query = prompt('Введите номер телефона или имя пользователя для поиска:');
    if (!query || query.length < 3) {
        alert('Минимум 3 символа для поиска');
        return;
    }
    
    try {
        const response = await fetch(`${SERVER_URL}/api/auth/search?query=${encodeURIComponent(query)}`);
        const users = await response.json();  // ← ИСПРАВЛЕНО!
        
        if (users.length === 0) {
            alert('Пользователи не найдены');
            return;
        }
        
        let resultsHtml = '<div style="padding:20px;"><h3>Результаты поиска:</h3>';
        users.forEach(user => {
            resultsHtml += `
                <div style="padding:10px; margin:5px; border:1px solid var(--border); border-radius:8px; cursor:pointer;" 
                     onclick="openChat(${user.id}, '${user.username}')">
                    <strong>${user.username}</strong><br>
                    <small>${user.phone}</small>
                </div>
            `;
        });
        resultsHtml += '</div>';
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = resultsHtml + '<button class="modal-close" onclick="this.parentElement.remove()">✕</button>';
        document.body.appendChild(modal);
        
    } catch (error) {
        console.error('Ошибка поиска:', error);
        alert('Ошибка при поиске');
    }
}
