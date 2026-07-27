import { Injectable } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@Injectable()
@WebSocketGateway({
  cors: true,
  namespace: '/orders-tracking',
})
export class OrderTrackingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
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
