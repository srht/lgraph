# LGraph - LangGraph Compatible Library Tools

Bu proje, ITU Kütüphanesi için LangGraph ve ESM import/export uyumlu araçları içerir. Uygulama başlatıldığında `data/` klasöründeki tüm PDF, Excel ve TXT dosyaları otomatik olarak yüklenir ve vektör deposuna eklenir.

## 🚀 Özellikler

- **LangGraph Uyumlu**: Tüm araçlar `@langchain/core/tools` kullanılarak oluşturulmuştur
- **ESM Modül Sistemi**: Modern JavaScript modül sistemi kullanır
- **Zod Şema Validasyonu**: Giriş parametreleri için tip güvenliği
- **Hata Yönetimi**: Kapsamlı hata yakalama ve fallback mekanizmaları
- **Otomatik Veri Yükleme**: Uygulama başlatıldığında data klasöründeki dosyalar otomatik işlenir
- **Çoklu Dosya Desteği**: PDF, Excel (.xlsx, .xls), TXT ve JSON dosyaları desteklenir
- **📊 Kapsamlı Loglama**: Tüm konuşmalar, tool kullanımları ve LLM çağrıları otomatik loglanır
- **🔍 Log Arama ve Analiz**: Web arayüzü ile logları arama, filtreleme ve analiz etme
- **📈 Performance Monitoring**: Response time, tool usage ve error rate takibi

## 📁 Proje Yapısı

```
lgraph/
├── helpers/
│   ├── systemPrompt.js          # Sistem prompt'u (ESM)
│   ├── documentProcessor.mjs    # Belge işleme motoru
│   ├── logger.js                # Kapsamlı loglama sistemi
│   └── ...
├── tools/
│   ├── index.mjs               # Tüm araçların merkezi export'u
│   ├── booksearch.js           # Kitap arama aracı
│   ├── coursebooksearch.js     # Ders kitabı arama aracı
│   ├── databasesearch.js       # Veritabanı arama aracı
│   ├── webdocsearch.js         # Web belge arama aracı
│   └── createDocumentSearchTool.mjs  # Belge arama aracı
├── data/                       # Veri dosyaları (otomatik işlenir)
│   ├── *.pdf                  # PDF dosyaları
│   ├── *.xlsx, *.xls          # Excel dosyaları
│   ├── *.txt                  # Metin dosyaları
│   └── *.json                 # JSON dosyaları
├── logs/                       # Log dosyaları (otomatik oluşturulur)
│   └── conversations_*.json   # Günlük konuşma logları
├── app.mjs                     # Ana uygulama (otomatik veri yükleme ile)
├── example-usage.mjs           # Kullanım örnekleri
├── setup.sh                    # Linux/Mac kurulum scripti
├── setup.bat                   # Windows kurulum scripti
├── config.example.js           # Konfigürasyon örneği
├── package.json                # ESM modül tipi
├── LOGGING_README.md           # Loglama sistemi detayları
└── README.md                   # Bu dosya
```

## 🛠️ Mevcut Araçlar

### 1. `get_books` - Kitap Arama
- **Açıklama**: Kütüphane kataloğundaki yayınları bulur
- **Giriş**: Kitap adı, yazar veya anahtar kelime
- **Çıkış**: Kitap bilgileri (başlık, yazar, ISBN, yer numarası)

### 2. `get_course_books` - Ders Kitabı Arama
- **Açıklama**: Ders materyalleri ve ders kitaplarını bulur
- **Giriş**: Ders kodu veya ders adı
- **Çıkış**: Ders materyali bilgileri

### 3. `get_library_databases` - Veritabanı Arama
- **Açıklama**: Kütüphanenin abone olduğu veritabanlarını bulur
- **Giriş**: Konu, alan veya veritabanı adı
- **Çıkış**: Veritabanı listesi ve linkleri

### 4. `get_databases_from_web` - Web Belge Arama
- **Açıklama**: Web'deki kütüphane bilgilerini arar
- **Giriş**: Aranacak konu veya soru
- **Çıkış**: Web'den alınan bilgiler

### 5. `get_information_from_documents` - Belge Arama
- **Açıklama**: Yüklenen belgelerden bilgi arar
- **Giriş**: Doğal dilde soru
- **Çıkış**: Belgelerden çıkarılan bilgiler

## 📊 Loglama Sistemi

Proje, kapsamlı bir loglama sistemi içerir:

### 🔍 Loglanan Bilgiler
- **Kullanıcı Mesajları**: Gelen tüm sorular
- **Agent Cevapları**: AI'ın verdiği tüm cevaplar
- **Tool Kullanımı**: Hangi toolların ne zaman ve nasıl kullanıldığı
- **LLM Çağrıları**: Model çağrıları, input/output, execution time
- **Execution Steps**: LangGraph'ın çalışma adımları
- **Hata Logları**: Tüm hatalar ve stack trace'ler

### 🌐 Log Yönetimi
- **Web Arayüzü**: `/logs.html` - Logları görüntüleme ve arama
- **API Endpoints**: Log okuma, arama ve istatistikler
- **Otomatik Temizlik**: Eski logları otomatik temizleme

### 📈 Monitoring
- Real-time performance metrics
- Tool usage analytics
- Error rate tracking
- Response time monitoring

Detaylı bilgi için [LOGGING_README.md](LOGGING_README.md) dosyasına bakın.

## 📦 Kurulum

### Hızlı Kurulum (Önerilen)

**Linux/Mac:**
```bash
chmod +x setup.sh
./setup.sh
```

**Windows:**
```cmd
setup.bat
```

### Manuel Kurulum

```bash
npm install
```

## 🔧 Konfigürasyon

### 1. Environment Variables

`.env` dosyası oluşturun:

```bash
# OpenAI API Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Optional: Document Processing Configuration
CHUNK_SIZE=1000
CHUNK_OVERLAP=300
```

### 2. Data Klasörü

`data/` klasörüne işlemek istediğiniz dosyaları koyun:

- **PDF**: `.pdf` uzantılı dosyalar
- **Excel**: `.xlsx` veya `.xls` uzantılı dosyalar  
- **Metin**: `.txt` uzantılı dosyalar
- **JSON**: `.json` uzantılı dosyalar

## 🚀 Kullanım

### Uygulamayı Başlatma

```bash
node app.mjs
```

Uygulama başlatıldığında:
1. 📁 `data/` klasöründeki tüm desteklenen dosyalar otomatik olarak taranır
2. 🔄 Her dosya işlenir ve metin çıkarılır
3. ✂️ Metinler chunk'lara bölünür
4. 🧠 Embedding'ler oluşturulur
5. 💾 Vektör deposuna eklenir
6. 🔧 Belge arama aracı otomatik olarak eklenir

### Temel Kullanım

```javascript
import { createAllTools } from './tools/index.mjs';
import { ChatOpenAI } from '@langchain/openai';

// Chat model'i başlat
const chatModel = new ChatOpenAI({
  modelName: "gpt-4",
  temperature: 0,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

// Tüm araçları oluştur
const tools = createAllTools(chatModel, documentProcessor);

// Araçları modele bağla
const modelWithTools = chatModel.bindTools(Object.values(tools));
```

### Tek Araç Kullanımı

```javascript
import { createBookSearchTool } from './tools/index.mjs';

const bookSearchTool = createBookSearchTool();
const result = await bookSearchTool.invoke({ input: "Simyacı" });
console.log(result);
```

### LangGraph ile Kullanım

```javascript
import { StateGraph, END } from '@langchain/langgraph';

const workflow = new StateGraph({
  channels: {
    messages: {
      value: (x) => x.messages,
      default: () => [],
    },
    tools: {
      value: (x) => x.tools,
      default: () => [],
    },
  },
});

workflow.addNode("agent", modelWithTools);
workflow.addEdge("agent", END);

const app = workflow.compile();
```

## 📊 Desteklenen Dosya Formatları

| Format | Uzantı | Açıklama |
|--------|---------|-----------|
| PDF | `.pdf` | PDF dosyalarından metin çıkarılır |
| Excel | `.xlsx`, `.xls` | Excel dosyalarından tablo verisi çıkarılır |
| Metin | `.txt` | Düz metin dosyaları |
| JSON | `.json` | JSON dosyaları okunur ve metin formatına çevrilir |

## 🔄 Eski Koddan Geçiş

### CommonJS'den ESM'e

**Eski:**
```javascript
const { getSearchTool } = require("./tools/booksearch.js");
```

**Yeni:**
```javascript
import { createBookSearchTool } from './tools/index.mjs';
const bookSearchTool = createBookSearchTool();
```

### DynamicTool'dan LangGraph Tool'a

**Eski:**
```javascript
const tool = new DynamicTool({
  name: "get_books",
  func: async (input) => { ... }
});
```

**Yeni:**
```javascript
import { tool } from "@langchain/core/tools";
const bookSearchTool = tool(fn, {
  name: "get_books",
  description: "...",
  schema: z.object({
    input: z.string().describe("...")
  })
});
```

## 🚨 Önemli Notlar

1. **ESM Modül Sistemi**: `package.json`'da `"type": "module"` olarak ayarlandı
2. **Dosya Uzantıları**: `.mjs` uzantısı kullanılıyor veya `.js` dosyaları ESM syntax'ı kullanıyor
3. **Import/Export**: `require()` yerine `import`/`export` kullanılıyor
4. **Tool Binding**: Araçlar `chatModel.bindTools()` ile modele bağlanmalı
5. **Otomatik Veri Yükleme**: Uygulama başlatıldığında data klasörü otomatik olarak işlenir
6. **API Key**: OpenAI API anahtarı gerekli (embedding'ler için)

## 🐛 Sorun Giderme

### "Cannot use import statement outside a module" Hatası
- `package.json`'da `"type": "module"` olduğundan emin olun
- Dosya uzantılarının `.mjs` veya `.js` olduğunu kontrol edin

### Tool Binding Hatası
- Araçların `chatModel.bindTools()` ile bağlandığından emin olun
- Tool şemalarının doğru tanımlandığını kontrol edin

### Import Hatası
- Dosya yollarının doğru olduğundan emin olun
- `index.mjs` dosyasından import yapıldığını kontrol edin

### Dosya İşleme Hatası
- Desteklenen dosya formatlarını kontrol edin
- Dosya boyutunun makul olduğundan emin olun
- Dosya izinlerini kontrol edin

### Embedding Hatası
- OpenAI API anahtarının geçerli olduğundan emin olun
- API limitlerini kontrol edin

## 📚 Daha Fazla Bilgi

- [LangGraph Dokümantasyonu](https://langchain-ai.github.io/langgraph/)
- [LangChain Core Tools](https://js.langchain.com/docs/modules/tools/)
- [ESM Modül Sistemi](https://nodejs.org/api/esm.html)
- [PDF Parse](https://www.npmjs.com/package/pdf-parse)
- [Excel.js](https://www.npmjs.com/package/xlsx)
