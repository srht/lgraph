#!/bin/bash

echo "🚀 LGraph Kurulum Scripti Başlatılıyor..."

# Dependencies kurulumu
echo "📦 Gerekli paketler kuruluyor..."
npm install

# Eğer .env dosyası yoksa oluştur
if [ ! -f .env ]; then
    echo "🔧 .env dosyası oluşturuluyor..."
    cat > .env << EOF
# OpenAI API Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Optional: Document Processing Configuration
CHUNK_SIZE=1000
CHUNK_OVERLAP=300
EOF
    echo "⚠️  Lütfen .env dosyasında OPENAI_API_KEY değerini güncelleyin!"
fi

echo "✅ Kurulum tamamlandı!"
echo "📝 Sonraki adımlar:"
echo "   1. .env dosyasında OPENAI_API_KEY değerini güncelleyin"
echo "   2. 'npm start' veya 'node app.mjs' ile uygulamayı çalıştırın"

