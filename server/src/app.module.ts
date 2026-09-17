import { Module } from '@nestjs/common';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { AuthModule } from '@/auth/auth.module';
import { RepairModule } from '@/repair/repair.module';
import { PurchaseModule } from '@/purchase/purchase.module';

@Module({
  imports: [AuthModule, RepairModule, PurchaseModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
