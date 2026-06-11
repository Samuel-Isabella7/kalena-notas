import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { Response } from 'express';
import * as fs from 'fs';
import { OmieAccount, Role } from '@prisma/client';
import { InvoicesService } from './invoices.service';
import { UploadInvoiceDto } from './dto/upload-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { allowedKinds } from '../../common/utils/role-scope';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @Roles(Role.CRIADOR, Role.ADMIN) // criador e admin anexam; admin serviço/icms são leitura
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadInvoiceDto,
    @CurrentUser() user: AuthUser,
  ) {
    const account = dto.account ?? OmieAccount.SP;
    return this.invoices.upload(file, dto.date, account, dto.kind, user.id);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('date') date?: string) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Informe ?date=YYYY-MM-DD');
    }
    return this.invoices.listByDate(date, user.role);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.invoices.get(id, user.role);
  }

  @Get(':id/file')
  async file(@Param('id') id: string, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new BadRequestException('Nota não encontrada.');
    if (!allowedKinds(user.role).includes(invoice.kind)) {
      throw new ForbiddenException('Você não tem acesso a este tipo de nota.');
    }
    if (invoice.driveLink) {
      return res.redirect(invoice.driveLink);
    }
    if (invoice.localPath && fs.existsSync(invoice.localPath)) {
      res.setHeader('Content-Type', invoice.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${invoice.fileName}"`);
      return fs.createReadStream(invoice.localPath).pipe(res);
    }
    throw new BadRequestException('Arquivo indisponível.');
  }

  @Patch(':id')
  @Roles(Role.CRIADOR, Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.invoices.update(id, dto, user.id);
  }

  @Delete(':id')
  @Roles(Role.CRIADOR)
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.invoices.remove(id, user.id);
  }

  @Post(':id/launch')
  @Roles(Role.CRIADOR)
  launch(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.invoices.launch(id, user.id);
  }
}
