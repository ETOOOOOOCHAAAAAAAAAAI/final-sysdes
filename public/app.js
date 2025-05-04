const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const joinBtn = document.getElementById('join-btn');
const leaveBtn = document.getElementById('leave-btn');
const roomForm = document.getElementById('room-form');
const roomIdInput = document.getElementById('room-id');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const roomInfo = document.getElementById('room-info');

const peers = {};
let myStream;
let currentRoomId = null;
let myId = null;
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8);
}
createRoomBtn.addEventListener('click', () => {
    const roomId = generateRoomId();
    roomIdInput.value = roomId;
    joinRoom(roomId);
});
joinRoomBtn.addEventListener('click', () => {
    const roomId = roomIdInput.value.trim();
    if (roomId) {
        joinRoom(roomId);
    } else {
        alert('Пожалуйста, введите ID комнаты');
    }
});

function joinRoom(roomId) {
    currentRoomId = roomId;
    roomForm.style.display = 'none';
    roomInfo.style.display = 'block';
    roomInfo.textContent = `Комната: ${roomId}`;
    joinBtn.style.display = 'block';
    window.history.pushState({}, '', `/${roomId}`);
}
async function getMedia() {
    try {
        myStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        addVideoStream(myStream, 'me');
        socket.on('connect', () => {
            myId = socket.id;
        });
        socket.emit('join-room', currentRoomId, socket.id);
        socket.on('all-users', (users) => {
            users.forEach(userId => {
                if (!peers[userId]) {
                    createPeer(userId, true); 
                }
            });
        });
        socket.on('user-connected', userId => {
        });
        socket.on('user-disconnected', userId => {
            if (peers[userId]) {
                peers[userId].destroy();
                delete peers[userId];
            }
            removeVideoStream(userId);
        });
    } catch (err) {
        console.error('Ошибка доступа к медиаустройствам:', err);
    }
}
function addVideoStream(stream, userId) {
    if (document.getElementById('video-' + userId)) return;
    const video = document.createElement('video');
    video.id = 'video-' + userId;
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    video.addEventListener('loadedmetadata', () => {
        video.play();
    });
    const container = document.createElement('div');
    container.className = 'video-container';
    container.appendChild(video);
    videoGrid.appendChild(container);
}

function removeVideoStream(userId) {
    const video = document.getElementById('video-' + userId);
    if (video && video.parentNode) {
        video.parentNode.remove();
    }
}
function createPeer(userId, initiator) {
    const peer = new SimplePeer({
        initiator: initiator,
        trickle: false,
        stream: myStream
    });

    peer.on('signal', signal => {
        socket.emit('signal', {
            target: userId,
            signal
        });
    });

    peer.on('stream', userStream => {
        addVideoStream(userStream, userId);
    });

    peer.on('error', err => {
        console.error('Ошибка peer соединения:', err);
    });

    peers[userId] = peer;
}
socket.on('signal', data => {
    if (!peers[data.from]) {
        createPeer(data.from, false); 
    }
    peers[data.from].signal(data.signal);
});
joinBtn.addEventListener('click', () => {
    getMedia();
    joinBtn.style.display = 'none';
    leaveBtn.style.display = 'block';
});

leaveBtn.addEventListener('click', () => {
    if (myStream) {
        myStream.getTracks().forEach(track => track.stop());
    }
    Object.values(peers).forEach(peer => peer.destroy());
    videoGrid.innerHTML = '';
    joinBtn.style.display = 'block';
    leaveBtn.style.display = 'none';
    roomForm.style.display = 'flex';
    roomInfo.style.display = 'none';
    currentRoomId = null;
    myId = null;
});
window.addEventListener('load', () => {
    const path = window.location.pathname;
    if (path.length > 1) {
        const roomId = path.substring(1);
        roomIdInput.value = roomId;
        joinRoom(roomId);
    }
}); 
