# Auth Implementation Plan

## Stack
- **Backend:** Rust (Axum 0.8) + PostgreSQL (sqlx)
- **Frontend:** Next.js 14 (TypeScript)
- **Strategy:** JWT access tokens (15min) + refresh tokens (httpOnly cookie, stored in DB)
- **Password hashing:** argon2
- **Roles:** `analyst` (default) | `admin`

---

## Progress

- [x] Phase 1 — Database
- [x] Phase 2 — Backend: Dependencies
- [x] Phase 3 — Backend: Auth Module
- [x] Phase 4 — Backend: Auth Handlers
- [x] Phase 5 — Backend: Protect Routes + Fix CORS
- [x] Phase 6 — Frontend: Auth Utilities
- [x] Phase 7 — Frontend: Auth Context + Login Page
- [x] Phase 8 — Frontend: API Wrapper + Route Protection

---

## Phase 1 — Database

### 1.1 Create users and refresh_tokens tables
File: `backend/arrt/migrations/0010_create_users.sql`

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'analyst',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 1.2 Add user_id to existing tables
File: `backend/arrt/migrations/0011_add_user_id_to_tables.sql`

```sql
ALTER TABLE fraud_reports ADD COLUMN user_id UUID REFERENCES users(id);
ALTER TABLE saved_csv_data ADD COLUMN user_id UUID REFERENCES users(id);
ALTER TABLE saved_entity_data ADD COLUMN user_id UUID REFERENCES users(id);
```

---

## Phase 2 — Backend: Dependencies

### 2.1 Add to `backend/arrt/Cargo.toml`
```toml
jsonwebtoken = "9"
argon2 = "0.5"
rand = "0.8"
```

### 2.2 Add JWT secret to `.env`
```
JWT_SECRET=<random-256-bit-hex-string>
REFRESH_TOKEN_EXPIRY_DAYS=30
```

---

## Phase 3 — Backend: Auth Module

### 3.1 Create `src/auth/mod.rs`
- `Claims` struct (`sub`, `email`, `role`, `exp`)
- `create_access_token(user)` — encodes JWT, 15min expiry
- `decode_access_token(token)` — decodes and validates JWT

### 3.2 Create `src/auth/middleware.rs`
- `AuthUser(Claims)` — Axum extractor, reads `Authorization: Bearer <token>`, returns 401 if missing/invalid
- `RequireAdmin(Claims)` — same as `AuthUser` but also checks `role == "admin"`, returns 403 if not

### 3.3 Create `src/auth/models.rs`
- `User` struct (matches DB schema)
- `NewUser` struct (for insert)
- `RefreshToken` struct (matches DB schema)

### 3.4 Wire up module in `src/main.rs`
```rust
mod auth;
```

---

## Phase 4 — Backend: Auth Handlers

### 4.1 Create `src/auth/handlers.rs`

#### `POST /auth/register`
- Request: `{ email, password }`
- Hash password with argon2
- Insert into `users`
- Return `{ user_id, email, role }`
- Error on duplicate email: 409

#### `POST /auth/login`
- Request: `{ email, password }`
- Fetch user by email
- Verify password with argon2
- Issue access token (JWT, 15min)
- Generate refresh token (random UUID), hash it, store in `refresh_tokens`
- Set refresh token as `httpOnly; Secure; SameSite=Strict` cookie
- Return `{ access_token, user: { id, email, role } }`

#### `POST /auth/refresh`
- Read refresh token from cookie
- Hash it, look up in `refresh_tokens`, check `expires_at`
- If valid: issue new access token, rotate refresh token (delete old, insert new)
- Return `{ access_token }`
- Error if missing/expired/not found: 401

#### `POST /auth/logout`
- Read refresh token from cookie
- Delete from `refresh_tokens`
- Clear cookie
- Return 204

### 4.2 Add auth routes to router in `src/routes.rs`
```rust
Router::new()
    .route("/auth/register", post(auth::handlers::register))
    .route("/auth/login",    post(auth::handlers::login))
    .route("/auth/refresh",  post(auth::handlers::refresh))
    .route("/auth/logout",   post(auth::handlers::logout))
```

---

## Phase 5 — Backend: Protect Routes + Fix CORS

### 5.1 Add `AuthUser` extractor to all protected handlers in `src/routes/`
- `fraud.rs` — all handlers
- `transactions.rs` — all handlers
- `csv_saves.rs` — all handlers
- `entity_saves.rs` — all handlers
- `chat.rs` — all handlers
- `sanctions.rs` — all handlers
- `risk.rs` — all handlers

Pattern — add as first param:
```rust
async fn handler(AuthUser(claims): AuthUser, State(pool): State<PgPool>, ...) { ... }
```

### 5.2 Scope DB queries by `user_id` where applicable
- `saved_csv_data` — filter by `claims.sub` on GET, insert with `user_id` on POST
- `saved_entity_data` — same
- `fraud_reports` — insert with `user_id`; admin can see all, analyst sees own

### 5.3 Update CORS in `src/main.rs`
```rust
CorsLayer::new()
    .allow_origin("http://localhost:3000".parse::<HeaderValue>().unwrap())
    .allow_methods([Method::GET, Method::POST, Method::DELETE, Method::OPTIONS])
    .allow_headers([AUTHORIZATION, CONTENT_TYPE])
    .allow_credentials(true)
```

---

## Phase 6 — Frontend: Auth Utilities

### 6.1 Create `frontend/lib/auth.ts`
- `accessToken` — module-level variable (in-memory, not localStorage)
- `setAccessToken(token)` / `getAccessToken()`
- `refreshAccessToken()` — POST `/auth/refresh` with `credentials: 'include'`, stores new token
- `logout()` — POST `/auth/logout`, clears token

### 6.2 Update `frontend/lib/api.ts`
- Replace all raw `fetch` calls with an `apiFetch` wrapper that:
  - Injects `Authorization: Bearer <token>` header
  - On 401: calls `refreshAccessToken()`, retries once
  - On second 401: redirects to `/login`

---

## Phase 7 — Frontend: Auth Context + Login Page

### 7.1 Create `frontend/contexts/AuthContext.tsx`
- `user` state (`{ id, email, role } | null`)
- `login(email, password)` — POST `/auth/login`, store access token, set user
- `logout()` — call auth util logout, clear user
- `isLoading` — true while checking auth on mount (attempt refresh to restore session)
- Export `useAuth()` hook

### 7.2 Wrap app in `frontend/app/layout.tsx`
```tsx
<AuthProvider>
  {children}
</AuthProvider>
```

### 7.3 Create `frontend/app/login/page.tsx`
- Email + password form
- Calls `login()` from `useAuth()`
- Redirects to `/` on success
- Shows error on failure

---

## Phase 8 — Frontend: Route Protection

### 8.1 Create `frontend/middleware.ts`
```typescript
export function middleware(request: NextRequest) {
  const isAuthRoute = request.nextUrl.pathname.startsWith('/login');
  const hasRefreshCookie = request.cookies.has('refresh_token');

  if (!isAuthRoute && !hasRefreshCookie) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/((?!api|_next|favicon|public).*)'],
};
```

### 8.2 Update `frontend/app/page.tsx` (or root layout)
- On mount, if `getAccessToken()` is null, call `refreshAccessToken()`
- If refresh fails, redirect to `/login`
- Show loading state while checking

---

## Notes

- `fraud_scan_cache` remains global (not per-user) — it caches the last scan result for the entire dataset
- `transactions` table has no `user_id` — transactions are shared/imported data, not user-owned
- The `reported_by` TEXT field in `fraud_reports` can be populated with `claims.email` after auth is added
- Admin-only routes (user management, viewing all reports) can be added as a follow-up after core auth is working
