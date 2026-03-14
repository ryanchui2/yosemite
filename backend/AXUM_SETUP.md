# Rust Backend Setup with Axum

## Prerequisites

- [Rust](https://rustup.rs/) (stable toolchain)
- `cargo` (included with Rust)

Verify installation:

```bash
rustc --version
cargo --version
```

---

## 1. Create a New Project

```bash
cargo new my-backend
cd my-backend
```

---

## 2. Add Dependencies

Edit `Cargo.toml`:

```toml
[package]
name = "my-backend"
version = "0.1.0"
edition = "2021"

[dependencies]
axum = "0.8"
tokio = { version = "1", features = ["full"] }
tower = "0.5"
tower-http = { version = "0.6", features = ["cors", "trace"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
```

---

## 3. Basic Server (`src/main.rs`)

```rust
use axum::{routing::get, Router};
use std::net::SocketAddr;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let app = Router::new().route("/", get(root));

    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    tracing::info!("Listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn root() -> &'static str {
    "Hello, World!"
}
```

---

## 4. Run the Server

```bash
cargo run
```

Visit `http://localhost:3000` — you should see `Hello, World!`.

---

## 5. Common Patterns

### JSON Response

```rust
use axum::Json;
use serde::Serialize;

#[derive(Serialize)]
struct User {
    id: u64,
    name: String,
}

async fn get_user() -> Json<User> {
    Json(User {
        id: 1,
        name: "Alice".to_string(),
    })
}
```

### Path and Query Parameters

```rust
use axum::{extract::{Path, Query}, routing::get, Router};
use serde::Deserialize;

#[derive(Deserialize)]
struct Pagination {
    page: Option<u32>,
    limit: Option<u32>,
}

async fn get_item(Path(id): Path<u64>, Query(params): Query<Pagination>) -> String {
    format!("Item {id}, page {:?}", params.page)
}

// Route: /items/:id
```

### JSON Request Body

```rust
use axum::{http::StatusCode, Json};
use serde::Deserialize;

#[derive(Deserialize)]
struct CreateUser {
    name: String,
    email: String,
}

async fn create_user(Json(payload): Json<CreateUser>) -> StatusCode {
    // process payload...
    StatusCode::CREATED
}
```

### Shared State

```rust
use axum::{extract::State, routing::get, Router};
use std::sync::Arc;

#[derive(Clone)]
struct AppState {
    db_url: String,
}

async fn handler(State(state): State<Arc<AppState>>) -> String {
    state.db_url.clone()
}

// In main():
let state = Arc::new(AppState { db_url: "postgres://...".into() });
let app = Router::new()
    .route("/", get(handler))
    .with_state(state);
```

### Router Organization

```rust
// src/routes/users.rs
pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", get(list_users).post(create_user))
        .route("/:id", get(get_user).put(update_user).delete(delete_user))
}

// src/main.rs
let app = Router::new()
    .nest("/users", users::router())
    .nest("/posts", posts::router());
```

### CORS Middleware

```rust
use tower_http::cors::{Any, CorsLayer};

let cors = CorsLayer::new()
    .allow_origin(Any)
    .allow_methods(Any)
    .allow_headers(Any);

let app = Router::new()
    .route("/", get(root))
    .layer(cors);
```

---

## 6. Recommended Project Structure

```text
my-backend/
├── Cargo.toml
└── src/
    ├── main.rs          # Server setup and startup
    ├── routes/
    │   ├── mod.rs       # Route aggregation
    │   ├── users.rs
    │   └── health.rs
    ├── handlers/        # Handler logic (optional split from routes)
    ├── models/          # Structs for DB/domain types
    ├── errors.rs        # Custom error types
    └── state.rs         # AppState definition
```

---

## 7. Error Handling

Implement `IntoResponse` for custom errors:

```rust
use axum::{http::StatusCode, response::{IntoResponse, Response}, Json};
use serde_json::json;

pub enum AppError {
    NotFound,
    Internal(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            AppError::NotFound => (StatusCode::NOT_FOUND, "Not found".to_string()),
            AppError::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg),
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}

// Handlers can now return Result<Json<T>, AppError>
async fn get_user(Path(id): Path<u64>) -> Result<Json<User>, AppError> {
    find_user(id).ok_or(AppError::NotFound).map(Json)
}
```

---

## 8. Environment Configuration

Use a `.env` file with the `dotenvy` crate:

```toml
# Cargo.toml
dotenvy = "0.15"
```

```rust
// main.rs
dotenvy::dotenv().ok();
let port: u16 = std::env::var("PORT")
    .unwrap_or_else(|_| "3000".into())
    .parse()
    .expect("PORT must be a number");
```

```env
# .env
PORT=3000
DATABASE_URL=postgres://user:pass@localhost/mydb
RUST_LOG=debug
```

---

## 9. Supabase Integration

Supabase exposes a standard PostgreSQL connection. The recommended approach in Rust is to connect via `sqlx` directly to Supabase's Postgres instance.

### Add Dependencies

```toml
# Cargo.toml
sqlx = { version = "0.8", features = ["runtime-tokio-rustls", "postgres", "uuid", "chrono", "macros"] }
uuid = { version = "1", features = ["v4", "serde"] }
```

### Connection Setup

Find your connection string in Supabase: **Project Settings → Database → Connection string (URI mode)**.

```env
# .env
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres
```

### Create a Connection Pool in `src/state.rs`

```rust
use sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
}
```

### Initialize the Pool in `main.rs`

```rust
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await
        .expect("Failed to connect to Supabase");

    let state = Arc::new(AppState { db: pool });

    let app = Router::new()
        .route("/users", get(list_users).post(create_user))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    tracing::info!("Listening on :3000");
    axum::serve(listener, app).await.unwrap();
}
```

### Query Example

```rust
use axum::{extract::State, Json};
use serde::Serialize;
use sqlx::FromRow;
use std::sync::Arc;

#[derive(Serialize, FromRow)]
pub struct User {
    pub id: uuid::Uuid,
    pub email: String,
}

pub async fn list_users(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<User>>, AppError> {
    let users = sqlx::query_as::<_, User>("SELECT id, email FROM auth.users LIMIT 100")
        .fetch_all(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(users))
}
```

### Insert Example

```rust
use axum::{http::StatusCode, Json};
use serde::Deserialize;

#[derive(Deserialize)]
pub struct CreateItem {
    pub name: String,
}

pub async fn create_item(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateItem>,
) -> Result<StatusCode, AppError> {
    sqlx::query("INSERT INTO items (name) VALUES ($1)")
        .bind(&payload.name)
        .execute(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(StatusCode::CREATED)
}
```

### Supabase JWT Auth (Optional)

To protect routes using Supabase-issued JWTs, validate the token with the `jsonwebtoken` crate using your project's JWT secret (found in **Project Settings → API → JWT Secret**).

```toml
jsonwebtoken = "9"
```

```rust
use axum::{extract::FromRequestParts, http::{request::Parts, StatusCode}};
use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};
use serde::Deserialize;

#[derive(Deserialize)]
struct Claims {
    sub: String,   // user UUID
    exp: usize,
    role: String,
}

pub struct AuthUser(pub Claims);

impl<S: Send + Sync> FromRequestParts<S> for AuthUser {
    type Rejection = StatusCode;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let token = parts
            .headers
            .get("Authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or(StatusCode::UNAUTHORIZED)?;

        let secret = std::env::var("SUPABASE_JWT_SECRET").expect("SUPABASE_JWT_SECRET must be set");

        let data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(secret.as_bytes()),
            &Validation::new(Algorithm::HS256),
        )
        .map_err(|_| StatusCode::UNAUTHORIZED)?;

        Ok(AuthUser(data.claims))
    }
}

// Usage in a protected handler:
async fn protected(AuthUser(claims): AuthUser) -> String {
    format!("Hello, user {}", claims.sub)
}
```

```env
# .env (add)
SUPABASE_JWT_SECRET=your-jwt-secret-from-supabase-dashboard
```

---

## Useful Resources

- [Axum docs](https://docs.rs/axum)
- [Axum examples](https://github.com/tokio-rs/axum/tree/main/examples)
- [Tokio docs](https://docs.rs/tokio)
- [Tower middleware](https://docs.rs/tower)
- [sqlx docs](https://docs.rs/sqlx)
- [Supabase connection strings](https://supabase.com/docs/guides/database/connecting-to-postgres)
