# Alex.OS

### Alex.OS is an AI mentor, not just an AI reviewer.

Alex.OS was designed to help developers learn while reviewing their code, combining practical feedback with educational explanations to encourage secure coding practices.

Many AI code-review tools identify problems. Alex.OS is an AI-powered code mentor that helps developers understand, fix, and learn from their code. Instead of only identifying issues, it explains why they happen, helping developers build secure coding habits and deeper technical understanding.

## ✨ Features

- 🔍 Reviews JavaScript and TypeScript code
- 🛡️ Detects bugs and common security issues
- 📍 Highlights affected code locations
- ⚠️ Classifies findings by severity
- 📚 Explains security concepts in a beginner-friendly way
- 💡 Provides improved code examples
- 🎓 Turns every finding into a mini-lesson to help developers grow

## 🎥 Demo

1. Load the vulnerable example or paste your own code.
2. Click **Review Code**.
3. Explore the security score, findings, explanations, suggested fixes, and learning insights.

Demo video: Add your public YouTube link here.

## 🛠️ Tech Stack

- Node.js
- OpenAI Responses API
- `gpt-4.1-mini`
- HTML
- CSS
- JavaScript

## 🚀 Run Locally

Install the project dependencies:

```bash
npm install

Create a local environment file:
cp .env.example .env

Add your own OpenAI API key to the .env file:
OPENAI_API_KEY=your_api_key

Start the server:
node server.mjs

🤖 How AI Was Used

This project was built using OpenAI tools throughout development.

All final product decisions, testing, and acceptance of implementation were performed by the project author. AI tools were used to accelerate development and support the engineering process.

GPT-5.6

Used for:

Product planning
Feature brainstorming
Architecture discussions
Documentation guidance
Testing ideas
README refinement
Product-roadmap development
Codex

Used for:

Implementing features
Debugging
Refactoring
Improving the project structure
Fixing API integration issues
Helping prepare the project for submission
GPT-4.1 mini

The Alex.OS application uses gpt-4.1-mini through the OpenAI Responses API to generate structured, educational code reviews.

Why Alex.OS?

Many AI code-review tools tell developers what is wrong.

Alex.OS aims to teach why the issue exists, how attackers might exploit it, and how developers can write more secure code in the future.

I built the learning experience that I always wished I had while studying cybersecurity and software engineering.

🎯 Project Vision

Alex.OS aims to make secure coding easier to understand by combining AI-powered code review with educational explanations.

The long-term goal is to help developers improve their skills while writing more secure software.

🚀 Future Roadmap
Support more programming languages
User accounts and review history
Team workspaces
Personalized learning paths
IDE integrations
Study Companion feature
Developers will be able to paste or upload study notes, and Alex.OS will generate:
- 📄 A concise summary
- 🧠 Interactive flashcards
- ❓ A short knowledge quiz
- 💻 A coding exercise with guided hints

The goal is to transform static notes into active learning experiences, helping developers retain concepts more effectively.

