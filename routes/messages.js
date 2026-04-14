const express = require('express');
const router = express.Router();

module.exports = ({ getMessagesBetweenUsers, createMessage, markMessagesAsRead, getRecentChats, deleteMessagesBetweenUsers }) => {
  
  // Получить историю сообщений с конкретным пользователем
  router.get('/history/:userId/:contactId', async (req, res) => {
    const { userId, contactId } = req.params;
    
    console.log(`📜 Getting history for ${userId} and ${contactId}`);
    
    try {
      const messages = await getMessagesBetweenUsers(parseInt(userId), parseInt(contactId));
      res.json(messages);
    } catch (error) {
      console.error('❌ Database error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Получить последние сообщения для всех чатов
  router.get('/recent/:userId', async (req, res) => {
    const { userId } = req.params;
    
    console.log(`📋 Getting recent chats for user ${userId}`);
    
    try {
      const chats = await getRecentChats(parseInt(userId));
      res.json(chats);
    } catch (error) {
      console.error('❌ Error getting recent chats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Отметить сообщения как прочитанные
  router.post('/read', async (req, res) => {
    const { userId, contactId } = req.body;
    
    if (!userId || !contactId) {
      return res.status(400).json({ error: 'Missing userId or contactId' });
    }
    
    try {
      await markMessagesAsRead(parseInt(userId), parseInt(contactId));
      res.json({ success: true });
    } catch (error) {
      console.error('❌ Error marking as read:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Очистить историю чата
  router.delete('/clear/:userId/:contactId', async (req, res) => {
    const { userId, contactId } = req.params;
    
    try {
      const deleted = await deleteMessagesBetweenUsers(parseInt(userId), parseInt(contactId));
      
      res.json({ 
        success: true, 
        deleted: deleted,
        message: `Удалено ${deleted} сообщений`
      });
    } catch (error) {
      console.error('❌ Ошибка очистки чата:', error);
      res.status(500).json({ error: 'Ошибка при очистке чата' });
    }
  });

  // Удалить чат полностью
  router.delete('/delete-chat/:userId/:contactId', async (req, res) => {
    const { userId, contactId } = req.params;
    
    try {
      const deleted = await deleteMessagesBetweenUsers(parseInt(userId), parseInt(contactId));
      
      res.json({ 
        success: true, 
        deleted: deleted,
        message: 'Чат удален'
      });
    } catch (error) {
      console.error('❌ Ошибка удаления чата:', error);
      res.status(500).json({ error: 'Ошибка при удалении чата' });
    }
  });

  // Сохранить бэкап всех сообщений
  router.get('/backup/:userId', async (req, res) => {
    const { userId } = req.params;
    
    try {
      res.status(501).json({ error: 'Функция в разработке' });
    } catch (error) {
      console.error('❌ Ошибка создания бэкапа:', error);
      res.status(500).json({ error: 'Ошибка создания бэкапа' });
    }
  });

  // Восстановить из бэкапа
  router.post('/restore/:userId', async (req, res) => {
    const { userId } = req.params;
    const { messages } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Неверный формат данных' });
    }
    
    try {
      res.status(501).json({ error: 'Функция в разработке' });
    } catch (error) {
      console.error('❌ Ошибка восстановления:', error);
      res.status(500).json({ error: 'Ошибка восстановления' });
    }
  });

  return router;
};
