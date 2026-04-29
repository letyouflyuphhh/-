import os
import re
import sys
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

HOST = "127.0.0.1"
PORT = 27183
VENDOR_DIR = Path(__file__).resolve().parent.parent / "vendor" / "caj2pdf"

if str(VENDOR_DIR) not in sys.path:
    sys.path.insert(0, str(VENDOR_DIR))

from cajparser import CAJParser, resolve_mutool_executable

app = FastAPI(title="CAJ to PDF Helper", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "ok": True,
        "host": HOST,
        "port": PORT,
        "mode": "vendored-caj2pdf",
        "mutool": resolve_mutool_executable(),
    }


@app.post("/convert")
async def convert(file: UploadFile = File(...)):
    filename = file.filename or "input.caj"
    suffix = Path(filename).suffix.lower()
    if suffix != ".caj":
        raise HTTPException(status_code=400, detail="Only .caj files are supported.")

    with tempfile.TemporaryDirectory(prefix="caj-helper-") as temp_dir:
        input_path = Path(temp_dir) / safe_name(filename)
        output_path = input_path.with_suffix(".pdf")

        contents = await file.read()
        input_path.write_bytes(contents)

        try:
            converter = CAJParser(str(input_path))
            converter.convert(str(output_path))
        except SystemExit as error:
            raise HTTPException(status_code=500, detail=str(error)) from error
        except FileNotFoundError as error:
            raise HTTPException(
                status_code=500,
                detail=(
                    "Required executable not found. Set CAJ2PDF_MUTOOL_PATH or install mutool. "
                    f"Original error: {error}"
                ),
            ) from error

        if not output_path.exists():
            raise HTTPException(
                status_code=500,
                detail="Converter finished without producing a PDF file.",
            )

        pdf_bytes = output_path.read_bytes()
        download_name = ascii_download_name(output_path.name)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{download_name}"',
            },
        )


def safe_name(filename: str) -> str:
    return Path(filename).name or "input.caj"


def ascii_download_name(filename: str) -> str:
    stem = Path(filename).stem
    safe_stem = re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip("._-") or "converted"
    return f"{safe_stem}.pdf"
