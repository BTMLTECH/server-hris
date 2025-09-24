import { Types } from 'mongoose';

export function emitToUser(userId: string | Types.ObjectId, event: string, payload: any) {
  const io = globalThis.io as any;
  if (!io || !userId) return;

  const roomId = userId.toString();
  io.to(roomId).emit(event, payload);
}
