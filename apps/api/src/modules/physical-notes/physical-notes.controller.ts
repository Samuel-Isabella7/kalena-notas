import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { Role } from '@prisma/client';
import { PhysicalNotesService } from './physical-notes.service';
import { UploadPhysicalNoteDto } from './dto/upload-physical-note.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

// Veem a aba: Criador, Administrador, ICMS e Balanço. Serviço NÃO tem acesso.
const VIEW_ROLES: Role[] = [Role.CRIADOR, Role.ADMIN, Role.ADMIN_ICMS, Role.BALANCO];

@ApiTags('physical-notes')
@ApiBearerAuth()
@Controller('physical-notes')
@Roles(...VIEW_ROLES)
export class PhysicalNotesController {
  constructor(private readonly notes: PhysicalNotesService) {}

  @Post()
  @Roles(Role.CRIADOR, Role.ADMIN) // só criador e admin anexam
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadPhysicalNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notes.upload(file, dto.nome, dto.observacao, user.id);
  }

  @Get()
  list(@Query('mes') mes?: string) {
    return this.notes.list(mes);
  }

  @Get('meta')
  meta() {
    return this.notes.meta();
  }

  @Get(':id/file')
  async file(@Param('id') id: string, @Res() res: Response) {
    const note = await this.notes.fileRef(id);
    if (note.driveLink) return res.redirect(note.driveLink);
    if (note.localPath && fs.existsSync(note.localPath)) {
      res.setHeader('Content-Type', note.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${note.fileName}"`);
      return fs.createReadStream(note.localPath).pipe(res);
    }
    throw new BadRequestException('Arquivo indisponível.');
  }

  @Delete(':id')
  @Roles(Role.CRIADOR, Role.ADMIN) // o serviço ainda valida: só quem anexou ou o criador
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.notes.remove(id, user.id, user.role);
  }
}
