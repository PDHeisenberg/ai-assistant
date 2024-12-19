// DOM Elements
const blob = document.getElementById('blob');
const muteBtn = document.getElementById('muteBtn');
const closeBtn = document.getElementById('closeBtn');

// State
let isConnected = false;
let isMuted = false;
let peerConnection = null;
let dataChannel = null;

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

// Stored messages and experience data
const messages = [];
const workExperience = {
    work: {
        grab: {
            company: "Grab",
            description: "Southeast asia's biggest super-app",
            positions: [
                {
                    title: "Team Lead",
                    team: "Omni commerce",
                    period: "Sept 2024 - Present",
                    responsibilities: [
                        "Managing a team of four direct reports for Grab's Omni Commerce team",
                        "Leading initiatives within the Omni team including Dine-in, Express, and Reservations"
                    ]
                },
                {
                    title: "Lead Product Designer",
                    team: "Food Deliveries",
                    period: "June 2022 - Sept 2024",
                    achievements: [
                        "Launched two pivotal zero-to-one products in the Affordability pod: Group Orders and OffersZone",
                        "Group Orders accounts for 3% of food orders, OffersZone accounts for 12% of all food orders",
                        "Led designs for Grab's finance team products including GrabPay Wallet and Pay-Later"
                    ]
                }
            ]
        },
        agoda: {
            company: "Agoda",
            description: "A travel platform in southeast Asia by Booking Holdings",
            position: "Senior Product Designer",
            period: "Feb 2019 - May 2022",
            achievements: [
                "Worked on new business funnels including Activities and Trip planning",
                "Led a team of 3 designers",
                "Achieved highest quarterly KPIs in A/B testing with 3x incremental bookings"
            ]
        },
        flipkart: {
            company: "Flipkart",
            description: "India's biggest e-commerce company",
            position: "Product Designer",
            period: "Apr 2016 - Jan 2019",
            achievements: [
                "Designed and launched Supermart grocery on Desktop",
                "Generated ₹20Cr in business through Brand Stories ads",
                "Created an advertising platform for brands"
            ]
        },
        peppertap: {
            company: "PepperTap",
            description: "A hyperlocal Grocery start-up",
            position: "UX Designer",
            period: "Jan 2015 - Mar 2016",
            achievements: [
                "Designed consumer app and website, growing from 2000 to 50,000 orders/day",
                "Improved operations efficiency by 36% through internal product design"
            ]
        }
    },
    projects: {
        offersAndMore: {
            title: "Offers & More",
            company: "Grab",
            year: "2024",
            role: "Lead Product Designer",
            description: "A dedicated landing page for all offers, budget meals, and free delivery",
            achievements: [
                "Launched affordability-focused landing page with visual filters",
                "Achieved 12.3% Tile CTR",
                "58% sessions involved merchant clicks, 15% conversion rate",
                "Visual filters selected 31.12% of the time"
            ],
            context: "Post-pandemic project addressing affordability concerns in SEA"
        },
        groupOrders: {
            title: "Group Orders Tiered Promos",
            company: "Grab",
            year: "2024",
            role: "Lead Product Designer",
            description: "New system for group food ordering with tiered savings",
            achievements: [
                "1% of total orders through Group Orders",
                "35% conversion rate",
                "Increased margins from 6.4% to 10.8%",
                "Implemented automatic bill-splitting"
            ]
        },
        tripPlanning: {
            title: "Cart & Trip Planning",
            company: "Agoda",
            year: "2021",
            role: "Senior Product Designer",
            description: "One-stop-shop trip planning and booking experience",
            achievements: [
                "Led design for Agoda's expansion beyond hotels",
                "Managed team of 25+ engineers and designers",
                "Implemented scalable booking system for multiple travel products"
            ]
        }
    },
    skills: {
        interaction: {
            title: "Interaction Design",
            description: "End-to-end feature design, Mobile and Web apps, work with cross functional teams"
        },
        prototyping: {
            title: "Prototyping",
            tools: ["Figma", "ProtoPie", "Framer", "After Effects", "Lottie"]
        },
        research: {
            title: "Research",
            methods: ["User testing", "Surveys", "Diary study", "A/B testing", "Variant testing"]
        },
        languages: {
            spoken: ["English", "Hindi"]
        }
    },
    education: {
        degree: "Bachelor of Computer Applications (BCA)",
        school: "Guru Gobind Singh Indraprastha University",
        period: "2011-2014"
    },
    contact: {
        email: "parthdhawan28@gmail.com",
        phone: "+65 87558470",
        location: "Singapore"
    }
};

// Email configuration
async function sendEmailWithMessages() {
    const emailContent = {
        to: workExperience.contact.email,
        subject: "New Messages from Your AI Assistant",
        body: formatMessagesForEmail()
    };
    
    try {
        const response = await fetch("/.netlify/functions/send-email", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(emailContent)
        });
        
        if (!response.ok) {
            throw new Error("Failed to send email notification");
        }
        
        console.log("Email notification sent successfully");
    } catch (error) {
        console.error("Error sending email:", error);
    }
}

function formatMessagesForEmail() {
    if (messages.length === 0) return "No new messages.";
    
    return messages.map(msg => `
From: ${msg.name}
Contact: ${msg.contact || 'Not provided'}
Time: ${new Date(msg.timestamp).toLocaleString()}
Urgency: ${msg.urgency || 'Not specified'}
Message: ${msg.message}
-------------------
`).join('\n');
}

// Function call handlers
function handleFunctionCall(functionCall) {
    const { name, arguments: args, call_id } = functionCall;
    const parsedArgs = JSON.parse(args);
    
    let result = {};
    
    switch(name) {
        case "save_message":
            messages.push({
                timestamp: new Date().toISOString(),
                ...parsedArgs
            });
            // Send email when a new message is received
            sendEmailWithMessages();
            result = {
                status: "success",
                message: "Message saved successfully and notification sent to Parth"
            };
            break;
            
        case "get_work_experience":
            result = {
                data: workExperience[parsedArgs.type],
                type: parsedArgs.type
            };
            break;
    }
    
    // Send function result back to the model
    if (dataChannel && dataChannel.readyState === "open") {
        const event = {
            type: "conversation.item.create",
            item: {
                type: "function_call_output",
                call_id: call_id,
                output: JSON.stringify(result)
            }
        };
        dataChannel.send(JSON.stringify(event));
        
        // Create a new response after function call
        sendMessage({
            type: "response.create"
        });
    }
}

// Blob Animation
function animateBlob(isActive = false) {
    // Stop any existing animations
    anime.remove(blob);
    
    if (isActive) {
        // Gentle pulsing animation when speaking
        anime({
            targets: '#blob',
            scale: [1, 1.05],
            duration: 600,
            direction: 'alternate',
            loop: true,
            easing: 'easeInOutQuad'
        });
    } else {
        // Reset to default state
        anime({
            targets: '#blob',
            scale: 1,
            duration: 300,
            easing: 'easeOutQuad'
        });
    }
}

// Error Animation
function showError() {
    blob.style.background = '#dc2626';
    setTimeout(() => {
        blob.style.background = '#9333ea';
    }, 1000);
}

// Initialize WebRTC
async function initWebRTC() {
    try {
        console.log("Initializing WebRTC connection...");
        
        // First check if we have microphone permission
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            console.log("Microphone access granted");
        } catch (micError) {
            console.error("Microphone access denied:", micError);
            showError();
            throw new Error("Please grant microphone access to use the voice assistant");
        }

        // Get session token from Netlify function
        console.log("Requesting session token...");
        const tokenResponse = await fetch("/.netlify/functions/session", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            }
        });

        const responseText = await tokenResponse.text();
        console.log("Raw session response:", responseText);

        if (!tokenResponse.ok) {
            console.error("Session token error:", responseText);
            throw new Error(`Failed to get session token. Please check if the API key is configured correctly in Netlify.`);
        }
        
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            console.error("Failed to parse session response:", e);
            throw new Error("Invalid response from server. Please try again.");
        }

        console.log("Parsed session data:", data);
        
        if (!data.client_secret?.value) {
            console.error("Invalid session data:", data);
            throw new Error("Invalid session configuration. Please check Netlify environment variables.");
        }
        
        const EPHEMERAL_KEY = data.client_secret.value;
        console.log("Session token received successfully");

        // Create peer connection with STUN servers
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        };
        peerConnection = new RTCPeerConnection(configuration);
        console.log("Peer connection created");

        // Add ICE connection state logging
        peerConnection.oniceconnectionstatechange = () => {
            console.log("ICE connection state:", peerConnection.iceConnectionState);
        };

        peerConnection.onicecandidate = event => {
            console.log("ICE candidate:", event.candidate);
        };

        // Set up audio element for model's voice
        const audioEl = document.createElement("audio");
        audioEl.autoplay = true;
        peerConnection.ontrack = e => {
            console.log("Received audio track from server");
            audioEl.srcObject = e.streams[0];
        };

        // Set up microphone
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            stream.getTracks().forEach(track => {
                peerConnection.addTrack(track, stream);
                console.log("Added audio track:", track.label);
            });
            console.log("Microphone access granted");
        } catch (micError) {
            console.error("Microphone access denied:", micError);
            showError();
            throw new Error("Please grant microphone access to use the voice assistant");
        }

        // Set up data channel
        dataChannel = peerConnection.createDataChannel("oai-events");
        
        dataChannel.onopen = () => {
            console.log("Data channel opened");
            
            // Update session with instructions and tools
            sendMessage({
                type: "session.update",
                session: {
                    instructions: SYSTEM_INSTRUCTIONS,
                    tools: TOOLS,
                    tool_choice: "auto"
                }
            });
            
            // Send initial response create with a greeting
            sendMessage({
                type: "response.create",
                response: {
                    modalities: ["text", "speech"],
                    instructions: "Greet the user with your introduction message as specified in the system instructions."
                }
            });
        };
        
        dataChannel.onclose = () => console.log("Data channel closed");
        dataChannel.onerror = (error) => {
            console.error("Data channel error:", error);
            showError();
        };
        dataChannel.onmessage = handleServerMessage;

        // Create and set local description
        console.log("Creating offer...");
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        console.log("Local description set:", offer.sdp);

        // Connect to OpenAI's Realtime API
        console.log("Connecting to OpenAI Realtime API...");
        const baseUrl = "https://api.openai.com/v1/realtime";
        const model = "gpt-4o-realtime-preview-2024-12-17";
        const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
            method: "POST",
            body: offer.sdp,
            headers: {
                Authorization: `Bearer ${EPHEMERAL_KEY}`,
                "Content-Type": "application/sdp"
            },
        });

        if (!sdpResponse.ok) {
            const error = await sdpResponse.text();
            console.error("OpenAI SDP response error:", error);
            throw new Error(`Failed to connect to OpenAI: ${error}`);
        }

        const sdpAnswer = await sdpResponse.text();
        console.log("Received SDP answer");

        const answer = {
            type: "answer",
            sdp: sdpAnswer,
        };
        await peerConnection.setRemoteDescription(answer);
        console.log("Remote description set");

        isConnected = true;
        console.log("WebRTC connection established successfully");

    } catch (error) {
        console.error("WebRTC initialization failed:", error);
        showError();
        alert(error.message || "Failed to initialize voice assistant. Please try again.");
    }
}

// Handle messages from the server
function handleServerMessage(event) {
    try {
        const data = JSON.parse(event.data);
        console.log("Received server message:", data.type);
        
        switch(data.type) {
            case "speech.start":
                animateBlob(true);
                break;
            case "speech.end":
                animateBlob(false);
                break;
            case "error":
                showError();
                break;
            case "response.done":
                // Check for function calls in the response
                const functionCall = data.response?.output?.find(item => item.type === "function_call");
                if (functionCall) {
                    handleFunctionCall(functionCall);
                }
                break;
        }
    } catch (error) {
        console.error("Error handling server message:", error);
    }
}

// Send message to the server
function sendMessage(message) {
    try {
        if (dataChannel && dataChannel.readyState === "open") {
            dataChannel.send(JSON.stringify(message));
            console.log("Message sent:", message.type);
        } else {
            console.warn("Data channel not ready, message not sent");
        }
    } catch (error) {
        console.error("Error sending message:", error);
    }
}

// Event Listeners
muteBtn.addEventListener('click', () => {
    try {
        isMuted = !isMuted;
        muteBtn.style.opacity = isMuted ? '0.3' : '0.5';
        
        if (peerConnection) {
            const senders = peerConnection.getSenders();
            const audioSender = senders.find(sender => sender.track?.kind === 'audio');
            if (audioSender && audioSender.track) {
                audioSender.track.enabled = !isMuted;
                console.log("Microphone " + (isMuted ? "muted" : "unmuted"));
            }
        }
    } catch (error) {
        console.error("Error toggling mute:", error);
    }
});

closeBtn.addEventListener('click', () => {
    try {
        if (peerConnection) {
            peerConnection.close();
            console.log("WebRTC connection closed");
        }
        window.close();
    } catch (error) {
        console.error("Error closing connection:", error);
        window.close();
    }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', initWebRTC); 