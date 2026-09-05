export type ProviderPaymentStatus = "pending" | "completed" | "failed" | "unknown";

export type CreateCollectionInput = {
  orderId: string;
  amountTzs: number;
  payerName: string;
  payerEmail: string;
  payerPhone: string;
  webhookUrl?: string;
};

export interface PaymentProvider {
  readonly name: string;
  createCollection(input: CreateCollectionInput): Promise<{ ok: boolean; message: string }>;
  checkStatus(orderId: string, createdAt?: Date): Promise<{ status: ProviderPaymentStatus; reference?: string }>;
}
