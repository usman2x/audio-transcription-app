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
    // create a new WebSocket connection ws://34.9.243.87:8766    
    // 
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


    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioContext = new AudioContext({ sampleRate: 48000 }); // default
  
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
  
    source.connect(processor);
    processor.connect(audioContext.destination);
  
    let audioBuffer = new Int16Array(); // this should be at component level or closure
    const chunkSize = 2560; // 2560 samples = 5120 bytes
    
    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0); // mono
      const downsampled = this.downsampleBuffer(input, audioContext.sampleRate, 16000); // Int16Array
    
      // Append to buffer
      const combined = new Int16Array(audioBuffer.length + downsampled.length);
      combined.set(audioBuffer);
      combined.set(downsampled, audioBuffer.length);
      audioBuffer = combined;
    
      // While we have enough data (5120 bytes = 2560 samples), send it
      while (audioBuffer.length >= chunkSize) {
        const chunk = audioBuffer.slice(0, chunkSize);
        this.websocket.send(chunk.buffer);
        audioBuffer = audioBuffer.slice(chunkSize);
      }
    };
  }

  stopRecording() {
    this.isRecording = false;
    this.mediaRecorder.stop();
    this.websocket.close();
    this.transcription += '\nRecording stopped.';
  }

  downsampleBuffer(buffer: Float32Array, inputSampleRate: number, targetSampleRate: number): Int16Array {
    if (targetSampleRate >= inputSampleRate) {
      throw new Error("Target rate must be lower than input rate.");
    }
  
    const sampleRateRatio = inputSampleRate / targetSampleRate;
    const newLength = Math.floor(buffer.length / sampleRateRatio);
    const result = new Int16Array(newLength);
  
    for (let i = 0; i < newLength; i++) {
      const index = Math.floor(i * sampleRateRatio);
      const sample = Math.max(-1, Math.min(1, buffer[index]));
      result[i] = sample * 32767;
    }
  
    return result;
  }
  
}