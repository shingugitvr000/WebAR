class ARCamera {
    constructor(unityCanvas, videoCapture) {
        this.unityCanvas = unityCanvas;
        this.videoCanvas = videoCapture;
        this.video_ctx = this.videoCanvas.getContext('2d');
        this.usingUnityVideoPlane = false;
        this.RESIZE_DELAY = 50;
        this.FRAMERATE = 30;
        this.SUBSCRIBED_TRACKERS = [];
        this.maxFrameSize = 1920;
        this.videoCapture = document.createElement('canvas');
        this.videoCapture.id = 'videoCapture';
        this.videoCapture.width = 1920;
        this.videoCapture.height = 1080;
        document.body.appendChild(this.videoCapture);
        this.capture_ctx = this.videoCapture.getContext('2d');
        this.videoCapture.style.position = 'absolute';
        this.videoCapture.style.top = '-100';
        this.videoCapture.style.zIndex = '200%';
        this.setFrameSize(this.maxFrameSize);
        this.usingUnityVideoPlane = false;
        this.onStartResizeCallbacks = [];
        this.onFinishedResizeCallbacks = [];
        this.lastOrientation = window.matchMedia('(orientation: portrait)').matches ? 'PORTRAIT' : 'LANDSCAPE';
        window.addEventListener('resize', this.resizeWithDelay.bind(this), true);
    }

    setFlipped(flipped) {
        this.videoCanvas.style.transform = flipped ? 'scaleX(-1)' : '';
        window.unityInstance.SendMessage('ARCamera', 'SetFlippedMessage', flipped ? 'true' : 'false');
    }

    pauseCamera() {
        this.cameraPaused = true;
        this.VIDEO.pause();
    }

    unpauseCamera() {
        this.cameraPaused = false;
        this.VIDEO.play();
    }

    setARCameraSettings(settingsJson) {
        const settings = JSON.parse(settingsJson);
        Object.keys(settings).forEach(key => {
            if (key in this && this[key] != settings[key]) {
                this[key] = settings[key];
            }
        });
    }

    async startWebcam(video) {
        this.VIDEO = video;
        try {
            await video.play();
            if (!this.videoCapture) {
                return Promise.reject('videoCapture canvas is null. Please call new ARCamera(unityCanvas, videoCapture) properly before starting the Webcam');
            } else if (!this.unityCanvas) {
                return Promise.reject('unityCanvas is null. Please call new ARCamera(unityCanvas, videoCapture) properly before starting the Webcam');
            }
            this.resizeCanvas();
            this.lastUpdateTime = Date.now();
            this.lastDetectTime = Date.now();
            this.lastMatchTrackTime = Date.now();
            this.updateInterval = setInterval(this.update.bind(this), 1000 / this.FRAMERATE);
            this.isCameraStarted = true;
            return Promise.resolve();
        } catch (error) {
            return Promise.reject(error);
        }
    }

    stopWebcam() {
        const tracks = this.VIDEO.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        this.VIDEO.srcObject = null;
        clearInterval(this.updateInterval);
    }

    update() {
        if (this.cameraPaused) return;
        if (!this.VIDEO) return;

        const video = this.VIDEO;
        const captureCanvas = this.videoCapture;
        const displayCanvas = this.videoCanvas;

        const scaleX = captureCanvas.width / video.videoWidth;
        const scaleY = captureCanvas.height / video.videoHeight;
        const scale = Math.min(scaleX, scaleY);
        const x = (captureCanvas.width - video.videoWidth * scale) / 2;
        const y = (captureCanvas.height - video.videoHeight * scale) / 2;

        this.capture_ctx.clearRect(0, 0, captureCanvas.width, captureCanvas.height);
        this.capture_ctx.setTransform(scale, 0, 0, scale, x, y);
        this.capture_ctx.drawImage(this.VIDEO, 0, 0);

        if (!this.usingUnityVideoPlane) {
            displayCanvas.width = window.innerWidth;
            displayCanvas.height = window.innerHeight;

            const scaleX = displayCanvas.width / video.videoWidth;
            const scaleY = displayCanvas.height / video.videoHeight;
            const scale = Math.max(scaleX, scaleY);
            const x = (displayCanvas.width - video.videoWidth * scale) / 2;
            const y = (displayCanvas.height - video.videoHeight * scale) / 2;

            this.video_ctx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
            this.video_ctx.setTransform(scale, 0, 0, scale, x, y);
            this.video_ctx.drawImage(this.VIDEO, 0, 0);
        }

        this.SUBSCRIBED_TRACKERS.forEach(tracker => {
            tracker.update();
        });

        if (this.updateUnityVideoTextureCallback) {
            this.updateUnityVideoTextureCallback();
        }
    }

    subscribeToWebcamUpdates(tracker, callback) {
        if (this.SUBSCRIBED_TRACKERS.includes(tracker)) {
            return;
        }
        this.SUBSCRIBED_TRACKERS.push(tracker);
    }

    setFrameSize(size) {
        this.maxFrameSize = size;
        const canvas = this.videoCapture;
        const video = this.VIDEO;
        if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) return;

        // 비디오 해상도에 맞춰 캔버스 크기 조정
        const videoAspect = video.videoWidth / video.videoHeight;
        const canvasWidth = Math.min(size, 1920); // 최대 1920px 너비
        const canvasHeight = Math.min(size, canvasWidth / videoAspect);
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
    }

    setFramerate(framerate) {
        this.FRAMERATE = framerate;
        clearInterval(this.updateInterval);
        this.updateInterval = setInterval(this.update.bind(this), 1000 / this.FRAMERATE);
    }

    resizeWithDelay(event) {
        if (event != null && event.target != window) return;
        if (!arCamera.unityCanvas.parentElement || !arCamera.unityCanvas.parentElement.style) return;
        var delay = arCamera.RESIZE_DELAY;

        arCamera.SUBSCRIBED_TRACKERS.forEach(tracker => {
            tracker.onStartResize();
        });
        arCamera.unityCanvas.style.opacity = 0;
        arCamera.videoCanvas.style.opacity = 0;
        setTimeout(() => {
            arCamera.resizeCanvas();
        }, delay);

        var parent = arCamera.unityCanvas.parentElement;
        setTimeout(() => {
            parent.style.display = 'none';
        }, delay + 5);
        setTimeout(() => {
            parent.style.display = '';
        }, delay + 50);

        setTimeout(() => {
            arCamera.SUBSCRIBED_TRACKERS.forEach(tracker => {
                tracker.onFinishedResize();
            });

            var fadeDuration = 500;
            var fadeInterval = 10;

            if (arCamera.fadeId) clearInterval(arCamera.fadeId);

            arCamera.fadeId = setInterval(() => {
                var opacity = parseFloat(arCamera.unityCanvas.style.opacity);
                opacity += 1 / (fadeDuration / fadeInterval);
                opacity = Math.min(opacity, 1);
                arCamera.unityCanvas.style.opacity = opacity;
                arCamera.videoCanvas.style.opacity = opacity;
                if (opacity >= 1) clearInterval(arCamera.fadeId);
            }, fadeInterval);
        }, delay + 100);
    }

    resizeCanvas() {
        if (!window.arCamera) window.arCamera = this;
        var captureCanvas = this.videoCapture;
        var video = this.VIDEO;

        if (!captureCanvas || !video || video.videoWidth <= 0 || video.videoHeight <= 0) return;

        var aspectRatio = window.innerWidth / window.innerHeight;

        this.setFrameSize(this.maxFrameSize);
        this.SUBSCRIBED_TRACKERS.forEach(tracker => {
            tracker.setCamDims(captureCanvas.width, captureCanvas.height);
        });
        this.updateCameraFOV();

        // 전체 화면에 맞춰 Unity 캔버스 크기 조정
        this.unityCanvas.style.width = '100vw';
        this.unityCanvas.style.height = '100vh';

        window.unityInstance.SendMessage('ARCamera', 'Resize', video.videoWidth + ',' + video.videoHeight);

        var newOrientation = window.matchMedia('(orientation: portrait)').matches ? 'PORTRAIT' : 'LANDSCAPE';
        if (this.lastOrientation != newOrientation) {
            window.unityInstance.SendMessage('ARCamera', 'SetOrientationMessage', newOrientation);
            this.lastOrientation = newOrientation;
        }
    }

    updateCameraFOV() {
        const unityCanvas = this.unityCanvas;
        const captureCanvas = this.videoCapture;
        const video = this.VIDEO;

        if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) return;

        const screenAspect = window.innerWidth / window.innerHeight;
        const videoAspect = video.videoWidth / video.videoHeight;

        unityCanvas.style.width = '100vw';
        unityCanvas.style.height = '100vh';

        const rect = this.videoCapture.getBoundingClientRect();

        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        const fovFactor = 0.5 / Math.max(videoAspect, screenAspect);
        const distance = 1;
        const fov = 2 * Math.atan(fovFactor / distance) * 180 / Math.PI;

        this.FOV = fov;

        if (window.unityInstance) {
            window.unityInstance.SendMessage('ARCamera', 'SetCameraFov', fov);
        }
    }

    getCameraTexture(type) {
        const canvas = this.videoCapture;
        const dataUrl = canvas.toDataURL(type);
        return dataUrl;
    }

    getVideoDims() {
        return this.VIDEO.videoWidth + ',' + this.VIDEO.videoHeight;
    }
}
