import { describe, expect, it } from 'vitest';
import {
  RecommendationWriteSchema,
  benefitIsActive,
  normalizeDestination,
  recommendationWhatsappMessage,
  whatsappLinkWithText,
} from './recommendations';

describe('recommendation links and messages', () => {
  it('accepts public https destinations and rejects unsafe schemes', () => {
    expect(normalizeDestination('website', 'https://tienda.example/promo').ok).toBe(true);
    expect(normalizeDestination('whatsapp', 'https://wa.me/5491111111111').ok).toBe(true);
    expect(normalizeDestination('website', 'javascript:alert(1)').ok).toBe(false);
    expect(normalizeDestination('website', 'http://tienda.example').ok).toBe(false);
    expect(normalizeDestination('website', 'https://127.0.0.1/x').ok).toBe(false);
    expect(normalizeDestination('website', 'https://user:pass@tienda.example').ok).toBe(false);
    expect(normalizeDestination('instagram', 'https://instagram.com/tienda').ok).toBe(true);
    expect(normalizeDestination('maps', 'https://maps.google.com/?q=local').ok).toBe(true);
    expect(normalizeDestination('whatsapp', 'https://evil.example/wa').ok).toBe(false);
  });

  it('builds a WhatsApp draft from the trainer profile and an optional code', () => {
    expect(
      recommendationWhatsappMessage({
        trainerName: 'Martín González',
        benefitDescription: 'el descuento del 15 %',
        promoCode: 'MARTIN15',
        benefitActive: true,
      }),
    ).toBe(
      'Hola, vengo de parte del profesor Martín González. Quisiera consultar por el descuento del 15 % utilizando el código MARTIN15.',
    );
    expect(
      recommendationWhatsappMessage({
        trainerName: 'Martín González',
        benefitActive: false,
        benefitDescription: 'el descuento del 15 %',
        promoCode: 'MARTIN15',
      }),
    ).toBe(
      'Hola, vengo de parte del profesor Martín González. Quisiera consultar por sus servicios.',
    );
    const link = whatsappLinkWithText('https://wa.me/5491111111111', 'Hola');
    expect(link).toBe('https://wa.me/5491111111111?text=Hola');
  });

  it('requires a declared commercial relationship when a benefit is present', () => {
    const base = {
      categorySlug: 'other',
      name: 'Nutricionista amigo',
      destinationKind: 'website' as const,
      destinationUrl: 'https://nutri.example',
      commercialDeclared: false,
    };
    expect(RecommendationWriteSchema.safeParse(base).success).toBe(true);
    expect(
      RecommendationWriteSchema.safeParse({
        ...base,
        name: 'Tienda',
        benefitDescription: '15 % de descuento',
        promoCode: 'MARTIN15',
      }).success,
    ).toBe(false);
    expect(
      RecommendationWriteSchema.safeParse({
        ...base,
        name: 'Tienda',
        benefitDescription: '15 % de descuento',
        promoCode: 'MARTIN15',
        commercialDeclared: true,
      }).success,
    ).toBe(true);
    expect(benefitIsActive('2026-11-20', '2026-11-21')).toBe(false);
    expect(benefitIsActive('2026-11-21', '2026-11-21')).toBe(true);
    expect(benefitIsActive(null, '2026-11-21')).toBe(true);
  });
});
