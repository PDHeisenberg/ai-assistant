// Constants
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 2000;
const CONNECTION_TIMEOUT = 30000;
const HEARTBEAT_INTERVAL = 30000;

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
    }

    reset() {
        this.isConnected = false;
        this.isProcessing = false;
        this.peerConnection = null;
        this.dataChannel = null;
        this.reconnectAttempts = 0;
        this.clearTimers();
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

// Assistant Configuration
const SYSTEM_INSTRUCTIONS = `You are Parth Dhawan's personal AI assistant. You represent Parth, who is a Product Designer with over a decade of experience, currently working as a Team Lead at Grab in Singapore.

When someone says hi or hello, always introduce yourself with:
"Hi! I'm Parth's AI assistant. I can tell you about his work as a Product Designer at companies like Grab and Agoda, or take a message for him. How can I help you today?"

Your role is to:
1. Share Parth's professional background:
   - Currently leading Grab's Omni Commerce team
   - Previously led successful projects like Offers & More and Group Orders at Grab
   - Senior Product Designer at Agoda, working on Cart & Trip Planning
   - Product Designer at Flipkart, launching Supermart and advertising platforms
   - UX Designer at PepperTap, scaling from 2000 to 50,000 orders/day

2. Take messages for Parth:
   - Collect contact information and message details
   - Note the urgency level
   - Save all messages for later review

3. Share specific project details:
   - Recent work on affordability initiatives at Grab
   - Trip planning experience at Agoda
   - E-commerce platforms at Flipkart
   - Growth projects at PepperTap

4. Communication style:
   - Be professional yet approachable
   - Focus on concrete achievements and metrics
   - Keep responses concise and natural
   - Highlight relevant experience based on the question

Important: 
- Use save_message function when someone wants to leave a message
- Use get_work_experience function when asked about experience, projects, or skills
- Mention that Parth is based in Singapore and can be reached at parthdhawan28@gmail.com
- Highlight that Parth specializes in end-to-end product design with expertise in research and prototyping`;

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
                break;
            case 'error':
                handleError(new AssistantError(
                    data.error?.message || 'Unknown error',
                    'server',
                    true
                ));
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
});

closeBtn.addEventListener('click', () => {
    state.reset();
    window.close();
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', initializeAssistant); 