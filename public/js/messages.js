function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function openChat(userId, username) {
    console.log('🔓 Opening chat with:', userId, username);
    
    if (!currentUser) {
        alert('Сначала войдите в систему');
        return;
    }
    
    currentChat = { id: userId, username };
    
    try {
        const url = `${SERVER_URL}/api/messages/history/${currentUser.id}/${userId}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const messages = await response.json();
        
        const userResponse = await fetch(`${SERVER_URL}/api/auth/${userId}`);
        const userInfo = await userResponse.json();

        let messagesHtml = '';
        if (!messages || messages.length === 0) {
            messagesHtml = '<div style="text-align:center; color:var(--text-secondary); padding:20px;">Нет сообщений. Напишите что-нибудь!</div>';
        } else {
            for (let msg of messages) {
                messagesHtml += renderMessage(msg);
            }
        }

        app.innerHTML = `
            <div class="chat-screen">
                <div class="chat-header">
                    <button class="back-btn" onclick="loadChats()">←</button>
                    <div class="chat-header-avatar ${userInfo?.status === 'online' ? 'online' : ''}" id="chat-header-avatar-${userId}">
                    </div>
                    <div class="chat-header-info">
                        <div class="chat-header-name" onclick="showMiniProfile(${userId}, '${username}')">${username}</div>
                        <div class="chat-header-status" id="chat-status">
                            ${userInfo?.status === 'online' ? 'в сети' : 'был(а) недавно'}
                        </div>
                        <div class="typing-indicator" id="typing-indicator" style="display:none;">печатает...</div>
                    </div>
                    <div class="chat-menu">
                        <button class="menu-dots" onclick="toggleChatMenu()">⋮</button>
                        <div id="chat-menu-dropdown" class="chat-menu-dropdown" style="display:none;">
                            <div onclick="clearChat(${userId}, '${username}')">🗑️ Очистить чат</div>
                            <div onclick="deleteChat(${userId}, '${username}')">❌ Удалить чат</div>
                        </div>
                    </div>
                </div>
                
                <div class="messages-container" id="messages-container">
                    ${messagesHtml}
                </div>
                
                <div class="message-input-container">
                    <button class="file-btn" onclick="selectFile()" title="Прикрепить файл">📎</button>
                    <button class="photo-btn" onclick="selectPhoto()">📷</button>
                    <input type="text" class="message-input" id="message-input" 
                           placeholder="Сообщение" 
                           onkeyup="handleTyping(event)" 
                           onkeypress="if(event.key==='Enter') sendMessage()">
                    <button class="send-btn" onclick="sendMessage()">➤</button>
                </div>
            </div>
        `;

                // Загружаем аватарку для шапки чата
        const chatAvatar = document.getElementById(`chat-header-avatar-${userId}`);
        if (chatAvatar) {
            fetch(`${SERVER_URL}/api/avatar/${userId}`)
                .then(response => {
                    if (response.ok) {
                        return response.blob();
                    } else {
                        throw new Error('No avatar');
                    }
                })
                .then(blob => {
                    const url = URL.createObjectURL(blob);
                    chatAvatar.style.backgroundImage = `url('${url}')`;
                    chatAvatar.style.backgroundSize = 'cover';
                    chatAvatar.style.backgroundPosition = 'center';
                    chatAvatar.style.color = 'transparent';
                    chatAvatar.textContent = '';
                })
                .catch(() => {
                    chatAvatar.style.backgroundImage = '';
                    chatAvatar.style.color = '';
                    chatAvatar.textContent = username[0].toUpperCase();
                });
        }

        markMessagesAsRead(userId);
        setTimeout(scrollToBottom, 100);
        setTimeout(() => {
            setupLongPressOnMessages();
        }, 200);
        
    } catch (error) {
        console.error('❌ Ошибка открытия чата:', error);
        alert('Не удалось загрузить чат. Ошибка: ' + error.message);
    }
}

// Функции для меню чата
function toggleChatMenu() {
    const menu = document.getElementById('chat-menu-dropdown');
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
}

// Очистить чат (удалить все сообщения, НО ЧАТ ОСТАЕТСЯ)
async function clearChat(userId, username) {
    if (!confirm(`Очистить всю переписку с ${username}? Сообщения будут удалены, но чат останется в списке.`)) {
        return;
    }
    
    try {
        const response = await fetch(`${SERVER_URL}/api/messages/clear/${currentUser.id}/${userId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert(`✅ Чат очищен. Удалено ${data.deleted} сообщений.`);
            
            // Отправляем уведомление собеседнику
            socket.emit('chat_cleared', {
                userId: currentUser.id,
                contactId: userId
            });
            
            // Перезагружаем текущий чат (он станет пустым)
            openChat(userId, username);
        } else {
            alert('❌ Ошибка: ' + data.error);
        }
    } catch (error) {
        console.error('Error clearing chat:', error);
        alert('Ошибка при очистке чата');
    }
}

// Удалить чат полностью
async function deleteChat(userId, username) {
    if (!confirm(`Удалить чат с ${username}? Все сообщения будут удалены, и чат исчезнет из списка.`)) {
        return;
    }
    
    try {
        const response = await fetch(`${SERVER_URL}/api/messages/delete-chat/${currentUser.id}/${userId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            alert(`✅ Чат с ${username} удален`);
            
            // Отправляем уведомление собеседнику
            socket.emit('chat_deleted', {
                userId: currentUser.id,
                contactId: userId
            });
            
            // Возвращаемся к списку чатов
            loadChats();
        } else {
            const data = await response.json();
            alert('❌ Ошибка: ' + data.error);
        }
    } catch (error) {
        console.error('Error deleting chat:', error);
        alert('Ошибка при удалении чата');
    }
    // Показываем плавающую кнопку перезагрузки
const fab = document.querySelector('.fab-reload');
if (fab) fab.style.display = 'flex';
}

// Закрыть меню при клике вне его
document.addEventListener('click', function(event) {
    const menu = document.getElementById('chat-menu-dropdown');
    const dots = document.querySelector('.menu-dots');
    if (menu && dots && !dots.contains(event.target) && !menu.contains(event.target)) {
        menu.style.display = 'none';
    }
});

function renderMessage(msg) {
    const isSent = msg.sender_id === currentUser.id;
    
    let timestamp = msg.timestamp;
    if (typeof timestamp === 'string') {
        timestamp = parseInt(timestamp);
    }
    
    const time = new Date(timestamp).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    let content = '';
    
    if (msg.type === 'text') {
        content = `<div class="message-content">${escapeHtml(msg.message)}</div>`;
    } 
    else if (msg.type === 'image') {
        content = `
            <div class="photo-message" onclick="openPhotoModal('${msg.message}')">
                <img src="${msg.message}" class="message-photo" loading="lazy">
            </div>
        `;
    }
    else if (msg.type === 'file') {
        const fileName = msg.fileName || 'Файл';
        const fileSize = msg.fileSize || 0;
        const fileIcon = getFileIcon(fileName);
        
        content = `
            <div class="file-message" onclick="downloadFile('${msg.message}', '${fileName}')">
                <span>${fileIcon} ${escapeHtml(fileName)}</span>
                <small>${formatFileSize(fileSize)}</small>
            </div>
        `;
    }
    else if (msg.type === 'video') {
        content = `
            <div class="video-message">
                <video controls class="message-video" preload="metadata">
                    <source src="${msg.message}" type="${msg.fileType || 'video/mp4'}">
                    Ваш браузер не поддерживает видео
                </video>
            </div>
        `;
    }
    else if (msg.type === 'audio') {
        content = `
            <div class="audio-message">
                <audio controls class="message-audio" preload="metadata">
                    <source src="${msg.message}" type="${msg.fileType || 'audio/mpeg'}">
                    Ваш браузер не поддерживает аудио
                </audio>
            </div>
        `;
    }
    else {
        content = `<div class="message-content">${escapeHtml(msg.message)}</div>`;
    }
    
    const status = msg.status === 'read' ? '✓✓' : (msg.status === 'sent' ? '✓' : '')
    
    return `
        <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${msg.id}">
        ${content}
        <div class="message-meta">
            <span class="message-time">${time}</span>
            ${isSent ? `<span class="message-status">${status}</span>` : ''}
        </div>
    </div>
`;
}

function addMessageToChat(message) {
    console.log('📨 Adding message to chat:', message);
    
    const container = document.getElementById('messages-container');
    if (!container) return;
    
    if (document.querySelector(`[data-message-id="${message.id}"]`)) return;
    
    // Создаем объект для renderMessage
    const msgForRender = {
        id: message.id,
        sender_id: message.senderId,
        receiver_id: message.receiverId,
        message: message.message,
        type: message.type || 'text',
        timestamp: message.timestamp,
        status: message.status || 'sent',
        duration: message.duration
    };
    
    const messageHtml = renderMessage(msgForRender);
    container.insertAdjacentHTML('beforeend', messageHtml);
    scrollToBottom();
    
    // ========== АВТОСОХРАНЕНИЕ ФОТО ==========
    if (message.type === 'image' && message.senderId !== currentUser.id) {
        if (typeof autoSavePhotoIfNeeded === 'function') {
            autoSavePhotoIfNeeded(message.message);
        }
    }
    
    // Отмечаем как прочитанное (только один раз!)
    if (message.senderId === currentChat?.id) {
        markMessagesAsRead(currentChat.id);
    }
}

// Отправить сообщение
function sendMessage() {
    const input = document.getElementById('message-input');
    if (!input) return;
    
    const messageText = input.value.trim();
    if (!messageText || !currentChat || !socket) return;
    
    console.log('📤 Sending message:', messageText);
    
    socket.emit('send_message', {
        senderId: currentUser.id,
        receiverId: currentChat.id,
        message: messageText,
        type: 'text'
    });
    
    input.value = '';
    
    socket.emit('typing', {
        senderId: currentUser.id,
        receiverId: currentChat.id,
        isTyping: false
    });
}

function handleTyping(event) {
    if (!socket || !currentChat) return;
    
    const isTyping = event.target.value.length > 0;

    socket.emit('typing', {
        senderId: currentUser.id,
        receiverId: currentChat.id,
        isTyping: isTyping
    });
    
    if (typingTimeout) clearTimeout(typingTimeout);
    
    if (isTyping) {
        typingTimeout = setTimeout(() => {
            socket.emit('typing', {
                senderId: currentUser.id,
                receiverId: currentChat.id,
                isTyping: false
            });
        }, 1500); // Уменьшил с 2000 до 1500
    }
}

async function markMessagesAsRead(contactId) {
    if (!currentUser || !contactId) return;
    
    try {
        await fetch(`${SERVER_URL}/api/messages/read`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                userId: currentUser.id, 
                contactId: contactId 
            })
        });
    } catch (error) {
        console.error('Error marking messages as read:', error);
    }
}

function updateMessageStatus(messageId, status) {
    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageEl) {
        const statusEl = messageEl.querySelector('.message-status');
        if (statusEl) {
            statusEl.textContent = status === 'read' ? '✓✓' : '✓';
        }
    }
}

function scrollToBottom() {
    const container = document.getElementById('messages-container');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

// Показать мини-профиль
async function showMiniProfile(userId, username) {
    try {
        const response = await fetch(`${SERVER_URL}/api/auth/${userId}`);
        const user = await response.json();
        
        const modal = document.createElement('div');
        modal.className = 'profile-modal';
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
        
        // Проверяем, есть ли аватарка
        let avatarHtml = '';
        try {
            const avatarResponse = await fetch(`${SERVER_URL}/api/avatar/${userId}`);
            if (avatarResponse.ok) {
                const avatarBlob = await avatarResponse.blob();
                const avatarUrl = URL.createObjectURL(avatarBlob);
                avatarHtml = `<div class="profile-avatar-large" style="background-image: url('${avatarUrl}'); background-size: cover; background-position: center;"></div>`;
            } else {
                avatarHtml = `<div class="profile-avatar-large">${user.username[0].toUpperCase()}</div>`;
            }
        } catch (e) {
            avatarHtml = `<div class="profile-avatar-large">${user.username[0].toUpperCase()}</div>`;
        }
        
        modal.innerHTML = `
            <div class="profile-modal-content">
                <button class="profile-modal-close" onclick="this.closest('.profile-modal').remove()">✕</button>
                ${avatarHtml}
                <div class="profile-info">
                    <h2>${user.username}</h2>
                    <p class="profile-phone">${user.phone}</p>
                    <p class="profile-status ${user.status}">
                        ${user.status === 'online' ? '🟢 в сети' : '⚪ был(а) недавно'}
                    </p>
                </div>
                <div class="profile-actions">
                    <button onclick="openChat(${user.id}, '${user.username}'); this.closest('.profile-modal').remove();">
                        💬 Написать
                    </button>
                    <button onclick="this.closest('.profile-modal').remove()">
                        ✕ Закрыть
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
    } catch (error) {
        console.error('Error loading profile:', error);
        alert('Не удалось загрузить профиль');
    }
}

// ========== ФУНКЦИИ ДЛЯ ФОТО ==========

// Выбор фото
function selectPhoto() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            await sendPhoto(file);
        }
    };
    input.click();
}

// Отправка фото (сохраняется в БД)
async function sendPhoto(file) {
    const formData = new FormData();
    formData.append('photo', file);
    
    try {
        const response = await fetch(`${SERVER_URL}/api/upload-photo`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Отправляем сообщение с ссылкой на фото из БД
            socket.emit('send_message', {
                senderId: currentUser.id,
                receiverId: currentChat.id,
                message: data.photoUrl,
                type: 'image',
                fileName: file.name,
                fileSize: file.size,
                photoId: data.photoId
            });
        } else {
            alert('❌ Ошибка при отправке фото');
        }
    } catch (error) {
        console.error('Error sending photo:', error);
        alert('Ошибка при отправке фото');
    }
}

// Открыть модальное окно с фото (с тремя точками и сохранением)
function openPhotoModal(imageUrl) {
    // Удаляем старое модальное окно
    const oldModal = document.querySelector('.photo-modal');
    if (oldModal) oldModal.remove();
    
    let currentZoom = 1;
    let translateX = 0;
    let translateY = 0;
    let isDragging = false;
    let startX, startY, startTranslateX, startTranslateY;
    
    const modal = document.createElement('div');
    modal.className = 'photo-modal';
    modal.innerHTML = `
        <div class="photo-modal-content">
            <button class="photo-modal-close" onclick="this.parentElement.parentElement.remove()">✕</button>
            <button class="photo-modal-menu" onclick="togglePhotoMenu()">⋮</button>
            <div id="photo-menu-dropdown" class="photo-menu-dropdown" style="display:none;">
                <div onclick="downloadPhoto('${imageUrl}')">💾 Сохранить в галерею</div>
            </div>
            <div class="photo-image-container">
                <img src="${imageUrl}" class="photo-modal-img" id="photo-modal-img" style="transform: scale(1) translate(0px, 0px); cursor: zoom-in;">
            </div>
        </div>
    `;
    
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
    
    document.body.appendChild(modal);
    
    const img = document.getElementById('photo-modal-img');
    
    // Зум колесиком мыши (как было)
    img.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = img.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left) / rect.width;
        const mouseY = (e.clientY - rect.top) / rect.height;
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const newZoom = Math.min(Math.max(currentZoom + delta, 1), 5);
        
        if (newZoom !== currentZoom) {
            const scaleChange = newZoom / currentZoom;
            translateX = mouseX * rect.width * (1 - scaleChange) + translateX * scaleChange;
            translateY = mouseY * rect.height * (1 - scaleChange) + translateY * scaleChange;
            currentZoom = newZoom;
            img.style.transform = `scale(${currentZoom}) translate(${translateX}px, ${translateY}px)`;
            img.style.cursor = currentZoom > 1 ? 'grab' : 'zoom-in';
        }
    });
    
    // Панорамирование (как было)
    img.addEventListener('mousedown', (e) => {
        if (currentZoom > 1) {
            e.preventDefault();
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startTranslateX = translateX;
            startTranslateY = translateY;
            img.style.cursor = 'grabbing';
        }
    });
    
    window.addEventListener('mousemove', (e) => {
        if (isDragging && currentZoom > 1) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            translateX = startTranslateX + dx;
            translateY = startTranslateY + dy;
            img.style.transform = `scale(${currentZoom}) translate(${translateX}px, ${translateY}px)`;
        }
    });
    
    window.addEventListener('mouseup', () => {
        isDragging = false;
        if (img) img.style.cursor = currentZoom > 1 ? 'grab' : 'zoom-in';
    });
    
    // Для телефона (как было)
    let initialDistance = 0;
    let initialZoom = 1;
    
    img.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            initialDistance = Math.hypot(dx, dy);
            initialZoom = currentZoom;
        } else if (e.touches.length === 1 && currentZoom > 1) {
            isDragging = true;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            startTranslateX = translateX;
            startTranslateY = translateY;
        }
    });
    
    img.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const distance = Math.hypot(dx, dy);
            const scale = distance / initialDistance;
            currentZoom = Math.min(Math.max(initialZoom * scale, 1), 5);
            img.style.transform = `scale(${currentZoom}) translate(${translateX}px, ${translateY}px)`;
        } else if (e.touches.length === 1 && isDragging && currentZoom > 1) {
            e.preventDefault();
            const dx = e.touches[0].clientX - startX;
            const dy = e.touches[0].clientY - startY;
            translateX = startTranslateX + dx;
            translateY = startTranslateY + dy;
            img.style.transform = `scale(${currentZoom}) translate(${translateX}px, ${translateY}px)`;
        }
    });
    
    img.addEventListener('touchend', () => {
        isDragging = false;
    });
}

// Переключение меню фото
function togglePhotoMenu() {
    const menu = document.getElementById('photo-menu-dropdown');
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
}

// Скачать фото (ручное сохранение)
function downloadPhoto(imageUrl) {
    savePhotoToGallery(imageUrl);
    
    // Закрываем меню
    const menu = document.getElementById('photo-menu-dropdown');
    if (menu) menu.style.display = 'none';
}

// Сохранить фото в галерею (загрузка)
async function savePhotoToGallery(imageUrl) {
    try {
        console.log('💾 Сохраняем фото:', imageUrl);
        
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const blob = await response.blob();
        
        // Создаём ссылку для скачивания
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // Извлекаем имя файла из URL
        let fileName = imageUrl.split('/').pop();
        if (!fileName.includes('.')) {
            fileName = fileName + '.jpg';
        }
        a.download = fileName;
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('✅ Фото сохранено');
        return true;
        
    } catch (error) {
        console.error('❌ Ошибка сохранения фото:', error);
        return false;
    }
}

// Проверить, нужно ли автоматически сохранять фото
async function autoSavePhotoIfNeeded(imageUrl) {
    // Проверяем настройку
    const saveToGallery = localStorage.getItem('settings_save_to_gallery') === 'true';
    
    if (saveToGallery) {
        console.log('📸 Автосохранение фото включено, сохраняем...');
        
        // Проверяем, не сохраняли ли уже это фото
        const savedPhotos = JSON.parse(localStorage.getItem('saved_photos') || '[]');
        if (savedPhotos.includes(imageUrl)) {
            console.log('⏭️ Фото уже сохранялось ранее');
            return;
        }
        
        const success = await savePhotoToGallery(imageUrl);
        if (success) {
            // Запоминаем, что фото уже сохранили
            savedPhotos.push(imageUrl);
            localStorage.setItem('saved_photos', JSON.stringify(savedPhotos.slice(-100))); // храним последние 100
            console.log('✅ Фото автоматически сохранено в галерею');
        }
    } else {
        console.log('📸 Автосохранение фото выключено');
    }
}

// ========== ПЕРЕСЫЛКА СООБЩЕНИЙ ==========

let longPressTimer = null;

// Показать меню при долгом нажатии на сообщение (позиционируется рядом с сообщением)
function showMessageMenu(messageId, messageText, messageType, fileUrl, fileName, targetElement) {
    // Удаляем старое меню
    const oldMenu = document.querySelector('.message-menu');
    if (oldMenu) oldMenu.remove();
    
    // Получаем позицию сообщения
    const rect = targetElement.getBoundingClientRect();
    const isNearBottom = rect.bottom > window.innerHeight - 150;
    const isNearRight = rect.right > window.innerWidth - 150;
    
    // Создаём меню
    const menu = document.createElement('div');
    menu.className = 'message-menu';
    
    // Позиционирование с учётом краёв экрана
    let left = rect.left + rect.width / 2;
    if (isNearRight) {
        left = rect.right - 100;
        menu.style.transform = 'translateX(0)';
    } else {
        menu.style.transform = 'translateX(-50%)';
    }
    
    if (isNearBottom) {
        menu.style.position = 'fixed';
        menu.style.bottom = `${window.innerHeight - rect.top + 10}px`;
        menu.style.left = `${left}px`;
        menu.style.top = 'auto';
    } else {
        menu.style.position = 'fixed';
        menu.style.top = `${rect.bottom + 10}px`;
        menu.style.left = `${left}px`;
    }
    
    menu.innerHTML = `
        <div class="message-menu-content">
            <div class="message-menu-item" onclick="forwardMessage(${messageId}, '${messageText.replace(/'/g, "\\'")}', '${messageType}', '${fileUrl}', '${fileName}')">
                📤 Переслать
            </div>
            <div class="message-menu-item" onclick="copyMessageText('${messageText.replace(/'/g, "\\'")}')">
                📋 Копировать текст
            </div>
            <div class="message-menu-item" onclick="deleteMessageFromChat(${messageId})">
                🗑️ Удалить
            </div>
            <div class="message-menu-close" onclick="this.parentElement.parentElement.remove()">✕</div>
        </div>
    `;
    
    document.body.appendChild(menu);
    
    // Закрыть при клике вне меню
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 100);
}

// Показать меню по ID сообщения (для кнопки)
function showMessageMenuById(messageId) {
    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageEl) return;
    
    const content = messageEl.querySelector('.message-content');
    const messageText = content ? content.textContent : '';
    const isImage = messageEl.querySelector('.photo-message') !== null;
    const isFile = messageEl.querySelector('.file-message') !== null;
    
    showMessageMenu(messageId, messageText, isImage ? 'image' : (isFile ? 'file' : 'text'), '', '', messageEl);
}
        
// Копировать текст сообщения
function copyMessageText(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('✅ Текст скопирован');
    }).catch(() => {
        alert('❌ Не удалось скопировать');
    });
    const menu = document.querySelector('.message-menu');
    if (menu) menu.remove();
}

// Переслать сообщение
async function forwardMessage(messageId, messageText, messageType, fileUrl, fileName) {
    // Закрываем меню
    const menu = document.querySelector('.message-menu');
    if (menu) menu.remove();
    
    // Получаем список чатов для выбора
    const response = await fetch(`${SERVER_URL}/api/messages/recent/${currentUser.id}`);
    const chats = await response.json();
    
    if (chats.length === 0) {
        alert('Нет чатов для пересылки');
        return;
    }
    
    // Создаём модальное окно с выбором чата
    const modal = document.createElement('div');
    modal.className = 'forward-modal';
    modal.innerHTML = `
        <div class="forward-modal-content">
            <div class="forward-modal-header">
                <h3>Переслать сообщение</h3>
                <button class="forward-modal-close" onclick="this.parentElement.parentElement.parentElement.remove()">✕</button>
            </div>
            <div class="forward-modal-list">
                ${chats.map(chat => `
                    <div class="forward-modal-item" onclick="sendForwardMessage(${messageId}, ${chat.contact_id}, '${chat.contact_name}')">
                        <div class="forward-avatar">${chat.contact_name[0].toUpperCase()}</div>
                        <div class="forward-name">${chat.contact_name}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Отправить пересланное сообщение
async function sendForwardMessage(originalMessageId, toUserId, toUsername) {
    // Закрываем модальное окно
    const modal = document.querySelector('.forward-modal');
    if (modal) modal.remove();
    
    try {
        const response = await fetch(`${SERVER_URL}/api/messages/forward`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                originalMessageId: originalMessageId,
                fromUserId: currentUser.id,
                toUserId: toUserId
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert(`✅ Сообщение переслано пользователю ${toUsername}`);
        } else {
            alert('❌ Ошибка: ' + data.error);
        }
    } catch (error) {
        console.error('Error forwarding message:', error);
        alert('Ошибка при пересылке');
    }
}

// Глобальный обработчик долгого нажатия на контейнере
function setupLongPressOnMessages() {
    const container = document.getElementById('messages-container');
    if (!container) return;
    
    let pressTimer = null;
    let targetMessage = null;
    
    // Функция начала нажатия
    function onTouchStart(e) {
        // Находим элемент сообщения (родитель с классом .message)
        targetMessage = e.target.closest('.message');
        if (!targetMessage) return;
        
        pressTimer = setTimeout(() => {
            if (targetMessage) {
                const messageId = targetMessage.dataset.messageId;
                const content = targetMessage.querySelector('.message-content');
                const messageText = content ? content.textContent : '';
                const isImage = targetMessage.querySelector('.photo-message') !== null;
                const isFile = targetMessage.querySelector('.file-message') !== null;
                
                // Показываем меню
                showMessageMenu(messageId, messageText, isImage ? 'image' : (isFile ? 'file' : 'text'), '', '', targetMessage);
            }
        }, 500);
    }
    
    function onTouchEnd() {
        clearTimeout(pressTimer);
        targetMessage = null;
    }
    
    function onTouchMove() {
        clearTimeout(pressTimer);
        targetMessage = null;
    }
    
    // Для мыши (компьютер)
    function onMouseDown(e) {
        if (e.button !== 0) return;
        targetMessage = e.target.closest('.message');
        if (!targetMessage) return;
        
        pressTimer = setTimeout(() => {
            if (targetMessage) {
                const messageId = targetMessage.dataset.messageId;
                const content = targetMessage.querySelector('.message-content');
                const messageText = content ? content.textContent : '';
                const isImage = targetMessage.querySelector('.photo-message') !== null;
                const isFile = targetMessage.querySelector('.file-message') !== null;
                
                showMessageMenu(messageId, messageText, isImage ? 'image' : (isFile ? 'file' : 'text'), '', '', targetMessage);
            }
        }, 500);
    }
    
    function onMouseUp() {
        clearTimeout(pressTimer);
        targetMessage = null;
    }
    
    // Удаляем старые обработчики
    container.removeEventListener('touchstart', onTouchStart);
    container.removeEventListener('touchend', onTouchEnd);
    container.removeEventListener('touchmove', onTouchMove);
    container.removeEventListener('mousedown', onMouseDown);
    container.removeEventListener('mouseup', onMouseUp);
    
    // Добавляем новые
    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchend', onTouchEnd);
    container.addEventListener('touchmove', onTouchMove);
    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('mouseup', onMouseUp);
    
    console.log('✅ Long press setup on messages container');
}

// Удалить сообщение из чата (только у себя)
async function deleteMessageFromChat(messageId) {
    if (!confirm('Удалить это сообщение?')) return;
    
    try {
        // Отправляем запрос на сервер
        const response = await fetch(`${SERVER_URL}/api/messages/${messageId}?userId=${currentUser.id}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            // Удаляем из DOM
            const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
            if (messageEl) {
                messageEl.remove();
            }
            alert('✅ Сообщение удалено');
        } else {
            const data = await response.json();
            alert('❌ Ошибка: ' + data.error);
        }
    } catch (error) {
        console.error('Error deleting message:', error);
        alert('Ошибка при удалении сообщения');
    }
}

// Делаем функцию глобальной
window.deleteMessageFromChat = deleteMessageFromChat;

// Делаем функции глобальными
window.forwardMessage = forwardMessage;
window.sendForwardMessage = sendForwardMessage;
window.copyMessageText = copyMessageText;
window.showMessageMenu = showMessageMenu;
window.setupLongPressOnMessages = setupLongPressOnMessages;

// ========== ГЛОБАЛЬНЫЕ ФУНКЦИИ ==========
window.openChat = openChat;
window.sendMessage = sendMessage;
window.addMessageToChat = addMessageToChat;
window.updateMessageStatus = updateMessageStatus;
window.renderMessage = renderMessage;
window.markMessagesAsRead = markMessagesAsRead;
window.handleTyping = handleTyping;
window.clearChat = clearChat;
window.deleteChat = deleteChat;
window.toggleChatMenu = toggleChatMenu;
window.showMiniProfile = showMiniProfile;
window.selectPhoto = selectPhoto;
window.openPhotoModal = openPhotoModal;
window.togglePhotoMenu = togglePhotoMenu;
window.downloadPhoto = downloadPhoto;
window.savePhotoToGallery = savePhotoToGallery;
window.autoSavePhotoIfNeeded = autoSavePhotoIfNeeded;
window.showMessageMenuById = showMessageMenuById;
