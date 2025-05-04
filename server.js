const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
app.use(express.static('public'));
const servers = new Map(); 
const users = new Map(); 
const typingUsers = new Set();
const dmHistory = new Map(); 
const testServerId = 'test-server';
servers.set(testServerId, {
  name: 'Тестовый сервер',
  channels: new Map([
    ['general-text', { name: 'чат', type: 'text', messages: [] }],
    ['general-voice', { name: 'голосовуха', type: 'voice', messages: [] }]
  ])
});
function updateUsersList() {
  const usersList = Array.from(users.values());
  io.emit('users-update', usersList);
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  socket.on('register', (username) => {
    users.set(socket.id, {
      username,
      currentServer: testServerId,
      currentChannel: 'general-text'
    });
    socket.emit('servers', Array.from(servers.entries()));
    const server = servers.get(testServerId);
    if (server) {
      const channel = server.channels.get('general-text');
      if (channel) {
        socket.emit('channel-history', channel.messages);
      }
    }
    updateUsersList();
  });
  socket.on('join-channel', (serverId, channelId) => {
    const user = users.get(socket.id);
    if (user) {
      user.currentServer = serverId;
      user.currentChannel = channelId;
      socket.join(channelId);
      
      const server = servers.get(serverId);
      if (server) {
        const channel = server.channels.get(channelId);
        if (channel) {
          if (channel.type === 'text') {
            socket.emit('channel-history', channel.messages);
          }
        }
      }
      updateUsersList();
    }
  });

  socket.on('send-message', (data) => {
    const user = users.get(socket.id);
    if (user) {
      const server = servers.get(user.currentServer);
      if (server) {
        const channel = server.channels.get(user.currentChannel);
        if (channel && channel.type === 'text') {
          const messageData = {
            id: Date.now(),
            userId: socket.id,
            username: user.username,
            content: data.content,
            timestamp: new Date(),
            channel: user.currentChannel
          };
          channel.messages.push(messageData);
          io.to(user.currentChannel).emit('new-message', messageData);
        }
      }
    }
  });
  socket.on('typing', (username) => {
    typingUsers.add(socket.id);
    socket.to(users.get(socket.id)?.currentChannel).emit('typing', username);
    
    setTimeout(() => {
      typingUsers.delete(socket.id);
    }, 3000);
  });

  socket.on('join-room', (roomId, userId) => {
    const user = users.get(socket.id);
    if (user) {
      user.currentChannel = roomId;
      socket.join(roomId);
      socket.to(roomId).emit('user-connected', userId);
      const roomUsers = Array.from(users.entries())
        .filter(([id, userData]) => userData.currentChannel === roomId && id !== socket.id)
        .map(([id, userData]) => ({
          id,
          username: userData.username
        }));
      
      socket.emit('room-users', roomUsers);
      const newUser = {
        id: socket.id,
        username: user.username
      };
      socket.to(roomId).emit('new-user', newUser);
      updateUsersList();
    }
  });

  socket.on('get-room-users', (roomId) => {
    const roomUsers = Array.from(users.entries())
      .filter(([id, userData]) => userData.currentChannel === roomId && id !== socket.id)
      .map(([id, userData]) => ({
        id,
        username: userData.username
      }));
    
    socket.emit('room-users', roomUsers);
  });

  socket.on('signal', (data) => {
    io.to(data.target).emit('signal', {
      signal: data.signal,
      from: socket.id
    });
  });

 
  socket.on('dm-message', (msg) => {
    const fromUser = users.get(socket.id)?.username;
    const toUser = msg.to;
    if (!fromUser || !toUser || fromUser === toUser) return;
    const key = [fromUser, toUser].sort().join('_');
    if (!dmHistory.has(key)) dmHistory.set(key, []);
    const messageData = {
      from: fromUser,
      to: toUser,
      content: msg.content,
      timestamp: msg.timestamp,
      username: fromUser
    };
    dmHistory.get(key).push(messageData);
    const toSocketId = Array.from(users.entries()).find(([id, u]) => u.username === toUser)?.[0];
    const fromSocketId = Array.from(users.entries()).find(([id, u]) => u.username === fromUser)?.[0];
    if (toSocketId) io.to(toSocketId).emit('dm-message', { ...messageData, to: toUser });
    if (fromSocketId && fromSocketId !== toSocketId) io.to(fromSocketId).emit('dm-message', { ...messageData, to: toUser });
  });

  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      io.to(user.currentChannel).emit('user-disconnected', socket.id);
      users.delete(socket.id);
      typingUsers.delete(socket.id);
      updateUsersList();
    }
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 
