import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(token: string): Socket {
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backend) {
    throw new Error("NEXT_PUBLIC_BACKEND_URL is required");
  }

  if (socket) {
    return socket;
  }

  socket = io(backend, {
    path: "/socket.io",
    transports: ["websocket"],
    auth: { token },
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
