const DEFAULT_HELPER_URL = "http://127.0.0.1:27183";

const helperUrlInput = document.getElementById("helperUrl");
const fileInput = document.getElementById("fileInput");
const fileLabel = document.getElementById("fileLabel");
const dropzone = document.getElementById("dropzone");
const checkButton = document.getElementById("checkButton");
const convertButton = document.getElementById("convertButton");
const statusElement = document.getElementById("status");

let selectedFile = null;

init().catch((error) => {
  setStatus(`Initialization failed: ${error.message}`, true);
});

async function init() {
  const stored = await chrome.storage.local.get(["helperUrl"]);
  helperUrlInput.value = stored.helperUrl || DEFAULT_HELPER_URL;
  bindEvents();
  void checkHelper(false);
}

function bindEvents() {
  helperUrlInput.addEventListener("change", persistHelperUrl);
  fileInput.addEventListener("change", handleFileInputChange);
  checkButton.addEventListener("click", () => {
    void checkHelper(true);
  });
  convertButton.addEventListener("click", () => {
    void convertFile();
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add("is-dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove("is-dragging");
    });
  });

  dropzone.addEventListener("drop", (event) => {
    const [file] = event.dataTransfer.files || [];
    if (!file) {
      return;
    }
    setSelectedFile(file);
  });
}

async function persistHelperUrl() {
  const helperUrl = normalizeBaseUrl(helperUrlInput.value);
  helperUrlInput.value = helperUrl;
  await chrome.storage.local.set({ helperUrl });
}

function handleFileInputChange(event) {
  const [file] = event.target.files || [];
  setSelectedFile(file || null);
}

function setSelectedFile(file) {
  selectedFile = file;
  fileLabel.textContent = file ? file.name : "Choose a .caj file";
  if (file && !file.name.toLowerCase().endsWith(".caj")) {
    setStatus("Selected file does not end with .caj. Conversion may fail.", true);
    return;
  }
  setStatus(file ? "File selected. Ready to convert." : "Ready.");
}

async function checkHelper(verbose) {
  const helperUrl = normalizeBaseUrl(helperUrlInput.value);
  helperUrlInput.value = helperUrl;
  await chrome.storage.local.set({ helperUrl });

  try {
    const response = await fetch(`${helperUrl}/health`, { method: "GET" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    if (verbose) {
      const detail = payload.mode ? ` mode: ${payload.mode}.` : "";
      setStatus(`Helper online.${detail}`);
    } else {
      setStatus("Helper detected.");
    }
  } catch (error) {
    setStatus(`Helper unavailable at ${helperUrl}: ${error.message}`, true);
  }
}

async function convertFile() {
  if (!selectedFile) {
    setStatus("Choose a .caj file first.", true);
    return;
  }

  const helperUrl = normalizeBaseUrl(helperUrlInput.value);
  await chrome.storage.local.set({ helperUrl });

  setBusy(true);
  setStatus("Uploading file to local helper...");

  try {
    const formData = new FormData();
    formData.append("file", selectedFile, selectedFile.name);

    const response = await fetch(`${helperUrl}/convert`, {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const message = await readErrorMessage(response);
      throw new Error(message);
    }

    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const outputName = selectedFile.name.replace(/\.caj$/i, "") || "converted";

    await chrome.downloads.download({
      url: downloadUrl,
      filename: `${outputName}.pdf`,
      saveAs: true
    });

    setStatus("Conversion succeeded. PDF download started.");
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 15000);
  } catch (error) {
    setStatus(`Conversion failed: ${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

async function readErrorMessage(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json();
    return data.detail || JSON.stringify(data);
  }
  return await response.text();
}

function normalizeBaseUrl(url) {
  return (url || DEFAULT_HELPER_URL).trim().replace(/\/+$/, "");
}

function setBusy(isBusy) {
  convertButton.disabled = isBusy;
  checkButton.disabled = isBusy;
}

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("error", Boolean(isError));
}
