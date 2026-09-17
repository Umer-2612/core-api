import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { AWS_ACCESS_KEY_ID, AWS_REGION, AWS_SECRET_ACCESS_KEY, S3_BUCKET_NAME } from "@shared/config/env";
import { HttpException } from "@shared/exceptions/http.exception";

export interface IResumeStorage {
  upload(key: string, body: Buffer, contentType: string): Promise<void>;
  download(key: string): Promise<Buffer>;
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

/** Resume PDFs live in S3, this is the only place that talks to it. */
export class S3ResumeStorage implements IResumeStorage {
  private client: S3Client | null = null;

  private getClient(): S3Client {
    if (!AWS_REGION || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !S3_BUCKET_NAME) {
      throw new HttpException(
        500,
        "AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and S3_BUCKET_NAME must be set to store resumes",
      );
    }
    if (!this.client) {
      this.client = new S3Client({
        region: AWS_REGION,
        credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
      });
    }
    return this.client;
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.getClient().send(
      new PutObjectCommand({ Bucket: S3_BUCKET_NAME, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async download(key: string): Promise<Buffer> {
    const result = await this.getClient().send(new GetObjectCommand({ Bucket: S3_BUCKET_NAME, Key: key }));
    if (!result.Body) throw new HttpException(404, "Resume file not found in storage");
    return streamToBuffer(result.Body as NodeJS.ReadableStream);
  }
}
