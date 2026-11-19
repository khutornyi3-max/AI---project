# Security Specification — The Tiebreaker (Firestore)

## 1. Data Invariants
1. **Default Deny**: All unmatched paths are denied for read and write.
2. **Verified Google Identity Only**: Every read/write requires `request.auth != null && request.auth.token.email_verified == true`.
3. **PII Isolation**: User profile data (`email`, `displayName`, `photoURL`) lives exclusively under `/users/{userId}/private/{docId}` and is readable/writable ONLY when `request.auth.uid == userId`. No `list` queries are permitted on user profiles.
4. **Strict Ownership on Decisions**: Every document in `/decisions/{decisionId}` carries an immutable `ownerId` that must equal `request.auth.uid`. `list` queries evaluate `resource.data.ownerId == request.auth.uid` on the server side.
5. **Strict Schema & Bounds**: Every string has `.size()` checks matching `firebase-blueprint.json`; every list is bounded (`options <= 4`, `prosCons <= 4`, `comparisonCriteria <= 15`, `swot <= 4`, `challenges <= 20`) and type-checked at index 0; no shadow/ghost keys permitted (`hasAll` + `hasOnly` on create, `affectedKeys().hasOnly(...)` on update).
6. **Temporal Integrity**: `createdAt == request.time` on create (and immutable on update); `updatedAt == request.time` on create and update.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated read** of `/decisions/dec-1` (`auth: null`).
2. **Unverified email write** to `/decisions/dec-1` (`email_verified: false`).
3. **Cross-user PII read** of `/users/victimUid/private/profile` as `attackerUid`.
4. **Identity spoofing on create**: creating `/decisions/dec-2` with `ownerId: "victimUid"` while signed in as `attackerUid`.
5. **Owner hijack on update**: updating `ownerId` on an existing decision.
6. **Shadow/ghost field injection**: creating or updating a decision with an extra `isAdmin: true` or `role: "superadmin"` field.
7. **Resource poisoning via ID**: creating `/decisions/` with a 200-char or invalid-character ID (`../../etc`).
8. **Oversized string payload**: writing `title` with 500 characters (`> 200`) or `context` with 5000 characters (`> 2000`).
9. **Unbounded array abuse**: writing `options` with 5+ items or `comparisonCriteria` with 16+ items.
10. **Invalid element type in array**: writing `options: ["not-a-map"]` (fails `data.options[0] is map`).
11. **Backdated/forged timestamp**: setting `createdAt` or `updatedAt` to a client timestamp instead of `request.time`, or mutating `createdAt` on update.
12. **Unfiltered list scrape**: listing `/decisions` without `where("ownerId", "==", uid)` (rejected by `resource.data.ownerId == request.auth.uid`).
