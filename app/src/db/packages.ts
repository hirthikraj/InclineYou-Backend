import { Q } from '@nozbe/watermelondb';
import { database } from './index';
import PackageModel from './models/Package';
import PaymentModel from './models/Payment';
import { refreshPending, syncDatabase } from './sync';

export const packagesCollection = database.get<PackageModel>('packages');
export const paymentsCollection = database.get<PaymentModel>('payments');

export function observePackages(clientId: string) {
  return packagesCollection
    .query(Q.where('client_id', clientId), Q.sortBy('created_at', Q.desc))
    .observe();
}

export function observePayments(packageId: string) {
  return paymentsCollection
    .query(Q.where('package_id', packageId), Q.sortBy('created_at', Q.desc))
    .observe();
}

export interface NewPackageInput {
  trainerId: string;
  clientId: string;
  type: 'session_pack' | 'monthly';
  sessionsTotal?: number;
  amount: number;
  startDate?: string;
  endDate?: string;
}

export async function createPackage(input: NewPackageInput): Promise<PackageModel> {
  const pkg = await database.write(async () =>
    packagesCollection.create((p) => {
      p.trainerId = input.trainerId;
      p.clientId = input.clientId;
      p.type = input.type;
      if (input.sessionsTotal != null) {
        p.sessionsTotal = input.sessionsTotal;
        p.sessionsRemaining = input.sessionsTotal;
      }
      p.amount = input.amount;
      p.currency = 'INR';
      if (input.startDate) p.startDate = input.startDate;
      if (input.endDate) p.endDate = input.endDate;
      p.status = 'active';
    }),
  );
  await refreshPending();
  syncDatabase('create-package');
  return pkg;
}

export interface NewPaymentInput {
  trainerId: string;
  clientId: string;
  packageId: string;
  amount: number;
  method: string;
  collectedBy: string;
  upiReference?: string;
}

export async function createPayment(input: NewPaymentInput): Promise<PaymentModel> {
  const payment = await database.write(async () =>
    paymentsCollection.create((p) => {
      p.trainerId = input.trainerId;
      p.clientId = input.clientId;
      p.packageId = input.packageId;
      p.amount = input.amount;
      p.currency = 'INR';
      p.method = input.method;
      p.collectedBy = input.collectedBy;
      p.status = 'pending';
      if (input.upiReference) p.upiReference = input.upiReference;
    }),
  );
  await refreshPending();
  syncDatabase('create-payment');
  return payment;
}

export async function confirmPayment(paymentId: string, upiReference?: string): Promise<void> {
  const payment = await paymentsCollection.find(paymentId);
  await database.write(async () => {
    await payment.update((p) => {
      p.status = 'paid';
      p.paidAt = new Date();
      if (upiReference) p.upiReference = upiReference;
    });
  });
  await refreshPending();
  syncDatabase('confirm-payment');
}
