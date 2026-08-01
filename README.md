# Pentabytes

**All-in-one AI Tool** for Code, Study, Content, Research & Productivity.

A clean, modern, dark-themed web application that lets you switch between powerful modes and chat with AI using your own API key.

## Features

- **5 Powerful Modes**
  - Code — Write, explain, debug & improve code
  - Study — Learn topics, get notes & quizzes
  - Content — Create blogs, posts, scripts, emails
  - Research — Structured research & summaries
  - Productivity — Goal breakdown & smart planning

- Multiple chats with history (saved in browser)
- Export chat as text file
- Voice input support
- Image upload ready (UI prepared)
- Dark modern clean interface
- Works with **OpenAI**, **Google Gemini**, and **Groq**
- API key stored only in your browser (localStorage)

## How to Use

1. Open `index.html` in your browser (or host it on GitHub Pages)
2. Click **Settings** and paste your API key
3. Choose provider (OpenAI / Gemini / Groq)
4. Start chatting in any mode

## Supported Providers

| Provider     | Example Models              | Where to get key                  |
|--------------|-----------------------------|-----------------------------------|
| OpenAI       | gpt-4o-mini, gpt-4o         | https://platform.openai.com      |
| Google Gemini| gemini-2.0-flash            | https://aistudio.google.com      |
| Groq         | llama-3.3-70b-versatile     | https://console.groq.com         |

## Project Structure

```
pentabytes/
── index.html
── js/
│   └── app.js
── README.md
```

## License

MIT License — feel free to use and modify.
