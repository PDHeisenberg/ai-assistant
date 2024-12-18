from fastapi import FastAPI, HTTPException
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

# Constants
MODEL = "gpt-4o-realtime-preview-2024-12-17"
VOICE = "verse"
API_BASE = "https://api.openai.com/v1"

# Email Configuration
EMAIL_CONFIG = {
    "SMTP_SERVER": os.getenv("SMTP_SERVER", "smtp.gmail.com"),
    "SMTP_PORT": int(os.getenv("SMTP_PORT", "465")),
    "SMTP_USERNAME": os.getenv("SMTP_USERNAME", "parthdhawan28@gmail.com"),
    "SMTP_PASSWORD": os.getenv("SMTP_PASSWORD", "jgbs btil eecu fgwk"),
    "YOUR_EMAIL": os.getenv("YOUR_EMAIL", "parthdhawan28@gmail.com")
}

# Print configuration status
print(colored("Configuration loaded:", "yellow"))
for key in EMAIL_CONFIG:
    if key != "SMTP_PASSWORD":
        print(colored(f"✓ {key}: {EMAIL_CONFIG[key]}", "green"))
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

# Initialize FastAPI
app = FastAPI()

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

def send_email(to_email: str, subject: str, body: str):
    try:
        # Create message
        msg = MIMEMultipart()
        msg['From'] = EMAIL_CONFIG["SMTP_USERNAME"]
        msg['To'] = to_email
        msg['Subject'] = subject
        
        msg.attach(MIMEText(body, 'plain'))
        
        # Send email using SSL
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
        
        # Test email configuration
        print(colored("Testing email configuration...", "yellow"))
        test_result = send_email(
            EMAIL_CONFIG["YOUR_EMAIL"],
            "AI Assistant Test Email",
            "Your AI Assistant email configuration is working correctly."
        )
        if test_result:
            print(colored("✓ Email configuration verified", "green"))
        else:
            print(colored("WARNING: Email configuration failed", "yellow"))
            
    except Exception as e:
        print(colored(f"Startup Error: {str(e)}", "red"))
        exit(1)

@app.get("/")
async def read_root():
    try:
        print(colored("Serving index.html...", "yellow"))
        return FileResponse("static/index.html")
    except Exception as e:
        print(colored(f"Error serving index.html: {str(e)}", "red"))
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/session")
async def create_session():
    try:
        print(colored("Creating new realtime session...", "yellow"))
        api_key = os.getenv("OPENAI_API_KEY")
        
        async with httpx.AsyncClient() as client:
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
            
            if response.status_code != 200:
                error_msg = f"OpenAI API error: {response.text}"
                print(colored(error_msg, "red"))
                raise HTTPException(status_code=response.status_code, detail=error_msg)
            
            print(colored("✓ Session created successfully", "green"))
            return JSONResponse(content=response.json())
            
    except Exception as e:
        error_msg = f"Session creation error: {str(e)}"
        print(colored(error_msg, "red"))
        raise HTTPException(status_code=500, detail=error_msg)

@app.post("/send-email")
async def send_email_endpoint(email_request: EmailRequest):
    try:
        print(colored("Sending email notification...", "yellow"))
        success = send_email(
            email_request.to,
            email_request.subject,
            email_request.body
        )
        
        if success:
            return JSONResponse(content={"status": "success", "message": "Email sent successfully"})
        else:
            raise HTTPException(status_code=500, detail="Failed to send email")
            
    except Exception as e:
        error_msg = f"Email sending error: {str(e)}"
        print(colored(error_msg, "red"))
        raise HTTPException(status_code=500, detail=error_msg)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True) 