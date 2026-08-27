let worker = null;
const video = document.getElementById('webcam');
const canvas = document.getElementById('proc-canvas');
const captureBtn = document.getElementById('capture-btn');
const ocrOutput = document.getElementById('ocr-output');
const status = document.getElementById('status');
const fileInput = document.getElementById('file-input');
const googleFallbackBtn = document.getElementById('google-fallback-btn');
const resultsList = document.getElementById('results-list');
const reticle = document.getElementById('reticle');
const cameraOverlay = document.getElementById('camera-overlay');
const cameraOverlayText = document.getElementById('camera-overlay-text');
const cameraRetryBtn = document.getElementById('camera-retry');

let cameraReady = false;
let ocrReady = false;

// Verified public HVAC manual providers
const MANUAL_PROVIDERS = [
  {
    name: "Trane Product Data",
    getUrl: (model) => `https://www.trane.com/residential/en/resources/owners-guides/?q=${encodeURIComponent(model)}`
  },
  {
    name: "Carrier Literature Search",
    getUrl: (model) => `https://www.carrier.com/residential/en/us/technical-support/manuals/?q=${encodeURIComponent(model)}`
  },
  {
    name: "Lennox Technical Documents",
    getUrl: (model) => `https://www.lennox.com/support/manuals-and-specifications?q=${encodeURIComponent(model)}`
  },
  {
    name: "InspectAPedia HVAC Repository",
    getUrl: (model) => `https://www.google.com/search?q=site:inspectapedia.com+${encodeURIComponent(model)}+manual+filetype:pdf`
  },
  {
    name: "ManualsLib PDF Direct Search",
    getUrl: (model) => `https://www.manualslib.com/search.html?q=${encodeURIComponent(model)}`
  },
  {
    name: "SupplyHouse Product Specs & Manuals",
    getUrl: (model) => `https://www.supplyhouse.com/sh/control/search/~SEARCH_STRING=${encodeURIComponent(model)}`
  }
];

function updateCaptureAvailability() {
  captureBtn.disabled = !(cameraReady && ocrReady);
  reticle.classList.toggle('scanning', cameraReady && ocrReady);
  if (cameraReady && ocrReady) {
    status.innerText = 'Ready to Scan';
  } else if (cameraReady && !ocrReady) {
    status.innerText = 'Camera ready — loading OCR engine…';
  } else if (!cameraReady && ocrReady) {
    status.innerText = 'OCR ready — waiting on camera…';
  }
}

function showCameraOverlay(message) {
  cameraOverlayText.innerText = message;
  cameraOverlay.classList.add('visible');
}

function hideCameraOverlay() {
  cameraOverlay.classList.remove('visible');
}

async function initCamera() {
  cameraReady = false;
  updateCaptureAvailability();
  hideCameraOverlay();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const msg = 'Camera requires a secure connection (https://) or localhost. Open this page over HTTPS to use the camera, or use the Photo button instead.';
    status.innerText = msg;
    showCameraOverlay(msg);
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { max: 1920 }, height: { max: 1080 } }
    });
    video.srcObject = stream;
    try {
      await video.play();
    } catch (playErr) {
      // Some browsers require this even with the autoplay attribute set.
    }
    await new Promise((resolve) => {
      if (video.readyState >= 2 && video.videoWidth > 0) return resolve();
      video.onloadedmetadata = () => resolve();
      setTimeout(resolve, 1500);
    });
    cameraReady = true;
    updateCaptureAvailability();
  } catch (err) {
    const msg = 'Camera access error: ' + err.message;
    status.innerText = msg;
    showCameraOverlay(msg);
    updateCaptureAvailability();
  }
}

async function initOCR() {
  status.innerText = 'Loading OCR Engine...';
  try {
    worker = await Tesseract.createWorker('eng');
    ocrReady = true;
    updateCaptureAvailability();
  } catch (e) {
    status.innerText = 'OCR Engine Failed: ' + e.message;
  }
}

/**
 * Extracts candidate model numbers from raw OCR text using regex heuristics.
 */
function extractModelNumber(rawText) {
  // Normalize line breaks and spaces
  const text = rawText.replace(/[\r\n]+/g, ' ').toUpperCase();

  // Pattern 1: Target common prefixes like "MODEL:", "MOD:", "MODEL NO:", "M/N:"
  const prefixMatch = text.match(/(?:MODEL|MOD|M\/N|MOD NO|MODEL NO)[\s.:#-]*([A-Z0-9\/-]{4,20})/i);
  if (prefixMatch && prefixMatch[1]) {
    return prefixMatch[1].trim();
  }

  // No "MODEL"-style label found — don't guess from noise, report nothing.
  return '';
}

/**
 * Renders one link per provider inside the existing results-list panel,
 * using the page's own styling instead of inline styles.
 */
function renderManualLinks(modelNumber) {
  resultsList.innerHTML = '';

  if (!modelNumber) return;

  MANUAL_PROVIDERS.forEach(provider => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = provider.getUrl(modelNumber);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.innerText = provider.name;
    li.appendChild(a);
    resultsList.appendChild(li);
  });
}

async function processImage(imageSource) {
  status.innerText = "Processing Image...";
  const ctx = canvas.getContext('2d');
  
  let srcWidth = 0;
  let srcHeight = 0;

  if (imageSource instanceof HTMLVideoElement) {
    srcWidth = imageSource.videoWidth;
    srcHeight = imageSource.videoHeight;
  } else if (imageSource instanceof HTMLImageElement) {
    srcWidth = imageSource.width;
    srcHeight = imageSource.height;
  }

  if (!srcWidth || !srcHeight) {
    status.innerText = "Error: Invalid image source.";
    return;
  }

  // Crop around the reticle region (center 70% width, center 50% height) to avoid surrounding plate text
  const cropWidth = srcWidth * 0.70;
  const cropHeight = srcHeight * 0.50;
  const cropX = (srcWidth - cropWidth) / 2;
  const cropY = (srcHeight - cropHeight) / 2;

  canvas.width = cropWidth;
  canvas.height = cropHeight;

  // Apply high contrast & grayscale filter for tag reading
  ctx.filter = 'contrast(200%) grayscale(100%) brightness(1.1)';
  ctx.drawImage(imageSource, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  
  status.innerText = "Reading Model Number...";
  try {
    const { data: { text } } = await worker.recognize(canvas);
    const detectedModel = extractModelNumber(text);
    
    ocrOutput.value = detectedModel;
    
    if (detectedModel.length > 0) {
      status.innerText = "Scan Complete.";
      if (googleFallbackBtn) googleFallbackBtn.disabled = false;
      renderManualLinks(detectedModel);
    } else {
      status.innerText = "No valid model number found. Try aligning closer.";
    }
  } catch (err) {
    status.innerText = "Scan Error: " + err.message;
  }
}

captureBtn.addEventListener('click', () => {
  if (!worker || !cameraReady) return;
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

if (googleFallbackBtn) {
  googleFallbackBtn.addEventListener('click', () => {
    const q = encodeURIComponent(ocrOutput.value.trim());
    if (!q) return;
    window.open(`https://www.google.com/search?q=${q}+manual+filetype:pdf`, '_blank');
  });
}

if (cameraRetryBtn) {
  cameraRetryBtn.addEventListener('click', () => {
    status.innerText = 'Starting camera…';
    initCamera();
  });
}

initCamera();
initOCR();
