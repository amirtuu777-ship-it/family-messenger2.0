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
        {
            urls: 'turn:global.relay.metered.ca:80',
            username: 'c9cf9f9b9c9d9e9f',
            credential: 'a9b9c9d9e9f9a9b9'
        },
        {
            urls: 'turn:global.relay.metered.ca:443',
            username: 'c9cf9f9b9c9d9e9f',
            credential: 'a9b9c9d9e9f9a9b9'
        }
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
        // Получаем медиа
        await getAvailableMedia(callType);
        
        // Создаём peer connection
        await createPeerConnection();
        
        // Добавляем ВСЕ треки из localStream
        localStream.getTracks().forEach(track => {
            console.log(`➕ Adding local ${track.kind} track to peer connection`);
            peerConnection.addTrack(track, localStream);
        });
        
        // Отображаем локальное видео если есть
        updateLocalVideoDisplay();
        
        // Создаём offer с правильными настройками
        const offerOptions = {
            offerToReceiveAudio: true,
            offerToReceiveVideo: true  // ВСЕГДА true, чтобы получать видео от собеседника
        };
        
        const offer = await peerConnection.createOffer(offerOptions);
        await peerConnection.setLocalDescription(offer);
        
        console.log(`📤 Created offer:`, {
            video: currentCall.hasVideo,
            audio: currentCall.hasAudio,
            sdp: offer.sdp.substring(0, 100) + '...'
        });
        
        // Отправляем сигнал
        socket.emit('call_user', {
            to: contactId,
            from: currentUser.id,
            fromName: currentUser.username,
            callType: currentCall.type,
            hasVideo: currentCall.hasVideo,
            hasAudio: currentCall.hasAudio,
            offer: offer
        });
        
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
        // Получаем медиа
        await getAvailableMedia(currentCall.type);
        
        // Создаём peer connection
        await createPeerConnection();
        
        // Добавляем ВСЕ треки
        localStream.getTracks().forEach(track => {
            console.log(`➕ Adding local ${track.kind} track to peer connection`);
            peerConnection.addTrack(track, localStream);
        });
        
        updateLocalVideoDisplay();
        
        // Устанавливаем remote description
        if (currentCall.incomingOffer) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(currentCall.incomingOffer));
            
            // Создаём answer с правильными настройками
            const answerOptions = {
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            };
            
            const answer = await peerConnection.createAnswer(answerOptions);
            await peerConnection.setLocalDescription(answer);
            
            console.log(`📤 Created answer:`, {
                video: currentCall.hasVideo,
                audio: currentCall.hasAudio
            });
            
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
    console.log(`🎥 Getting media (requested: ${requestedType})...`);
    
    // ВСЕГДА запрашиваем аудио
    const constraints = {
        audio: true,
        video: requestedType === 'video'
    };
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        currentCall.hasVideo = requestedType === 'video';
        currentCall.hasAudio = true;
        console.log(`✅ Got video: ${currentCall.hasVideo}, audio: ${currentCall.hasAudio}`);
        
    } catch (error) {
        console.warn('⚠️ Requested media not available:', error);
        
        // Если запрошено видео, но не получилось — пробуем только аудио
        if (requestedType === 'video') {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ 
                    video: false, 
                    audio: true 
                });
                currentCall.hasVideo = false;
                currentCall.hasAudio = true;
                currentCall.type = 'audio';
                showCallNotification('Камера недоступна, звонок только с аудио');
                console.log('✅ Fallback to audio only');
                
            } catch (audioError) {
                console.error('❌ Audio also not available:', audioError);
                currentCall.hasVideo = false;
                currentCall.hasAudio = false;
                throw new Error('NO_MEDIA_PERMISSION');
            }
        } else {
            // Запрошено только аудио, но не получилось
            console.error('❌ Audio not available:', error);
            currentCall.hasVideo = false;
            currentCall.hasAudio = false;
            throw new Error('NO_MEDIA_PERMISSION');
        }
    }
}

// ========== ПЕРЕКЛЮЧЕНИЕ ВИДЕО ==========

async function toggleVideo() {
    console.log(`🎥 Toggle video (current: ${currentCall.hasVideo})`);
    
    if (currentCall.hasVideo) {
        // Выключаем видео
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = false;
            currentCall.hasVideo = false;
            
            const localVideo = document.getElementById('local-video');
            if (localVideo) localVideo.style.display = 'none';
            
            // Показываем аватар
            showAvatar();
        }
        document.querySelector('.video-btn').textContent = '📷❌';
        document.querySelector('.video-btn').style.backgroundColor = '#f44336';
        
    } else {
        // Пробуем включить видео
        try {
            const newStream = await navigator.mediaDevices.getUserMedia({ 
                video: true, 
                audio: false 
            });
            const newVideoTrack = newStream.getVideoTracks()[0];
            
            if (newVideoTrack) {
                // Заменяем или добавляем видео трек
                const senders = peerConnection.getSenders();
                const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                
                if (videoSender) {
                    await videoSender.replaceTrack(newVideoTrack);
                } else {
                    peerConnection.addTrack(newVideoTrack, localStream);
                }
                
                // Обновляем локальный стрим
                const oldVideoTrack = localStream.getVideoTracks()[0];
                if (oldVideoTrack) {
                    localStream.removeTrack(oldVideoTrack);
                    oldVideoTrack.stop();
                }
                localStream.addTrack(newVideoTrack);
                
                currentCall.hasVideo = true;
                
                const localVideo = document.getElementById('local-video');
                if (localVideo) {
                    localVideo.srcObject = localStream;
                    localVideo.style.display = 'block';
                }
                
                // Скрываем аватар
                hideAvatar();
                
                // Пересоздаём offer для синхронизации
                await renegotiate();
            }
            
            document.querySelector('.video-btn').textContent = '📹';
            document.querySelector('.video-btn').style.backgroundColor = '';
            
        } catch (error) {
            console.warn('⚠️ Cannot enable video:', error);
            showCallNotification('Не удалось включить камеру');
        }
    }
}

// Пересогласование соединения
async function renegotiate() {
    try {
        const offerOptions = {
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        };
        
        const offer = await peerConnection.createOffer(offerOptions);
        await peerConnection.setLocalDescription(offer);
        
        socket.emit('call_renegotiate', {
            to: currentCall.contactId,
            offer: offer
        });
        
    } catch (error) {
        console.error('❌ Renegotiation failed:', error);
    }
}

// ========== ПЕРЕКЛЮЧЕНИЕ АУДИО ==========

function toggleMute() {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        currentCall.hasAudio = audioTrack.enabled;
        
        const btn = document.querySelector('.mute-btn');
        btn.textContent = audioTrack.enabled ? '🎤' : '🔇';
        btn.style.backgroundColor = audioTrack.enabled ? '' : '#f44336';
    }
}

// ========== УПРАВЛЕНИЕ АВАТАРОМ ==========

function showAvatar() {
    const container = document.querySelector('.call-video-container');
    const avatar = container.querySelector('.audio-avatar');
    if (avatar) avatar.style.display = 'flex';
}

function hideAvatar() {
    const container = document.querySelector('.call-video-container');
    const avatar = container.querySelector('.audio-avatar');
    if (avatar) avatar.style.display = 'none';
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
        console.log(`📹 Remote ${event.track.kind} track received, streams:`, event.streams.length);
        
        if (event.track.kind === 'video') {
            const remoteVideo = document.getElementById('remote-video');
            if (remoteVideo) {
                remoteVideo.srcObject = event.streams[0];
                remoteVideo.style.display = 'block';
                hideAvatar();
                
                // ВАЖНО: принудительно запускаем воспроизведение
                remoteVideo.play().catch(e => console.warn('Play failed:', e));
            }
        } else if (event.track.kind === 'audio') {
            // Аудио автоматически воспроизводится через srcObject видео элемента
            const remoteVideo = document.getElementById('remote-video');
            if (remoteVideo && !remoteVideo.srcObject) {
                remoteVideo.srcObject = event.streams[0];
            }
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
    
    peerConnection.oniceconnectionstatechange = () => {
        console.log('🧊 ICE state:', peerConnection.iceConnectionState);
    };
}

// ========== ОБНОВЛЕНИЕ ОТОБРАЖЕНИЯ ==========

function updateLocalVideoDisplay() {
    const localVideo = document.getElementById('local-video');
    const avatar = document.querySelector('.audio-avatar');
    
    if (localVideo) {
        if (currentCall.hasVideo) {
            localVideo.srcObject = localStream;
            localVideo.style.display = 'block';
            if (avatar) avatar.style.display = 'none';
        } else {
            localVideo.style.display = 'none';
            if (avatar) avatar.style.display = 'flex';
        }
    }
}

function updateControlsVisibility() {
    const controls = document.querySelector('.call-controls');
    if (!controls) return;
    
    // Проверяем, есть ли уже кнопка видео
    let videoBtn = controls.querySelector('.video-btn');
    
    // Если тип звонка видео, но кнопки нет — добавляем
    if (currentCall.type === 'video' && !videoBtn) {
        videoBtn = document.createElement('button');
        videoBtn.className = 'call-btn video-btn';
        videoBtn.onclick = toggleVideo;
        videoBtn.title = 'Включить/выключить камеру';
        videoBtn.textContent = currentCall.hasVideo ? '📹' : '📷❌';
        if (!currentCall.hasVideo) videoBtn.style.backgroundColor = '#f44336';
        
        // Вставляем после mute-btn
        const muteBtn = controls.querySelector('.mute-btn');
        if (muteBtn) {
            muteBtn.insertAdjacentElement('afterend', videoBtn);
        } else {
            controls.appendChild(videoBtn);
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
    
    socket.on('call_renegotiate', async (data) => {
        try {
            if (data.offer && peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
                
                const answerOptions = {
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true
                };
                
                const answer = await peerConnection.createAnswer(answerOptions);
                await peerConnection.setLocalDescription(answer);
                
                socket.emit('call_renegotiate_answer', {
                    to: currentCall.contactId,
                    answer: answer
                });
            }
        } catch (error) {
            console.error('❌ Renegotiation error:', error);
        }
    });
    
    socket.on('call_renegotiate_answer', async (data) => {
        try {
            if (data.answer && peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            }
        } catch (error) {
            console.error('❌ Error setting renegotiation answer:', error);
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
