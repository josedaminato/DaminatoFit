export interface MeMembership {
  id: string;
  tenantId: string;
  role: string;
  status: string;
  tenantName: string;
  brandId: string;
}

export interface MeResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    realm: string;
    brandId: string;
  };
  memberships: MeMembership[];
  activeTenantId: string | null;
}

export interface TrainerProfile {
  displayName: string;
  bio: string | null;
  whatsappE164: string | null;
  whatsappUrl?: string | null;
}
