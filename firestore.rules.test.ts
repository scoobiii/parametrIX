/**
 * Security contract verification matrix for Parametrix CAD Studio Firestore Rules.
 * Covers the "Dirty Dozen" adversarial payloads defined in security_spec.md.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  actorUid: string | null;
  emailVerified: boolean;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_SECURITY_CASES: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Cross-Tenant User Read',
    actorUid: 'userB',
    emailVerified: true,
    operation: 'get',
    path: '/users/userA',
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'User Directory Enumeration',
    actorUid: 'userB',
    emailVerified: true,
    operation: 'list',
    path: '/users',
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Identity Spoofing on Profile',
    actorUid: 'userB',
    emailVerified: true,
    operation: 'create',
    path: '/users/userB',
    payload: { uid: 'userA', displayName: 'Spoofer', email: 'b@example.com', photoUrl: '' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Shadow Ghost Field on Profile',
    actorUid: 'userA',
    emailVerified: true,
    operation: 'create',
    path: '/users/userA',
    payload: { uid: 'userA', displayName: 'Alice', email: 'a@example.com', photoUrl: '', isAdmin: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Unverified Token Write',
    actorUid: 'userA',
    emailVerified: false,
    operation: 'create',
    path: '/users/userA',
    payload: { uid: 'userA', displayName: 'Alice', email: 'a@example.com', photoUrl: '' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Cross-Tenant Project Create',
    actorUid: 'userB',
    emailVerified: true,
    operation: 'create',
    path: '/users/userA/projects/proj_1',
    payload: { id: 'proj_1', ownerId: 'userB', name: 'Injected' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Orphaned Project Without Parent Profile',
    actorUid: 'userNoProfile',
    emailVerified: true,
    operation: 'create',
    path: '/users/userNoProfile/projects/proj_1',
    payload: { id: 'proj_1', ownerId: 'userNoProfile', name: 'Orphan' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'ID Poisoning (>128 chars)',
    actorUid: 'userA',
    emailVerified: true,
    operation: 'create',
    path: `/users/userA/projects/${'x'.repeat(200)}`,
    payload: { id: 'x'.repeat(200), ownerId: 'userA', name: 'Poison' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Client Timestamp Forgery',
    actorUid: 'userA',
    emailVerified: true,
    operation: 'create',
    path: '/users/userA/projects/proj_1',
    payload: { id: 'proj_1', ownerId: 'userA', createdAt: '2020-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Ghost Key Inside Nested designParams Map',
    actorUid: 'userA',
    emailVerified: true,
    operation: 'create',
    path: '/users/userA/projects/proj_1',
    payload: { id: 'proj_1', ownerId: 'userA', designParams: { preset: 'shell', ghostKey: 'payload' } },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Immutable ownerId Hijack on Update',
    actorUid: 'userA',
    emailVerified: true,
    operation: 'update',
    path: '/users/userA/projects/proj_1',
    payload: { id: 'proj_1', ownerId: 'userB' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Deliverable Audit Record Mutation',
    actorUid: 'userA',
    emailVerified: true,
    operation: 'update',
    path: '/users/userA/deliverables/deliv_1',
    payload: { filename: 'tampered.stl' },
    expectedResult: 'PERMISSION_DENIED',
  },
];
