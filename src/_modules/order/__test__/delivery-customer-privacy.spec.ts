import { OrderStatus, OrderType } from '@prisma/client';
import { OrderService } from '../order.service';

describe('OrderService.sanitizeOrderForDelivery', () => {
  // Minimal OrderService instance for pure helper testing
  const orderService = new (OrderService as any)();

  const mockOrder = (status: OrderStatus, type: OrderType = OrderType.DELIVERY) => ({
    id: 101,
    status,
    type,
    note: 'Customer secret gate code: 1234',
    deliveryLat: 30.1234,
    deliveryLng: 31.5678,
    Customer: {
      name: 'محمد أحمد',
      phone: '01012345678',
      image: 'customer.jpg',
    },
    User: {
      name: 'محمد أحمد',
      phone: '01012345678',
      email: 'mohamed@test.com',
      image: 'customer.jpg',
    },
    Address: {
      lat: 30.1234,
      lng: 31.5678,
      adress: 'شارع الجمهورية عمارة 5',
      details: 'الدور الثالث شقة 10',
      title: 'المنزل',
    },
  });

  it('leaves order untouched if user is not delivery', () => {
    const order = mockOrder(OrderStatus.READY_PICKUP);
    const result = orderService.sanitizeOrderForDelivery(order, false);
    expect(result.Customer.phone).toBe('01012345678');
    expect(result.Address.lat).toBe(30.1234);
    expect(result.deliveryLat).toBe(30.1234);
  });

  it('leaves custom delivery orders untouched', () => {
    const order = mockOrder(OrderStatus.READY_PICKUP, OrderType.CUSTOM_DELIVERY);
    const result = orderService.sanitizeOrderForDelivery(order, true);
    expect(result.Customer.phone).toBe('01012345678');
    expect(result.Address.lat).toBe(30.1234);
  });

  it('masks customer phone, name, exact address, coordinates, and note before pickup (READY_PICKUP)', () => {
    const order = mockOrder(OrderStatus.READY_PICKUP);
    const result = orderService.sanitizeOrderForDelivery(order, true);

    expect(result.Customer.phone).toBeNull();
    expect(result.Customer.name).toBe('العميل');
    expect(result.Customer.image).toBeNull();

    expect(result.User.phone).toBeNull();
    expect(result.User.email).toBeNull();

    expect(result.Address.lat).toBeNull();
    expect(result.Address.lng).toBeNull();
    expect(result.Address.adress).toBeNull();
    expect(result.Address.details).toBeNull();

    expect(result.deliveryLat).toBeNull();
    expect(result.deliveryLng).toBeNull();
    expect(result.note).toBeNull();
  });

  it('masks customer data during PREPARING', () => {
    const order = mockOrder(OrderStatus.PREPARING);
    const result = orderService.sanitizeOrderForDelivery(order, true);

    expect(result.Customer.phone).toBeNull();
    expect(result.Address.lat).toBeNull();
    expect(result.deliveryLat).toBeNull();
  });

  it('reveals full customer data once order is ON_THE_WAY (picked up from restaurant)', () => {
    const order = mockOrder(OrderStatus.ON_THE_WAY);
    const result = orderService.sanitizeOrderForDelivery(order, true);

    expect(result.Customer.phone).toBe('01012345678');
    expect(result.Customer.name).toBe('محمد أحمد');
    expect(result.Address.lat).toBe(30.1234);
    expect(result.Address.lng).toBe(31.5678);
    expect(result.Address.adress).toBe('شارع الجمهورية عمارة 5');
    expect(result.deliveryLat).toBe(30.1234);
    expect(result.note).toBe('Customer secret gate code: 1234');
  });

  it('reveals customer data when DELIVERED', () => {
    const order = mockOrder(OrderStatus.DELIVERED);
    const result = orderService.sanitizeOrderForDelivery(order, true);

    expect(result.Customer.phone).toBe('01012345678');
    expect(result.Address.lat).toBe(30.1234);
  });
});
