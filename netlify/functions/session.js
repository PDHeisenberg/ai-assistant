const fetch = require('node-fetch');
const path = require('path');

let resume;
try {
  const resumePath = path.join(__dirname, '..', '..', 'static', 'data', 'resume.json');
  resume = require(resumePath);
} catch (error) {
  console.warn('Unable to load resume data for session instructions:', error);
  resume = null;
}

const FALLBACK_INSTRUCTIONS = "You are Parth Dhawan's AI voice assistant. Keep every conversation focused on his product design experience, skills, and availability. Politely decline unrelated topics and offer to take a message.";

function buildInstructions(profile) {
  if (!profile) {
    return FALLBACK_INSTRUCTIONS;
  }

  const current = profile.current_role || {};
  const currentAchievements = Array.isArray(current.achievements)
    ? current.achievements.map((item, index) => `${index + 1}. ${item}`).join('\n    ')
    : 'N/A';

  const experienceSummary = Array.isArray(profile.experience)
    ? profile.experience
        .map(role => {
          const period = role.end ? `${role.start} – ${role.end}` : `${role.start} – Present`;
          const highlight = Array.isArray(role.highlights) && role.highlights.length > 0 ? `: ${role.highlights[0]}` : '';
          return `- ${role.role} at ${role.company} (${period})${highlight}`;
        })
        .join('\n')
    : '';

  const skills = Array.isArray(profile.skills) ? profile.skills.join(', ') : '';

  return `You are ${profile.name}'s personal AI assistant. Only discuss Parth Dhawan's product design background, leadership experience, and availability.\n\nGuidelines:\n- Speak as Parth's representative and reference measurable impact from his resume.\n- Highlight that he is based in ${profile.location} and can be reached at ${profile.contact}.\n- Politely decline unrelated topics and offer to capture a message.\n\nCurrent role:\n- ${current.role || ''} at ${current.company || ''} (since ${current.start || 'N/A'}). Achievements:\n    ${currentAchievements}\n\nCareer snapshot:\n${experienceSummary}\n\nCore skills: ${skills}\n\nAlways greet with: "Hi! I'm Parth's AI assistant. I can tell you about his work as a product designer or take a message for him."`;
}

exports.handler = async function(event, context) {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only allow POST
  if (event.httpMethod !== "POST") {
    return { 
      statusCode: 405, 
      headers,
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  try {
    console.log("Creating session with OpenAI...");
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-latest",
        voice: "alloy",
        instructions: buildInstructions(resume)
      })
    });

    const data = await response.json();
    console.log("OpenAI response:", data);

    if (!response.ok) {
      throw new Error(data.error?.message || "Failed to create session");
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error("Session creation error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: error.message,
        details: "Failed to create OpenAI session"
      })
    };
  }
}; 