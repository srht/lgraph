import ConversationLogger from "../logging/logger.js";
const logger = new ConversationLogger();

// Conversation memory store - her kullanıcı için ayrı conversation tutar
const conversationStore = new Map();
const MAX_CONVERSATION_LENGTH = 20; // Maksimum conversation uzunluğu

// Conversation memory yardımcı fonksiyonları
const conversationHelpers = {
  // Kullanıcının conversation'ını al
  getUserConversation: (userId) => {
    return conversationStore.get(userId) || [];
  },

  // Conversation'a mesaj ekle
  addMessage: (userId, message) => {
    let conversation = conversationStore.get(userId) || [];
    conversation.push(message);

    // Conversation uzunluğunu sınırla
    if (conversation.length > MAX_CONVERSATION_LENGTH) {
      conversation = conversation.slice(-MAX_CONVERSATION_LENGTH);
    }

    conversationStore.set(userId, conversation);
    return conversation;
  },

  // Conversation'ı temizle
  clearConversation: (userId) => {
    conversationStore.delete(userId);
  },

  // Conversation özeti oluştur
  getConversationSummary: (userId) => {
    const conversation = conversationStore.get(userId) || [];
    if (conversation.length === 0) return "Henüz konuşma yok.";

    const userMessages = conversation.filter(
      (msg) => msg._getType() === "human"
    );
    const aiMessages = conversation.filter((msg) => msg._getType() === "ai");

    return {
      totalMessages: conversation.length,
      userMessages: userMessages.length,
      aiMessages: aiMessages.length,
      topics: userMessages.map((msg) => msg.content.substring(0, 50)).slice(-5),
      lastActivity: new Date().toISOString(),
    };
  },
};
const conversationLogger = logger;
export {
  conversationHelpers,
  conversationLogger,
  conversationStore,
  MAX_CONVERSATION_LENGTH,
};
