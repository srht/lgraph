// config.example.js
// Bu dosyayı config.js olarak kopyalayın ve kendi değerlerinizi girin

export const config = {
  // OpenAI API Configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "your_openai_api_key_here",
    model: "gpt-4o-mini", // veya 'gpt-4o', 'gpt-4o-mini-tts'
    temperature: 0,
  },
  
  // Document Processing Configuration
  documentProcessing: {
    chunkSize: parseInt(process.env.CHUNK_SIZE) || 1000,
    chunkOverlap: parseInt(process.env.CHUNK_OVERLAP) || 300,
  },
  
  // Data Directory Configuration
  dataDir: "../data", // Relative to app.mjs location
};

// Kullanım:
// import { config } from './config.js';
// const apiKey = config.openai.apiKey;

