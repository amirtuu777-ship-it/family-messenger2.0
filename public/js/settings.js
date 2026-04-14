// Настройки приложения
let appSettings = {
    notifications: {
        sound: localStorage.getItem('settings_notification_sound') !== 'false'
    },
    media: {
        saveToGallery: localStorage.getItem('settings_save_to_gallery') === 'true',
        photoQuality: localStorage.getItem('settings_photo_quality') || 'good'
    },
    appearance: {
        fontSize: localStorage.getItem('settings_font_size') || 'medium',
        accentColor: localStorage.getItem('settings_accent_color') || 'blue'
    }
};

// Применить настройки к интерфейсу
function applySettings() {
    const fontSizeMap = {
        small: '14px',
        medium: '16px',
        large: '18px'
    };
    document.documentElement.style.fontSize = fontSizeMap[appSettings.appearance.fontSize];
    
    const colorMap = {
        blue: '#4a6fa5',
        green: '#00a884',
        purple: '#9b59b6',
        orange: '#e67e22'
    };
    document.documentElement.style.setProperty('--accent', colorMap[appSettings.appearance.accentColor]);
    
    saveSettings();
}

// Сохранить настройки
function saveSettings() {
    localStorage.setItem('settings_notification_sound', appSettings.notifications.sound);
    localStorage.setItem('settings_save_to_gallery', appSettings.media.saveToGallery);
    localStorage.setItem('settings_photo_quality', appSettings.media.photoQuality);
    localStorage.setItem('settings_font_size', appSettings.appearance.fontSize);
    localStorage.setItem('settings_accent_color', appSettings.appearance.accentColor);
}

// Страница настроек
function showSettings() {
    console.log('📱 Opening settings...');
    
    if (!app || !app.innerHTML) {
        console.error('app element not found');
        return;
    }
    
    app.innerHTML = `
        <div class="chats-screen">
            <div class="header">
                <button class="back-btn" onclick="loadChats()">←</button>
                <h2>Настройки</h2>
            </div>
            <div class="settings-container">
                <!-- Уведомления -->
                <div class="settings-section">
                    <h3>Уведомления</h3>
                    <div class="settings-item">
                        <span>Звук уведомлений</span>
                        <label class="switch">
                            <input type="checkbox" ${appSettings.notifications.sound ? 'checked' : ''} onchange="toggleNotificationSound()">
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>

                <!-- Медиа -->
                <div class="settings-section">
                    <h3>Медиа</h3>
                    <div class="settings-item">
                        <span>Сохранять в галерею</span>
                        <label class="switch">
                            <input type="checkbox" ${appSettings.media.saveToGallery ? 'checked' : ''} onchange="toggleSaveToGallery()">
                            <span class="slider"></span>
                        </label>
                    </div>
                    <div class="settings-item">
                        <span>Качество фото</span>
                        <select onchange="setPhotoQuality(this.value)">
                            <option value="good" ${appSettings.media.photoQuality === 'good' ? 'selected' : ''}>Хорошее</option>
                            <option value="original" ${appSettings.media.photoQuality === 'original' ? 'selected' : ''}>Оригинал</option>
                        </select>
                    </div>
                </div>

                <!-- Оформление -->
                <div class="settings-section">
                    <h3>Оформление</h3>
                    <div class="settings-item">
                        <span>Размер шрифта</span>
                        <select onchange="setFontSize(this.value)">
                            <option value="small" ${appSettings.appearance.fontSize === 'small' ? 'selected' : ''}>Маленький</option>
                            <option value="medium" ${appSettings.appearance.fontSize === 'medium' ? 'selected' : ''}>Средний</option>
                            <option value="large" ${appSettings.appearance.fontSize === 'large' ? 'selected' : ''}>Большой</option>
                        </select>
                    </div>
                    <div class="settings-item">
                        <span>Цвет акцента</span>
                        <div class="color-picker">
                            <button class="color-btn blue ${appSettings.appearance.accentColor === 'blue' ? 'active' : ''}" onclick="setAccentColor('blue')"></button>
                            <button class="color-btn green ${appSettings.appearance.accentColor === 'green' ? 'active' : ''}" onclick="setAccentColor('green')"></button>
                            <button class="color-btn purple ${appSettings.appearance.accentColor === 'purple' ? 'active' : ''}" onclick="setAccentColor('purple')"></button>
                            <button class="color-btn orange ${appSettings.appearance.accentColor === 'orange' ? 'active' : ''}" onclick="setAccentColor('orange')"></button>
                        </div>
                    </div>
                </div>

                <button class="back-btn-settings" onclick="loadChats()">← Назад</button>
            </div>
        </div>
    `;
}

// Функции настроек
function toggleNotificationSound() {
    appSettings.notifications.sound = !appSettings.notifications.sound;
    saveSettings();
}

function toggleSaveToGallery() {
    appSettings.media.saveToGallery = !appSettings.media.saveToGallery;
    saveSettings();
    alert(`Автосохранение фото ${appSettings.media.saveToGallery ? 'включено' : 'выключено'}`);
}

function setPhotoQuality(value) {
    appSettings.media.photoQuality = value;
    saveSettings();
}

function setFontSize(value) {
    appSettings.appearance.fontSize = value;
    applySettings();
    showSettings();
}

function setAccentColor(value) {
    appSettings.appearance.accentColor = value;
    applySettings();
    showSettings();
}

// Применяем настройки
applySettings();

// Делаем функции глобальными
window.showSettings = showSettings;
window.toggleNotificationSound = toggleNotificationSound;
window.toggleSaveToGallery = toggleSaveToGallery;
window.setPhotoQuality = setPhotoQuality;
window.setFontSize = setFontSize;
window.setAccentColor = setAccentColor;

console.log('✅ Settings loaded, showSettings is', typeof window.showSettings);
