# hungry-rp - WIP

roleplaying shouldn't be so passively stimulating.

i've been struggling for a while when using SillyTavern, Marinara, Lumiverse etc. (btw all are amazing projects). they are all too _feature-rich per-se_, which is cool, but just not my vibe.

so this project is focused on having the simplest roleplaying experience without missing the necessary features, at least for me.

## what it can do (at the moment)
- connect to any OpenAI chat completions based API (e.g. llama.cpp, Ollama, OpenRouter etc.)
- basic chatting
- conversation branching
- use detailed presets with toggles
- import/export characters, conversations and presets
- create personas, and import personas from SillyTavern userdata

## architecture
- uses a basic Vite frontend
- uses a Python FastAPI instance as backend/proxy
- uses local IndexedDB-based browser storage
- uses `config.yaml` as the shared runtime configuration file

## configuration
host URLs, ports, CORS origins, and the provider base URL are configurable in `./config.yaml`.

default values:
- frontend: `http://localhost:5173`
- backend/proxy: `http://localhost:8025`
- provider: `http://localhost:5000/v1`

## requirements
- Node.js/npm
- Python
- uv

if you don't have [uv](https://github.com/astral-sh/uv) installed, install it:

```sh
curl -LsSf https://astral.sh/uv/install.sh | sh # Linux/macOS
```

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex" # Windows
```

## run
clone the project wherever you want hungry-rp to live:

```sh
git clone https://github.com/bombdefuser-124/hungry-rp
cd hungry-rp
```

run one of the commands below, based on your OS/shell:

```sh
./start.fish # Linux/macOS, fish
./start.sh   # Linux/macOS, shell
./start.bash # Linux/macOS, bash
```

```bat
start.bat
```

the start script installs frontend/backend dependencies, starts the Python proxy, and starts the Vite frontend.