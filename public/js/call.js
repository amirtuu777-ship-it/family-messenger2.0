// ========== WebRTC ЗВОНКИ ==========

let localStream = null;
let peerConnection = null;
let currentCall = {
    type: null,
    contactId: null,
    contactName: null,
    status: null,
    incomingOffer: null
};

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
    ]
};

// ========== ЗАПУСК ЗВОНКА ==========

async function startCall(contactId, contactName, callType = 'audio') {
    console.log(`📞 Starting ${callType} call to ${contactName} (${contactId})`);
    
    // Проверяем, что текущий пользователь есть
    if (!currentUser || !currentUser.id) {
        alert('Ошибка: пользователь не авторизован');
        return;
    }
    
    currentCall = {
        type: callType,
        contactId: contactId,
        contactName: contactName,
        status: 'outgoing'
    };
    
    showCallScreen('outgoing', contactName, callType);
    
    try {
        const constraints = {
            audio: true,
            video: callType === 'video'
        };
        
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('✅ Local stream obtained');
        
        await createPeerConnection();
        
        localStream.getTracks().forEach(track => {
            console.log(`➕ Adding ${track.kind} track`);
            peerConnection.addTrack(track, localStream);
        });
        
        if (callType === 'video') {
            const localVideo = document.getElementById('local-video');
            if (localVideo) localVideo.srcObject = localStream;
        }
        
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        await peerConnection.setLocalDescription(offer);
        
        console.log('📤 Sending offer to server');
        
        socket.emit('call_user', {
            to: contactId,
            from: currentUser.id,
            fromName: currentUser.username,
            callType: callType,
            offer: offer
        });
        
    } catch (error) {
        console.error('❌ Call error:', error);
        if (error.name === 'NotAllowedError') {
            alert('Нет доступа к камере/микрофону');
        } else {
            alert('Не удалось начать звонок: ' + error.message);
        }
        endCall();
    }
}

// ========== ПРИНЯТЬ ЗВОНОК ==========

async function acceptCall() {
    console.log('📞 Accepting call, incoming offer:', !!currentCall.incomingOffer);
    
    if (!currentCall.incomingOffer) {
        console.error('❌ No incoming offer!');
        alert('Ошибка: нет входящего звонка');
        endCall();
        return;
    }
    
    currentCall.status = 'connected';
    updateCallStatus('Соединение...');
    
    // Сразу меняем кнопки
    const acceptBtn = document.getElementById('call-accept-btn');
    const declineBtn = document.getElementById('call-decline-btn');
    const controls = document.querySelector('.call-controls');
    
    if (acceptBtn) acceptBtn.style.display = 'none';
    if (declineBtn) declineBtn.textContent = 'Завершить';
    if (controls) controls.style.display = 'flex';
    
    try {
        const constraints = {
            audio: true,
            video: currentCall.type === 'video'
        };
        
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('✅ Local stream obtained');
        
        await createPeerConnection();
        
        localStream.getTracks().forEach(track => {
            console.log(`➕ Adding ${track.kind} track`);
            peerConnection.addTrack(track, localStream);
        });
        
        if (currentCall.type === 'video') {
            const localVideo = document.getElementById('local-video');
            if (localVideo) localVideo.srcObject = localStream;
        }
        
        console.log('📥 Setting remote description...');
        await peerConnection.setRemoteDescription(new RTCSessionDescription(currentCall.incomingOffer));
        
        console.log('📤 Creating answer...');
        const answer = await peerConnection.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        await peerConnection.setLocalDescription(answer);
        
        console.log('📤 Sending answer to server');
        
        socket.emit('call_accepted', {
            to: currentCall.contactId,
            answer: answer
        });
        
    } catch (error) {
        console.error('❌ Accept error:', error);
        alert('Не удалось принять звонок: ' + error.message);
        endCall();
    }
}

// ========== ОТКЛОНИТЬ ==========

function declineCall() {
    console.log('📞 Declining call');
    socket.emit('call_declined', { to: currentCall.contactId });
    endCall();
}

// ========== ЗАВЕРШИТЬ ==========

function endCall() {
    console.log('📞 Ending call');
    if (currentCall.status) {
        socket.emit('call_ended', { to: currentCall.contactId });
    }
    cleanupCall();
    hideCallScreen();
}

// ========== PEER CONNECTION ==========

async function createPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);
    
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('🧊 Sending ICE candidate');
            socket.emit('ice_candidate', {
                to: currentCall.contactId,
                candidate: event.candidate
            });
        }
    };
    
    peerConnection.oniceconnectionstatechange = () => {
        console.log('🧊 ICE state:', peerConnection.iceConnectionState);
    };
    
    peerConnection.ontrack = (event) => {
        console.log('📹 Remote track received:', event.track.kind, 'streams:', event.streams.length);
        const remoteVideo = document.getElementById('remote-video');
        if (remoteVideo && event.streams.length > 0) {
            remoteVideo.srcObject = event.streams[0];
            // Принудительно запускаем воспроизведение
            remoteVideo.play().catch(e => console.warn('Play failed:', e));
        }
    };
    
    peerConnection.onconnectionstatechange = () => {
        console.log('🔌 Connection state:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
            currentCall.status = 'connected';
            updateCallStatus('Разговор...');
        } else if (peerConnection.connectionState === 'disconnected' || 
                   peerConnection.connectionState === 'failed') {
            console.log('⚠️ Connection lost');
            // Не завершаем сразу, может переподключиться
        }
    };
}

// ========== УПРАВЛЕНИЕ ==========

function toggleMute() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            const btn = document.querySelector('.mute-btn');
            if (btn) {
                btn.textContent = audioTrack.enabled ? '🎤' : '🔇';
                btn.style.backgroundColor = audioTrack.enabled ? '' : '#f44336';
            }
        }
    }
}

function toggleVideo() {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            const btn = document.querySelector('.video-btn');
            const localVideo = document.getElementById('local-video');
            if (btn) {
                btn.textContent = videoTrack.enabled ? '📹' : '📷❌';
                btn.style.backgroundColor = videoTrack.enabled ? '' : '#f44336';
            }
            if (localVideo) {
                localVideo.style.display = videoTrack.enabled ? 'block' : 'none';
            }
        }
    }
}

function toggleSpeaker() {
    const btn = document.querySelector('.speaker-btn');
    if (btn) {
        btn.textContent = btn.textContent === '🔊' ? '📢' : '🔊';
    }
}

// ========== UI ==========

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
        
        <div class="call-video-container ${callType === 'audio' ? 'audio-only' : ''}">
            <video id="remote-video" class="remote-video" autoplay playsinline></video>
            <video id="local-video" class="local-video" autoplay playsinline muted></video>
            ${callType === 'audio' ? `<div class="audio-avatar">${contactName[0].toUpperCase()}</div>` : ''}
        </div>
        
        <div class="call-controls" style="display: ${type === 'incoming' ? 'none' : 'flex'}">
            <button class="call-btn mute-btn" onclick="toggleMute()">🎤</button>
            ${callType === 'video' ? `<button class="call-btn video-btn" onclick="toggleVideo()">📹</button>` : ''}
            <button class="call-btn speaker-btn" onclick="toggleSpeaker()">🔊</button>
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
}

function updateCallStatus(text) {
    const el = document.getElementById('call-status');
    if (el) el.textContent = text;
}

// ========== ОБРАБОТЧИКИ СИГНАЛОВ ==========

function setupCallHandlers() {
    if (!socket) {
        console.error('❌ Socket not available for call handlers');
        return;
    }
    
    console.log('✅ Setting up call handlers');
    
    socket.on('incoming_call', (data) => {
        console.log('📞 Incoming call from:', data.fromName, 'type:', data.callType);
        
        if (currentCall.status) {
            console.log('⚠️ Already in call, sending busy');
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
    });
    
    socket.on('call_accepted', async (data) => {
        console.log('✅ Call accepted, setting remote description');
        if (data.answer && peerConnection) {
            try {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                currentCall.status = 'connected';
                updateCallStatus('Разговор...');
                const controls = document.querySelector('.call-controls');
                if (controls) controls.style.display = 'flex';
            } catch (error) {
                console.error('❌ Error setting remote description:', error);
            }
        }
    });
    
    socket.on('call_declined', () => {
        console.log('❌ Call declined');
        alert('Звонок отклонён');
        endCall();
    });
    
    socket.on('call_busy', () => {
        console.log('⚠️ User busy');
        alert('Абонент занят');
        endCall();
    });
    
    socket.on('call_ended', () => {
        console.log('🔚 Call ended by remote');
        alert('Звонок завершён');
        endCall();
    });
    
    socket.on('call_failed', (data) => {
        console.log('❌ Call failed:', data.reason);
        if (data.reason === 'user_offline') {
            alert('Абонент не в сети');
        }
        endCall();
    });
    
    socket.on('ice_candidate', async (data) => {
        if (data.candidate && peerConnection) {
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (e) {
                console.warn('ICE candidate error:', e);
            }
        }
    });
}

// ========== ОЧИСТКА ==========

function cleanupCall() {
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
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
        incomingOffer: null
    };
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
