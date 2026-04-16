// ========== WebRTC ЗВОНКИ ==========

let localStream = null;
let peerConnection = null;
let currentCall = {
    type: null,
    contactId: null,
    contactName: null,
    status: null,
    incomingOffer: null,
    hasVideo: false,
    hasAudio: false
};

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

// ========== ЗАПУСК ЗВОНКА ==========

async function startCall(contactId, contactName, callType = 'audio') {
    console.log(`📞 Starting ${callType} call to ${contactName} (${contactId})`);
    
    currentCall = {
        type: callType,
        contactId: contactId,
        contactName: contactName,
        status: 'outgoing',
        hasVideo: false,
        hasAudio: false
    };
    
    showCallScreen('outgoing', contactName, callType);
    
    try {
        // Получаем медиа (то, что доступно)
        await getAvailableMedia(callType);
        
        await createPeerConnection();
        
        // Добавляем треки которые есть
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Отображаем локальное видео если есть
        updateLocalVideoDisplay();
        
        // Создаём offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        // Отправляем сигнал с информацией о доступных треках
        socket.emit('call_user', {
            to: contactId,
            from: currentUser.id,
            fromName: currentUser.username,
            callType: currentCall.type,
            hasVideo: currentCall.hasVideo,
            hasAudio: currentCall.hasAudio,
            offer: offer
        });
        
        console.log(`📤 Offer sent (video: ${currentCall.hasVideo}, audio: ${currentCall.hasAudio})`);
        
    } catch (error) {
        console.error('❌ Ошибка при запуске звонка:', error);
        
        if (!currentCall.hasAudio && !currentCall.hasVideo) {
            alert('Нет доступа ни к камере, ни к микрофону. Звонок невозможен.');
            endCall();
        }
    }
}

// Принять входящий звонок
async function acceptCall() {
    console.log('📞 Accepting call...');
    
    currentCall.status = 'connected';
    updateCallStatus('Соединение...');
    
    try {
        // Получаем доступные медиа
        await getAvailableMedia(currentCall.type);
        
        await createPeerConnection();
        
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        updateLocalVideoDisplay();
        
        if (currentCall.incomingOffer) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(currentCall.incomingOffer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            socket.emit('call_accepted', {
                to: currentCall.contactId,
                answer: answer,
                hasVideo: currentCall.hasVideo,
                hasAudio: currentCall.hasAudio
            });
        }
        
        document.getElementById('call-accept-btn').style.display = 'none';
        document.getElementById('call-decline-btn').textContent = 'Завершить';
        document.querySelector('.call-controls').style.display = 'flex';
        
        // Показываем/скрываем кнопку видео в зависимости от типа звонка
        updateControlsVisibility();
        
    } catch (error) {
        console.error('❌ Ошибка при принятии звонка:', error);
        
        if (!currentCall.hasAudio && !currentCall.hasVideo) {
            alert('Нет доступа ни к камере, ни к микрофону. Звонок невозможен.');
            endCall();
        }
    }
}

// ========== ПОЛУЧЕНИЕ ДОСТУПНЫХ МЕДИА ==========

async function getAvailableMedia(requestedType) {
    console.log(`🎥 Getting available media (requested: ${requestedType})...`);
    
    const constraints = { audio: true, video: requestedType === 'video' };
    
    try {
        // Пробуем получить всё что запрошено
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        currentCall.hasVideo = requestedType === 'video';
        currentCall.hasAudio = true;
        console.log(`✅ Got video: ${currentCall.hasVideo}, audio: ${currentCall.hasAudio}`);
        
    } catch (error) {
        console.warn('⚠️ Full media not available, trying fallbacks...');
        
        // Если запрошено видео, но не получилось — пробуем только аудио
        if (requestedType === 'video') {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
                currentCall.hasVideo = false;
                currentCall.hasAudio = true;
                currentCall.type = 'audio';
                showCallNotification('Камера недоступна, звонок только с аудио');
                console.log('✅ Fallback to audio only');
                
            } catch (audioError) {
                // Пробуем только видео (странный случай, но вдруг)
                try {
                    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                    currentCall.hasVideo = true;
                    currentCall.hasAudio = false;
                    showCallNotification('Микрофон недоступен, звонок без звука');
                    console.log('✅ Fallback to video only (no audio)');
                    
                } catch (videoError) {
                    // Ничего не доступно
                    currentCall.hasVideo = false;
                    currentCall.hasAudio = false;
                    throw new Error('NO_MEDIA_PERMISSION');
                }
            }
        } else {
            // Запрошено только аудио, но не получилось
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                currentCall.hasVideo = true;
                currentCall.hasAudio = false;
                showCallNotification('Микрофон недоступен, звонок без звука');
                console.log('✅ Fallback to video only (no audio)');
                
            } catch (videoError) {
                currentCall.hasVideo = false;
                currentCall.hasAudio = false;
                throw new Error('NO_MEDIA_PERMISSION');
            }
        }
    }
}

// ========== ПЕРЕКЛЮЧЕНИЕ ВИДЕО ВО ВРЕМЯ ЗВОНКА ==========

async function toggleVideo() {
    if (currentCall.hasVideo) {
        // Выключаем видео
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = false;
            currentCall.hasVideo = false;
            
            // Убираем локальное видео
            const localVideo = document.getElementById('local-video');
            if (localVideo) localVideo.style.display = 'none';
            
            // Уведомляем собеседника
            notifyTrackChange('video', false);
        }
        document.querySelector('.video-btn').textContent = '📷❌';
        document.querySelector('.video-btn').style.backgroundColor = '#f44336';
        
    } else {
        // Пробуем включить видео
        try {
            const newStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            const newVideoTrack = newStream.getVideoTracks()[0];
            
            if (newVideoTrack) {
                // Заменяем видео трек в peer connection
                const senders = peerConnection.getSenders();
                const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                
                if (videoSender) {
                    await videoSender.replaceTrack(newVideoTrack);
                } else {
                    peerConnection.addTrack(newVideoTrack, localStream);
                }
                
                // Добавляем в локальный стрим
                const oldVideoTrack = localStream.getVideoTracks()[0];
                if (oldVideoTrack) {
                    localStream.removeTrack(oldVideoTrack);
                    oldVideoTrack.stop();
                }
                localStream.addTrack(newVideoTrack);
                
                currentCall.hasVideo = true;
                
                // Показываем локальное видео
                const localVideo = document.getElementById('local-video');
                if (localVideo) {
                    localVideo.srcObject = localStream;
                    localVideo.style.display = 'block';
                }
                
                // Уведомляем собеседника
                notifyTrackChange('video', true);
            }
            
            document.querySelector('.video-btn').textContent = '📹';
            document.querySelector('.video-btn').style.backgroundColor = '';
            
        } catch (error) {
            console.warn('⚠️ Cannot enable video:', error);
            showCallNotification('Не удалось включить камеру');
        }
    }
}

// ========== ПЕРЕКЛЮЧЕНИЕ АУДИО ВО ВРЕМЯ ЗВОНКА ==========

function toggleMute() {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        currentCall.hasAudio = audioTrack.enabled;
        
        const btn = document.querySelector('.mute-btn');
        btn.textContent = audioTrack.enabled ? '🎤' : '🔇';
        btn.style.backgroundColor = audioTrack.enabled ? '' : '#f44336';
        
        // Уведомляем собеседника
        notifyTrackChange('audio', audioTrack.enabled);
    }
}

// Уведомить собеседника об изменении треков
function notifyTrackChange(kind, enabled) {
    socket.emit('track_changed', {
        to: currentCall.contactId,
        kind: kind,
        enabled: enabled
    });
}

// ========== PEER CONNECTION ==========

async function createPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);
    
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice_candidate', {
                to: currentCall.contactId,
                candidate: event.candidate
            });
        }
    };
    
    peerConnection.ontrack = (event) => {
        console.log(`📹 Remote ${event.track.kind} track received`);
        const remoteVideo = document.getElementById('remote-video');
        if (remoteVideo && event.track.kind === 'video') {
            remoteVideo.srcObject = event.streams[0];
            remoteVideo.style.display = 'block';
        }
    };
    
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
}

// ========== ОБНОВЛЕНИЕ ОТОБРАЖЕНИЯ ==========

function updateLocalVideoDisplay() {
    const localVideo = document.getElementById('local-video');
    if (localVideo) {
        if (currentCall.hasVideo) {
            localVideo.srcObject = localStream;
            localVideo.style.display = 'block';
        } else {
            localVideo.style.display = 'none';
        }
    }
    
    // Если нет видео, показываем аватар
    if (!currentCall.hasVideo) {
        const container = document.querySelector('.call-video-container');
        if (container && !container.querySelector('.audio-avatar')) {
            const avatar = document.createElement('div');
            avatar.className = 'audio-avatar';
            avatar.textContent = currentCall.contactName[0].toUpperCase();
            container.appendChild(avatar);
        }
    }
}

function updateControlsVisibility() {
    // Кнопка видео всегда видна, если звонок был начат как видео
    // или если мы хотим дать возможность включить видео в любой момент
    const videoBtn = document.querySelector('.video-btn');
    if (!videoBtn) {
        // Если кнопки нет, но тип звонка видео — добавляем
        const controls = document.querySelector('.call-controls');
        if (controls && currentCall.type === 'video') {
            const btn = document.createElement('button');
            btn.className = 'call-btn video-btn';
            btn.onclick = toggleVideo;
            btn.title = 'Включить/выключить камеру';
            btn.textContent = currentCall.hasVideo ? '📹' : '📷❌';
            if (!currentCall.hasVideo) btn.style.backgroundColor = '#f44336';
            
            // Вставляем после mute-btn
            const muteBtn = controls.querySelector('.mute-btn');
            if (muteBtn) {
                muteBtn.insertAdjacentElement('afterend', btn);
            } else {
                controls.insertBefore(btn, controls.firstChild);
            }
        }
    }
}

// ========== ОТКЛОНИТЬ ЗВОНОК ==========

function declineCall() {
    console.log('📞 Declining call...');
    socket.emit('call_declined', { to: currentCall.contactId });
    endCall();
}

// ========== ЗАВЕРШИТЬ ЗВОНОК ==========

function endCall() {
    console.log('📞 Ending call...');
    
    if (currentCall.status === 'outgoing' || currentCall.status === 'connected') {
        socket.emit('call_ended', { to: currentCall.contactId });
    }
    
    cleanupCall();
    hideCallScreen();
}

// ========== ОБРАБОТЧИКИ СИГНАЛОВ ==========

function setupCallHandlers() {
    if (!socket) return;
    
    socket.on('incoming_call', (data) => {
        console.log('📞 Incoming call from:', data.fromName, data);
        
        if (currentCall.status) {
            socket.emit('call_busy', { to: data.from });
            return;
        }
        
        currentCall = {
            type: data.callType,
            contactId: data.from,
            contactName: data.fromName,
            status: 'incoming',
            incomingOffer: data.offer,
            hasVideo: false,
            hasAudio: false
        };
        
        showCallScreen('incoming', data.fromName, data.callType);
        playRingtone();
    });
    
    socket.on('call_declined', () => {
        showCallNotification('Звонок отклонён');
        endCall();
    });
    
    socket.on('call_busy', () => {
        showCallNotification('Абонент занят');
        endCall();
    });
    
    socket.on('call_accepted', async (data) => {
        console.log('📞 Call accepted, remote has video:', data.hasVideo);
        
        try {
            if (data.answer && peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                currentCall.status = 'connected';
                updateCallStatus('Разговор...');
                document.querySelector('.call-controls').style.display = 'flex';
                updateControlsVisibility();
            }
        } catch (error) {
            console.error('❌ Error setting remote description:', error);
        }
    });
    
    socket.on('ice_candidate', async (data) => {
        try {
            if (data.candidate && peerConnection) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        } catch (error) {
            console.error('❌ Error adding ICE candidate:', error);
        }
    });
    
    socket.on('call_ended', () => {
        showCallNotification('Звонок завершён');
        endCall();
    });
    
    socket.on('call_failed', (data) => {
        if (data.reason === 'user_offline') {
            showCallNotification('Абонент не в сети');
        }
        endCall();
    });
    
    socket.on('track_changed', (data) => {
        console.log(`🔄 Remote ${data.kind} ${data.enabled ? 'enabled' : 'disabled'}`);
        // Просто информационно, UI обновится автоматически через ontrack
    });
}

// ========== UI ЭКРАНА ЗВОНКА ==========

function showCallScreen(type, contactName, callType) {
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
        
        <div class="call-video-container">
            <video id="remote-video" class="remote-video" autoplay playsinline></video>
            <video id="local-video" class="local-video" autoplay playsinline muted></video>
            <div class="audio-avatar">${contactName[0].toUpperCase()}</div>
        </div>
        
        <div class="call-controls" style="display: ${type === 'incoming' ? 'none' : 'flex'}">
            <button class="call-btn mute-btn" onclick="toggleMute()" title="Выключить микрофон">🎤</button>
            <button class="call-btn speaker-btn" onclick="toggleSpeaker()" title="Громкая связь">🔊</button>
        </div>
        
        <div class="call-actions">
            ${type === 'incoming' ? `
                <button class="call-decline-btn" id="call-decline-btn" onclick="declineCall()">❌ Отклонить</button>
                <button class="call-accept-btn" id="call-accept-btn" onclick="acceptCall()">✅ Принять</button>
            ` : `
                <button class="call-end-btn" onclick="endCall()">🔴 Завершить</button>
            `}
        </div>
    `;
    
    document.body.appendChild(screen);
    
    // Скрываем аватар если будет видео
    const avatar = screen.querySelector('.audio-avatar');
    const remoteVideo = screen.querySelector('#remote-video');
    
    // Наблюдаем за появлением видео
    const observer = new MutationObserver(() => {
        if (remoteVideo.srcObject) {
            avatar.style.display = 'none';
        } else {
            avatar.style.display = 'flex';
        }
    });
    
    observer.observe(remoteVideo, { attributes: true, childList: false, subtree: false });
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
    const notification = document.createElement('div');
    notification.className = 'call-notification';
    notification.textContent = text;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// ========== ГРОМКАЯ СВЯЗЬ ==========

function toggleSpeaker() {
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
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    currentCall = {
        type: null,
        contactId: null,
        contactName: null,
        status: null,
        incomingOffer: null,
        hasVideo: false,
        hasAudio: false
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
