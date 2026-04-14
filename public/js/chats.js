async function loadChats() {
    console.log('📋 Loading chats');
    currentChat = null;
    
    try {
        const chatsResponse = await fetch(`/api/messages/recent/${currentUser.id}`);
        if (!chatsResponse.ok) throw new Error('Failed to fetch chats');
        
        const chats = await chatsResponse.json();
        console.log('💬 Chats with messages:', chats);
        
        const contactIds = chats.map(chat => chat.contact_id);
        
        let users = [];
        if (contactIds.length > 0) {
            const usersResponse = await fetch(`/api/auth/users?ids=${contactIds.join(',')}`);
            users = await usersResponse.json();
        }

        let html = `
            <div class="chats-screen">
                <div class="header">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <button class="menu-btn" onclick="openDrawer()">☰</button>
                        <h2>SharIQ</h2>
                    </div>
                    <div class="header-actions">
                        <button onclick="searchUser()" title="Поиск">🔍</button>
                    </div>
                </div>
                <div class="chats-list">
        `;

        if (!chats || chats.length === 0) {
            html += '<div style="text-align:center; padding:50px; color:var(--text-secondary);">Нет чатов<br><small>Найдите пользователя через поиск 🔍</small></div>';
        } else {
            const usersMap = new Map(users.map(u => [u.id, u]));
            
            for (let chat of chats) {
                const user = usersMap.get(chat.contact_id) || {};
                const lastMessage = chat.last_message || 'Нет сообщений';
                const lastTime = chat.last_timestamp ? formatTime(chat.last_timestamp) : '';
                
                html += `
                    <div class="chat-item" onclick="openChat(${chat.contact_id}, '${user.username || 'Пользователь'}')">
                        <div class="chat-avatar ${user.status === 'online' ? 'online' : ''}" style="background-image: url('${SERVER_URL}/api/avatar/${user.id}'); background-size: cover; background-position: center;">
    ${!user.has_avatar ? (user.username ? user.username[0].toUpperCase() : '?') : ''}
</div>
                        <div class="chat-info">
                            <div class="chat-name">
                                ${user.username || 'Пользователь'}
                                <span class="chat-time">${lastTime}</span>
                            </div>
                            <div class="chat-last-message">${escapeHtml(lastMessage)}</div>
                        </div>
                    </div>
                `;
            }
        }

        html += `</div></div>${getDrawerHTML()}`;
        
        // Добавляем плавающую кнопку перезагрузки
        html += `
            <button class="fab-reload" onclick="reloadPage()" title="Обновить">
                🔄
            </button>
        `;
        
        app.innerHTML = html;
        
        updateDrawerInfo();

    } catch (error) {
        console.error('❌ Ошибка загрузки чатов:', error);
    }
}

function getDrawerHTML() {
    return `
        <div class="drawer-overlay" id="drawer-overlay" onclick="closeDrawer()"></div>
        <div class="drawer" id="drawer">
            <div class="drawer-header">
                <div class="drawer-user">
                    <div class="drawer-avatar" id="drawer-avatar">${currentUser?.username[0].toUpperCase() || '?'}</div>
                    <div class="drawer-user-info">
                        <h3 id="drawer-name">${currentUser?.username || ''}</h3>
                        <p id="drawer-phone">${currentUser?.phone || ''}</p>
                    </div>
                </div>
            </div>
            <div class="drawer-menu">
                <div class="drawer-menu-item" onclick="navigateToProfile()"><span>👤</span><span>Мой профиль</span></div>
                <div class="drawer-menu-item" onclick="navigateToTheme()"><span>🎨</span><span id="theme-text">Тема: ${currentTheme === 'light' ? 'Светлая' : 'Тёмная'}</span></div>
                <div class="drawer-menu-item" onclick="navigateToSettings()"><span>⚙️</span><span>Настройки</span></div>
            </div>
            <div class="drawer-footer">
                <div class="drawer-menu-item" onclick="navigateToLogout()"><span>🚪</span><span>Выйти</span></div>
            </div>
        </div>
    `;
}

async function updateChatsList() {
    if (!currentUser) return;
    
    try {
        const response = await fetch(`/api/messages/recent/${currentUser.id}`);
        if (!response.ok) return;
        
        const chats = await response.json();
        console.log('🔄 Chats updated:', chats);
        
        // Обновляем время и текст сообщения в списке чатов
        document.querySelectorAll('.chat-item').forEach(item => {
            const onclick = item.getAttribute('onclick');
            if (onclick) {
                const match = onclick.match(/openChat\((\d+)/);
                if (match) {
                    const userId = parseInt(match[1]);
                    const chat = chats.find(c => c.contact_id === userId);
                    
                    const timeEl = item.querySelector('.chat-time');
                    if (timeEl && chat?.last_timestamp) {
                        timeEl.textContent = formatTime(chat.last_timestamp);
                    }
                    
                    const lastMsgEl = item.querySelector('.chat-last-message');
                    if (lastMsgEl && chat?.last_message) {
                        lastMsgEl.textContent = escapeHtml(chat.last_message);
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error updating chats:', error);
    }
}

async function showProfile() {
    try {
        const response = await fetch(`/api/auth/${currentUser.id}`);
        const user = await response.json();
        
        // Проверяем, есть ли аватарка
        let avatarHtml = '';
        try {
            const avatarResponse = await fetch(`${SERVER_URL}/api/avatar/${currentUser.id}`);
            if (avatarResponse.ok) {
                const avatarBlob = await avatarResponse.blob();
                const avatarUrl = URL.createObjectURL(avatarBlob);
                avatarHtml = `<div style="width:100px;height:100px;border-radius:50%;margin:0 auto 20px;background-image:url('${avatarUrl}');background-size:cover;background-position:center;border:3px solid var(--accent);"></div>`;
            } else {
                avatarHtml = `<div style="width:100px;height:100px;background:var(--accent);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:48px;color:white;">${user.username[0].toUpperCase()}</div>`;
            }
        } catch (e) {
            avatarHtml = `<div style="width:100px;height:100px;background:var(--accent);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:48px;color:white;">${user.username[0].toUpperCase()}</div>`;
        }
        
        app.innerHTML = `
            <div class="chats-screen">
                <div class="header">
                    <button class="back-btn" onclick="loadChats()">←</button>
                    <h2>Профиль</h2>
                </div>
                <div style="padding:20px;">
                    <div style="text-align:center;">
                        ${avatarHtml}
                        <h2>${user.username}</h2>
                        <p>${user.phone}</p>
                        <p>Статус: ${user.status === 'online' ? '🟢 онлайн' : '⚪ офлайн'}</p>
                    </div>
                    <div style="display:flex; gap:10px; margin-top:20px; flex-wrap: wrap;">
                        <button onclick="selectAvatar()" style="flex:1; padding:15px; background:var(--accent); color:white; border:none; border-radius:12px; min-width:120px;">
                            🖼️ Сменить аватар
                        </button>
                        <button onclick="removeAvatar()" style="flex:1; padding:15px; background:#f44336; color:white; border:none; border-radius:12px; min-width:120px;">
                            🗑️ Удалить аватар
                        </button>
                        <button onclick="changeUsername()" style="flex:1; padding:15px; background:var(--accent); color:white; border:none; border-radius:12px; min-width:120px;">
                            ✏️ Изменить ник
                        </button>
                        <button onclick="loadChats()" style="flex:1; padding:15px; background:var(--text-secondary); color:white; border:none; border-radius:12px; min-width:120px;">
                            ← Назад
                        </button>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

// Поиск пользователей
async function searchUser() {
    const query = prompt('Введите номер телефона или имя пользователя для поиска:');
    if (!query || query.length < 3) {
        alert('Минимум 3 символа для поиска');
        return;
    }
    
    try {
        const response = await fetch(`/api/auth/search?query=${encodeURIComponent(query)}`);
        const users = await response.json();
        
        if (users.length === 0) {
            alert('Пользователи не найдены');
            return;
        }
        
        // Удаляем предыдущее модальное окно если есть
        const oldModal = document.querySelector('.search-modal');
        if (oldModal) oldModal.remove();
        
        // Создаем модальное окно
        const modal = document.createElement('div');
        modal.className = 'search-modal';
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
        
        // Контент
        const content = document.createElement('div');
        content.className = 'search-modal-content';
        
        // Заголовок
        const title = document.createElement('h3');
        title.textContent = 'Результаты поиска:';
        content.appendChild(title);
        
        // Список пользователей
        users.forEach(user => {
            const userDiv = document.createElement('div');
            userDiv.className = 'search-user-item';
            userDiv.onclick = () => {
                openChat(user.id, user.username);
                modal.remove();
            };
            
            userDiv.innerHTML = `
                <div class="search-user-avatar">${user.username[0].toUpperCase()}</div>
                <div class="search-user-info">
                    <div class="search-user-name">${user.username}</div>
                    <div class="search-user-phone">${user.phone}</div>
                </div>
            `;
            
            content.appendChild(userDiv);
        });
        
        // Кнопка закрытия
        const closeBtn = document.createElement('button');
        closeBtn.className = 'search-modal-close';
        closeBtn.innerHTML = '✕';
        closeBtn.onclick = () => modal.remove();
        content.appendChild(closeBtn);
        
        modal.appendChild(content);
        document.body.appendChild(modal);
        
    } catch (error) {
        console.error('Ошибка поиска:', error);
        alert('Ошибка при поиске');
    }
}

function navigateToSettings() {
    closeDrawer();
    if (typeof window.showSettings === 'function') {
        window.showSettings();
    } else {
        alert('Ошибка загрузки настроек');
    }
}

// Изменить ник
async function changeUsername() {
    const newUsername = prompt('Введите новое имя пользователя (минимум 3 символа):', currentUser.username);
    
    if (!newUsername || newUsername.length < 3) {
        alert('Имя должно быть минимум 3 символа');
        return;
    }
    
    try {
        const response = await fetch(`/api/auth/change-username/${currentUser.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newUsername })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentUser.username = newUsername;
            localStorage.setItem('shariq_user', JSON.stringify(currentUser));
            alert('✅ Имя успешно изменено!');
            updateDrawerInfo();
            showProfile(); // Обновляем профиль
        } else {
            alert('❌ Ошибка: ' + data.error);
        }
    } catch (error) {
        console.error('Error changing username:', error);
        alert('Ошибка при изменении имени');
    }
}

// Перезагрузка страницы
function reloadPage() {
    // Показываем уведомление перед перезагрузкой
    const notification = document.createElement('div');
    notification.className = 'reload-notification';
    notification.innerHTML = `
        <div class="notification-content">
            <span>🔄 Перезагрузка...</span>
        </div>
    `;
    document.body.appendChild(notification);
    
    // Перезагружаем страницу через 0.5 секунды
    setTimeout(() => {
        window.location.reload();
    }, 500);
}

// Выбор и загрузка аватарки
function selectAvatar() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) {
                alert('❌ Файл слишком большой. Максимальный размер 2 MB');
                return;
            }
            await uploadAvatar(file);
        }
    };
    input.click();
}

// Загрузка аватарки на сервер
async function uploadAvatar(file) {
    const formData = new FormData();
    formData.append('avatar', file);
    formData.append('userId', currentUser.id);
    
    const progressBar = document.getElementById('uploadProgress');
    if (progressBar) progressBar.style.display = 'block';
    
    try {
        const response = await fetch(`${SERVER_URL}/api/avatar/upload`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (progressBar) progressBar.style.display = 'none';
        
        if (response.ok) {
            alert('✅ Аватарка обновлена!');
            
            // ОБНОВЛЯЕМ АВАТАРКУ ВЕЗДЕ
            await updateAvatarEverywhere();
            
            // Обновляем страницу профиля
            showProfile();
        } else {
            alert('❌ Ошибка: ' + data.error);
        }
    } catch (error) {
        console.error('Error uploading avatar:', error);
        alert('Ошибка при загрузке аватарки');
        if (progressBar) progressBar.style.display = 'none';
    }
}

// Обновить аватарку в интерфейсе
function updateAvatarInUI() {
    // Обновляем аватарку в шапке
    const avatarElement = document.querySelector('.drawer-avatar');
    if (avatarElement) {
        // Меняем текст на букву (пока не подгрузится картинка)
        avatarElement.textContent = currentUser.username[0].toUpperCase();
        avatarElement.style.backgroundImage = `url(${SERVER_URL}/api/avatar/${currentUser.id}?t=${Date.now()})`;
        avatarElement.style.backgroundSize = 'cover';
        avatarElement.style.backgroundPosition = 'center';
        avatarElement.style.color = 'transparent';
    }
}

// Удалить аватарку
async function removeAvatar() {
    if (!confirm('Удалить аватарку? Будет установлена стандартная.')) return;
    
    try {
        const response = await fetch(`${SERVER_URL}/api/avatar/${currentUser.id}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('✅ Аватарка удалена');
            
            // Сбрасываем аватарку на букву везде
            const drawerAvatar = document.getElementById('drawer-avatar');
            if (drawerAvatar) {
                drawerAvatar.style.backgroundImage = '';
                drawerAvatar.textContent = currentUser.username[0].toUpperCase();
                drawerAvatar.style.color = '';
            }
            
            const chatAvatar = document.querySelector('.chat-header-avatar');
            if (chatAvatar && currentChat) {
                chatAvatar.style.backgroundImage = '';
                chatAvatar.textContent = currentChat.username[0].toUpperCase();
                chatAvatar.style.color = '';
            }
            
            const miniProfileAvatar = document.querySelector('.profile-avatar-large');
            if (miniProfileAvatar) {
                miniProfileAvatar.style.backgroundImage = '';
                miniProfileAvatar.textContent = currentUser.username[0].toUpperCase();
                miniProfileAvatar.style.color = '';
            }
            
            // Обновляем страницу профиля и список чатов
            showProfile();
            loadChats();
        } else {
            alert('❌ Ошибка: ' + data.error);
        }
    } catch (error) {
        console.error('Error removing avatar:', error);
        alert('Ошибка при удалении аватарки');
    }
}

// Обновить аватарку во всех местах
async function updateAvatarEverywhere() {
    console.log('🔄 Обновление аватарки везде...');
    
    // 1. Обновляем в боковой панели (drawer)
    const drawerAvatar = document.getElementById('drawer-avatar');
    if (drawerAvatar) {
        try {
            const response = await fetch(`${SERVER_URL}/api/avatar/${currentUser.id}`);
            if (response.ok) {
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                drawerAvatar.style.backgroundImage = `url('${url}')`;
                drawerAvatar.style.backgroundSize = 'cover';
                drawerAvatar.style.backgroundPosition = 'center';
                drawerAvatar.style.color = 'transparent';
                drawerAvatar.textContent = '';
            } else {
                throw new Error('No avatar');
            }
        } catch (e) {
            drawerAvatar.style.backgroundImage = '';
            drawerAvatar.textContent = currentUser.username[0].toUpperCase();
            drawerAvatar.style.color = '';
        }
    }
    
    // 2. Обновляем в шапке текущего чата (если открыт)
    if (currentChat) {
        const chatAvatar = document.querySelector('.chat-header-avatar');
        if (chatAvatar) {
            try {
                const response = await fetch(`${SERVER_URL}/api/avatar/${currentChat.id}`);
                if (response.ok) {
                    const blob = await response.blob();
                    const url = URL.createObjectURL(blob);
                    chatAvatar.style.backgroundImage = `url('${url}')`;
                    chatAvatar.style.backgroundSize = 'cover';
                    chatAvatar.style.backgroundPosition = 'center';
                    chatAvatar.style.color = 'transparent';
                    chatAvatar.textContent = '';
                } else {
                    throw new Error('No avatar');
                }
            } catch (e) {
                chatAvatar.style.backgroundImage = '';
                chatAvatar.textContent = currentChat.username[0].toUpperCase();
                chatAvatar.style.color = '';
            }
        }
    }
    
    // 3. Обновляем в мини-профиле (если открыт)
    const miniProfileAvatar = document.querySelector('.profile-avatar-large');
    if (miniProfileAvatar) {
        try {
            const response = await fetch(`${SERVER_URL}/api/avatar/${currentUser.id}`);
            if (response.ok) {
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                miniProfileAvatar.style.backgroundImage = `url('${url}')`;
                miniProfileAvatar.style.backgroundSize = 'cover';
                miniProfileAvatar.style.backgroundPosition = 'center';
                miniProfileAvatar.style.color = 'transparent';
                miniProfileAvatar.textContent = '';
            } else {
                throw new Error('No avatar');
            }
        } catch (e) {
            miniProfileAvatar.style.backgroundImage = '';
            miniProfileAvatar.textContent = currentUser.username[0].toUpperCase();
            miniProfileAvatar.style.color = '';
        }
    }
    
    // 4. Перезагружаем список чатов (обновятся аватарки в списке)
    loadChats();
    
    console.log('✅ Аватарка обновлена везде');
}

function updateDrawerInfo() {
    if (!currentUser) return;
    
    const avatarEl = document.getElementById('drawer-avatar');
    const nameEl = document.getElementById('drawer-name');
    const phoneEl = document.getElementById('drawer-phone');
    
    if (nameEl) nameEl.textContent = currentUser.username;
    if (phoneEl) phoneEl.textContent = currentUser.phone;
    
    // Загружаем аватарку для боковой панели
    if (avatarEl) {
        fetch(`${SERVER_URL}/api/avatar/${currentUser.id}`)
            .then(response => {
                if (response.ok) {
                    return response.blob();
                } else {
                    throw new Error('No avatar');
                }
            })
            .then(blob => {
                const url = URL.createObjectURL(blob);
                avatarEl.style.backgroundImage = `url('${url}')`;
                avatarEl.style.backgroundSize = 'cover';
                avatarEl.style.backgroundPosition = 'center';
                avatarEl.style.color = 'transparent';
                avatarEl.textContent = '';
            })
            .catch(() => {
                // Если нет аватарки, показываем букву
                avatarEl.style.backgroundImage = '';
                avatarEl.style.color = '';
                avatarEl.textContent = currentUser.username[0].toUpperCase();
            });
    }
}

// Делаем функцию глобальной
window.reloadPage = reloadPage;

// Экспорт функций
window.loadChats = loadChats;
window.updateChatsList = updateChatsList;
window.showProfile = showProfile;
window.searchUser = searchUser;
window.getDrawerHTML = getDrawerHTML;
window.navigateToSettings = navigateToSettings;
window.changeUsername = changeUsername;
window.selectAvatar = selectAvatar;
window.removeAvatar = removeAvatar;
window.uploadAvatar = uploadAvatar;
window.updateAvatarEverywhere = updateAvatarEverywhere;
