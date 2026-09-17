import { Module } from '@nestjs/common';
import { PurchaseCallbackController, PurchaseController } from './purchase.controller';
import { PurchaseService } from './purchase.service';
import { PaymentService } from './payment.service';

@Module({
  controllers: [PurchaseController, PurchaseCallbackController],
  providers: [PurchaseService, PaymentService],
})
export class PurchaseModule {}
