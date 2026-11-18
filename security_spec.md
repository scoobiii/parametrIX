# Security Specification & Red Team Audit — Parametrix CAD Studio

## 1. Data Invariants (Zero Cross-Tenant / Zero PO Exposure)
1. **Strict Tenant Isolation**: Every document in `/users/{userId}`, `/users/{userId}/projects/{projectId}`, and `/users/{userId}/deliverables/{deliverableId}` is strictly owned by `request.auth.uid == userId`. No Product Owner (PO), developer, or other end-user can list, read, create, update, or delete another user's documents.
2. **Email Verification Gate**: All reads and writes require `request.auth != null && request.auth.token.email_verified == true`.
3. **Master Gate Integrity**: Subcollection single-document writes and reads (`projects`, `deliverables`) verify that the parent `/users/{userId}` document exists (`exists(...)`) and belongs to `request.auth.uid`.
4. **No Blanket Reads / Enumeration**: `allow list: if false;` on `/users`. On subcollections, `allow list` enforces `isOwner(userId) && existing().ownerId == request.auth.uid` without O(n) `get()`/`exists()` lookups.
5. **Strict Key & Size Allowlisting**: Every entity validates `keys().hasAll(...) && keys().hasOnly(...)`, exact `designParams` / `camSettings` map keys, bounded string sizes, regex-checked IDs (`^[a-zA-Z0-9_\-]+$`), and server timestamps (`request.time`).
6. **Immutability**: `uid`, `id`, `ownerId`, and `createdAt` cannot be modified after creation.

## 2. The "Dirty Dozen" Adversarial Payloads (Expected: PERMISSION_DENIED)
1. **Cross-Tenant User Read**: User B attempts `get(/users/userA)`.
2. **User Directory Enumeration**: Authenticated User B attempts `list(/users)`.
3. **Identity Spoofing on Profile**: User B attempts `create(/users/userB, { uid: 'userA', ... })`.
4. **Shadow Ghost Field on Profile**: User A attempts `create(/users/userA, { ..., isAdmin: true })`.
5. **Unverified Token Write**: Unverified auth token (`email_verified: false`) attempts `create(/users/userA, ...)`.
6. **Cross-Tenant Project Create**: User B attempts `create(/users/userA/projects/proj1, { ownerId: 'userB', ... })`.
7. **Orphaned Project (Missing Parent User Doc)**: User A without `/users/userA` attempts `create(/users/userA/projects/proj1, ...)`.
8. **ID Poisoning (1.5KB Invalid Doc ID)**: User A attempts `create(/users/userA/projects/${'x'.repeat(300)}, ...)`.
9. **Client Timestamp Forgery**: User A sends `createdAt: Timestamp(2020-01-01)` instead of `serverTimestamp()` (`request.time`).
10. **Ghost Key inside Nested Map (`designParams`)**: User A injects `designParams: { ..., __proto_exploit__: '1MB...' }`.
11. **Immutable `ownerId` / `createdAt` Hijack on Update**: User A updates `/users/userA/projects/proj1` changing `ownerId` or `createdAt`.
12. **Terminal Deliverable Tampering**: User A attempts `update` on `/users/userA/deliverables/d1` (deliverable audit records are append-only / immutable once logged, only deletable by owner).
