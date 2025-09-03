import EventEmitter from 'events';

class QuestionQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Konfigürasyon
    this.maxQuestionsPerMinute = options.maxQuestionsPerMinute || 15;
    this.processInterval = options.processInterval || 60000; // 1 dakika
    
    // Kuyruk durumu
    this.queue = [];
    this.processing = new Map(); // processId -> questionData
    this.completed = new Map(); // processId -> result
    this.failed = new Map(); // processId -> error
    
    // Rate limiting
    this.processedThisMinute = 0;
    this.currentMinuteStart = Date.now();
    this.isProcessing = false;
    
    // İstatistikler
    this.stats = {
      totalQueued: 0,
      totalProcessed: 0,
      totalFailed: 0,
      currentQueueSize: 0,
      averageProcessingTime: 0,
      lastProcessedAt: null
    };
    
    // Timer'ı başlat
    this.startProcessing();
    
    console.log(`🔄 Soru kuyruğu başlatıldı (Dakikada max ${this.maxQuestionsPerMinute} soru)`);
  }

  /**
   * Kuyruğa yeni soru ekle
   * @param {Object} questionData - Soru verisi
   * @returns {string} processId - İşlem ID'si
   */
  enqueue(questionData) {
    const processId = this.generateId();
    const queueItem = {
      id: processId,
      data: questionData,
      enqueuedAt: Date.now(),
      priority: questionData.priority || 0 // Yüksek sayı = yüksek öncelik
    };
    
    // Önceliğe göre sırala (yüksek öncelik başta)
    const insertIndex = this.queue.findIndex(item => item.priority < queueItem.priority);
    if (insertIndex === -1) {
      this.queue.push(queueItem);
    } else {
      this.queue.splice(insertIndex, 0, queueItem);
    }
    
    this.stats.totalQueued++;
    this.stats.currentQueueSize = this.queue.length;
    
    console.log(`📥 Soru kuyruğa eklendi: ${processId} (Kuyruk: ${this.queue.length})`);
    
    this.emit('enqueued', { processId, queueSize: this.queue.length });
    return processId;
  }

  /**
   * İşlem durumunu kontrol et
   * @param {string} processId - İşlem ID'si
   * @returns {Object} durum bilgisi
   */
  getStatus(processId) {
    if (this.completed.has(processId)) {
      return {
        status: 'completed',
        result: this.completed.get(processId).result,
        processedAt: this.completed.get(processId).processedAt,
        processingTime: this.completed.get(processId).processingTime
      };
    }
    
    if (this.failed.has(processId)) {
      return {
        status: 'failed',
        error: this.failed.get(processId).error,
        failedAt: this.failed.get(processId).failedAt
      };
    }
    
    if (this.processing.has(processId)) {
      const item = this.processing.get(processId);
      return {
        status: 'processing',
        startedAt: item.startedAt,
        waitTime: item.startedAt - item.enqueuedAt
      };
    }
    
    const queueItem = this.queue.find(item => item.id === processId);
    if (queueItem) {
      const position = this.queue.findIndex(item => item.id === processId) + 1;
      const estimatedWaitTime = this.calculateEstimatedWaitTime(position);
      
      return {
        status: 'queued',
        position: position,
        queueSize: this.queue.length,
        enqueuedAt: queueItem.enqueuedAt,
        estimatedWaitTime: estimatedWaitTime
      };
    }
    
    return {
      status: 'not_found',
      error: 'İşlem ID bulunamadı'
    };
  }

  /**
   * Tahmini bekleme süresini hesapla
   * @param {number} position - Kuyruktaki pozisyon
   * @returns {number} tahmini bekleme süresi (ms)
   */
  calculateEstimatedWaitTime(position) {
    const remainingTimeInCurrentMinute = this.processInterval - (Date.now() - this.currentMinuteStart);
    const remainingQuotaThisMinute = Math.max(0, this.maxQuestionsPerMinute - this.processedThisMinute);
    
    if (position <= remainingQuotaThisMinute) {
      // Bu dakika işlenebilir
      return Math.max(1000, remainingTimeInCurrentMinute / remainingQuotaThisMinute);
    } else {
      // Sonraki dakikalar
      const additionalMinutes = Math.ceil((position - remainingQuotaThisMinute) / this.maxQuestionsPerMinute);
      return remainingTimeInCurrentMinute + (additionalMinutes * this.processInterval);
    }
  }

  /**
   * Kuyruk işleme döngüsünü başlat
   */
  startProcessing() {
    // Her saniye kontrol et
    setInterval(() => {
      this.processQueue();
    }, 1000);
    
    // Her dakika sayacı sıfırla
    setInterval(() => {
      this.resetMinuteCounter();
    }, this.processInterval);
  }

  /**
   * Dakika sayacını sıfırla
   */
  resetMinuteCounter() {
    this.processedThisMinute = 0;
    this.currentMinuteStart = Date.now();
    console.log(`🔄 Dakika sayacı sıfırlandı. Kuyruk: ${this.queue.length}, İşleniyor: ${this.processing.size}`);
  }

  /**
   * Kuyruktaki soruları işle
   */
  async processQueue() {
    // Rate limit kontrolü
    if (this.processedThisMinute >= this.maxQuestionsPerMinute) {
      return;
    }
    
    // Kuyruk boşsa çık
    if (this.queue.length === 0) {
      return;
    }
    
    // Eşzamanlı işlem limiti (max 3 soru aynı anda)
    if (this.processing.size >= 3) {
      return;
    }
    
    // Kuyruktaki ilk soruyu al
    const queueItem = this.queue.shift();
    if (!queueItem) return;
    
    this.stats.currentQueueSize = this.queue.length;
    
    // İşleme başla
    const processingItem = {
      ...queueItem,
      startedAt: Date.now()
    };
    
    this.processing.set(queueItem.id, processingItem);
    this.processedThisMinute++;
    
    console.log(`🚀 Soru işleniyor: ${queueItem.id} (${this.processedThisMinute}/${this.maxQuestionsPerMinute})`);
    
    this.emit('processing', { 
      processId: queueItem.id, 
      position: this.processedThisMinute,
      queueSize: this.queue.length 
    });
    
    try {
      // Soruyu işle
      const startTime = Date.now();
      const result = await this.processQuestion(queueItem.data);
      const processingTime = Date.now() - startTime;
      
      // Başarılı sonucu kaydet
      this.completed.set(queueItem.id, {
        result: result,
        processedAt: Date.now(),
        processingTime: processingTime
      });
      
      // İstatistikleri güncelle
      this.stats.totalProcessed++;
      this.stats.lastProcessedAt = Date.now();
      this.updateAverageProcessingTime(processingTime);
      
      console.log(`✅ Soru tamamlandı: ${queueItem.id} (${processingTime}ms)`);
      
      this.emit('completed', { 
        processId: queueItem.id, 
        result: result,
        processingTime: processingTime
      });
      
    } catch (error) {
      // Hata durumunu kaydet
      this.failed.set(queueItem.id, {
        error: error.message,
        failedAt: Date.now()
      });
      
      this.stats.totalFailed++;
      
      console.error(`❌ Soru işleme hatası: ${queueItem.id}`, error.message);
      
      this.emit('failed', { 
        processId: queueItem.id, 
        error: error.message 
      });
      
    } finally {
      // İşlemden kaldır
      this.processing.delete(queueItem.id);
    }
  }

  /**
   * Soruyu işle (bu method override edilecek)
   * @param {Object} questionData - Soru verisi
   * @returns {Object} işlem sonucu
   */
  async processQuestion(questionData) {
    // Bu method ana uygulamada override edilecek
    throw new Error('processQuestion method must be implemented');
  }

  /**
   * Ortalama işlem süresini güncelle
   * @param {number} newTime - Yeni işlem süresi
   */
  updateAverageProcessingTime(newTime) {
    if (this.stats.averageProcessingTime === 0) {
      this.stats.averageProcessingTime = newTime;
    } else {
      // Exponential moving average
      this.stats.averageProcessingTime = (this.stats.averageProcessingTime * 0.8) + (newTime * 0.2);
    }
  }

  /**
   * Kuyruk istatistiklerini al
   * @returns {Object} istatistikler
   */
  getStats() {
    return {
      ...this.stats,
      currentQueueSize: this.queue.length,
      processingCount: this.processing.size,
      processedThisMinute: this.processedThisMinute,
      remainingQuotaThisMinute: Math.max(0, this.maxQuestionsPerMinute - this.processedThisMinute),
      nextResetIn: this.processInterval - (Date.now() - this.currentMinuteStart),
      completedCount: this.completed.size,
      failedCount: this.failed.size,
      queueItems: this.queue.map(item => ({
        id: item.id,
        enqueuedAt: item.enqueuedAt,
        priority: item.priority,
        waitTime: Date.now() - item.enqueuedAt
      })),
      processingItems: Array.from(this.processing.values()).map(item => ({
        id: item.id,
        startedAt: item.startedAt,
        processingTime: Date.now() - item.startedAt
      }))
    };
  }

  /**
   * Kuyruğu temizle
   */
  clearQueue() {
    const clearedCount = this.queue.length;
    this.queue = [];
    this.stats.currentQueueSize = 0;
    
    console.log(`🗑️ Kuyruk temizlendi: ${clearedCount} soru kaldırıldı`);
    
    this.emit('cleared', { clearedCount });
    return clearedCount;
  }

  /**
   * Tamamlanan sonuçları temizle (memory management)
   */
  cleanupCompleted(olderThanMinutes = 60) {
    const cutoffTime = Date.now() - (olderThanMinutes * 60 * 1000);
    let cleanedCount = 0;
    
    // Tamamlanan sonuçları temizle
    for (const [id, data] of this.completed.entries()) {
      if (data.processedAt < cutoffTime) {
        this.completed.delete(id);
        cleanedCount++;
      }
    }
    
    // Başarısız sonuçları temizle
    for (const [id, data] of this.failed.entries()) {
      if (data.failedAt < cutoffTime) {
        this.failed.delete(id);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 ${cleanedCount} eski sonuç temizlendi`);
    }
    
    return cleanedCount;
  }

  /**
   * Benzersiz ID oluştur
   */
  generateId() {
    return `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default QuestionQueue;
