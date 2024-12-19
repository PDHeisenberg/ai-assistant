from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
import os
from termcolor import colored
import json
import httpx
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pydantic import BaseModel
from typing import Optional, List
import time
from datetime import datetime, timedelta
import asyncio
from functools import wraps

# Constants
MODEL = "gpt-4o-realtime-preview-2024-12-17"
VOICE = "verse"
API_BASE = "https://api.openai.com/v1"
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds
RATE_LIMIT_WINDOW = 60  # seconds
MAX_REQUESTS_PER_WINDOW = 50
SESSION_TIMEOUT = 300  # seconds

# Rate limiting state
request_timestamps = []
active_sessions = {}

# Email Configuration
EMAIL_CONFIG = {
    "SMTP_SERVER": os.getenv("SMTP_SERVER", "smtp.gmail.com"),
    "SMTP_PORT": int(os.getenv("SMTP_PORT", "465")),
    "SMTP_USERNAME": os.getenv("SMTP_USERNAME"),
    "SMTP_PASSWORD": os.getenv("SMTP_PASSWORD"),
    "YOUR_EMAIL": os.getenv("YOUR_EMAIL")
}

# Print configuration status
print(colored("Configuration loaded:", "yellow"))
for key in EMAIL_CONFIG:
    if key != "SMTP_PASSWORD":
        status = "✓" if EMAIL_CONFIG[key] else "✗"
        color = "green" if EMAIL_CONFIG[key] else "red"
        print(colored(f"{status} {key}: {EMAIL_CONFIG[key] or 'NOT SET'}", color))
    else:
        print(colored(f"✓ {key}: ***********", "green"))

# Message Models
class Message(BaseModel):
    name: str
    contact: Optional[str]
    message: str
    urgency: Optional[str]
    timestamp: str

class EmailRequest(BaseModel):
    to: str
    subject: str
    body: str

class SessionInfo(BaseModel):
    session_id: str
    created_at: datetime
    last_active: datetime

# Initialize FastAPI
app = FastAPI()

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

def rate_limit_decorator():
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            current_time = time.time()
            
            # Remove timestamps older than the window
            global request_timestamps
            request_timestamps = [ts for ts in request_timestamps 
                               if current_time - ts < RATE_LIMIT_WINDOW]
            
            # Check if rate limit is exceeded
            if len(request_timestamps) >= MAX_REQUESTS_PER_WINDOW:
                raise HTTPException(
                    status_code=429,
                    detail="Rate limit exceeded. Please try again later."
                )
            
            # Add current timestamp
            request_timestamps.append(current_time)
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator

async def cleanup_expired_sessions():
    while True:
        try:
            current_time = datetime.now()
            expired_sessions = [
                session_id for session_id, info in active_sessions.items()
                if (current_time - info.last_active).total_seconds() > SESSION_TIMEOUT
            ]
            
            for session_id in expired_sessions:
                print(colored(f"Cleaning up expired session: {session_id}", "yellow"))
                del active_sessions[session_id]
            
            await asyncio.sleep(60)  # Check every minute
        except Exception as e:
            print(colored(f"Session cleanup error: {str(e)}", "red"))

async def send_email_async(to_email: str, subject: str, body: str):
    try:
        msg = MIMEMultipart()
        msg['From'] = EMAIL_CONFIG["SMTP_USERNAME"]
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain'))
        
        async with asyncio.Lock():
            with smtplib.SMTP_SSL(EMAIL_CONFIG["SMTP_SERVER"], EMAIL_CONFIG["SMTP_PORT"]) as server:
                server.login(EMAIL_CONFIG["SMTP_USERNAME"], EMAIL_CONFIG["SMTP_PASSWORD"])
                server.send_message(msg)
        
        print(colored("✓ Email sent successfully", "green"))
        return True
    except Exception as e:
        print(colored(f"Failed to send email: {str(e)}", "red"))
        return False

@app.on_event("startup")
async def startup_event():
    try:
        # Check for API key
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            print(colored("ERROR: OPENAI_API_KEY not found in environment variables", "red"))
            exit(1)
        print(colored("✓ API key found", "green"))
        
        # Start session cleanup task
        asyncio.create_task(cleanup_expired_sessions())
        
    except Exception as e:
        print(colored(f"Startup Error: {str(e)}", "red"))
        exit(1)

@app.post("/session")
@rate_limit_decorator()
async def create_session(background_tasks: BackgroundTasks):
    try:
        print(colored("Creating new realtime session...", "yellow"))
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            error_msg = "OpenAI API key not found in environment variables"
            print(colored(error_msg, "red"))
            raise HTTPException(status_code=500, detail=error_msg)
        
        print(colored(f"Using model: {MODEL}", "cyan"))
        print(colored(f"Using voice: {VOICE}", "cyan"))
        
        retry_count = 0
        last_error = None
        
        while retry_count < MAX_RETRIES:
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(
                        f"{API_BASE}/realtime/sessions",
                        headers={
                            "Authorization": f"Bearer {api_key}",
                            "Content-Type": "application/json"
                        },
                        json={
                            "model": MODEL,
                            "voice": VOICE
                        }
                    )
                    
                    response_json = response.json()
                    print(colored(f"API Response: {json.dumps(response_json, indent=2)}", "cyan"))
                    
                    if response.status_code == 200:
                        session_id = response_json.get("session_id")
                        if session_id:
                            active_sessions[session_id] = SessionInfo(
                                session_id=session_id,
                                created_at=datetime.now(),
                                last_active=datetime.now()
                            )
                            print(colored("✓ Session created successfully", "green"))
                            return JSONResponse(content=response_json)
                    
                    error_msg = f"OpenAI API error: {response.text}"
                    print(colored(error_msg, "red"))
                    last_error = error_msg
                    
            except (httpx.TimeoutException, httpx.RequestError) as e:
                last_error = str(e)
                print(colored(f"Attempt {retry_count + 1} failed: {last_error}", "yellow"))
            
            retry_count += 1
            if retry_count < MAX_RETRIES:
                await asyncio.sleep(RETRY_DELAY * (2 ** retry_count))  # Exponential backoff
        
        raise HTTPException(
            status_code=500,
            detail=f"Failed after {MAX_RETRIES} attempts. Last error: {last_error}"
        )
        
    except Exception as e:
        error_msg = f"Session creation error: {str(e)}"
        print(colored(error_msg, "red"))
        raise HTTPException(status_code=500, detail=error_msg)

@app.post("/send-email")
@rate_limit_decorator()
async def send_email_endpoint(email_request: EmailRequest, background_tasks: BackgroundTasks):
    try:
        background_tasks.add_task(
            send_email_async,
            email_request.to,
            email_request.subject,
            email_request.body
        )
        return JSONResponse(content={"message": "Email scheduled for delivery"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "active_sessions": len(active_sessions),
        "rate_limit": {
            "current_requests": len(request_timestamps),
            "max_requests": MAX_REQUESTS_PER_WINDOW,
            "window_seconds": RATE_LIMIT_WINDOW
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True) 