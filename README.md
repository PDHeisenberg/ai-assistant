# Parth's AI Assistant

A voice-based AI assistant that can discuss my work experience, take messages, and share information about my projects. Built using OpenAI's Realtime API.

## Features

- Voice interaction with natural responses
- Shares detailed work experience and project information
- Takes messages and sends email notifications
- Minimal UI with responsive blob animation
- Dark mode interface

## Tech Stack

- Backend: FastAPI
- Frontend: Vanilla JavaScript with Anime.js
- Voice: OpenAI Realtime API
- Email: SMTP with SSL
- Deployment: Netlify

## Local Development

1. Clone the repository:
```bash
git clone https://github.com/parthdhawan/ai-assistant.git
cd ai-assistant
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Set up environment variables in Netlify:
- `OPENAI_API_KEY`: Your OpenAI API key
- `SMTP_SERVER`: SMTP server address
- `SMTP_PORT`: SMTP port (default: 465)
- `SMTP_USERNAME`: Your email username
- `SMTP_PASSWORD`: Your email password
- `YOUR_EMAIL`: Email to receive notifications

4. Run the development server:
```bash
python main.py
```

5. Open http://127.0.0.1:8000 in your browser

## Deployment

1. Push to GitHub:
```bash
git add .
git commit -m "Initial commit"
git push origin main
```

2. Connect to Netlify:
- Go to Netlify and connect your GitHub repository
- Add the environment variables in Netlify's dashboard
- Deploy!

## Environment Variables

Required environment variables in Netlify:

| Variable | Description |
|----------|-------------|
| OPENAI_API_KEY | Your OpenAI API key |
| SMTP_SERVER | SMTP server (smtp.gmail.com) |
| SMTP_PORT | SMTP port (465) |
| SMTP_USERNAME | Email username |
| SMTP_PASSWORD | Email password |
| YOUR_EMAIL | Notification recipient |

## License

MIT License - feel free to use this code for your own projects! 