import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'audio-transcription-app';
  isRecording = false;
  isConnecting = false;
  transcription = '';
  mediaRecorder!: MediaRecorder;
  websocket!: WebSocket;

  toggleRecording() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  }

  async startRecording() {
    this.isConnecting = true;
    this.transcription = 'Connecting to server...';

    // Connect to WebSocket server
    this.websocket = new WebSocket('ws://localhost:8080/ws-asr');
    this.websocket.binaryType = 'arraybuffer'; // Optimize for binary data

    this.websocket.onopen = () => {
      this.isConnecting = false;
      this.isRecording = true;
      this.transcription = 'Recording started...';
      console.log('WebSocket connection established.');
    };

    this.websocket.onmessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      const newTranscription = data.transcription || ''; // Extract transcription from the server response

      // Append the new transcription to the existing text with a newline
      this.transcription += newTranscription + '\n';
    };
    
    this.websocket.onerror = (error: Event) => {
      console.error('WebSocket error:', error);
      this.transcription = 'Error connecting to server.';
    };
    
    this.websocket.onclose = () => {
      console.log('WebSocket connection closed.');
      this.isRecording = false;
      this.transcription += '\nConnection closed.';
    };

    // Start recording audio
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaRecorder = new MediaRecorder(stream);

    this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) {
        console.log('Audio chunk received:', event.data.size, 'bytes');
        this.sendAudioChunk(event.data);
      } else {
        console.warn('Empty audio chunk received.');
      }
    };

    this.mediaRecorder.onstop = () => {
      console.log('Recording stopped.');
      stream.getTracks().forEach(track => track.stop());
    };

    this.mediaRecorder.start(10); // Send audio chunks every 20ms for faster real-time communication
  }

  stopRecording() {
    this.isRecording = false;
    this.mediaRecorder.stop();
    this.websocket.close();
    this.transcription += '\nRecording stopped.';
  }

  sendAudioChunk(chunk: Blob) {
    if (this.websocket.readyState === WebSocket.OPEN) {
      this.convertToPCM(chunk).then(pcmData => {
        console.log('Sending PCM data:', pcmData.byteLength, 'bytes');
        this.websocket.send(pcmData); // Send PCM data
      });
    } else {
      console.warn('WebSocket is not open. Cannot send audio chunk.');
    }
  }
  
  async convertToPCM(blob: Blob): Promise<ArrayBuffer> {
    console.log('Converting audio chunk to PCM...');
    console.log('MediaRecorder mimeType:', this.mediaRecorder.mimeType);
    const audioContext = new AudioContext();
    const arrayBuffer = await blob.arrayBuffer();
    console.log('Raw audio data:', arrayBuffer);
  
    try {
      console.log('Decoding audio data...');
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      console.log('Audio data decoded successfully.');
  
      console.log('Extracting PCM data...');
      const channelData = audioBuffer.getChannelData(0); // Mono channel
      const pcmData = new Int16Array(channelData.length);
      for (let i = 0; i < channelData.length; i++) {
        pcmData[i] = Math.max(-1, Math.min(1, channelData[i])) * 0x7FFF; // Scale to 16-bit PCM
      }
  
      console.log('PCM conversion complete.');
      return pcmData.buffer;
    } catch (error) {
      console.error('Failed to decode audio data:', error);
      throw error;
    }
  }
}