use axum::{routing::{get, post}, Router};
use axum::http::{HeaderValue, Method};
use axum::http::header::{AUTHORIZATION, CONTENT_TYPE};
use sqlx::postgres::PgPoolOptions;
use std::net::SocketAddr;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod auth;
mod models;
mod routes;
mod services;
mod state;

use state::AppState;

#[tokio::main]
async fn main() {
    // Load .env file
    dotenvy::dotenv().ok();

    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Connect to Postgres
    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .expect("Failed to connect to database");

    tracing::info!("Connected to database");

    // Migrations are embedded at compile time; add new .sql in backend/arrt/migrations/
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Failed to run database migrations");

    tracing::info!("Migrations applied");

    let opensanctions_api_key = std::env::var("OPENSANCTIONS_API_KEY")
        .unwrap_or_default();

    let state = AppState {
        db: pool,
        http: reqwest::Client::new(),
        opensanctions_api_key,
    };
    let frontend_origins: Vec<HeaderValue> = std::env::var("FRONTEND_ORIGIN")
        .unwrap_or_else(|_| "http://localhost:3000,http://127.0.0.1:3000".to_string())
        .split(',')
        .map(|s| s.trim().parse::<HeaderValue>().expect("Invalid FRONTEND_ORIGIN"))
        .collect();
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(frontend_origins))
        .allow_methods([Method::GET, Method::POST, Method::DELETE, Method::OPTIONS])
        .allow_headers([AUTHORIZATION, CONTENT_TYPE])
        .allow_credentials(true);

    let app = Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .route("/auth/register", post(auth::handlers::register))
        .route("/auth/login", post(auth::handlers::login))
        .route("/auth/refresh", post(auth::handlers::refresh))
        .route("/auth/logout", post(auth::handlers::logout))
        .route("/api/transactions", get(routes::transactions::list))
        .route("/api/fraud/scan", get(routes::fraud::get_cached_scan).post(routes::fraud::scan))
        .route("/api/fraud/report/summary", get(routes::fraud_report::summary))
        .route("/api/fraud/report", post(routes::fraud_report::report))
        .route("/api/fraud/benford", get(routes::advanced::benford))
        .route("/api/fraud/duplicates", get(routes::advanced::duplicates))
        .route("/api/fraud/document", post(routes::document::analyze))
        .route("/api/fraud/georisk", post(routes::georisk::analyze))
        .route("/api/fraud/pipeline", post(routes::pipeline::ingest))
        .route("/api/fraud/seed-demo", post(routes::pipeline::seed_demo))
        .route("/api/fraud/agent-scan", post(routes::agent_scan::scan))
        .route("/api/risk/business", post(routes::risk::business_risk))
        .route("/api/chat", post(routes::chat::respond))
        .route("/api/entity/investigate", post(routes::entity::investigate))
        .route("/api/sanctions/scan", post(routes::sanctions::scan))
        .route("/api/csv-saves", post(routes::csv_saves::create).get(routes::csv_saves::list))
        .route("/api/csv-saves/{id}", axum::routing::delete(routes::csv_saves::delete))
        .route("/api/entity-saves", post(routes::entity_saves::create).get(routes::entity_saves::list))
        .route("/api/entity-saves/{id}", axum::routing::delete(routes::entity_saves::delete))
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
