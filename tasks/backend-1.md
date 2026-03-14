# Backend Person 1 — Render Postgres + Data Layer

## Your job

Wire up the database and get transaction data flowing through the API.

---

## Step 1 — Add dependencies to `backend/arrt/Cargo.toml`

```toml
sqlx = { version = "0.8", features = ["runtime-tokio-rustls", "postgres", "uuid", "chrono", "macros"] }
dotenvy = "0.15"
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
```

---

## Step 2 — Create `.env` in `backend/arrt/`

```env
DATABASE_URL=postgresql://arrt_db_s3oh_user:H7wq2LCJbuvz5KMIgVDeYm6ortOzKlZT@dpg-d6qfmtsr85hc73esi4tg-a.oregon-postgres.render.com/arrt_db_s3oh
GEMINI_API_KEY=your-key-from-aistudio.google.com
RUST_LOG=info
PORT=3001
```

---

## Step 3 — Create `src/models/transaction.rs`

Map the CSV columns to a Rust struct:

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Transaction {
    pub transaction_id: String,
    pub order_id: Option<String>,
    pub customer_id: Option<String>,
    pub customer_name: Option<String>,
    pub timestamp: Option<String>,
    pub amount: Option<f64>,
    pub currency: Option<String>,
    pub payment_method: Option<String>,
    pub card_last4: Option<String>,
    pub card_brand: Option<String>,
    pub transaction_status: Option<String>,
    pub merchant_id: Option<String>,
    pub store_id: Option<String>,
    pub refund_status: Option<String>,
    pub ip_address: Option<String>,
    pub ip_country: Option<String>,
    pub ip_is_vpn: Option<bool>,
    pub device_type: Option<String>,
    pub address_match: Option<bool>,
    pub cvv_match: Option<bool>,
    pub avs_result: Option<String>,
    pub card_present: Option<bool>,
    pub entry_mode: Option<String>,
    pub amount_subtotal: Option<f64>,
    pub tax: Option<f64>,
    pub discount_applied: Option<f64>,
}
```

> Only map columns you actually need. Add more as required.

---

## Step 4 — Create `src/state.rs`

```rust
use sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
}
```

> `AppState` is passed to Axum directly (no `Arc` wrapper needed — Axum clones it via the `Clone` bound).

---

## Step 5 — Update `src/main.rs` to connect to Render Postgres

```rust
use axum::{routing::{get, post}, Router};
use sqlx::postgres::PgPoolOptions;
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod models;
mod routes;
mod services;
mod state;

use state::AppState;

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
        .max_connections(5)
        .connect(&database_url)
        .await
        .expect("Failed to connect to database");

    tracing::info!("Connected to database");

    let state = AppState { db: pool };
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .route("/api/transactions", get(routes::transactions::list))
        .route("/api/fraud/scan", post(routes::fraud::scan))
        .with_state(state)
        .layer(cors);

    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "3001".to_string())
        .parse()
        .expect("PORT must be a number");

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("Listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn root() -> &'static str {
    "Hello, World!"
}

async fn health() -> &'static str {
    "ok"
}
```

---

## Step 6 — Create `src/routes/transactions.rs`

```rust
use axum::{extract::State, Json};

use crate::{models::transaction::Transaction, state::AppState};

pub async fn list(State(state): State<AppState>) -> Json<Vec<Transaction>> {
    let rows = sqlx::query_as::<_, Transaction>("SELECT * FROM transactions LIMIT 100")
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();

    Json(rows)
}
```

---

## Done when

`curl http://localhost:3001/api/transactions` returns JSON rows from Render Postgres.

Hand off `AppState` and the `transactions` table to Backend Person 2.
