export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "completed"
  | "cancelled";

export interface Order {
  id: number;
  customerName: string;
  itemId: number;
  quantity: number;
  totalAmount: number;
  status: OrderStatus;
  createdAt: Date;
}