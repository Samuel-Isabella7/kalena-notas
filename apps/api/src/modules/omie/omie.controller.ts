import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { OmieAccount } from '@prisma/client';
import { OmieService } from './omie.service';

function parseAccount(account?: string): OmieAccount {
  if (account === 'SP' || account === 'RJ') return account as OmieAccount;
  throw new BadRequestException('Conta inválida. Use SP ou RJ.');
}

@ApiTags('omie')
@ApiBearerAuth()
@Controller('omie')
export class OmieController {
  constructor(private readonly omie: OmieService) {}

  @Get('status')
  status() {
    return { accounts: this.omie.configuredAccounts() };
  }

  @Get('categorias')
  categorias(@Query('account') account?: string) {
    return this.omie.listCategorias(parseAccount(account));
  }

  @Get('contas-correntes')
  contasCorrentes(@Query('account') account?: string) {
    return this.omie.listContasCorrentes(parseAccount(account));
  }
}
