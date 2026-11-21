import type { BrandId } from '@daminatofit/brand';
import { createTransport, type Transporter } from 'nodemailer';
import type { Env } from '../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let transporter: Transporter | null = null;

function getTransporter(env: Env): Transporter {
  if (!transporter) {
    transporter = createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: false,
      tls: { rejectUnauthorized: false },
    });
  }
  return transporter;
}

export async function sendMail(env: Env, message: MailMessage): Promise<void> {
  await getTransporter(env).sendMail({
    from: env.SMTP_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}

const brandNames: Record<BrandId, string> = {
  daminatofit: 'DaminatoFit',
  pupiapp: 'PupiApp',
};

export function verificationEmail(brandId: BrandId, url: string): MailMessage {
  const brand = brandNames[brandId];
  return {
    to: '',
    subject: `${brand}: verificá tu correo`,
    text: `Verificá tu correo en ${brand}: ${url}`,
    html: `<p>Verificá tu correo en <strong>${brand}</strong>.</p><p><a href="${url}">Confirmar correo</a></p>`,
  };
}

export function resetPasswordEmail(brandId: BrandId, url: string): MailMessage {
  const brand = brandNames[brandId];
  return {
    to: '',
    subject: `${brand}: recuperá tu contraseña`,
    text: `Restablecé tu contraseña en ${brand}: ${url}`,
    html: `<p>Restablecé tu contraseña en <strong>${brand}</strong>.</p><p><a href="${url}">Elegir nueva contraseña</a></p>`,
  };
}

export function invitationEmail(brandId: BrandId, trainerName: string, url: string): MailMessage {
  const brand = brandNames[brandId];
  return {
    to: '',
    subject: `${brand}: invitación de ${trainerName}`,
    text: `${trainerName} te invitó a entrenar en ${brand}. Abrí: ${url}`,
    html: `<p><strong>${trainerName}</strong> te invitó a entrenar en <strong>${brand}</strong>.</p><p><a href="${url}">Aceptar invitación</a></p>`,
  };
}
