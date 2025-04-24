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
  websocket!: WebSocket;
  audioContext!: AudioContext;
  sourceNode!: MediaStreamAudioSourceNode;
  processorNode!: ScriptProcessorNode;
  audioBuffer = new Int16Array();

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
    this.websocket.binaryType = 'arraybuffer';
  
    this.websocket.onopen = async () => {
      this.isConnecting = false;
      this.isRecording = true;
      this.transcription = 'Recording started...';
      console.log('WebSocket connection established.');
  
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  
      // Now initialize audio context and nodes
      this.audioContext = new AudioContext({ sampleRate: 48000 });
  
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);
      this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);
  
      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);
  
      this.audioBuffer = new Int16Array();
  
      this.processorNode.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        if(this.calculateRMS(input) < 0.01) {
          console.log('Silence detected, skipping processing.');
          return;
        }
                
        const downsampled = this.downsampleBuffer(input, this.audioContext.sampleRate, 16000);
        const combined = new Int16Array(this.audioBuffer.length + downsampled.length);
        combined.set(this.audioBuffer);
        combined.set(downsampled, this.audioBuffer.length);
        this.audioBuffer = combined;
  
        while (this.audioBuffer.length >= 2560) {
          const chunk = this.audioBuffer.slice(0, 2560);
          this.websocket.send(chunk.buffer);
          this.audioBuffer = this.audioBuffer.slice(2560);
        }
      };
    };
  
    this.websocket.onmessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      const newTranscription = data.transcription?.trim();
    
      if (newTranscription) {
        this.transcription += newTranscription + '\n';
      } else {
        console.log('Skipping empty transcription.');
      }
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
  }
  

  stopRecording() {
    this.isRecording = false;
    this.transcription += '\nRecording stopped.';

    // Close WebSocket
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.close();
    }

    // Stop audio processing
    if (this.processorNode) {
      this.processorNode.disconnect();
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
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

  calculateRMS(buffer: Float32Array): number {
    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i++) {
      sumSquares += buffer[i] * buffer[i];  
    }
    return Math.sqrt(sumSquares / buffer.length); 
  }

}