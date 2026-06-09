import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface StoredFile {
  driveFileId: string | null;
  driveLink: string | null;
  localPath: string | null;
}

interface UploadParams {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  kindLabel: string; // "Serviço" ou "ICMS" — pasta de topo
  year: number;
  month: number; // 1-12
  day: number;
}

const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive'];

@Injectable()
export class DriveService implements OnModuleInit {
  private readonly logger = new Logger(DriveService.name);
  private drive: drive_v3.Drive | null = null;
  private rootFolderId = '';
  private folderCache = new Map<string, string>();
  private readonly localRoot = path.resolve(process.cwd(), 'uploads');

  constructor(private config: ConfigService) {}

  onModuleInit() {
    this.rootFolderId = this.config.get<string>('GDRIVE_ROOT_FOLDER_ID', '').trim();
    const credentials = this.loadCredentials();

    if (!credentials || !this.rootFolderId) {
      this.logger.warn(
        'Google Drive não configurado (faltam credenciais ou GDRIVE_ROOT_FOLDER_ID). ' +
          'Os arquivos serão salvos localmente em apps/api/uploads/.',
      );
      return;
    }

    try {
      const auth = new google.auth.GoogleAuth({ credentials, scopes: DRIVE_SCOPES });
      this.drive = google.drive({ version: 'v3', auth });
      this.logger.log('Google Drive configurado com conta de serviço.');
    } catch (e: any) {
      this.logger.error(`Falha ao inicializar Google Drive: ${e.message}. Usando armazenamento local.`);
      this.drive = null;
    }
  }

  isEnabled(): boolean {
    return this.drive !== null;
  }

  status() {
    return {
      driveEnabled: this.isEnabled(),
      rootFolderConfigured: !!this.rootFolderId,
    };
  }

  private loadCredentials(): any | null {
    const raw = this.config.get<string>('GOOGLE_SERVICE_ACCOUNT_JSON', '').trim();
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        this.logger.error('GOOGLE_SERVICE_ACCOUNT_JSON não é um JSON válido.');
      }
    }
    const file = this.config.get<string>('GOOGLE_SERVICE_ACCOUNT_FILE', '').trim();
    if (file && fs.existsSync(file)) {
      try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch {
        this.logger.error(`Não foi possível ler/parsear ${file}.`);
      }
    }
    return null;
  }

  /** Faz upload do arquivo organizando em subpastas Ano/Mês/Dia. */
  async upload(params: UploadParams): Promise<StoredFile> {
    const { buffer, fileName, mimeType, kindLabel, year, month, day } = params;
    const monthFolder = String(month).padStart(2, '0');
    const dayFolder = String(day).padStart(2, '0');
    const safeName = `${crypto.randomUUID().slice(0, 8)}_${this.sanitize(fileName)}`;

    if (!this.drive) {
      return this.saveLocal(buffer, safeName, [kindLabel, String(year), monthFolder, dayFolder]);
    }

    try {
      const kindId = await this.ensureFolder(kindLabel, this.rootFolderId);
      const yearId = await this.ensureFolder(String(year), kindId);
      const monthId = await this.ensureFolder(monthFolder, yearId);
      const dayId = await this.ensureFolder(dayFolder, monthId);

      const res = await this.drive.files.create({
        requestBody: { name: safeName, parents: [dayId] },
        media: { mimeType, body: Readable.from(buffer) },
        fields: 'id, webViewLink',
        supportsAllDrives: true,
      });

      return {
        driveFileId: res.data.id ?? null,
        driveLink: res.data.webViewLink ?? null,
        localPath: null,
      };
    } catch (e: any) {
      this.logger.error(`Falha no upload para o Drive: ${e.message}. Salvando localmente.`);
      return this.saveLocal(buffer, safeName, [String(year), monthFolder, dayFolder]);
    }
  }

  async delete(file: { driveFileId: string | null; localPath: string | null }): Promise<void> {
    if (file.driveFileId && this.drive) {
      try {
        await this.drive.files.delete({ fileId: file.driveFileId, supportsAllDrives: true });
        return;
      } catch (e: any) {
        this.logger.warn(`Falha ao excluir do Drive (${file.driveFileId}): ${e.message}`);
      }
    }
    if (file.localPath && fs.existsSync(file.localPath)) {
      try {
        fs.unlinkSync(file.localPath);
      } catch (e: any) {
        this.logger.warn(`Falha ao excluir arquivo local: ${e.message}`);
      }
    }
  }

  private async ensureFolder(name: string, parentId: string): Promise<string> {
    const cacheKey = `${parentId}/${name}`;
    const cached = this.folderCache.get(cacheKey);
    if (cached) return cached;

    const q = [
      `name = '${name.replace(/'/g, "\\'")}'`,
      "mimeType = 'application/vnd.google-apps.folder'",
      `'${parentId}' in parents`,
      'trashed = false',
    ].join(' and ');

    const found = await this.drive!.files.list({
      q,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'allDrives',
      spaces: 'drive',
    });

    if (found.data.files && found.data.files.length > 0) {
      const id = found.data.files[0].id!;
      this.folderCache.set(cacheKey, id);
      return id;
    }

    const created = await this.drive!.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      },
      fields: 'id',
      supportsAllDrives: true,
    });
    const id = created.data.id!;
    this.folderCache.set(cacheKey, id);
    return id;
  }

  private saveLocal(buffer: Buffer, name: string, segments: string[]): StoredFile {
    const dir = path.join(this.localRoot, ...segments);
    fs.mkdirSync(dir, { recursive: true });
    const full = path.join(dir, name);
    fs.writeFileSync(full, buffer);
    return { driveFileId: null, driveLink: null, localPath: full };
  }

  private sanitize(name: string): string {
    return name.replace(/[^\w.\-]+/g, '_').slice(-120);
  }
}
