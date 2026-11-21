import { z } from 'zod';

export const RECOMMENDATION_DESTINATIONS = [
  'website',
  'whatsapp',
  'instagram',
  'maps',
  'other',
] as const;

export type RecommendationDestination = (typeof RECOMMENDATION_DESTINATIONS)[number];

export const RECOMMENDATION_STATUSES = ['draft', 'published', 'hidden', 'archived'] as const;

export const REPORT_REASONS = [
  'fraudulent',
  'misleading',
  'dangerous',
  'inappropriate',
  'suspicious_link',
] as const;

export const DEFAULT_ACTION_LABEL: Record<RecommendationDestination, string> = {
  website: 'Visitar tienda',
  whatsapp: 'Contactar por WhatsApp',
  instagram: 'Ver Instagram',
  maps: 'Cómo llegar',
  other: 'Consultar profesional',
};

const CONTROL_FREE = (value: string) => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31)) return false;
  }
  return true;
};

function requiredText(max: number) {
  return z.string().trim().min(1).max(max).refine(CONTROL_FREE, { message: 'invalid_characters' });
}

function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .refine(CONTROL_FREE, { message: 'invalid_characters' })
    .optional()
    .transform((value) => (value ? value : undefined));
}

interface ParsedUrl {
  protocol: string;
  username: string;
  password: string;
  hostname: string;
  pathname: string;
  hash: string;
  toString: () => string;
}

function parseUrl(raw: string): ParsedUrl {
  const UrlCtor = (globalThis as { URL?: new (value: string) => ParsedUrl }).URL;
  if (!UrlCtor) throw new TypeError('URL unavailable');
  return new UrlCtor(raw);
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '::1' || host === '0.0.0.0') return true;
  const parts = host.split('.').map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
  return false;
}

export function normalizeDestination(
  kind: RecommendationDestination,
  raw: string,
):
  | { ok: true; url: string }
  | { ok: false; error: 'invalid_url' | 'invalid_scheme' | 'invalid_host' } {
  let parsed: ParsedUrl;
  try {
    parsed = parseUrl(raw.trim());
  } catch {
    return { ok: false, error: 'invalid_url' };
  }
  if (parsed.username || parsed.password) return { ok: false, error: 'invalid_url' };
  if (parsed.protocol !== 'https:') return { ok: false, error: 'invalid_scheme' };
  const host = parsed.hostname.toLowerCase();
  if (isPrivateHost(host)) return { ok: false, error: 'invalid_host' };

  if (kind === 'whatsapp') {
    if (host !== 'wa.me') return { ok: false, error: 'invalid_host' };
    const digits = parsed.pathname.replace(/^\//, '');
    if (!/^[1-9]\d{7,14}$/.test(digits)) return { ok: false, error: 'invalid_url' };
    return { ok: true, url: `https://wa.me/${digits}` };
  }

  if (kind === 'instagram') {
    if (host !== 'instagram.com' && host !== 'www.instagram.com') {
      return { ok: false, error: 'invalid_host' };
    }
  } else if (kind === 'maps') {
    const allowed =
      host === 'maps.google.com' ||
      host === 'www.google.com' ||
      host === 'maps.app.goo.gl' ||
      host === 'goo.gl';
    if (!allowed) return { ok: false, error: 'invalid_host' };
    if (host === 'www.google.com' && !parsed.pathname.startsWith('/maps')) {
      return { ok: false, error: 'invalid_url' };
    }
    if (host === 'goo.gl' && !parsed.pathname.startsWith('/maps')) {
      return { ok: false, error: 'invalid_url' };
    }
  } else if (host === 'wa.me') {
    return { ok: false, error: 'invalid_host' };
  }

  parsed.hash = '';
  return { ok: true, url: parsed.toString() };
}

export function recommendationWhatsappMessage(input: {
  trainerName: string;
  benefitDescription?: string | null;
  promoCode?: string | null;
  benefitActive: boolean;
}): string {
  const trainer = input.trainerName.trim() || 'tu entrenador';
  const benefit = input.benefitActive ? input.benefitDescription?.trim() : '';
  const code = input.benefitActive ? input.promoCode?.trim() : '';
  if (benefit && code) {
    return `Hola, vengo de parte del profesor ${trainer}. Quisiera consultar por ${benefit} utilizando el código ${code}.`;
  }
  if (benefit) {
    return `Hola, vengo de parte del profesor ${trainer}. Quisiera consultar por ${benefit}.`;
  }
  if (code) {
    return `Hola, vengo de parte del profesor ${trainer}. Quisiera consultar utilizando el código ${code}.`;
  }
  return `Hola, vengo de parte del profesor ${trainer}. Quisiera consultar por sus servicios.`;
}

export function whatsappLinkWithText(storedUrl: string, text: string): string | null {
  const normalized = normalizeDestination('whatsapp', storedUrl);
  if (!normalized.ok) return null;
  const digits = normalized.url.replace('https://wa.me/', '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function benefitIsActive(expiresOn: string | null | undefined, todayUtc: string): boolean {
  if (!expiresOn) return true;
  return expiresOn >= todayUtc;
}

const destinationKind = z.enum(RECOMMENDATION_DESTINATIONS);

export const RecommendationWriteSchema = z
  .object({
    categorySlug: z
      .string()
      .trim()
      .regex(/^[a-z0-9_]{2,40}$/),
    name: requiredText(80),
    description: optionalText(400),
    imageMediaId: z.string().uuid().nullable().optional(),
    destinationKind,
    destinationUrl: z.string().trim().min(8).max(500),
    actionLabel: optionalText(40),
    benefitLabel: optionalText(80),
    benefitDescription: optionalText(240),
    promoCode: z
      .string()
      .trim()
      .max(32)
      .regex(/^[A-Za-z0-9_-]*$/)
      .optional()
      .transform((value) => (value ? value : undefined)),
    benefitTerms: optionalText(500),
    benefitExpiresOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    professionalLicense: optionalText(40),
    commercialDeclared: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    const destination = normalizeDestination(value.destinationKind, value.destinationUrl);
    if (!destination.ok) {
      ctx.addIssue({ code: 'custom', path: ['destinationUrl'], message: destination.error });
    }
    const hasBenefit = Boolean(
      value.benefitLabel ||
      value.benefitDescription ||
      value.promoCode ||
      value.benefitTerms ||
      value.benefitExpiresOn,
    );
    if (hasBenefit && !value.commercialDeclared) {
      ctx.addIssue({
        code: 'custom',
        path: ['commercialDeclared'],
        message: 'commercial_declaration_required',
      });
    }
  });

export const RecommendationReorderSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

export const RecommendationReportSchema = z.object({
  reason: z.enum(REPORT_REASONS),
  details: optionalText(500),
});

export const RecommendationModerateSchema = z.object({
  action: z.enum(['hide', 'dismiss']),
  reason: requiredText(500),
  reportId: z.string().uuid(),
  confirm: z.literal(true),
});

export const RecommendationCategoryWriteSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{2,40}$/),
  name: requiredText(80),
  confirm: z.literal(true),
});

export type RecommendationWrite = z.infer<typeof RecommendationWriteSchema>;
