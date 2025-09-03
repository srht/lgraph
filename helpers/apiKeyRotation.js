import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// JSON dosya yolu
const API_KEYS_FILE = path.join(__dirname, '..', 'config', 'api-keys.json');

// Varsayılan API key yapılandırması
const DEFAULT_CONFIG = {
  gemini: {
    keys: [
      {
        key: "YOUR_GEMINI_API_KEY_1",
        requestCount: 0,
        isActive: true
      },
      {
        key: "YOUR_GEMINI_API_KEY_2", 
        requestCount: 0,
        isActive: true
      },
      {
        key: "YOUR_GEMINI_API_KEY_3",
        requestCount: 0,
        isActive: true
      }
    ],
    maxRequestsPerKey: 15,
    currentKeyIndex: 0,
    lastResetTime: Date.now()
  },
  openai: {
    keys: [
      {
        key: "YOUR_OPENAI_API_KEY_1",
        requestCount: 0,
        isActive: true
      }
    ],
    maxRequestsPerKey: 15,
    currentKeyIndex: 0,
    lastResetTime: Date.now()
  }
};

class APIKeyRotation {
  constructor() {
    this.config = null;
    this.resetInterval = 15 * 60 * 1000; // 15 dakika
  }

  // Konfigürasyon dosyasını yükle veya oluştur
  async loadConfig() {
    try {
      // Config klasörünü oluştur
      const configDir = path.dirname(API_KEYS_FILE);
      try {
        await fs.access(configDir);
      } catch {
        await fs.mkdir(configDir, { recursive: true });
      }

      // Dosyayı okumaya çalış
      const data = await fs.readFile(API_KEYS_FILE, 'utf8');
      this.config = JSON.parse(data);
      
      // 15 dakika geçmişse sayaçları sıfırla
      await this.checkAndResetCounters();
      
    } catch (error) {
      console.log('📝 API key config dosyası bulunamadı, varsayılan oluşturuluyor...');
      this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      await this.saveConfig();
    }
  }

  // Konfigürasyonu dosyaya kaydet
  async saveConfig() {
    try {
      await fs.writeFile(API_KEYS_FILE, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('❌ API key config kaydedilemedi:', error.message);
    }
  }

  // 15 dakika kontrolü ve sayaç sıfırlama
  async checkAndResetCounters() {
    const now = Date.now();
    let needsSave = false;

    for (const provider in this.config) {
      const providerConfig = this.config[provider];
      
      if (now - providerConfig.lastResetTime >= this.resetInterval) {
        console.log(`🔄 ${provider.toUpperCase()} API key sayaçları sıfırlanıyor...`);
        
        // Tüm key'lerin sayaçlarını sıfırla
        providerConfig.keys.forEach(keyObj => {
          keyObj.requestCount = 0;
        });
        
        // İndeksi sıfırla
        providerConfig.currentKeyIndex = 0;
        providerConfig.lastResetTime = now;
        needsSave = true;
      }
    }

    if (needsSave) {
      await this.saveConfig();
    }
  }

  // Belirtilen provider için sonraki API key'i al
  async getNextKey(provider = 'gemini') {
    if (!this.config) {
      await this.loadConfig();
    }

    await this.checkAndResetCounters();

    const providerConfig = this.config[provider];
    if (!providerConfig) {
      throw new Error(`Provider '${provider}' bulunamadı`);
    }

    const activeKeys = providerConfig.keys.filter(keyObj => keyObj.isActive);
    if (activeKeys.length === 0) {
      throw new Error(`${provider} için aktif API key bulunamadı`);
    }

    // Mevcut key'i kontrol et
    let currentKey = activeKeys[providerConfig.currentKeyIndex % activeKeys.length];
    
    // Eğer mevcut key limiti aştıysa bir sonrakine geç
    if (currentKey.requestCount >= providerConfig.maxRequestsPerKey) {
      console.log(`🔄 ${provider} API key ${providerConfig.currentKeyIndex + 1} limit aştı, rotasyon yapılıyor...`);
      
      providerConfig.currentKeyIndex = (providerConfig.currentKeyIndex + 1) % activeKeys.length;
      currentKey = activeKeys[providerConfig.currentKeyIndex];
      
      // Eğer tüm key'ler limit aştıysa en az kullanılanı bul
      if (currentKey.requestCount >= providerConfig.maxRequestsPerKey) {
        const leastUsedKey = activeKeys.reduce((min, key) => 
          key.requestCount < min.requestCount ? key : min
        );
        
        const leastUsedIndex = activeKeys.findIndex(key => key === leastUsedKey);
        providerConfig.currentKeyIndex = leastUsedIndex;
        currentKey = leastUsedKey;
        
        console.log(`⚠️ Tüm ${provider} key'ler limit aştı, en az kullanılan seçildi (${currentKey.requestCount} istek)`);
      }
    }

    // İstek sayısını artır
    currentKey.requestCount++;
    
    console.log(`🔑 ${provider} API key ${providerConfig.currentKeyIndex + 1} kullanılıyor (${currentKey.requestCount}/${providerConfig.maxRequestsPerKey})`);
    
    // Değişiklikleri kaydet
    await this.saveConfig();
    
    return {
      key: currentKey.key,
      requestCount: currentKey.requestCount,
      maxRequests: providerConfig.maxRequestsPerKey,
      keyIndex: providerConfig.currentKeyIndex + 1,
      totalKeys: activeKeys.length
    };
  }

  // API key istatistiklerini göster
  async getStats(provider = 'gemini') {
    if (!this.config) {
      await this.loadConfig();
    }

    const providerConfig = this.config[provider];
    if (!providerConfig) {
      return null;
    }

    const stats = {
      provider,
      currentKeyIndex: providerConfig.currentKeyIndex + 1,
      totalKeys: providerConfig.keys.length,
      activeKeys: providerConfig.keys.filter(k => k.isActive).length,
      maxRequestsPerKey: providerConfig.maxRequestsPerKey,
      lastResetTime: new Date(providerConfig.lastResetTime).toLocaleString('tr-TR'),
      nextResetTime: new Date(providerConfig.lastResetTime + this.resetInterval).toLocaleString('tr-TR'),
      keys: providerConfig.keys.map((keyObj, index) => ({
        index: index + 1,
        keyPreview: keyObj.key.substring(0, 8) + '...',
        requestCount: keyObj.requestCount,
        isActive: keyObj.isActive,
        isLimitReached: keyObj.requestCount >= providerConfig.maxRequestsPerKey
      }))
    };

    return stats;
  }

  // Yeni API key ekle
  async addKey(provider, newKey) {
    if (!this.config) {
      await this.loadConfig();
    }

    if (!this.config[provider]) {
      throw new Error(`Provider '${provider}' bulunamadı`);
    }

    // Key'in zaten ekli olup olmadığını kontrol et
    const exists = this.config[provider].keys.some(keyObj => keyObj.key === newKey);
    if (exists) {
      throw new Error('Bu API key zaten mevcut');
    }

    this.config[provider].keys.push({
      key: newKey,
      requestCount: 0,
      isActive: true
    });

    await this.saveConfig();
    console.log(`✅ Yeni ${provider} API key eklendi`);
  }

  // API key'i deaktif et
  async deactivateKey(provider, keyIndex) {
    if (!this.config) {
      await this.loadConfig();
    }

    const providerConfig = this.config[provider];
    if (!providerConfig || keyIndex < 0 || keyIndex >= providerConfig.keys.length) {
      throw new Error('Geçersiz key index');
    }

    providerConfig.keys[keyIndex].isActive = false;
    await this.saveConfig();
    console.log(`🚫 ${provider} API key ${keyIndex + 1} deaktif edildi`);
  }
}

// Singleton instance
const apiKeyRotation = new APIKeyRotation();

export default apiKeyRotation;
