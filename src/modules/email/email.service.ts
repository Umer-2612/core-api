import nodemailer from "nodemailer";
import { FRONTEND_URL, SMTP_HOST, SMTP_PASS, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_FROM } from "@shared/config/env";
import { logger } from "@shared/utils/logger";

export interface SendInvitationParams {
  to: string;
  token: string;
  companyName: string;
  inviterName: string;
}

/** Sends transactional email via SMTP when configured, otherwise logs the link (local dev). */
export class EmailService {
  private readonly transporter: ReturnType<typeof nodemailer.createTransport> | null;

  constructor() {
    this.transporter = SMTP_HOST
      ? nodemailer.createTransport({
          host: SMTP_HOST,
          port: SMTP_PORT,
          secure: SMTP_SECURE,
          auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
        })
      : null;
  }

  async sendHiringManagerInvitation(params: SendInvitationParams): Promise<void> {
    const link = `${FRONTEND_URL}/invite/${params.token}`;

    if (!this.transporter) {
      logger.info(`[email:dev] Invitation for ${params.to} (${params.companyName}): ${link}`);
      return;
    }

    await this.transporter.sendMail({
      from: SMTP_FROM,
      to: params.to,
      subject: `${params.inviterName} invited you to ${params.companyName} on Interview Platform`,
      html: `<p>${params.inviterName} invited you to join <b>${params.companyName}</b>.</p><p><a href="${link}">Accept invitation</a></p>`,
    });
  }
}
