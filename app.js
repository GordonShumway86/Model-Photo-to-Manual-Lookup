let worker = null;
const video = document.getElementById('webcam');
const canvas = document.getElementById('proc-canvas');
const captureBtn = document.getElementById('capture-btn');
const ocrOutput = document.getElementById('ocr-output');
const status = document.getElementById('status');
const fileInput = document.getElementById('file-input');
const searchBtns = document.querySelectorAll('.search-btn');

async function initCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { max: 1920 }, height: { max: 1080 } }
    });
    video.srcObject = stream;
  } catch (err) {
    status.innerText = "Camera access error: " + err.message;
  }
}

async function initOCR() {
  status.innerText = "Loading OCR Engine...";
  try {
    worker = await Tesseract.createWorker('eng');
    status.innerText = "Ready to Scan";
  } catch (e) {
    status.innerText = "OCR Engine Failed.";
  }
}

async function processImage(imageSource) {
  status.innerText = "Processing Image...";
  const ctx = canvas.getContext('2d');
  
  if (imageSource instanceof HTMLVideoElement) {
    canvas.width = imageSource.videoWidth;
    canvas.height = imageSource.videoHeight;
  } else if (imageSource instanceof HTMLImageElement) {
    canvas.width = imageSource.width;
    canvas.height = imageSource.height;
  }
  
  ctx.filter = 'contrast(200%) grayscale(100%) brightness(1.1)';
  ctx.drawImage(imageSource, 0, 0, canvas.width, canvas.height);
  
  status.innerText = "Reading Text...";
  try {
    const { data: { text } } = await worker.recognize(canvas);
    const cleaned = text.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, ' ').trim();
    ocrOutput.value = cleaned;
    
    if (cleaned.length > 0) {
      status.innerText = "Scan Complete.";
      searchBtns.forEach(btn => btn.disabled = false);
    } else {
      status.innerText = "No text found. Try again.";
    }
  } catch (err) {
    status.innerText = "Scan Error: " + err.message;
  }
}

captureBtn.addEventListener('click', () => {
  if (!worker) return;
  processImage(video);
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file || !worker) return;
  
  const img = new Image();
  img.onload = () => {
    processImage(img);
    fileInput.value = '';
  };
  img.src = URL.createObjectURL(file);
});

function getQuery() {
  return encodeURIComponent(ocrOutput.value.trim());
}

document.querySelectorAll('.search-btn').forEach(button => {
  button.addEventListener('click', () => {
    const q = getQuery();
    if (!q) return;

    const target = button.dataset.target;
    let url = '';

    if (target === 'manualsplus') {
      url = `https://www.google.com/search?q=site:manuals.plus+${q}`;
    } else if (target === 'archive') {
      url = `https://archive.org/search.php?query=${q}+manual`;
    } else if (target === 'duckduckgo') {
      url = `https://duckduckgo.com/?q=${q}+manual`;
    } else if (target === 'google') {
      url = `https://www.google.com/search?q=${q}+manual+filetype:pdf`;
    }

    if (url) window.open(url, '_blank');
  });
});

initCamera();
initOCR();
