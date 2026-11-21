import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';

/**
 * Isolation scenario:
 * - Realm daminatofit: tenant T1 (trainer A, students S1+S2) and T2 (trainer B, students S2+S3)
 * - Realm pupiapp: tenant TP (trainer P, student SP)
 * - Global muscle group G
 */
export interface ScenarioIds {
  brands: { daminatofit: string; pupiapp: string };
  users: {
    trainerA: string;
    studentS1: string;
    studentS2: string;
    trainerB: string;
    studentS3: string;
    trainerP: string;
    studentSP: string;
  };
  tenants: { t1: string; t2: string; tp: string };
  memberships: {
    ownerT1: string;
    s1T1: string;
    s2T1: string;
    ownerT2: string;
    s2T2: string;
    s3T2: string;
    ownerTP: string;
    spTP: string;
  };
  messages: { toS1: string; toS2T1: string };
  announcements: { t1: string; t2: string };
  muscleGroupId: string;
}

export async function seedScenario(sql: Sql): Promise<ScenarioIds> {
  const ids: ScenarioIds = {
    brands: { daminatofit: randomUUID(), pupiapp: randomUUID() },
    users: {
      trainerA: randomUUID(),
      studentS1: randomUUID(),
      studentS2: randomUUID(),
      trainerB: randomUUID(),
      studentS3: randomUUID(),
      trainerP: randomUUID(),
      studentSP: randomUUID(),
    },
    tenants: { t1: randomUUID(), t2: randomUUID(), tp: randomUUID() },
    memberships: {
      ownerT1: randomUUID(),
      s1T1: randomUUID(),
      s2T1: randomUUID(),
      ownerT2: randomUUID(),
      s2T2: randomUUID(),
      s3T2: randomUUID(),
      ownerTP: randomUUID(),
      spTP: randomUUID(),
    },
    messages: { toS1: randomUUID(), toS2T1: randomUUID() },
    announcements: { t1: randomUUID(), t2: randomUUID() },
    muscleGroupId: randomUUID(),
  };

  // Brands are seeded by migration 0002; reuse their ids.
  const brandRows = await sql<{ id: string; slug: string }[]>`
    SELECT id, slug FROM brands WHERE slug IN ('daminatofit', 'pupiapp')
  `;
  ids.brands.daminatofit = brandRows.find((b) => b.slug === 'daminatofit')!.id;
  ids.brands.pupiapp = brandRows.find((b) => b.slug === 'pupiapp')!.id;

  await sql`
    INSERT INTO users (id, realm, auth_user_id, display_name) VALUES
      (${ids.users.trainerA}, 'daminatofit', ${`auth_${randomUUID()}`}, 'Trainer A'),
      (${ids.users.studentS1}, 'daminatofit', ${`auth_${randomUUID()}`}, 'Student S1'),
      (${ids.users.studentS2}, 'daminatofit', ${`auth_${randomUUID()}`}, 'Student S2'),
      (${ids.users.trainerB}, 'daminatofit', ${`auth_${randomUUID()}`}, 'Trainer B'),
      (${ids.users.studentS3}, 'daminatofit', ${`auth_${randomUUID()}`}, 'Student S3'),
      (${ids.users.trainerP}, 'pupiapp', ${`auth_${randomUUID()}`}, 'Trainer P'),
      (${ids.users.studentSP}, 'pupiapp', ${`auth_${randomUUID()}`}, 'Student SP')
  `;

  await sql`
    INSERT INTO tenants (id, brand_id, kind, name, owner_user_id) VALUES
      (${ids.tenants.t1}, ${ids.brands.daminatofit}, 'trainer', 'Tenant T1', ${ids.users.trainerA}),
      (${ids.tenants.t2}, ${ids.brands.daminatofit}, 'trainer', 'Tenant T2', ${ids.users.trainerB}),
      (${ids.tenants.tp}, ${ids.brands.pupiapp}, 'trainer', 'Tenant TP', ${ids.users.trainerP})
  `;

  await sql`
    INSERT INTO memberships (id, tenant_id, user_id, role, status, activated_at) VALUES
      (${ids.memberships.ownerT1}, ${ids.tenants.t1}, ${ids.users.trainerA}, 'owner', 'active', now()),
      (${ids.memberships.s1T1}, ${ids.tenants.t1}, ${ids.users.studentS1}, 'student', 'active', now()),
      (${ids.memberships.s2T1}, ${ids.tenants.t1}, ${ids.users.studentS2}, 'student', 'active', now()),
      (${ids.memberships.ownerT2}, ${ids.tenants.t2}, ${ids.users.trainerB}, 'owner', 'active', now()),
      (${ids.memberships.s2T2}, ${ids.tenants.t2}, ${ids.users.studentS2}, 'student', 'active', now()),
      (${ids.memberships.s3T2}, ${ids.tenants.t2}, ${ids.users.studentS3}, 'student', 'active', now()),
      (${ids.memberships.ownerTP}, ${ids.tenants.tp}, ${ids.users.trainerP}, 'owner', 'active', now()),
      (${ids.memberships.spTP}, ${ids.tenants.tp}, ${ids.users.studentSP}, 'student', 'active', now())
  `;

  await sql`
    INSERT INTO trainer_profiles (tenant_id, display_name, whatsapp_e164) VALUES
      (${ids.tenants.t1}, 'Coach A', '+5491100000001'),
      (${ids.tenants.t2}, 'Coach B', '+5491100000002'),
      (${ids.tenants.tp}, 'Coach P', '+5491100000003')
  `;

  await sql`
    INSERT INTO announcements (id, tenant_id, author_user_id, title, body, published_at) VALUES
      (${ids.announcements.t1}, ${ids.tenants.t1}, ${ids.users.trainerA}, 'T1 notice', 'Hello T1', now()),
      (${ids.announcements.t2}, ${ids.tenants.t2}, ${ids.users.trainerB}, 'T2 notice', 'Hello T2', now())
  `;

  await sql`
    INSERT INTO direct_messages (id, tenant_id, sender_user_id, recipient_membership_id, body) VALUES
      (${ids.messages.toS1}, ${ids.tenants.t1}, ${ids.users.trainerA}, ${ids.memberships.s1T1}, 'Private for S1'),
      (${ids.messages.toS2T1}, ${ids.tenants.t1}, ${ids.users.trainerA}, ${ids.memberships.s2T1}, 'Private for S2 in T1')
  `;

  const existingMuscle = await sql<{ id: string }[]>`
    SELECT id FROM muscle_groups WHERE slug = 'chest' LIMIT 1
  `;
  if (existingMuscle[0]) {
    ids.muscleGroupId = existingMuscle[0].id;
  } else {
    await sql`
      INSERT INTO muscle_groups (id, slug, name) VALUES
        (${ids.muscleGroupId}, 'chest', 'Pecho')
    `;
  }

  return ids;
}

export const actor = {
  trainerA: (ids: ScenarioIds) => ({
    realm: 'daminatofit',
    userId: ids.users.trainerA,
    tenantId: ids.tenants.t1,
    membershipId: ids.memberships.ownerT1,
    role: 'owner',
  }),
  studentS1: (ids: ScenarioIds) => ({
    realm: 'daminatofit',
    userId: ids.users.studentS1,
    tenantId: ids.tenants.t1,
    membershipId: ids.memberships.s1T1,
    role: 'student',
  }),
  studentS2InT1: (ids: ScenarioIds) => ({
    realm: 'daminatofit',
    userId: ids.users.studentS2,
    tenantId: ids.tenants.t1,
    membershipId: ids.memberships.s2T1,
    role: 'student',
  }),
  studentS2InT2: (ids: ScenarioIds) => ({
    realm: 'daminatofit',
    userId: ids.users.studentS2,
    tenantId: ids.tenants.t2,
    membershipId: ids.memberships.s2T2,
    role: 'student',
  }),
  trainerB: (ids: ScenarioIds) => ({
    realm: 'daminatofit',
    userId: ids.users.trainerB,
    tenantId: ids.tenants.t2,
    membershipId: ids.memberships.ownerT2,
    role: 'owner',
  }),
  trainerP: (ids: ScenarioIds) => ({
    realm: 'pupiapp',
    userId: ids.users.trainerP,
    tenantId: ids.tenants.tp,
    membershipId: ids.memberships.ownerTP,
    role: 'owner',
  }),
  studentSP: (ids: ScenarioIds) => ({
    realm: 'pupiapp',
    userId: ids.users.studentSP,
    tenantId: ids.tenants.tp,
    membershipId: ids.memberships.spTP,
    role: 'student',
  }),
};
