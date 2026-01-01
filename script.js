// --- КОНФИГУРАЦИЯ ---
const peer = new Peer(); // Инициализация PeerJS
let myId = null;
let currentConn = null; // Для чата
let currentCall = null; // Для видео
let localStream = null;
let screenStream = null;
let isMuted = false;

// Настройки для чистого звука
const mediaConstraints = {
    video: { width: 1280, height: 720 }, // HD качество
    audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
    }
};

// --- DOM ЭЛЕМЕНТЫ ---
const ui = {
    myId: document.getElementById('myIdDisplay'),
    friendInput: document.getElementById('friendIdInput'),
    connStatus: document.getElementById('connStatus'),
    msgsArea: document.getElementById('messagesArea'),
    msgInput: document.getElementById('msgInput'),
    typing: document.getElementById('typingIndicator'),
    callOverlay: document.getElementById('callOverlay'),
    remoteVideo: document.getElementById('remoteVideo'),
    localVideo: document.getElementById('localVideo'),
    incomingModal: document.getElementById('incomingCallModal'),
    qualityBadge: document.getElementById('callQualityBadge')
};

// --- 1. СЕТЬ И ИДЕНТИФИКАЦИЯ ---

peer.on('open', (id) => {
    myId = id;
    ui.myId.innerText = id;
    showToast("Вы в сети! ID получен.");
});

peer.on('error', (err) => {
    console.error(err);
    showToast("Ошибка сети: " + err.type);
});

// Копирование ID
ui.myId.onclick = () => {
    navigator.clipboard.writeText(myId).then(() => {
        showToast("ID скопирован в буфер обмена!");
    }).catch(() => showToast("Не удалось скопировать (нужен HTTPS)"));
};

// Копирование ссылки
document.getElementById('btnShareLink').onclick = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
        showToast("Ссылка на сайт скопирована!");
    });
};

// Подключение к другу (ЧАТ)
document.getElementById('btnConnect').onclick = () => {
    const id = ui.friendInput.value.trim();
    if(!id) return showToast("Введите ID друга!");
    const conn = peer.connect(id);
    handleConnection(conn);
};

// Входящее подключение (ЧАТ)
peer.on('connection', (conn) => {
    handleConnection(conn);
    showToast("Друг подключился к чату!");
});

function handleConnection(conn) {
    currentConn = conn;
    
    conn.on('open', () => {
        ui.connStatus.innerText = "Подключено к: " + conn.peer;
        ui.connStatus.className = "status-connected";
        ui.friendInput.value = conn.peer; // Автозаполнение для ответного звонка
    });

    conn.on('data', (data) => {
        if(data.type === 'msg') {
            renderMessage(data.content, 'in', data.isImage);
            ui.typing.classList.remove('visible');
        } else if (data.type === 'typing') {
            ui.typing.classList.add('visible');
            clearTimeout(window.typingTimeout);
            window.typingTimeout = setTimeout(() => ui.typing.classList.remove('visible'), 2000);
        }
    });

    conn.on('close', () => {
        ui.connStatus.innerText = "Отключено";
        ui.connStatus.className = "status-disconnected";
        showToast("Собеседник отключился");
    });
}

// --- 2. ЧАТ И СООБЩЕНИЯ ---

function renderMessage(content, type, isImage) {
    const div = document.createElement('div');
    div.className = `message ${type}`;
    const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    if(isImage) {
        div.innerHTML = `<img src="${content}"><div class="msg-time">${time}</div>`;
    } else {
        div.innerHTML = `${content}<div class="msg-time">${time}</div>`;
    }
    
    ui.msgsArea.appendChild(div);
    ui.msgsArea.scrollTop = ui.msgsArea.scrollHeight;
}

function sendMessage() {
    const text = ui.msgInput.value.trim();
    if(!text) return;
    
    renderMessage(text, 'out', false);
    if(currentConn && currentConn.open) {
        currentConn.send({ type: 'msg', content: text, isImage: false });
    }
    ui.msgInput.value = '';
}

document.getElementById('btnSend').onclick = sendMessage;
ui.msgInput.onkeypress = (e) => { if(e.key === 'Enter') sendMessage(); };
ui.msgInput.oninput = () => {
    if(currentConn && currentConn.open) currentConn.send({type: 'typing'});
};

// Отправка файлов
document.getElementById('fileInput').onchange = (e) => {
    const file = e.target.files[0];
    if(file) {
        const reader = new FileReader();
        reader.onload = (f) => {
            renderMessage(f.target.result, 'out', true);
            if(currentConn) currentConn.send({type: 'msg', content: f.target.result, isImage: true});
        };
        reader.readAsDataURL(file);
    }
};

// --- 3. ЗВОНКИ И ДЕМКА (ЯДРО) ---

// Начало звонка
async function startCall(isVideo) {
    const friendId = ui.friendInput.value.trim();
    if(!friendId) return showToast("Сначала введите ID друга!");

    try {
        const constraints = { ...mediaConstraints, video: isVideo };
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        ui.localVideo.srcObject = localStream;
        ui.callOverlay.style.display = 'flex';
        ui.qualityBadge.innerText = "Звоним...";

        const call = peer.call(friendId, localStream);
        handleCall(call);
    } catch (err) {
        alert("Нет доступа к устройствам: " + err.message);
    }
}

// Входящий звонок
peer.on('call', (call) => {
    ui.incomingModal.style.display = 'block';
    
    // Кнопка Принять
    document.getElementById('btnAccept').onclick = async () => {
        ui.incomingModal.style.display = 'none';
        try {
            localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
            ui.localVideo.srcObject = localStream;
            ui.callOverlay.style.display = 'flex';
            
            call.answer(localStream);
            handleCall(call);
        } catch (err) {
            alert("Ошибка оборудования: " + err.message);
            call.close();
        }
    };

    // Кнопка Отклонить
    document.getElementById('btnReject').onclick = () => {
        ui.incomingModal.style.display = 'none';
        call.close();
    };
});

function handleCall(call) {
    currentCall = call;
    
    call.on('stream', (remoteStream) => {
        ui.remoteVideo.srcObject = remoteStream;
        ui.qualityBadge.innerText = "Связь стабильна (P2P)";
    });

    call.on('close', closeCallUI);
    call.on('error', () => closeCallUI());
}

function closeCallUI() {
    if(localStream) localStream.getTracks().forEach(t => t.stop());
    if(screenStream) screenStream.getTracks().forEach(t => t.stop());
    
    ui.callOverlay.style.display = 'none';
    ui.remoteVideo.srcObject = null;
    ui.localVideo.srcObject = null;
    document.getElementById('btnScreenShare').classList.remove('active');
    
    showToast("Звонок завершен");
}

// --- ДЕМКА ЭКРАНА (ИСПРАВЛЕНО) ---
document.getElementById('btnScreenShare').onclick = async () => {
    const btn = document.getElementById('btnScreenShare');
    
    if (!screenStream) {
        try {
            // Запрашиваем экран (БЕЗ АУДИО, чтобы не ломать микрофон)
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: 60, cursor: "always" },
                audio: false 
            });

            const videoTrack = screenStream.getVideoTracks()[0];

            // Заменяем видео-трек у собеседника
            if (currentCall && currentCall.peerConnection) {
                const sender = currentCall.peerConnection.getSenders().find(s => s.track.kind === 'video');
                if (sender) {
                    sender.replaceTrack(videoTrack);
                }
            }

            // Показываем демку у себя (вместо собеседника или в PIP)
            // Обычно в мессенджерах ты видишь свою демку маленькой, а собеседника большой.
            // Но чтобы убедиться что работает, выведем в большое окно:
            ui.remoteVideo.srcObject = screenStream; 

            btn.classList.add('active');

            // Если нажать "Закрыть доступ" в браузере
            videoTrack.onended = stopScreenShare;

        } catch (err) {
            console.error(err);
            showToast("Отмена демонстрации");
        }
    } else {
        stopScreenShare();
    }
};

function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
        screenStream = null;
    }

    // Возвращаем камеру
    if (currentCall && localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        const sender = currentCall.peerConnection.getSenders().find(s => s.track.kind === 'video');
        if (sender) sender.replaceTrack(videoTrack);
    }

    // Возвращаем видео собеседника на главный экран
    if (currentCall && currentCall.remoteStream) {
        ui.remoteVideo.srcObject = currentCall.remoteStream;
    }

    document.getElementById('btnScreenShare').classList.remove('active');
}

// --- УПРАВЛЕНИЕ ЗВОНКОМ ---

document.getElementById('btnMute').onclick = function() {
    if(!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks()[0].enabled = !isMuted;
    this.classList.toggle('active', isMuted);
    this.innerHTML = isMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
};

document.getElementById('btnFullscreen').onclick = () => {
    if (!document.fullscreenElement) ui.callOverlay.requestFullscreen();
    else document.exitFullscreen();
};

document.getElementById('btnHangup').onclick = () => {
    if(currentCall) currentCall.close();
    closeCallUI();
};

document.getElementById('btnStartVideo').onclick = () => startCall(true);
document.getElementById('btnStartAudio').onclick = () => startCall(false);

// Утилита для тостов
function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
