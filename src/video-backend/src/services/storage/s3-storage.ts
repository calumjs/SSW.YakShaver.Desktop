import fs from "node:fs";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../../config/index.js";
import type { StorageProvider } from "../../types/index.js";

export class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = config.storage.bucket;

    this.client = new S3Client({
      region: config.storage.region,
      ...(config.storage.endpoint && { endpoint: config.storage.endpoint }),
      forcePathStyle: config.storage.forcePathStyle,
      ...(config.storage.accessKeyId &&
        config.storage.secretAccessKey && {
          credentials: {
            accessKeyId: config.storage.accessKeyId,
            secretAccessKey: config.storage.secretAccessKey,
          },
        }),
    });
  }

  async upload(
    key: string,
    filePath: string,
    contentType?: string,
  ): Promise<string> {
    const fileStream = fs.createReadStream(filePath);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: fileStream,
        ContentType: contentType,
      }),
    );

    return key;
  }

  async download(key: string, destPath: string): Promise<void> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    if (!response.Body) {
      throw new Error(`No body in S3 response for key: ${key}`);
    }

    const writeStream = fs.createWriteStream(destPath);
    const readable = response.Body as NodeJS.ReadableStream;

    await new Promise<void>((resolve, reject) => {
      readable.pipe(writeStream);
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });
  }

  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn = 3600,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }

  async getPresignedDownloadUrl(
    key: string,
    expiresIn = 3600,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }
}

let instance: S3StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (!instance) {
    instance = new S3StorageProvider();
  }
  return instance;
}
