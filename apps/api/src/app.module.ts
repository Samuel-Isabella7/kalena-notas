import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { MailModule } from './modules/mail/mail.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { StorageModule } from './modules/storage/storage.module';
import { PdfModule } from './modules/pdf/pdf.module';
import { OmieModule } from './modules/omie/omie.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SefazModule } from './modules/sefaz/sefaz.module';
import { PhysicalNotesModule } from './modules/physical-notes/physical-notes.module';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { BootstrapService } from './common/bootstrap.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    MailModule,
    AuthModule,
    UsersModule,
    StorageModule,
    PdfModule,
    OmieModule,
    InvoicesModule,
    CalendarModule,
    SettingsModule,
    SefazModule,
    PhysicalNotesModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    BootstrapService,
  ],
})
export class AppModule {}
