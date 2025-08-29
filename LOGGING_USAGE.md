# Genel Amaçlı Loglama Sistemi

Bu sistem, herhangi bir text'i farklı dosyalara loglama imkanı sağlar.

## Kullanılabilir Fonksiyonlar

### 1. Text Loglama
```javascript
import ConversationLogger from './helpers/logger.js';
const logger = new ConversationLogger();

// Basit text loglama
logger.logText('Bu bir test mesajıdır', 'my-log');

// Opsiyonlarla text loglama
logger.logText('Hata mesajı', 'error-log', {
  level: 'ERROR',
  timestamp: true,
  append: true,
  extension: 'log'
});
```

### 2. JSON Loglama
```javascript
// JSON veri loglama
logger.logJSON({ 
  user: 'john', 
  action: 'search', 
  query: 'test' 
}, 'user-actions');

// Opsiyonlarla JSON loglama
logger.logJSON(data, 'my-data', {
  append: true,
  timestamp: true,
  pretty: true
});
```

### 3. Özel Loglama Fonksiyonları
```javascript
// Debug loglama
logger.logDebug('Debug mesajı', { variable: 'value' });

// Error loglama
logger.logError(new Error('Test hatası'), { context: 'my-function' });

// Retrieval loglama
logger.logRetrieval('search query', results, { method: 'hybrid' });

// Performance loglama
logger.logPerformance('operation_name', 1250, { details: 'extra info' });
```

### 4. Log Dosyası Yönetimi
```javascript
// Log dosyalarını listele
const files = logger.getLogFiles();
const filteredFiles = logger.getLogFiles('debug'); // pattern ile filtrele

// Log dosyası oku
const content = logger.readLogFile('my-log.log');
const lastLines = logger.readLogFile('my-log.log', 10); // son 10 satır
```

## HTTP API Endpoints

### POST /logs/text
Text loglama için:
```json
{
  "text": "Log mesajı",
  "fileName": "my-log",
  "options": {
    "level": "INFO",
    "timestamp": true,
    "append": true,
    "extension": "log"
  }
}
```

### POST /logs/json
JSON loglama için:
```json
{
  "data": { "key": "value" },
  "fileName": "my-data",
  "options": {
    "append": true,
    "timestamp": true,
    "pretty": true
  }
}
```

### POST /logs/debug
Debug loglama için:
```json
{
  "message": "Debug mesajı",
  "data": { "variable": "value" }
}
```

### POST /logs/error
Error loglama için:
```json
{
  "error": "Hata mesajı",
  "context": { "function": "myFunction", "line": 42 }
}
```

### POST /logs/performance
Performance loglama için:
```json
{
  "operation": "search_operation",
  "duration": 1250,
  "details": { "resultsCount": 5 }
}
```

### GET /logs/files
Log dosyalarını listele:
```
GET /logs/files
GET /logs/files?pattern=debug
```

### GET /logs/files/:fileName
Log dosyası oku:
```
GET /logs/files/my-log.log
GET /logs/files/debug.json?lines=10
```

## Dosya Formatları

### Text Logs (.log)
```
[2025-08-29T08:18:13.651Z] [INFO] Bu bir test mesajıdır
[2025-08-29T08:18:13.655Z] [ERROR] Hata mesajı
```

### JSON Logs (.json)
```json
[
  {
    "timestamp": "2025-08-29T08:18:13.692Z",
    "data": {
      "message": "Test mesajı",
      "details": { "key": "value" }
    }
  }
]
```

## Özellikler

- ✅ **Esnek dosya adlandırma**: İstediğiniz dosya adını kullanabilirsiniz
- ✅ **Çoklu format desteği**: Text, JSON, ve özel formatlar
- ✅ **Timestamp desteği**: Otomatik zaman damgası ekleme
- ✅ **Log seviyeleri**: INFO, ERROR, DEBUG, WARNING
- ✅ **Append/Overwrite**: Dosyaya ekleme veya üzerine yazma
- ✅ **HTTP API**: REST endpoint'ler ile uzaktan loglama
- ✅ **Dosya yönetimi**: Log dosyalarını listeleme ve okuma
- ✅ **Pattern filtering**: Dosya adı pattern'i ile filtreleme

## Kullanım Örnekleri

### Retrieval Sonuçlarını Loglama
```javascript
// docsRetriever.js içinde
if (logger?.logRetrieval) {
  logger.logRetrieval(userInput, docs, {
    hybridUsed: true,
    vectorK: kVec,
    lexicalK: kLex,
    minScore: minScore
  });
}
```

### Custom Log Dosyası
```javascript
// Özel bir işlem için log
logger.logText(`User ${userId} performed action: ${action}`, 'user-activities', {
  level: 'INFO',
  timestamp: true
});

// JSON formatında detaylı log
logger.logJSON({
  userId: userId,
  action: action,
  timestamp: new Date(),
  metadata: { ip: req.ip, userAgent: req.headers['user-agent'] }
}, 'detailed-activities');
```
