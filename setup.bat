@echo off
echo 🚀 LGraph Kurulum Scripti Başlatılıyor...

REM Dependencies kurulumu
echo 📦 Gerekli paketler kuruluyor...
npm install

REM Eğer .env dosyası yoksa oluştur
if not exist .env (
    echo 🔧 .env dosyası oluşturuluyor...
    (
        echo # OpenAI API Configuration
        echo OPENAI_API_KEY=your_openai_api_key_here
        echo.
        echo # Optional: Document Processing Configuration
        echo CHUNK_SIZE=1000
        echo CHUNK_OVERLAP=300
    ) > .env
    echo ⚠️  Lütfen .env dosyasında OPENAI_API_KEY değerini güncelleyin!
)

echo ✅ Kurulum tamamlandı!
echo 📝 Sonraki adımlar:
echo    1. .env dosyasında OPENAI_API_KEY değerini güncelleyin
echo    2. 'npm start' veya 'node app.mjs' ile uygulamayı çalıştırın
pause
