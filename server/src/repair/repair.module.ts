import { Module } from '@nestjs/common';
import { RepairController } from '@/repair/repair.controller';
import { RepairService } from '@/repair/repair.service';

@Module({
  controllers: [RepairController],
  providers: [RepairService],
  exports: [RepairService],
})
export class RepairModule {}
