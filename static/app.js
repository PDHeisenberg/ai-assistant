// Constants
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 2000;
const CONNECTION_TIMEOUT = 30000;
const HEARTBEAT_INTERVAL = 30000;
const VOICE = "alloy";

// State Management
class ConnectionState {
    constructor() {
        this.isConnected = false;
        this.isMuted = false;
        this.isProcessing = false;
        this.reconnectAttempts = 0;
        this.peerConnection = null;
        this.dataChannel = null;
        this.isLottieReady = false;
        this.heartbeatInterval = null;
        this.connectionTimeout = null;
        this.resumeProfile = null;
        this.instructions = "";
        this.speechRecognizer = null;
        this.shouldRestartRecognition = false;
        this.subtitleTimeout = null;
    }

    reset(options = {}) {
        const { preserveProfile = true } = options;
        this.isConnected = false;
        this.isProcessing = false;
        this.peerConnection = null;
        this.dataChannel = null;
        this.reconnectAttempts = 0;
        this.clearTimers();

        if (!preserveProfile) {
            this.resumeProfile = null;
            this.instructions = "";
        }
        this.stopSpeechRecognition();
    }

    clearTimers() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }
    }

    stopSpeechRecognition() {
        if (this.speechRecognizer) {
            this.shouldRestartRecognition = false;
            try {
                this.speechRecognizer.onend = null;
                this.speechRecognizer.stop();
            } catch (error) {
                console.warn("Speech recognition stop error:", error);
            }
            this.speechRecognizer = null;
        }
        if (this.subtitleTimeout) {
            clearTimeout(this.subtitleTimeout);
            this.subtitleTimeout = null;
        }
        hideSubtitle();
    }
}

const state = new ConnectionState();

// DOM Elements
const blob = document.getElementById('blob');
const muteBtn = document.getElementById('muteBtn');
const closeBtn = document.getElementById('closeBtn');
const leftEye = document.querySelector('.eye-left');
const rightEye = document.querySelector('.eye-right');
const statusIndicator = document.createElement('div');
statusIndicator.className = 'status-indicator';
document.body.appendChild(statusIndicator);
const subtitleEl = document.getElementById('subtitle');

// Profile helpers
async function loadResumeProfile() {
    try {
        const response = await fetch('/static/data/resume.json', { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Failed to load resume (status ${response.status})`);
        }
        const profile = await response.json();
        state.resumeProfile = profile;
        state.instructions = buildSystemInstructions(profile);
        console.info("Resume loaded successfully");
    } catch (error) {
        console.error("Unable to load resume profile:", error);
        state.instructions = FALLBACK_INSTRUCTIONS;
    }
}

const FALLBACK_INSTRUCTIONS = `You are Parth Dhawan's personal AI assistant. Keep the conversation focused on his product design background, portfolio, and availability. If someone asks about unrelated topics, politely steer them back to Parth's work or offer to take a message.`;

function buildSystemInstructions(profile) {
    if (!profile) {
        return FALLBACK_INSTRUCTIONS;
    }

    const current = profile.current_role;
    const currentHighlights = current?.achievements?.map((item, index) => `${index + 1}. ${item}`).join('\n    ');
    const experienceSummary = (profile.experience || [])
        .map(role => `- ${role.role} at ${role.company} (${role.start}${role.end ? ` – ${role.end}` : ''})${role.highlights?.length ? `: ${role.highlights[0]}` : ''}`)
        .join('\n');
    const skills = (profile.skills || []).join(', ');

    return `You are ${profile.name}'s personal AI voice assistant. Always speak as Parth's representative and keep every response anchored to his product design career.\n\nRules:\n- Only discuss Parth's background, skills, availability, or the projects listed below.\n- Politely decline unrelated questions and guide the conversation back to his design practice.\n- Highlight that Parth is based in ${profile.location} and can be reached at ${profile.contact}.\n- Offer to capture a message when someone wants to follow up.\n\nCurrent role:\n- ${current?.role || ''} at ${current?.company || ''} (since ${current?.start || 'N/A'}). Key achievements:\n    ${currentHighlights || 'N/A'}\n\nCareer snapshot:\n${experienceSummary}\n\nCore skills: ${skills}\n\nTone guidelines:\n- Be confident, concise, and data-backed.\n- Mention measurable impact (conversion lifts, adoption, operational improvements).\n- When greeting, introduce yourself as Parth's AI assistant and explain you can share his work or take a message.`;
}

// Subtitle helpers
function showSubtitle(text, { isFinal = false } = {}) {
    if (!subtitleEl || !text) {
        return;
    }

    subtitleEl.textContent = text;
    subtitleEl.classList.add('visible');

    if (state.subtitleTimeout) {
        clearTimeout(state.subtitleTimeout);
        state.subtitleTimeout = null;
    }

    if (isFinal) {
        state.subtitleTimeout = setTimeout(() => hideSubtitle(), 1500);
    }
}

function hideSubtitle() {
    if (!subtitleEl) {
        return;
    }
    subtitleEl.classList.remove('visible');
    subtitleEl.textContent = '';
    if (state.subtitleTimeout) {
        clearTimeout(state.subtitleTimeout);
        state.subtitleTimeout = null;
    }
}

function initializeSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.warn('SpeechRecognition API is not supported in this browser.');
        return;
    }

    if (state.speechRecognizer) {
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const result = event.results[i];
            const transcript = result[0]?.transcript?.trim();
            if (!transcript) continue;

            if (result.isFinal) {
                finalTranscript += `${transcript} `;
            } else {
                interimTranscript += `${transcript} `;
            }
        }

        if (interimTranscript) {
            showSubtitle(interimTranscript.trim(), { isFinal: false });
        }

        if (finalTranscript) {
            showSubtitle(finalTranscript.trim(), { isFinal: true });
        }
    };

    recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
    };

    recognition.onend = () => {
        if (state.shouldRestartRecognition) {
            try {
                recognition.start();
            } catch (error) {
                console.warn('Speech recognition restart error:', error);
            }
        } else {
            hideSubtitle();
        }
    };

    try {
        recognition.start();
        state.speechRecognizer = recognition;
        state.shouldRestartRecognition = true;
    } catch (error) {
        console.warn('Speech recognition start failed:', error);
    }
}

// Assistant Configuration
const SYSTEM_INSTRUCTIONS = FALLBACK_INSTRUCTIONS;

// Tools Configuration
const TOOLS = [
    {
        type: "function",
        name: "save_message",
        description: "Save a message for Parth from someone",
        parameters: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "Name of the person leaving the message"
                },
                contact: {
                    type: "string",
                    description: "Contact information (email/phone) of the person"
                },
                message: {
                    type: "string",
                    description: "The message content"
                },
                urgency: {
                    type: "string",
                    enum: ["low", "medium", "high"],
                    description: "The urgency level of the message"
                }
            },
            required: ["name", "message"]
        }
    },
    {
        type: "function",
        name: "get_work_experience",
        description: "Get information about Parth's work experience or past projects",
        parameters: {
            type: "object",
            properties: {
                type: {
                    type: "string",
                    enum: ["work", "projects", "skills"],
                    description: "Type of information requested"
                },
                specific_company: {
                    type: "string",
                    description: "Specific company to get information about"
                }
            },
            required: ["type"]
        }
    }
];

// Error Handling
class AssistantError extends Error {
    constructor(message, type, retryable = true) {
        super(message);
        this.name = 'AssistantError';
        this.type = type;
        this.retryable = retryable;
        this.timestamp = new Date();
    }
}

// Status Updates
function updateStatus(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    statusIndicator.textContent = message;
    statusIndicator.className = `status-indicator ${type}`;
    setTimeout(() => {
        statusIndicator.className = 'status-indicator fade-out';
    }, 3000);
}

// Connection Management
async function initializeAssistant() {
    try {
        updateStatus('Initializing assistant...', 'info');
        state.reset();
        await loadResumeProfile();

        // Initialize Lottie
        if (blob) {
            blob.addEventListener('load', () => {
                console.log("Lottie animation loaded");
                state.isLottieReady = true;
                blob.stop();
            });
            
            blob.addEventListener('error', (error) => {
                console.error("Error loading Lottie animation:", error);
                throw new AssistantError('Failed to load animations', 'animation');
            });
        }

        await initializeWebRTC();

    } catch (error) {
        handleError(error);
    }
}

async function initializeWebRTC() {
    try {
        updateStatus('Initializing connection...', 'info');
        state.isProcessing = true;
        animateBlob();

        // Check microphone access
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        initializeSpeechRecognition();

        // Get session token
        const tokenResponse = await fetch("/.netlify/functions/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        });

        if (!tokenResponse.ok) {
            throw new AssistantError(
                'Failed to get session token',
                'session',
                true
            );
        }

        const data = await tokenResponse.json();
        if (!data.client_secret?.value) {
            throw new AssistantError(
                'Invalid session configuration',
                'config',
                false
            );
        }

        // Setup WebRTC
        state.peerConnection = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        state.dataChannel = state.peerConnection.createDataChannel('oai-events');
        state.dataChannel.onopen = handleDataChannelOpen;
        state.dataChannel.onmessage = handleServerMessage;
        state.dataChannel.onerror = (event) => {
            console.error('Data channel error:', event);
        };
        state.dataChannel.onclose = () => {
            console.log('Data channel closed');
        };

        setupWebRTCHandlers();
        setupMediaStream(stream);
        await createAndSetOffer(data.client_secret.value);

        // Setup connection monitoring
        setupConnectionMonitoring();
        
    } catch (error) {
        handleError(error);
    }
}

function setupWebRTCHandlers() {
    state.peerConnection.oniceconnectionstatechange = () => {
        console.log("ICE connection state:", state.peerConnection.iceConnectionState);
        handleConnectionStateChange(state.peerConnection.iceConnectionState);
    };

    state.peerConnection.onicecandidate = event => {
        console.log("ICE candidate:", event.candidate);
    };

    state.peerConnection.ondatachannel = (event) => {
        console.log('Received remote data channel');
        if (!state.dataChannel) {
            state.dataChannel = event.channel;
            state.dataChannel.onopen = handleDataChannelOpen;
            state.dataChannel.onmessage = handleServerMessage;
        }
    };

    state.peerConnection.ontrack = e => {
        console.log("Received audio track");
        const audioEl = document.createElement("audio");
        audioEl.autoplay = true;
        audioEl.srcObject = e.streams[0];
    };
}

function setupMediaStream(stream) {
    stream.getTracks().forEach(track => {
        state.peerConnection.addTrack(track, stream);
        console.log("Added track:", track.kind);
    });
}

async function createAndSetOffer(token) {
    const offer = await state.peerConnection.createOffer();
    await state.peerConnection.setLocalDescription(offer);
    
    const response = await fetch("https://api.openai.com/v1/realtime", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/sdp"
        },
        body: offer.sdp
    });

    if (!response.ok) {
        throw new AssistantError(
            'Failed to establish connection with OpenAI',
            'connection',
            true
        );
    }

    const answer = {
        type: "answer",
        sdp: await response.text()
    };
    await state.peerConnection.setRemoteDescription(answer);
}

function setupConnectionMonitoring() {
    // Setup heartbeat
    state.heartbeatInterval = setInterval(() => {
        if (state.dataChannel?.readyState === 'open') {
            sendMessage({ type: 'heartbeat' });
        }
    }, HEARTBEAT_INTERVAL);

    // Setup connection timeout
    state.connectionTimeout = setTimeout(() => {
        if (!state.isConnected) {
            handleError(new AssistantError(
                'Connection timeout',
                'timeout',
                true
            ));
        }
    }, CONNECTION_TIMEOUT);
}

function handleConnectionStateChange(iceState) {
    switch (iceState) {
        case 'connected':
            state.isConnected = true;
            updateStatus('Connected', 'success');
            break;
        case 'disconnected':
        case 'failed':
            handleDisconnection();
            break;
        case 'closed':
            state.reset();
            updateStatus('Connection closed', 'info');
            break;
    }
}

async function handleDisconnection() {
    state.isConnected = false;
    updateStatus('Connection lost', 'error');
    hideSubtitle();

    if (state.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        state.reconnectAttempts++;
        updateStatus(`Reconnecting (${state.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`, 'warning');

        setTimeout(() => {
            initializeWebRTC();
        }, RECONNECT_DELAY * state.reconnectAttempts);
    } else {
        updateStatus('Could not reconnect', 'error');
    }
}

function handleError(error) {
    console.error('Assistant Error:', error);
    state.isProcessing = false;
    animateBlob();
    showError();

    if (error.retryable && state.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        handleDisconnection();
    } else {
        updateStatus(error.message, 'error');
    }
}

// Message Handling
function sendMessage(message) {
    try {
        if (state.dataChannel?.readyState === 'open') {
            if (message.type === 'response.create') {
                state.isProcessing = true;
                animateBlob();
            }
            state.dataChannel.send(JSON.stringify(message));
            console.log("Message sent:", message.type);
        } else {
            throw new AssistantError(
                'Connection not available',
                'connection',
                true
            );
        }
    } catch (error) {
        handleError(error);
    }
}

function handleServerMessage(event) {
    try {
        const data = JSON.parse(event.data);
        console.log("Received:", data.type);

        switch(data.type) {
            case 'speech.start':
                state.isProcessing = false;
                animateBlob(true);
                break;
            case 'speech.end':
                animateBlob(false);
                hideSubtitle();
                break;
            case 'error':
                handleError(new AssistantError(
                    data.error?.message || 'Unknown error',
                    'server',
                    true
                ));
                break;
            case 'conversation.item.created':
                handleConversationItem(data.item);
                break;
            case 'response.create':
                state.isProcessing = true;
                animateBlob();
                break;
            case 'response.done':
                state.isProcessing = false;
                animateBlob();
                const functionCall = data.response?.output?.find(
                    item => item.type === 'function_call'
                );
                if (functionCall) {
                    handleFunctionCall(functionCall);
                }
                break;
        }
    } catch (error) {
        handleError(error);
    }
}

function handleConversationItem(item) {
    if (!item) return;
    const isUserText = item.role === 'user' && Array.isArray(item.content);

    if (isUserText) {
        const textContent = item.content
            .filter(part => part.type === 'input_text' || part.type === 'output_text')
            .map(part => part.text)
            .join(' ')
            .trim();

        if (textContent) {
            const isFinal = item.status === 'completed' || item.status === 'complete';
            showSubtitle(textContent, { isFinal });
        }
    }
}

function handleDataChannelOpen() {
    console.log('Data channel open');
    state.isConnected = true;
    state.reconnectAttempts = 0;
    updateStatus('Assistant ready', 'success');

    const instructions = state.instructions || SYSTEM_INSTRUCTIONS;

    sendMessage({
        type: 'session.update',
        session: {
            instructions,
            voice: VOICE,
            modalities: ['text', 'audio'],
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16'
        }
    });

    sendMessage({
        type: 'session.update',
        session: {
            tools: TOOLS
        }
    });

    sendMessage({
        type: 'response.create',
        response: {
            instructions: 'Greet the user warmly, introduce yourself as Parth Dhawan\'s AI assistant, and offer to share his product design experience or take a message.'
        }
    });
}

function handleFunctionCall(functionCall) {
    console.warn('Function call received but no handler implemented yet:', functionCall?.name);
}

// Animation Functions
function animateBlob(isActive = false) {
    if (!state.isLottieReady) return;
    
    try {
        if (state.isProcessing) {
            blob.play();
            blob.setAttribute('speed', '1.5');
        } else if (isActive) {
            blob.play();
            blob.setAttribute('speed', '1');
        } else {
            blob.stop();
        }
    } catch (error) {
        console.error('Animation error:', error);
    }
}

function showError() {
    if (!state.isLottieReady) return;
    
    try {
        blob.setAttribute('speed', '2');
        setTimeout(() => {
            if (!state.isProcessing && state.isLottieReady) {
                blob.setAttribute('speed', '1');
            }
        }, 1000);
    } catch (error) {
        console.error('Error animation failed:', error);
    }
}

// Event Listeners
muteBtn.addEventListener('click', () => {
    state.isMuted = !state.isMuted;
    if (state.peerConnection) {
        const senders = state.peerConnection.getSenders();
        const audioSender = senders.find(sender => sender.track?.kind === 'audio');
        if (audioSender) {
            audioSender.track.enabled = !state.isMuted;
        }
    }
    muteBtn.style.opacity = state.isMuted ? 0.3 : 0.8;

    if (state.isMuted) {
        state.stopSpeechRecognition();
        hideSubtitle();
    } else {
        initializeSpeechRecognition();
    }
});

closeBtn.addEventListener('click', () => {
    state.reset({ preserveProfile: false });
    window.close();
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', initializeAssistant); 