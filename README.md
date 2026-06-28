# Prism

Prism is an AI-assisted messaging safety platform designed to help users detect suspicious intent in conversations before they fall for scams. The app combines a React frontend with a FastAPI backend, a transformer-based analysis pipeline, and user-facing reporting and organization verification flows.

## What Prism does

- Detects suspicious or manipulative messages using a transformer-based analysis pipeline
- Flags impersonation attempts and lookalike domains
- Supports chat-based message exchange with threat scoring and consent controls
- Allows users to report suspicious messages for admin review
- Includes organization registration and verification workflows
- Provides an admin dashboard for reviewing reports, managing organizations, and inspecting vector database stats

## Tech stack

- Frontend: React, Vite, Tailwind CSS, React Router
- Backend: FastAPI, Uvicorn, Pydantic
- AI / ML: Hugging Face Transformers, PyTorch, ChromaDB
- Storage: SQLite for app data, Firebase Admin for authentication-related verification

## Repository structure

```text
.
├── app/
│   ├── backend/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── routes/
│   │   ├── services/
│   │   └── requirements.txt
│   └── frontend/
│       ├── package.json
│       ├── src/
│       └── vite.config.js
├── production_chat_model/
├── production1_chat_model/
└── README.md
```

## Prerequisites

- Python 3.10+
- Node.js 18+
- npm
- A local copy of the model directory used by the backend (the repository includes the packaged model folders)

## Backend setup

```bash
cd app/backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Run the API server:

```bash
python main.py
```

The API will be available at:

- http://localhost:8000
- Swagger docs: http://localhost:8000/docs

### Important backend notes

- The app expects a Firebase service account file at `backend/serviceAccountKey.json` for authentication-related verification.
- OTPs are currently generated in development mode and printed in the backend terminal.
- The backend uses a local SQLite database file created automatically on first startup.

## Frontend setup

```bash
cd app/frontend
npm install
npm run dev
```

The frontend will be available at http://localhost:5173 by default.

## Environment variables

The backend reads a few environment variables from the shell if provided:

- `MODEL_PATH` — path to the model directory
- `DB_PATH` — SQLite database location
- `JWT_SECRET` — secret used for issuing JWTs
- `FIREBASE_SERVICE_ACCOUNT` — path to the Firebase service account JSON
- `VITE_API_URL` — backend URL used by the frontend

## Development workflow

1. Start the backend first.
2. Start the frontend in a second terminal.
3. Open the frontend in the browser and sign in or register.
4. Use the admin and reporting features from the appropriate UI screens.

## Notes for contributors

- The repository is currently structured for local development and experimentation.
- Large model assets and generated artifacts are expected to remain in the project root and should be handled carefully during commits.
- For production use, replace the development OTP flow and hard-coded secret defaults with secure production configuration.

## License

This project is intended for academic and personal development use unless otherwise specified by the repository owner.
