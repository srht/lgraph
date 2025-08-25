# LGraph Loglama Sistemi

Bu proje, LGraph agent'ının tüm konuşmalarını, kullanılan toolları, LLM çağrılarını ve hataları kapsamlı bir şekilde loglayan bir sistem içerir.

## 🎯 Özellikler

### 📝 Kapsamlı Loglama
- **Kullanıcı Mesajları**: Gelen tüm sorular
- **Agent Cevapları**: AI'ın verdiği tüm cevaplar
- **Tool Kullanımı**: Hangi toolların ne zaman ve nasıl kullanıldığı
- **LLM Çağrıları**: Model çağrıları, input/output, execution time
- **Execution Steps**: LangGraph'ın çalışma adımları
- **Hata Logları**: Tüm hatalar ve stack trace'ler
- **Metadata**: Execution time, model bilgileri, temperature

### 🔍 Arama ve Filtreleme
- Konuşmalarda metin bazlı arama
- Tarih bazlı filtreleme
- Tool kullanımına göre filtreleme
- Hata durumlarına göre filtreleme

### 📊 İstatistikler
- Toplam konuşma sayısı
- Kullanılan tool sayısı
- LLM çağrı sayısı
- Hata oranları
- En çok kullanılan toollar
- Ortalama response time

## 🚀 Kurulum

### 1. Gerekli Dosyalar
```
helpers/
├── logger.js          # Ana loglama sınıfı
public/
├── logs.html          # Log görüntüleme arayüzü
app.mjs               # Ana uygulama (loglama entegrasyonu ile)
```

### 2. Otomatik Kurulum
Sistem otomatik olarak `logs/` klasörünü oluşturur ve günlük JSON dosyalarında logları saklar.

## 📁 Log Dosya Yapısı

### Dosya Adlandırma
```
logs/
├── conversations_2024-01-15.json
├── conversations_2024-01-16.json
└── conversations_2024-01-17.json
```

### Log Formatı
```json
{
  "id": "unique_conversation_id",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "userMessage": {
    "content": "Kullanıcının sorusu",
    "timestamp": "2024-01-15T10:30:00.000Z"
  },
  "agentResponse": {
    "content": "AI'ın cevabı",
    "timestamp": "2024-01-15T10:30:05.000Z"
  },
  "executionSteps": [...],
  "toolsUsed": [
    {
      "toolName": "document_search",
      "toolDescription": "Belge arama aracı",
      "input": "arama parametreleri",
      "output": "tool çıktısı",
      "executionTime": 150,
      "success": true,
      "timestamp": "2024-01-15T10:30:02.000Z"
    }
  ],
  "llmCalls": [
    {
      "model": "ChatGoogleGenerativeAI",
      "input": [...],
      "output": {...},
      "executionTime": 2000,
      "temperature": 0,
      "timestamp": "2024-01-15T10:30:01.000Z"
    }
  ],
  "errors": [...],
  "metadata": {
    "totalExecutionTime": 2500,
    "totalMessages": 3,
    "model": "ChatGoogleGenerativeAI",
    "temperature": 0,
    "totalSteps": 2,
    "totalToolsUsed": 1,
    "totalLLMCalls": 1,
    "hasErrors": false
  }
}
```

## 🌐 API Endpoints

### Log Yönetimi
```
GET    /logs/conversations          # Tüm konuşmaları getir
GET    /logs/conversations/:id      # Belirli konuşmayı getir
GET    /logs/search?q=query        # Konuşmalarda arama yap
GET    /logs/stats                  # İstatistikleri getir
DELETE /logs/cleanup?days=30       # Eski logları temizle
```

### Chat (Loglama ile)
```
POST   /chat                        # Mesaj gönder (otomatik loglanır)
```

## 💻 Kullanım

### 1. Web Arayüzü
Ana sayfada "📊 Konuşma Logları" linkine tıklayarak logları görüntüleyebilirsiniz.

### 2. API Kullanımı
```bash
# Tüm konuşmaları getir
curl http://localhost:3000/logs/conversations

# Belirli konuşmayı getir
curl http://localhost:3000/logs/conversations/conversation_id

# Konuşmalarda arama yap
curl "http://localhost:3000/logs/search?q=kitap"

# İstatistikleri getir
curl http://localhost:3000/logs/stats

# Eski logları temizle (30 günden eski)
curl -X DELETE "http://localhost:3000/logs/cleanup?days=30"
```

### 3. Programatik Kullanım
```javascript
import ConversationLogger from './helpers/logger.js';

const logger = new ConversationLogger();

// Konuşma logla
const conversationId = logger.logAgentInteraction({
  userMessage: "Kullanıcı sorusu",
  agentResponse: "AI cevabı",
  toolsUsed: [...],
  llmCalls: [...],
  errors: [...],
  metadata: {...}
});

// Logları oku
const conversations = logger.getConversations(100, 0);
const stats = logger.getConversationStats();
const searchResults = logger.searchConversations("kitap");
```

## 🔧 Özelleştirme

### Log Seviyesi
Logger sınıfında log seviyelerini ayarlayabilirsiniz:
```javascript
// Sadece hataları logla
if (process.env.LOG_LEVEL === 'error') {
  // Minimal logging
}

// Detaylı loglama
if (process.env.LOG_LEVEL === 'debug') {
  // Full logging with all details
}
```

### Log Saklama Süresi
Varsayılan olarak 30 gün saklanır, değiştirmek için:
```javascript
// 90 gün sakla
logger.cleanupOldLogs(90);
```

### Özel Metadata
Chat endpoint'inde özel metadata ekleyebilirsiniz:
```javascript
metadata: {
  userId: "user123",
  sessionId: "session456",
  userAgent: req.headers['user-agent'],
  ipAddress: req.ip
}
```

## 📊 Monitoring ve Analytics

### Real-time Monitoring
- Her chat request'i otomatik olarak loglanır
- Response time, tool usage, error rate takip edilir
- Performance metrics otomatik hesaplanır

### Analytics Dashboard
Web arayüzünde:
- Konuşma sayıları
- Tool kullanım istatistikleri
- Hata oranları
- En popüler sorular
- Response time trendleri

## 🚨 Hata Yönetimi

### Hata Loglama
- Tüm hatalar otomatik olarak loglanır
- Stack trace'ler saklanır
- Context bilgileri eklenir
- Error rate hesaplanır

### Hata Recovery
- Loglama hatası chat'i etkilemez
- Graceful degradation
- Fallback mechanisms

## 🔒 Güvenlik

### Log Güvenliği
- Hassas bilgiler (API keys, passwords) loglanmaz
- User input sanitization
- Rate limiting desteği

### Access Control
- Log dosyalarına direkt erişim kısıtlanabilir
- Admin-only endpoints
- Audit trail

## 📈 Performance

### Optimizasyon
- Asenkron loglama
- Batch operations
- Compression support
- Efficient JSON serialization

### Monitoring
- Memory usage tracking
- Disk space monitoring
- Log rotation
- Performance metrics

## 🧪 Testing

### Test Senaryoları
```bash
# Loglama sistemini test et
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Test mesajı"}'

# Logları kontrol et
curl http://localhost:3000/logs/conversations

# İstatistikleri kontrol et
curl http://localhost:3000/logs/stats
```

## 🔄 Maintenance

### Log Temizleme
```bash
# 30 günden eski logları temizle
curl -X DELETE "http://localhost:3000/logs/cleanup?days=30"

# Manuel temizlik
rm logs/conversations_*.json
```

### Backup
```bash
# Logları yedekle
cp -r logs/ logs_backup_$(date +%Y%m%d)/

# Sıkıştır
tar -czf logs_backup_$(date +%Y%m%d).tar.gz logs_backup_$(date +%Y%m%d)/
```

## 📚 Örnek Kullanım Senaryoları

### 1. Kullanıcı Davranış Analizi
```javascript
// En çok sorulan soruları bul
const conversations = logger.getConversations(1000, 0);
const questionFrequency = {};

conversations.forEach(conv => {
  const question = conv.userMessage.content.toLowerCase();
  questionFrequency[question] = (questionFrequency[question] || 0) + 1;
});

// En popüler sorular
const topQuestions = Object.entries(questionFrequency)
  .sort(([,a], [,b]) => b - a)
  .slice(0, 10);
```

### 2. Tool Performance Analizi
```javascript
// Tool kullanım istatistikleri
const stats = logger.getConversationStats();
console.log('En çok kullanılan tool:', stats.mostUsedTools[0]);

// Tool başına ortalama response time
const toolPerformance = {};
conversations.forEach(conv => {
  conv.toolsUsed.forEach(tool => {
    if (!toolPerformance[tool.toolName]) {
      toolPerformance[tool.toolName] = { total: 0, count: 0 };
    }
    toolPerformance[tool.toolName].total += tool.executionTime;
    toolPerformance[tool.toolName].count += 1;
  });
});
```

### 3. Error Analysis
```javascript
// Hata trendleri
const errorTrends = {};
conversations.forEach(conv => {
  if (conv.errors.length > 0) {
    const date = conv.timestamp.split('T')[0];
    errorTrends[date] = (errorTrends[date] || 0) + conv.errors.length;
  }
});
```

## 🤝 Katkıda Bulunma

### Yeni Özellikler
1. Log formatını genişlet
2. Yeni analytics ekle
3. Export functionality ekle
4. Real-time notifications ekle

### Bug Reports
- Hata detaylarını loglardan al
- Reproduction steps ekle
- Environment bilgilerini ekle

## 📞 Destek

### Sorun Giderme
1. Log dosyalarını kontrol et
2. Server console'u kontrol et
3. API endpoint'lerini test et
4. Web arayüzünü kontrol et

### İletişim
- GitHub Issues
- Documentation updates
- Feature requests

---

**Not**: Bu loglama sistemi production environment'da kullanılmak üzere tasarlanmıştır. Gerekirse ek güvenlik önlemleri ve monitoring eklenebilir.
