const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

module.exports = ({ findUserByPhone, findUserById, createUser, updateUserStatus, getUsers, updateUsername }) => {
  
  // Регистрация по номеру телефона
  router.post('/register', async (req, res) => {
    const { phone, username, password } = req.body;
    
    if (!phone || !username || !password) {
      return res.status(400).json({ error: 'Все поля обязательны' });
    }
    
    const phoneRegex = /^\+?[0-9]{10,15}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ error: 'Неверный формат номера телефона' });
    }
    
    try {
      const user = await createUser({ phone, username, password, email: '' });
      
      res.status(201).json({
        success: true,
        user: {
          id: user.id,
          phone: user.phone,
          username: user.username
        }
      });
    } catch (error) {
      if (error.message.includes('duplicate key')) {
        if (error.message.includes('phone')) {
          return res.status(400).json({ error: 'Этот номер телефона уже зарегистрирован' });
        }
        if (error.message.includes('username')) {
          return res.status(400).json({ error: 'Это имя пользователя уже занято' });
        }
      }
      console.error('Ошибка регистрации:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // Вход по телефону
  router.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    
    if (!phone || !password) {
      return res.status(400).json({ error: 'Введите телефон и пароль' });
    }
    
    try {
      const user = await findUserByPhone(phone);
      
      if (!user) {
        return res.status(401).json({ error: 'Неверный телефон или пароль' });
      }
      
      const validPassword = await bcrypt.compare(password, user.password);
      
      if (!validPassword) {
        return res.status(401).json({ error: 'Неверный телефон или пароль' });
      }
      
      await updateUserStatus(user.id, 'online');
      
      res.json({
        success: true,
        user: {
          id: user.id,
          phone: user.phone,
          username: user.username,
          avatar: user.avatar
        }
      });
    } catch (error) {
      console.error('Ошибка входа:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // Получить список всех пользователей
  router.get('/users', async (req, res) => {
    const { exclude } = req.query;
    
    try {
      const users = await getUsers();
      
      let filteredUsers = users;
      if (exclude) {
        filteredUsers = users.filter(u => u.id !== parseInt(exclude));
      }
      
      res.json(filteredUsers);
    } catch (error) {
      console.error('Ошибка получения пользователей:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // Поиск пользователей по телефону или имени
  router.get('/search', async (req, res) => {
    const { query } = req.query;
    
    if (!query || query.length < 3) {
      return res.json([]);
    }
    
    try {
      const users = await getUsers();
      
      const filtered = users.filter(user => 
        user.phone.includes(query) || 
        user.username.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 20);
      
      res.json(filtered);
    } catch (error) {
      console.error('Ошибка поиска:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // Получить информацию о пользователе
  router.get('/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
      const user = await findUserById(parseInt(id));
      
      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }
      
      res.json({
        id: user.id,
        phone: user.phone,
        username: user.username,
        avatar: user.avatar,
        status: user.status,
        last_seen: user.last_seen
      });
    } catch (error) {
      console.error('Ошибка получения пользователя:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // Выход
  router.post('/logout/:userId', async (req, res) => {
    const { userId } = req.params;
    
    try {
      await updateUserStatus(parseInt(userId), 'offline');
      res.json({ success: true });
    } catch (error) {
      console.error('Ошибка при выходе:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // Получить пользователей по массиву ID
  router.get('/by-ids', async (req, res) => {
    const { ids } = req.query;
    
    if (!ids) {
      return res.json([]);
    }
    
    const idArray = ids.split(',').map(Number);
    
    try {
      const users = await getUsers();
      const filtered = users.filter(u => idArray.includes(u.id));
      res.json(filtered);
    } catch (error) {
      console.error('Ошибка получения пользователей:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // Изменить имя пользователя
  router.put('/change-username/:userId', async (req, res) => {
    const { userId } = req.params;
    const { newUsername } = req.body;
    
    if (!newUsername || newUsername.length < 3) {
      return res.status(400).json({ error: 'Имя должно быть минимум 3 символа' });
    }
    
    try {
      const updatedUser = await updateUsername(parseInt(userId), newUsername);
      res.json({ success: true, username: updatedUser.username });
    } catch (error) {
      console.error('Ошибка изменения имени:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  return router;
};
