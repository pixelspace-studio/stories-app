#!/usr/bin/env python3
"""
Manual test script - starts backend and opens a simple web interface
This bypasses Electron issues for testing
"""

import subprocess
import sys
import time
import webbrowser
import threading
from pathlib import Path

def start_backend():
    """Start the Flask backend"""
    print("🚀 Starting Flask backend...")
    
    try:
        # Start the backend
        process = subprocess.Popen([
            sys.executable, 'backend/app.py'
        ], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, 
           universal_newlines=True, bufsize=1)
        
        # Monitor output
        for line in process.stdout:
            print(f"Backend: {line.strip()}")
            if 'Running on http://127.0.0.1:5000' in line:
                print("✅ Backend ready!")
                break
                
    except Exception as e:
        print(f"❌ Backend failed: {e}")

def create_test_page():
    """Create a simple test page"""
    html_content = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Whisper Space - Web Test</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            background: #ffffff;
            color: #1a1a1a;
            max-width: 500px;
            margin: 40px auto;
            padding: 20px;
        }
        .container {
            background: #ffffff;
            border-radius: 16px;
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
            padding: 30px;
            border: 1px solid #e5e7eb;
        }
        h1 {
            text-align: center;
            color: #374151;
            font-weight: 500;
            margin-bottom: 30px;
        }
        .record-button {
            width: 120px;
            height: 120px;
            border-radius: 60px;
            border: 2px solid #e5e7eb;
            background: #1f2937;
            color: #f9fafb;
            font-size: 16px;
            font-weight: 500;
            cursor: pointer;
            display: block;
            margin: 0 auto 20px;
            transition: all 0.2s ease;
        }
        .record-button:hover {
            background: #374151;
            transform: translateY(-1px);
        }
        .record-button.recording {
            background: #3b82f6;
            border-color: #2563eb;
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.8; }
        }
        .timer {
            text-align: center;
            font-family: 'SF Mono', Monaco, monospace;
            font-size: 20px;
            color: #6b7280;
            margin-bottom: 20px;
        }
        .timer.recording {
            color: #3b82f6;
        }
        textarea {
            width: 100%;
            min-height: 120px;
            padding: 16px;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            font-size: 15px;
            background: #f9fafb;
            color: #374151;
            resize: vertical;
            margin-bottom: 15px;
        }
        .copy-button {
            padding: 12px 24px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            background: #1f2937;
            color: #f9fafb;
            cursor: pointer;
            display: block;
            margin: 0 auto;
        }
        .copy-button:disabled {
            opacity: 0.4;
            background: #9ca3af;
        }
        .status {
            text-align: center;
            margin: 20px 0;
            padding: 10px;
            border-radius: 8px;
            font-size: 14px;
        }
        .status.success { background: #d1fae5; color: #065f46; }
        .status.error { background: #fee2e2; color: #991b1b; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Voice to Text - Web Test</h1>
        
        <div id="status" class="status">Click the button to test backend connection</div>
        
        <button onclick="testBackend()" style="margin: 10px auto; display: block; padding: 8px 16px; background: #6b7280; color: white; border: none; border-radius: 6px;">
            Test Backend Connection
        </button>
        
        <button id="recordBtn" class="record-button" onclick="toggleRecord()">
            ● Record
        </button>
        
        <div id="timer" class="timer" style="display: none;">00:00</div>
        
        <textarea id="result" placeholder="Transcribed text will appear here..."></textarea>
        
        <button id="copyBtn" class="copy-button" onclick="copyText()" disabled>
            Copy to Clipboard
        </button>
    </div>

    <script>
        let recording = false;
        let mediaRecorder = null;
        let chunks = [];
        let startTime = null;
        let timer = null;

        function updateStatus(message, type = '') {
            const status = document.getElementById('status');
            status.textContent = message;
            status.className = `status ${type}`;
        }

        async function testBackend() {
            updateStatus('Testing backend connection...', '');
            
            try {
                const response = await fetch('http://127.0.0.1:5000/api/health');
                const data = await response.json();
                updateStatus(`✅ Backend connected! API: ${data.api_available ? 'Available' : 'Need API key'}`, 'success');
            } catch (error) {
                updateStatus(`❌ Backend failed: ${error.message}`, 'error');
            }
        }

        async function toggleRecord() {
            const btn = document.getElementById('recordBtn');
            const timerEl = document.getElementById('timer');
            
            if (!recording) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    mediaRecorder = new MediaRecorder(stream);
                    chunks = [];
                    
                    mediaRecorder.ondataavailable = (e) => {
                        if (e.data.size > 0) chunks.push(e.data);
                    };
                    
                    mediaRecorder.onstop = () => processAudio();
                    
                    mediaRecorder.start();
                    recording = true;
                    
                    btn.textContent = '■ Stop';
                    btn.classList.add('recording');
                    timerEl.style.display = 'block';
                    timerEl.classList.add('recording');
                    
                    startTimer();
                    updateStatus('🎙️ Recording... Speak now!', 'success');
                    
                } catch (error) {
                    updateStatus(`❌ Microphone error: ${error.message}`, 'error');
                }
            } else {
                mediaRecorder.stop();
                mediaRecorder.stream.getTracks().forEach(track => track.stop());
                
                recording = false;
                btn.textContent = '● Record';
                btn.classList.remove('recording');
                timerEl.style.display = 'none';
                timerEl.classList.remove('recording');
                
                stopTimer();
                updateStatus('Processing...', '');
            }
        }

        function startTimer() {
            startTime = Date.now();
            timer = setInterval(() => {
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                const mins = Math.floor(elapsed / 60);
                const secs = elapsed % 60;
                document.getElementById('timer').textContent = 
                    `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }, 1000);
        }

        function stopTimer() {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
        }

        async function processAudio() {
            try {
                const audioBlob = new Blob(chunks, { type: 'audio/webm' });
                const formData = new FormData();
                formData.append('audio', audioBlob, 'recording.webm');
                
                const response = await fetch('http://127.0.0.1:5000/api/transcribe', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (response.ok && result.text) {
                    document.getElementById('result').value = result.text;
                    document.getElementById('copyBtn').disabled = false;
                    updateStatus(`✅ Transcribed! Language: ${result.language}`, 'success');
                } else {
                    throw new Error(result.error || 'Transcription failed');
                }
                
            } catch (error) {
                updateStatus(`❌ Transcription error: ${error.message}`, 'error');
            }
        }

        async function copyText() {
            const text = document.getElementById('result').value;
            try {
                await navigator.clipboard.writeText(text);
                updateStatus('✅ Copied to clipboard!', 'success');
            } catch (error) {
                updateStatus(`❌ Copy failed: ${error.message}`, 'error');
            }
        }

        // Auto-test backend when page loads
        window.addEventListener('load', () => {
            setTimeout(testBackend, 1000);
        });
    </script>
</body>
</html>"""
    
    # Write the test page
    test_file = Path("web_test.html")
    test_file.write_text(html_content)
    return test_file

def main():
    print("🌐 Whisper Space - Manual Web Test")
    print("=" * 40)
    
    # Check if we're in the right directory
    if not Path("backend/app.py").exists():
        print("❌ backend/app.py not found. Run from project root.")
        return
    
    print("This will:")
    print("1. Start the Flask backend")
    print("2. Create and open a web test page")
    print("3. Test the complete functionality")
    print()
    
    try:
        # Create test page
        test_file = create_test_page()
        print(f"📄 Created test page: {test_file}")
        
        # Start backend in a thread
        backend_thread = threading.Thread(target=start_backend, daemon=True)
        backend_thread.start()
        
        # Wait a bit for backend to start
        time.sleep(3)
        
        # Open test page
        url = f"file://{test_file.absolute()}"
        webbrowser.open(url)
        print(f"🌐 Opened test page: {url}")
        
        print("\n✅ Test environment ready!")
        print("- Backend should be running on http://127.0.0.1:5000")
        print("- Web page opened in your browser")
        print("- Press Ctrl+C to stop")
        
        # Keep running
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n✅ Stopped by user")
            
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    main()
