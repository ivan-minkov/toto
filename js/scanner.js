/**
 * TOTO SCANNER PRO - CAMERA & VIEWPORT CONTROLLER
 * Handles video stream, torch control, camera switching and capture
 */

const TotoScanner = {
  videoEl: null,
  stream: null,
  currentFacingMode: 'environment', // back camera by default
  isTorchOn: false,
  track: null,

  async init(videoElementId) {
    this.videoEl = document.getElementById(videoElementId);
    return this.startCamera();
  },

  isLiveActive: false,

  async startCamera() {
    this.stopCamera();

    if (!this.videoEl) return false;

    // Mobile-critical video attributes: required for Safari and Chrome on iOS/Android
    this.videoEl.setAttribute('autoplay', '');
    this.videoEl.setAttribute('muted', '');
    this.videoEl.setAttribute('playsinline', 'true');
    this.videoEl.setAttribute('webkit-playsinline', 'true');
    this.videoEl.muted = true;

    // Check if navigator.mediaDevices is supported and origin is secure
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('getUserMedia is not available (insecure context or browser unsupported).');
      this.isLiveActive = false;
      return false;
    }

    const constraintOptions = [
      {
        video: {
          facingMode: { ideal: this.currentFacingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      },
      {
        video: { facingMode: { ideal: this.currentFacingMode } },
        audio: false
      },
      {
        video: { facingMode: this.currentFacingMode },
        audio: false
      },
      {
        video: true,
        audio: false
      }
    ];

    for (const constraints of constraintOptions) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.videoEl.srcObject = this.stream;
        await this.videoEl.play();
        this.track = this.stream.getVideoTracks()[0];
        this.isLiveActive = true;
        return true;
      } catch (err) {
        console.warn('Camera constraint failed, trying next:', constraints, err.name);
      }
    }

    this.isLiveActive = false;
    return false;
  },

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
      this.track = null;
    }
    this.isTorchOn = false;
  },

  async toggleTorch() {
    if (!this.track) return false;
    try {
      const capabilities = this.track.getCapabilities?.() || {};
      if (capabilities.torch) {
        this.isTorchOn = !this.isTorchOn;
        await this.track.applyConstraints({
          advanced: [{ torch: this.isTorchOn }]
        });
        return this.isTorchOn;
      }
    } catch (e) {
      console.warn('Torch toggle failed:', e);
    }
    return false;
  },

  async switchCamera() {
    this.currentFacingMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
    return this.startCamera();
  },

  /**
   * Capture still frame from live video
   */
  captureFrame() {
    if (!this.videoEl || !this.videoEl.videoWidth) return null;

    const canvas = document.createElement('canvas');
    canvas.width = this.videoEl.videoWidth;
    canvas.height = this.videoEl.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(this.videoEl, 0, 0, canvas.width, canvas.height);
    return canvas;
  },

  /**
   * Capture a full-resolution still photo (sensor resolution, autofocus) when the
   * browser supports ImageCapture (Chrome/Android). Falls back to a video frame.
   */
  async capturePhoto() {
    if (this.track && 'ImageCapture' in window) {
      try {
        const ic = new window.ImageCapture(this.track);
        const blob = await Promise.race([
          ic.takePhoto(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('takePhoto timeout')), 4000))
        ]);
        const canvas = await this.blobToCanvas(blob);
        if (canvas && canvas.width >= (this.videoEl?.videoWidth || 0)) return canvas;
      } catch (e) {
        console.warn('ImageCapture.takePhoto failed, using video frame:', e);
      }
    }
    return this.captureFrame();
  },

  async blobToCanvas(blob) {
    let source;
    if ('createImageBitmap' in window) {
      try {
        source = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      } catch (e) {
        source = null;
      }
    }
    if (!source) {
      source = await new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
        img.src = url;
      });
    }
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    canvas.getContext('2d').drawImage(source, 0, 0);
    if (source.close) source.close();
    return canvas;
  },

  /**
   * Load image file from gallery / file input into canvas
   */
  loadImageFromFile(file) {
    // Object URL / ImageBitmap instead of base64 data URL: far less memory for 12MP phone photos
    return this.blobToCanvas(file);
  },

  /**
   * Load image from SVG URL into canvas
   */
  loadImageFromUrl(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width || 420;
        canvas.height = img.height || 700;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas);
      };
      img.onerror = reject;
      img.src = url;
    });
  }
};
