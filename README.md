# Client-Side Video Compression Demo

This project is a React application that demonstrates **client-side video compression** using the [WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) for modern browsers, with a fallback to the [MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder_API) for broader compatibility. The app features an upload widget that allows users to select a video file, compress it directly in the browser, and preview or download the result—all without uploading the video to a server.

## Features

- 📦 **Client-side compression**: No server upload required.
- 🚀 **WebCodecs API**: Uses hardware-accelerated H.264/AAC encoding when available.
- 🔄 **MediaRecorder fallback**: Ensures compatibility on browsers without WebCodecs.
- 🎛️ **Customizable presets**: Easily adjust compression settings.
- ⚡ **Fast and private**: All processing happens locally in your browser.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or newer recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)

### Installation

1.  **Clone the repository:**

    ```sh
    git clone https://github.com/your-username/client-side-compression.git
    cd client-side-compression
    ```

2.  **Install dependencies:**

    ```sh
    npm install
    # or
    yarn install
    ```

3.  **Start the development server:**

    ```sh
    npm run dev
    # or
    yarn dev
    ```

4.  **Open your browser and visit:**

    ```
    http://localhost:5173
    ```

---

## How It Works

### WebCodecs API

The WebCodecs API provides low-level access to media encoding and decoding components, enabling efficient, hardware-accelerated video and audio processing directly in the browser. In this app, WebCodecs is used to:

- Decode the uploaded video.
- Re-encode it using H.264 (video) and AAC (audio) codecs.
- Mux the result into an MP4 file using the **mediabunny** library.

### MediaRecorder API Fallback

If the browser does not support WebCodecs, the app falls back to the MediaRecorder API:

- The video is drawn frame-by-frame onto a `<canvas>`.
- Audio is captured using the Web Audio API.
- Both streams are combined and recorded using MediaRecorder, producing a WebM or MP4 file (depending on browser support).

---

## Core Components

- **UploadWidget**: The main UI component for file selection and compression.
- **compressVideo**: Handles the logic for choosing between WebCodecs and MediaRecorder.
- **compressWithWebCodecs**: Implements compression using WebCodecs.
- **compressWithMediaRecorder**: Implements compression using MediaRecorder.

---

## License

This repository is licensed under the Apache License 2.0.

_Note: This project is for demonstration and educational purposes. Browser support for WebCodecs is still evolving. For best results, use the latest version of Chrome or Edge._
