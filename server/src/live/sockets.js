// Wires up every Socket.IO event. (M0: only a ping/pong to prove the connection works.)

// Called once from index.js with the Socket.IO server.
export function attachSockets(io) {
  io.on('connection', (socket) => {
    // The client sends "ping" and gets the server time back, used to check the connection.
    // Every event in this app is (payload, ack): the client always sends a payload object first.
    socket.on('ping', (payload, ack) => {
      if (typeof ack === 'function') ack({ pong: true, serverNow: Date.now() });
    });
  });
}
