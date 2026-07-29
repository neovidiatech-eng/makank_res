import { Injectable, UseGuards } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { PrismaService } from 'src/globals/services/prisma.service';
import { WsJwtGuard } from '../../authentication/guards/ws.guard';

@Injectable()
@WebSocketGateway({
  cors: true,
  namespace: '/orders-tracking',
})
export class OrderTrackingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  constructor(private readonly prisma: PrismaService) {}

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log('Client connected to orders tracking gateway');
    client.emit('connected', {
      message: 'Connected to orders tracking gateway',
    });
  }

  handleDisconnect(client: Socket) {
    console.log('Client disconnected from orders tracking gateway');
    client.emit('disconnected', {
      message: 'Disconnected from orders tracking gateway',
    });
  }

  @SubscribeMessage('joinOrderTracking')
  handleJoinOrderTracking(client: Socket, payload: { orderId: number }) {
    const roomName = this.getOrderRoomName(payload.orderId);
    client.join(roomName);
    client.emit('joinedOrderTracking', {
      room: roomName,
      orderId: payload.orderId,
    });
  }

  @SubscribeMessage('leaveOrderTracking')
  handleLeaveOrderTracking(client: Socket, payload: { orderId: number }) {
    const roomName = this.getOrderRoomName(payload.orderId);
    client.leave(roomName);
    client.emit('leftOrderTracking', {
      room: roomName,
      orderId: payload.orderId,
    });
  }

  // Store-side live feed — a store dashboard/app joins its own store's room
  // once on login/app-open (not per-order, unlike joinOrderTracking above)
  // and gets `newOrder`/`orderStatusChanged` events pushed for every order
  // belonging to that store, without polling.
  //
  // Guarded (unlike joinOrderTracking above, which predates this change and
  // is left as-is to avoid breaking whatever already relies on its current
  // unauthenticated behavior): this room carries a store's live business
  // data (every new order), so a client must present a valid access token
  // AND actually belong to the store it's asking to join — otherwise any
  // client could listen in on another restaurant's orders just by guessing
  // a storeId.
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('joinStoreOrders')
  async handleJoinStoreOrders(client: Socket, payload: { storeId: number }) {
    const authorized = await this.canAccessStoreRoom(client, payload.storeId);
    if (!authorized) {
      client.emit('joinStoreOrdersError', {
        message: 'You do not have access to this store',
        storeId: payload.storeId,
      });
      return;
    }
    const roomName = this.getStoreRoomName(payload.storeId);
    client.join(roomName);
    client.emit('joinedStoreOrders', {
      room: roomName,
      storeId: payload.storeId,
    });
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('leaveStoreOrders')
  handleLeaveStoreOrders(client: Socket, payload: { storeId: number }) {
    const roomName = this.getStoreRoomName(payload.storeId);
    client.leave(roomName);
    client.emit('leftStoreOrders', {
      room: roomName,
      storeId: payload.storeId,
    });
  }

  // WsJwtGuard only attaches the raw Session row (client.user.userId) — look
  // up the actual account to check it's an Admin, or a Store belonging to
  // this exact store.
  private async canAccessStoreRoom(client: Socket, storeId: number) {
    const userId = (client as any).user?.userId;
    if (!userId) return false;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { storeId: true, roleKey: true },
    });
    if (!user) return false;
    return user.roleKey === RolesKeys.ADMIN || user.storeId === storeId;
  }

  broadcastNewOrder(storeId: number, order: { id: number; status: string; type: string; total?: number }) {
    const roomName = this.getStoreRoomName(storeId);
    this.server.to(roomName).emit('newOrder', { storeId, order });
  }

  broadcastOrderStatusChanged(storeId: number, orderId: number, status: string) {
    const roomName = this.getStoreRoomName(storeId);
    this.server.to(roomName).emit('orderStatusChanged', {
      storeId,
      orderId,
      status,
    });
  }

  getStoreRoomName(storeId: number) {
    return `store_${storeId}_orders_room`;
  }

  broadcastLocationUpdate(
    orderId: number,
    data: {
      deliveryBoyId: number;
      lat: number;
      lng: number;
      bearing?: number | null;
      lastSeen: Date;
    },
  ) {
    const roomName = this.getOrderRoomName(orderId);
    this.server.to(roomName).emit('locationUpdated', {
      orderId,
      delivery_boy: {
        id: data.deliveryBoyId,
        lat: data.lat,
        lng: data.lng,
        bearing: data.bearing ?? null,
        last_seen: data.lastSeen,
      },
    });
  }

  getOrderRoomName(orderId: number) {
    return `order_${orderId}_room`;
  }
}
