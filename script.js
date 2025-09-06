document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('video-feed');
    const overlay = document.getElementById('overlay');
    const canvas = document.getElementById('capture-canvas');
    const zoomSlider = document.getElementById('zoom-slider');
    const switchCameraButton = document.getElementById('switch-camera-button');
    const statusText = document.getElementById('status-text');
    const spinner = document.getElementById('spinner');

    let currentStream;
    let videoTrack;
    let tesseractWorker;
    let isProcessing = false;
    let currentFacingMode = 'environment';

    async function setupTesseract() {
        statusText.textContent = 'Loading OCR model...';
        spinner.classList.remove('hidden');
        tesseractWorker = await Tesseract.createWorker('eng', 1, {
            logger: m => {
                if (m.status === 'recognizing text') {
                    statusText.textContent = `Recognizing... ${Math.round(m.progress * 100)}%`;
                }
            }
        });
        statusText.textContent = 'Ready';
        spinner.classList.add('hidden');
    }

    async function startCamera(facingMode) {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }
        try {
            const constraints = {
                video: {
                    facingMode: { exact: facingMode },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            };
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = currentStream;
            videoTrack = currentStream.getVideoTracks()[0];
            setupZoom();
        } catch (error) {
            console.error('Error accessing camera:', error);
            statusText.textContent = 'Camera access denied.';
            alert('Could not access the camera. Please ensure you have a camera and have granted permission.');
        }
    }

    function setupZoom() {
        if (!videoTrack.getCapabilities || !videoTrack.getCapabilities().zoom) {
            zoomSlider.disabled = true;
            return;
        }
        const { zoom } = videoTrack.getCapabilities();
        zoomSlider.min = zoom.min;
        zoomSlider.max = zoom.max;
        zoomSlider.step = zoom.step;
        zoomSlider.value = videoTrack.getSettings().zoom || zoom.min;
        zoomSlider.disabled = false;
    }

    zoomSlider.addEventListener('input', () => {
        if (videoTrack && !zoomSlider.disabled) {
            videoTrack.applyConstraints({ advanced: [{ zoom: zoomSlider.value }] });
        }
    });

    switchCameraButton.addEventListener('click', () => {
        currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
        startCamera(currentFacingMode);
    });

    function drawText(result) {
        overlay.innerHTML = '';
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;
        const displayWidth = video.clientWidth;
        const displayHeight = video.clientHeight;

        const scaleX = displayWidth / videoWidth;
        const scaleY = displayHeight / videoHeight;

        result.data.paragraphs.forEach(para => {
            const bbox = para.bbox;
            const div = document.createElement('div');
            div.classList.add('text-box');
            div.style.left = `${bbox.x0 * scaleX}px`;
            div.style.top = `${bbox.y0 * scaleY}px`;
            div.style.width = `${(bbox.x1 - bbox.x0) * scaleX}px`;
            div.style.height = `${(bbox.y1 - bbox.y0) * scaleY}px`;
            div.dataset.text = para.text;
            
            div.addEventListener('click', () => {
                speakText(para.text);
            });
            overlay.appendChild(div);
        });
    }

    function speakText(text) {
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel(); // Cancel any previous speech
            const utterance = new SpeechSynthesisUtterance(text);
            speechSynthesis.speak(utterance);
        } else {
            alert('Text-to-Speech is not supported in your browser.');
        }
    }

    async function recognizeFrame() {
        if (isProcessing || !tesseractWorker || !video.videoWidth) {
            return;
        }

        isProcessing = true;
        spinner.classList.remove('hidden');
        statusText.textContent = 'Capturing frame...';

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        const result = await tesseractWorker.recognize(canvas);
        drawText(result);
        
        statusText.textContent = 'Ready';
        spinner.classList.add('hidden');
        isProcessing = false;
    }
    
    async function init() {
        await setupTesseract();
        await startCamera(currentFacingMode);
        setInterval(recognizeFrame, 3000); // Process a frame every 3 seconds
    }

    init();
});

