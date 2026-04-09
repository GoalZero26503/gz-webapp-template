export const APP_ROLES = ['user', 'admin'] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const PERMISSIONS = {
  'portal:user:read': 'View portal users',
  'portal:user:write': 'Modify portal user roles',
  'portal:user:invite': 'Invite new portal users',
  'portal:user:delete': 'Delete portal users',
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  user: [],
  admin: [
    'portal:user:read',
    'portal:user:write',
    'portal:user:invite',
    'portal:user:delete',
  ],
};

export const ROLE_HIERARCHY: Record<AppRole, number> = {
  user: 0,
  admin: 1,
};

export interface PermissionOverride {
  grant?: Permission[];
  revoke?: Permission[];
}

export interface AppUser {
  email: string;
  name?: string;
  role: AppRole;
  status: 'active' | 'disabled';
  invitedBy: string;
  invitedAt: string;
  googleSub?: string;
  lastLoginAt?: string;
  permissionOverrides?: PermissionOverride;
  permissions?: Permission[];
}

export interface AppJwtPayload {
  sub: string;
  email: string;
  name: string;
  role: AppRole;
  permissions: Permission[];
  iat: number;
  exp: number;
}
