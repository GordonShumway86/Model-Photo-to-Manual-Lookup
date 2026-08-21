let worker = null;
const video = document.getElementById('webcam');
const canvas = document.getElementById('proc-canvas');
const captureBtn = document.getElementById('capture-btn');
const ocrOutput = document.getElementById('ocr-output');
const status = document.getElementById('status');
const fileInput = document.getElementById('file-input');
const googleFallbackBtn = document.getElementById('google-fallback-btn');

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

  // Pattern 2: Target typical HVAC/appliance model strings (mixed letters & digits, length 5-18)
  const tokens = text.split(/\s+/);
  const candidates = tokens.filter(token => {
    const cleaned = token.replace(/[^A-Z0-9-]/g, '');
    const hasLetter = /[A-Z]/.test(cleaned);
    const hasDigit = /[0-9]/.test(cleaned);
    return hasLetter && hasDigit && cleaned.length >= 5 && cleaned.length <= 18;
  });

  if (candidates.length > 0) {
    // Return the longest candidate match as the primary model string
    return candidates.reduce((a, b) => a.length >= b.length ? a : b).replace(/[^A-Z0-9-]/g, '');
  }

  // Fallback: Return raw cleaned text if no model pattern was identified
  return text.replace(/[^A-Z0-9\s-]/g, '').replace(/\s+/g, ' ').trim();
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
    } else {
      status.innerText = "No valid model number found. Try aligning closer.";
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

if (googleFallbackBtn) {
  googleFallbackBtn.addEventListener('click', () => {
    const q = encodeURIComponent(ocrOutput.value.trim());
    if (!q) return;
    window.open(`https://www.google.com/search?q=${q}+manual+filetype:pdf`, '_blank');
  });
}

initCamera();
initOCR();
