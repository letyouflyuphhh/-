# CAJ to PDF

Local browser-extension workflow for converting downloaded `.caj` files into `.pdf` through a local helper service.

Project location:

```text
D:\wendang\New project 1\CAJ to PDF
```

## What It Does

- Loads as a Chrome or Edge extension from `extension/`
- Lets the user choose a local `.caj` file from the popup
- Sends the file to a local helper on `127.0.0.1:27183`
- Converts with vendored `caj2pdf` logic plus `mutool`
- Returns a downloadable PDF

## Structure

```text
CAJ to PDF/
├─ extension/
│  ├─ manifest.json
│  ├─ popup.html
│  ├─ popup.css
│  └─ popup.js
├─ helper/
│  ├─ requirements.txt
│  ├─ server.py
│  └─ .venv/
├─ vendor/
├─ samples/
├─ third_party/
└─ start-helper.ps1
```

## Requirements

- Windows
- Python
- `mutool` available locally

The helper currently reports:

- Host: `127.0.0.1`
- Port: `27183`
- Mode: `vendored-caj2pdf`

## Start The Helper

From the project root:

```powershell
.\start-helper.ps1
```

This script:

- creates `helper/.venv` if missing
- installs dependencies from `helper/requirements.txt`
- starts `uvicorn` on `http://127.0.0.1:27183`

Manual start is also supported:

```powershell
cd helper
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn server:app --host 127.0.0.1 --port 27183 --app-dir .
```

Health check:

```text
GET http://127.0.0.1:27183/health
```

## Load The Extension

Chrome:

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click `Load unpacked`
4. Choose `extension/`

Edge:

1. Open `edge://extensions`
2. Enable Developer mode
3. Click `Load unpacked`
4. Choose `extension/`

## Usage

1. Start the local helper
2. Open the extension popup
3. Choose a local `.caj` file
4. Click `Convert`
5. Download the returned PDF

## API

- `GET /health`
- `POST /convert`

`POST /convert` accepts multipart form data with a single uploaded file.

## Validation Notes

Verified locally:

- helper starts successfully from the new location
- `GET /health` returns `200 OK`
- non-`.caj` uploads are rejected with `400` and `Only .caj files are supported.`

Not fully verified in this session:

- real `.caj` to `.pdf` conversion on a sample CAJ file, because no sample `.caj` file was present in the project

## Current Limitations

- single-file conversion only
- depends on local helper service
- depends on local `mutool` availability
- no Native Messaging integration yet
- no batch conversion or history UI yet
