document.addEventListener('DOMContentLoaded', () => {
    console.log("[Client] 🏁 Скрипт завантажено. Версія 3.0 - Report System.");
    
    // Отримуємо всі елементи
    const allScreens = document.querySelectorAll('.w-full.max-w-md > div');
    const preloaderScreen = document.getElementById('preloader-screen');
    const onboardingScreen = document.getElementById('onboarding-screen');
    const mainScreen = document.getElementById('main-screen');
    const searchScreen = document.getElementById('search-screen');
    const chatScreen = document.getElementById('chat-screen');
    const postChatScreen = document.getElementById('post-chat-screen');
    const backgroundShapes = document.getElementById('background-shapes');
    const modal = document.getElementById('confirmation-modal');
    const cancelSearchBtn = document.getElementById('cancel-search-btn');
    const reportBtn = document.getElementById('report-btn');
    
    let currentMode = null; 
    let timerInterval = null;

    function showScreen(screenToShow) {
        allScreens.forEach(screen => {
            screen.classList.add('hidden');
        });
        screenToShow.classList.remove('hidden');
    }

    const clickSound = document.getElementById('click-sound');
    const connectSound = document.getElementById('connect-sound');
    const disconnectSound = document.getElementById('disconnect-sound');
    function playSound(sound) {
        try {
            sound.currentTime = 0;
            sound.play();
        } catch(e) { console.warn("Не вдалося відтворити звук:", e); }
    }
    document.querySelectorAll('button, .accordion-header').forEach(el => {
        el.addEventListener('click', () => playSound(clickSound));
    });

    const shapeCount = 15;
    for (let i = 0; i < shapeCount; i++) {
        const shape = document.createElement('div');
        const size = Math.random() * 80 + 20;
        shape.style.width = `${size}px`; shape.style.height = `${size}px`;
        shape.style.top = `${Math.random() * 100}%`; shape.style.left = `${Math.random() * 100}%`;
        shape.style.opacity = Math.random() * 0.5 + 0.1;
        backgroundShapes.appendChild(shape);
    }
    document.body.addEventListener('mousemove', (e) => {
        const { clientX, clientY } = e; const { innerWidth, innerHeight } = window;
        const moveX = (clientX / innerWidth - 0.5) * -40; const moveY = (clientY / innerHeight - 0.5) * -40;
        backgroundShapes.style.transform = `translate(${moveX}px, ${moveY}px)`;
    });

    document.body.addEventListener('click', (e) => {
        const target = e.target.closest('.relative.overflow-hidden');
        if (target) {
            const rect = target.getBoundingClientRect(); const ripple = document.createElement('span');
            ripple.className = 'ripple';
            ripple.style.left = `${e.clientX - rect.left}px`; ripple.style.top = `${e.clientY - rect.top}px`;
            target.appendChild(ripple);
            setTimeout(() => ripple.remove(), 600);
        }
    });
    
    function showToast(message, isError = false) {
        const toastContainer = document.getElementById('toast-container'); const toast = document.createElement('div');
        toast.className = `px-4 py-2 rounded-lg shadow-lg text-white text-sm ${isError ? 'bg-red-600' : 'glassmorphism'} fade-in`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => { toast.remove(); }, 4000);
    }

    let confirmCallback = null;
    function showModal(title, text, onConfirm) {
        document.getElementById('modal-title').textContent = title; document.getElementById('modal-text').textContent = text;
        confirmCallback = onConfirm;
        modal.classList.remove('hidden');
    }
    document.getElementById('modal-cancel-btn').addEventListener('click', () => modal.classList.add('hidden'));
    document.getElementById('modal-confirm-btn').addEventListener('click', () => {
        modal.classList.add('hidden');
        if (confirmCallback) confirmCallback();
    });

    document.querySelectorAll('.accordion-header').forEach(header => {
        header.addEventListener('click', () => { header.parentElement.classList.toggle('active'); });
    });

    const onboardingSteps = document.querySelectorAll('.onboarding-step');
    const nextOnboardingBtn = document.getElementById('next-onboarding-step');
    let currentStep = 0;
    nextOnboardingBtn.addEventListener('click', () => {
        onboardingSteps[currentStep].classList.add('hidden');
        currentStep++;
        if (currentStep < onboardingSteps.length) {
            onboardingSteps[currentStep].classList.remove('hidden');
            if (currentStep === onboardingSteps.length - 1) { nextOnboardingBtn.textContent = 'Розпочати!'; }
        } else {
            localStorage.setItem('onboardingCompleted', 'true');
            showScreen(mainScreen);
        }
    });

    setTimeout(() => {
        const onboardingCompleted = localStorage.getItem('onboardingCompleted');
        if (onboardingCompleted) { showScreen(mainScreen); } else { showScreen(onboardingScreen); }
    }, 2000);

    document.querySelectorAll('.start-search-btn').forEach(btn => {
        btn.addEventListener('click', () => startSearch(btn.dataset.mode));
    });
    
    cancelSearchBtn.addEventListener('click', () => {
        sendMessage({ type: 'cancel_search' });
        showScreen(mainScreen);
    });

    document.getElementById('end-chat-btn').addEventListener('click', () => {
        showModal('Завершення діалогу', 'Ви впевнені, що хочете завершити розмову?', endChat);
    });
    
    reportBtn.addEventListener('click', () => {
        showModal('Скарга на співрозмовника', 'Ви впевнені, що хочете поскаржитись на цього користувача за порушення правил?', () => {
            sendMessage({ type: 'report_user' });
            showToast("Вашу скаргу надіслано.");
        });
    });

    document.getElementById('next-chat-btn').addEventListener('click', () => startSearch(currentMode));
    document.getElementById('main-menu-btn').addEventListener('click', () => {
         messageContainer.innerHTML = '';
         showScreen(mainScreen);
    });

    const messageForm = document.getElementById('message-form');
    const messageInput = document.getElementById('message-input');
    const messageContainer = document.getElementById('message-container');

    messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const messageText = messageInput.value.trim();
        if (messageText) {
            addMessage(messageText, 'my');
            sendMessage({ type: 'text_message', content: messageText });
            messageInput.value = '';
        }
    });

    function addMessage(text, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `flex ${type === 'my' ? 'justify-end' : 'justify-start'}`;
        const bubble = document.createElement('div');
        bubble.className = `chat-message p-3 rounded-2xl ${type === 'my' ? 'bg-gradient-animated text-white' : 'bg-gray-700'}`;
        bubble.textContent = text;
        messageDiv.appendChild(bubble);
        messageContainer.appendChild(messageDiv);
        messageContainer.scrollTop = messageContainer.scrollHeight;
    }

    function startSearch(mode) {
        currentMode = mode;
        document.getElementById('voice-search-animation').classList.toggle('hidden', mode !== 'voice');
        document.getElementById('text-search-animation').classList.toggle('hidden', mode !== 'text');
        showScreen(searchScreen);
        
        if (!socket || socket.readyState === WebSocket.CLOSED) { connectToServer(); } else { sendMessage({ type: 'start_search', mode: currentMode }); }
    }

    function showChatScreen(mode) {
        playSound(connectSound);
        document.getElementById('voice-chat-interface').classList.toggle('hidden', mode !== 'voice');
        document.getElementById('text-chat-interface').classList.toggle('hidden', mode !== 'text');
        showScreen(chatScreen);
        startTimer();
    }

    function endChat() {
        playSound(disconnectSound);
        stopTimer();
        closeVoiceChat();
        sendMessage({ type: 'end_chat' });
        showScreen(postChatScreen);
    }

    function startTimer() {
        stopTimer(); let seconds = 0; const timerEl = document.getElementById('chat-timer');
        timerEl.textContent = '00:00';
        timerInterval = setInterval(() => {
            seconds++; const min = String(Math.floor(seconds / 60)).padStart(2, '0');
            const sec = String(seconds % 60).padStart(2, '0');
            timerEl.textContent = `${min}:${sec}`;
        }, 1000);
    }
    function stopTimer() { clearInterval(timerInterval); }

    let peerConnection;
    let localStream;
    let audioVisualizerCanvas, canvasCtx, visualizerAnimation;
    const remoteAudio = document.getElementById('remote-audio');
    const micBtn = document.getElementById('mic-toggle-btn');
    const micIcon = document.getElementById('mic-icon');
    const micOffIcon = document.getElementById('mic-off-icon');
    const userAvatar = document.getElementById('user-avatar').querySelector('div');
    const partnerAvatar = document.getElementById('partner-avatar').querySelector('div');

    const iceServers = {
        iceServers: [ { urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]
    };

    async function startVoiceChat(role) {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            setupAudioVisualizer(localStream, userAvatar);

            peerConnection = new RTCPeerConnection(iceServers);
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });

            peerConnection.ontrack = (event) => {
                if (event.streams && event.streams[0]) {
                    remoteAudio.srcObject = event.streams[0];
                    setupAudioVisualizer(event.streams[0], partnerAvatar, true);
                }
            };

            peerConnection.onicecandidate = (event) => {
                if (event.candidate) { sendMessage({ type: 'webrtc_signal', signal: { candidate: event.candidate } }); }
            };

            if (role === 'caller') {
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                sendMessage({ type: 'webrtc_signal', signal: { sdp: peerConnection.localDescription } });
            }
        } catch (error) {
            showToast("Не вдалося отримати доступ до мікрофона", true);
            endChat();
        }
    }

    micBtn.addEventListener('click', () => {
        if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            audioTrack.enabled = !audioTrack.enabled;
            micIcon.classList.toggle('hidden', !audioTrack.enabled);
            micOffIcon.classList.toggle('hidden', audioTrack.enabled);
        }
    });

    function setupAudioVisualizer(stream, avatarElement, isPartner = false) {
        if (isPartner) {
            audioVisualizerCanvas = document.getElementById('audio-visualizer');
            canvasCtx = audioVisualizerCanvas.getContext('2d');
        }

        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        function draw() {
            requestAnimationFrame(draw);
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) { sum += dataArray[i]; }
            const average = sum / bufferLength;
            avatarElement.classList.toggle('speaking', average > 15);

            if (isPartner && canvasCtx) {
                canvasCtx.clearRect(0, 0, audioVisualizerCanvas.width, audioVisualizerCanvas.height);
                const barWidth = (audioVisualizerCanvas.width / bufferLength) * 2.5;
                let barHeight; let x = 0;
                const gradient = canvasCtx.createLinearGradient(0, 0, audioVisualizerCanvas.width, 0);
                gradient.addColorStop(0, "rgba(239, 68, 68, 0.7)");
                gradient.addColorStop(1, "rgba(249, 115, 22, 0.7)");
                canvasCtx.fillStyle = gradient;
                for(let i = 0; i < bufferLength; i++) {
                    barHeight = dataArray[i] / 2.5;
                    canvasCtx.fillRect(x, (audioVisualizerCanvas.height - barHeight) / 2, barWidth, barHeight);
                    x += barWidth + 1;
                }
            }
        }
        draw();
    }

    async function handleRtcSignal(signal) {
        if (!peerConnection) return;
        if (signal.sdp) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            if (signal.sdp.type === 'offer') {
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                sendMessage({ type: 'webrtc_signal', signal: { sdp: peerConnection.localDescription } });
            }
        } else if (signal.candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
    }

    function closeVoiceChat() {
        if(visualizerAnimation) cancelAnimationFrame(visualizerAnimation);
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        remoteAudio.srcObject = null;
        userAvatar.classList.remove('speaking');
        partnerAvatar.classList.remove('speaking');
        if (canvasCtx) canvasCtx.clearRect(0, 0, audioVisualizerCanvas.width, audioVisualizerCanvas.height);
    }

    let socket = null;
    const SERVER_URL = "wss://hearmeapp.onrender.com";

    function connectToServer() {
        socket = new WebSocket(SERVER_URL);
        socket.onopen = function() {
            showToast("З'єднано з сервером");
            sendMessage({ type: 'start_search', mode: currentMode });
        };
        socket.onmessage = function(event) {
            try {
                const message = JSON.parse(event.data);
                switch (message.type) {
                    case 'partner_found':
                        if (searchScreen.classList.contains('hidden')) return;
                        showChatScreen(currentMode);
                        if (currentMode === 'voice') startVoiceChat(message.role);
                        break;
                    case 'text_message':
                        addMessage(message.content, 'partner');
                        break;
                    case 'partner_disconnected':
                        showToast("Співрозмовник від'єднався", true);
                        if (!chatScreen.classList.contains('hidden')) endChat();
                        break;
                    case 'webrtc_signal':
                        if (peerConnection) handleRtcSignal(message.signal);
                        break;
                    case 'you_are_banned':
                        showToast(`Вас заблоковано до: ${new Date(message.until).toLocaleString()}`, true);
                        if (socket) socket.close();
                        showScreen(mainScreen);
                        break;
                }
            } catch (e) {
                 console.error("[Client] ❌ НЕ ВДАЛОСЯ ОБРОБИТИ ПОВІДОМЛЕННЯ:", e);
            }
        };
        socket.onclose = function() {
            showToast("З'єднання з сервером втрачено", true);
            closeVoiceChat();
            if (!mainScreen.classList.contains('hidden')) showScreen(mainScreen);
        };
        socket.onerror = function() {
            showToast("Помилка з'єднання з сервером", true);
        };
    }

    function sendMessage(message) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
        }
    }
});
