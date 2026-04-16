// ========== WebRTC ЗВОНКИ ==========

// Глобальные переменные для звонка
let localStream = null;
let peerConnection = null;
let currentCall = {
    type: null, // 'audio' или 'video'
    contactId: null,
    contactName: null,
    status: null, // 'incoming', 'outgoing', 'connected', 'ended'
    incomingOffer: null
};

// STUN сервера для WebRTC
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

// ========== ЗАПУСК ЗВОНКА ==========

// Исходящий звонок
async function startCall(contactId, contactName, callType = 'audio') {
    console.log(`📞 Starting ${callType} call to ${contactName} (${contactId})`);
    
    currentCall = {
        type: callType,
        contactId: contactId,
        contactName: contactName,
        status: 'outgoing'
    };
    
    // Показываем экран звонка
    showCallScreen('outgoing', contactName, callType);
    
    try {
        // Запрашиваем доступ к медиа
        const constraints = {
            audio: true,
            video: callType === 'video'
        };
        
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Создаём peer connection
        await createPeerConnection();
        
        // Добавляем локальные треки
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Отображаем локальное видео
        const localVideo = document.getElementById('local-video');
        if (localVideo && callType === 'video') {
            localVideo.srcObject = localStream;
        }
        
        // Создаём offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        // Отправляем сигнал собеседнику
        socket.emit('call_user', {
            to: contactId,
            from: currentUser.id,
            fromName: currentUser.username,
            callType: callType,
            offer: offer
        });
        
        console.log('📤 Offer sent, waiting for answer...');
        
    } catch (error) {
        console.error('❌ Ошибка при запуске звонка:', error);
        alert('Не удалось получить доступ к камере/микрофону');
        endCall();
    }
}

// Принять входящий звонок
async function acceptCall() {
    console.log('📞 Accepting call...');
    
    currentCall.status = 'connected';
    updateCallStatus('Соединение...');
    
    try {
        // Запрашиваем медиа
        const constraints = {
            audio: true,
            video: currentCall.type === 'video'
        };
        
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Создаём peer connection
        await createPeerConnection();
        
        // Добавляем треки
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Отображаем локальное видео
        const localVideo = document.getElementById('local-video');
        if (localVideo && currentCall.type === 'video') {
            localVideo.srcObject = localStream;
        }
        
        // Устанавливаем удалённый offer
        if (currentCall.incomingOffer) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(currentCall.incomingOffer));
            
            // Создаём answer
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            // Отправляем answer
            socket.emit('call_accepted', {
                to: currentCall.contactId,
                answer: answer
            });
            
            console.log('📤 Answer sent');
        }
        
        // Меняем UI
        document.getElementById('call-accept-btn').style.display = 'none';
        document.getElementById('call-decline-btn').textContent = 'Завершить';
        document.querySelector('.call-controls').style.display = 'flex';
        
    } catch (error) {
        console.error('❌ Ошибка при принятии звонка:', error);
        alert('Не удалось получить доступ к камере/микрофону');
        endCall();
    }
}

// Отклонить звонок
function declineCall() {
    console.log('📞 Declining call...');
    
    socket.emit('call_declined', {
        to: currentCall.contactId,
        from: currentUser.id
    });
    
    endCall();
}

// Завершить звонок
function endCall() {
    console.log('📞 Ending call...');
    
    if (currentCall.status === 'outgoing' || currentCall.status === 'connected') {
        socket.emit('call_ended', {
            to: currentCall.contactId
        });
    }
    
    cleanupCall();
    hideCallScreen();
}

// ========== PEER CONNECTION ==========

async function createPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);
    
    // Обработка ICE кандидатов
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice_candidate', {
                to: currentCall.contactId,
                candidate: event.candidate
            });
        }
    };
    
    // Обработка входящих треков (видео/аудио собеседника)
    peerConnection.ontrack = (event) => {
        console.log('📹 Remote track received');
        const remoteVideo = document.getElementById('remote-video');
        if (remoteVideo) {
            remoteVideo.srcObject = event.streams[0];
        }
    };
    
    // Обработка состояния соединения
    peerConnection.onconnectionstatechange = () => {
        console.log('🔌 Connection state:', peerConnection.connectionState);
        
        if (peerConnection.connectionState === 'connected') {
            currentCall.status = 'connected';
            updateCallStatus('Разговор...');
        } else if (peerConnection.connectionState === 'disconnected' || 
                   peerConnection.connectionState === 'failed') {
            endCall();
        }
    };
    
    // Обработка ICE состояния
    peerConnection.oniceconnectionstatechange = () => {
        console.log('🧊 ICE state:', peerConnection.iceConnectionState);
    };
}

// ========== ОБРАБОТЧИКИ СИГНАЛОВ ОТ СЕРВЕРА ==========

function setupCallHandlers() {
    if (!socket) return;
    
    // Входящий звонок
    socket.on('incoming_call', (data) => {
        console.log('📞 Incoming call from:', data.fromName);
        
        // Проверяем, не в звонке ли уже
        if (currentCall.status) {
            socket.emit('call_busy', { to: data.from });
            return;
        }
        
        currentCall = {
            type: data.callType,
            contactId: data.from,
            contactName: data.fromName,
            status: 'incoming',
            incomingOffer: data.offer
        };
        
        showCallScreen('incoming', data.fromName, data.callType);
        playRingtone();
    });
    
    // Звонок отклонён
    socket.on('call_declined', (data) => {
        console.log('📞 Call declined');
        showCallNotification('Звонок отклонён');
        endCall();
    });
    
    // Абонент занят
    socket.on('call_busy', () => {
        showCallNotification('Абонент занят');
        endCall();
    });
    
    // Звонок принят
    socket.on('call_accepted', async (data) => {
        console.log('📞 Call accepted, setting remote description');
        
        try {
            if (data.answer && peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                currentCall.status = 'connected';
                updateCallStatus('Разговор...');
                document.querySelector('.call-controls').style.display = 'flex';
            }
        } catch (error) {
            console.error('❌ Error setting remote description:', error);
        }
    });
    
    // ICE кандидат
    socket.on('ice_candidate', async (data) => {
        try {
            if (data.candidate && peerConnection) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        } catch (error) {
            console.error('❌ Error adding ICE candidate:', error);
        }
    });
    
    // Звонок завершён собеседником
    socket.on('call_ended', () => {
        console.log('📞 Call ended by remote');
        showCallNotification('Звонок завершён');
        endCall();
    });
}

// ========== UI ЭКРАНА ЗВОНКА ==========

function showCallScreen(type, contactName, callType) {
    // Удаляем старый экран если есть
    const oldScreen = document.getElementById('call-screen');
    if (oldScreen) oldScreen.remove();
    
    const screen = document.createElement('div');
    screen.id = 'call-screen';
    screen.className = 'call-screen';
    
    screen.innerHTML = `
        <div class="call-header">
            <div class="call-contact-name">${escapeHtml(contactName)}</div>
            <div class="call-status" id="call-status">
                ${type === 'outgoing' ? 'Вызов...' : 'Входящий звонок...'}
            </div>
        </div>
        
        <div class="call-video-container ${callType === 'video' ? '' : 'audio-only'}">
            <video id="remote-video" class="remote-video" autoplay playsinline></video>
            <video id="local-video" class="local-video" autoplay playsinline muted></video>
            ${callType === 'audio' ? '<div class="audio-avatar">' + contactName[0].toUpperCase() + '</div>' : ''}
        </div>
        
        <div class="call-controls" style="display: ${type === 'incoming' ? 'none' : 'flex'}">
            <button class="call-btn mute-btn" onclick="toggleMute()" title="Выключить микрофон">
                🎤
            </button>
            ${callType === 'video' ? `
                <button class="call-btn video-btn" onclick="toggleVideo()" title="Выключить камеру">
                    📹
                </button>
            ` : ''}
            <button class="call-btn speaker-btn" onclick="toggleSpeaker()" title="Громкая связь">
                🔊
            </button>
        </div>
        
        <div class="call-actions">
            ${type === 'incoming' ? `
                <button class="call-decline-btn" id="call-decline-btn" onclick="declineCall()">
                    ❌ Отклонить
                </button>
                <button class="call-accept-btn" id="call-accept-btn" onclick="acceptCall()">
                    ✅ Принять
                </button>
            ` : `
                <button class="call-end-btn" onclick="endCall()">
                    🔴 Завершить
                </button>
            `}
        </div>
    `;
    
    document.body.appendChild(screen);
}

function hideCallScreen() {
    const screen = document.getElementById('call-screen');
    if (screen) screen.remove();
    stopRingtone();
}

function updateCallStatus(text) {
    const statusEl = document.getElementById('call-status');
    if (statusEl) statusEl.textContent = text;
}

function showCallNotification(text) {
    // Показываем всплывающее уведомление
    const notification = document.createElement('div');
    notification.className = 'call-notification';
    notification.textContent = text;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.remove(), 3000);
}

// ========== УПРАВЛЕНИЕ ВО ВРЕМЯ ЗВОНКА ==========

function toggleMute() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            const btn = document.querySelector('.mute-btn');
            btn.textContent = audioTrack.enabled ? '🎤' : '🔇';
            btn.style.backgroundColor = audioTrack.enabled ? '' : '#f44336';
        }
    }
}

function toggleVideo() {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            const btn = document.querySelector('.video-btn');
            btn.textContent = videoTrack.enabled ? '📹' : '📷❌';
            btn.style.backgroundColor = videoTrack.enabled ? '' : '#f44336';
        }
    }
}

function toggleSpeaker() {
    const remoteVideo = document.getElementById('remote-video');
    if (remoteVideo) {
        // На мобильных устройствах это не всегда работает, но попробуем
        if (typeof remoteVideo.setSinkId === 'function') {
            // Можно переключить на динамик
        }
    }
    // Для большинства браузеров громкая связь по умолчанию
    const btn = document.querySelector('.speaker-btn');
    btn.textContent = btn.textContent === '🔊' ? '📢' : '🔊';
}

// ========== ЗВУК ВЫЗОВА ==========

let ringtoneAudio = null;

function playRingtone() {
    try {
        ringtoneAudio = new Audio('/sounds/ringtone.mp3');
        ringtoneAudio.loop = true;
        ringtoneAudio.play().catch(e => console.log('Автовоспроизведение заблокировано'));
    } catch (e) {}
}

function stopRingtone() {
    if (ringtoneAudio) {
        ringtoneAudio.pause();
        ringtoneAudio = null;
    }
}

// ========== ОЧИСТКА ==========

function cleanupCall() {
    // Останавливаем локальный стрим
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    // Закрываем peer connection
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    // Сбрасываем состояние
    currentCall = {
        type: null,
        contactId: null,
        contactName: null,
        status: null,
        incomingOffer: null
    };
    
    stopRingtone();
}

// ========== ЭКСПОРТ ==========

window.startCall = startCall;
window.acceptCall = acceptCall;
window.declineCall = declineCall;
window.endCall = endCall;
window.toggleMute = toggleMute;
window.toggleVideo = toggleVideo;
window.toggleSpeaker = toggleSpeaker;
window.setupCallHandlers = setupCallHandlers;
window.cleanupCall = cleanupCall;
