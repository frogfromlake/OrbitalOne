use std::{convert::Infallible, net::SocketAddr, time::Instant};

use hyper::{
    body::{Bytes, Frame, Incoming},
    http::{Request, Response, StatusCode},
    service::service_fn,
    Method,
};
use hyper_util::{
    rt::{TokioExecutor, TokioIo},
    server::conn::auto::Builder as ServerBuilder,
};
use http_body_util::{BodyExt, Full, StreamBody};
use http_body_util::combinators::BoxBody;
use once_cell::sync::Lazy;
use reqwest::Client;
use tokio::net::TcpListener;
use tracing::{info, error};
use moka::future::Cache;
use tokio_stream::once;
use tokio::fs;
use std::path::Path;
use std::env;

/// Returns the tile storage base path from the `TILE_STORAGE_PATH` env var.
/// - If set and non-empty, returns the trimmed path.
/// - If set but empty/whitespace, returns `None`.
/// - If unset, returns the default path `/data/tiles`.
fn get_tile_base_path() -> Option<String> {
    match env::var("TILE_STORAGE_PATH").ok().map(|s| s.trim().to_string()) {
        Some(s) if !s.is_empty() => Some(s),
        Some(_) => None,
        None => Some("/data/tiles".to_string()),
    }
}

const MAX_TILE_CACHE_CAPACITY: u64 = 50_000;

static TILE_CACHE: Lazy<Cache<String, Bytes>> = Lazy::new(|| {
    Cache::builder()
        .max_capacity(MAX_TILE_CACHE_CAPACITY)
        .time_to_live(std::time::Duration::from_secs(3600))
        .build()
});

static REQWEST_CLIENT: Lazy<Client> = Lazy::new(|| {
    Client::builder()
        .user_agent("tile-proxy-rust/1.0")
        .timeout(std::time::Duration::from_secs(10))
        .pool_max_idle_per_host(100)
        .build()
        .expect("Failed to build reqwest client")
});

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let tile_base = get_tile_base_path();
    let use_disk_cache = tile_base
        .as_ref()
        .map(|p| !p.trim().is_empty() && Path::new(p).exists())
        .unwrap_or(false);

    // Only attempt to create volume directory in production
    if use_disk_cache {
        let tile_dir = Path::new(tile_base.as_ref().unwrap());
        if !tile_dir.exists() {
            fs::create_dir_all(tile_dir).await?;
        }
    }

    let addr: SocketAddr = "0.0.0.0:8080".parse()?;
    let listener = TcpListener::bind(addr).await?;

    info!("🚀 Tile Proxy Server is Ready");
    info!("🌍 Listening on       http://{}", addr);
    info!("🧩 Tile route format: /tile/{{z}}/{{x}}/{{y}}");
    info!("📦 Cache capacity:   {} tiles", MAX_TILE_CACHE_CAPACITY);
    info!("⏱  Cache TTL:        1 hour");

    loop {
        let (stream, _) = listener.accept().await?;
        tokio::spawn(handle_connection(stream));
    }
}


async fn handle_connection(stream: tokio::net::TcpStream) {
    if let Err(err) = ServerBuilder::new(TokioExecutor::new())
        .serve_connection(TokioIo::new(stream), service_fn(proxy_handler))
        .await
    {
        eprintln!("Connection error: {}", err);
    }
}

async fn proxy_handler(
    req: Request<Incoming>,
) -> Result<Response<BoxBody<Bytes, std::io::Error>>, Infallible> {
    let start = Instant::now();
    let result = actual_proxy_logic(req, start).await;
    result
}

async fn actual_proxy_logic(
    req: Request<Incoming>,
    start: Instant,
) -> Result<Response<BoxBody<Bytes, std::io::Error>>, Infallible> {
    use std::path::Path;

    let path = req.uri().path();
    let use_disk_cache = get_tile_base_path()
        .as_ref()
        .map(|p| !p.trim().is_empty() && Path::new(p).exists())
        .unwrap_or(false);

    if req.method() != Method::GET || !path.starts_with("/tile/") {
        return Ok(
            with_cors_headers(Response::builder(), req.headers().get("origin").and_then(|v| v.to_str().ok()))
                .status(StatusCode::BAD_REQUEST)
                .body(full_body("Only GET /tile/* supported"))
                .unwrap(),
        );
    }

    let stripped_path = path.trim_start_matches("/tile/");
    let parts: Vec<&str> = stripped_path.split('/').collect();

    // Support both /tile/{z}/{x}/{y} and /tile/{mode}/{z}/{x}/{y}.ktx2
    let (mode, z_str, x_str, y_str, ext): (Option<&str>, &str, &str, &str, Option<&str>) = match parts.as_slice() {
        // /tile/day/5/10/12.ktx2 or /tile/night/5/10/12.ktx2
        [mode @ ("day" | "night"), z, x, y_with_ext] => {
            let (y, ext) = match y_with_ext.rsplit_once('.') {
                Some((y, ext)) => (y, Some(ext)),
                None => (y_with_ext, None),
            };
            (Some(*mode), *z, *x, y, ext)
        }
        // /tile/5/10/12.ktx2 or /tile/5/10/12 (jpeg)
        [z, x, y_with_ext] => {
            let (y, ext) = match y_with_ext.rsplit_once('.') {
                Some((y, ext)) => (y, Some(ext)),
                None => (y_with_ext, None),
            };
            (None, *z, *x, y, ext)
        }
        _ => {
            return Ok(
                with_cors_headers(Response::builder(), req.headers().get("origin").and_then(|v| v.to_str().ok()))
                    .status(StatusCode::BAD_REQUEST)
                    .body(full_body("Invalid tile path. Supported: /tile/{z}/{x}/{y} or /tile/{mode}/{z}/{x}/{y}.ktx2"))
                    .unwrap(),
            );
        }
    };

    // Parse z, x, y
    let z: u32 = match z_str.parse() {
        Ok(val) => val,
        Err(_) => {
            return Ok(
                with_cors_headers(Response::builder(), req.headers().get("origin").and_then(|v| v.to_str().ok()))
                    .status(StatusCode::BAD_REQUEST)
                    .body(full_body("Invalid Z coordinate"))
                    .unwrap(),
            );
        }
    };
    let x: u32 = match x_str.parse() {
        Ok(val) => val,
        Err(_) => {
            return Ok(
                with_cors_headers(Response::builder(), req.headers().get("origin").and_then(|v| v.to_str().ok()))
                    .status(StatusCode::BAD_REQUEST)
                    .body(full_body("Invalid X coordinate"))
                    .unwrap(),
            );
        }
    };
    let y: u32 = match y_str.parse() {
        Ok(val) => val,
        Err(_) => {
            return Ok(
                with_cors_headers(Response::builder(), req.headers().get("origin").and_then(|v| v.to_str().ok()))
                    .status(StatusCode::BAD_REQUEST)
                    .body(full_body("Invalid Y coordinate"))
                    .unwrap(),
            );
        }
    };

    let cache_key = format!(
        "{}{}/{}/{}{}",
        mode.map(|m| format!("{}/", m)).unwrap_or_default(),
        z, x, y,
        ext.map(|e| format!(".{}", e)).unwrap_or_default()
    );

    // ==== (A) Serve NASA Bunny CDN Day/Night KTX2 tiles (z5-z7) from volume ====
    if let Some(mode @ ("day" | "night")) = mode {
        if ext == Some("ktx2") && (5..=7).contains(&z) {
            if let Some(base_path) = get_tile_base_path() {
                let tile_path = format!("{}/{}/{}/{}/{}.ktx2", base_path, mode, z, x, y);
                if Path::new(&tile_path).exists() {
                    let file_bytes = fs::read(&tile_path).await.unwrap();
                    let elapsed = start.elapsed().as_millis();
                    info!(%cache_key, elapsed_ms = elapsed, "📦 Served KTX2 from volume");
                    return Ok(
                        with_cors_headers(Response::builder(), req.headers().get("origin").and_then(|v| v.to_str().ok()))
                            .status(StatusCode::OK)
                            .header("content-type", "image/ktx2")
                            .body(StreamBody::new(once(Ok(Frame::data(Bytes::from(file_bytes))))).boxed())
                            .unwrap(),
                    );
                } else {
                    let elapsed = start.elapsed().as_millis();
                    info!(%cache_key, elapsed_ms = elapsed, "❌ KTX2 not found on disk");
                    return Ok(
                        with_cors_headers(Response::builder(), req.headers().get("origin").and_then(|v| v.to_str().ok()))
                            .status(StatusCode::NOT_FOUND)
                            .body(full_body("KTX2 day/night tile not found"))
                            .unwrap(),
                    );
                }
            }
        }
    }

    // ==== (B) Serve Sentinel-2 JPEG (z0-z8) from disk ====
    if mode.is_none() && (ext.is_none() || ext == Some("jpg")) {
        if let Some(base_path) = get_tile_base_path() {
            if (0..=8).contains(&z) && Path::new(&base_path).exists() {
                let tile_path = format!("{}/{}/{}/{}.jpg", base_path, z, x, y);
                match fs::read(&tile_path).await {
                    Ok(file_bytes) => {
                        let elapsed = start.elapsed().as_millis();
                        info!(%cache_key, elapsed_ms = elapsed, "📦 Served from volume");
                        return Ok(
                            with_cors_headers(Response::builder(), req.headers().get("origin").and_then(|v| v.to_str().ok()))
                                .status(StatusCode::OK)
                                .header("content-type", "image/jpeg")
                                .body(StreamBody::new(once(Ok(Frame::data(Bytes::from(file_bytes))))).boxed())
                                .unwrap(),
                        );
                    }
                    Err(_) => {
                        let elapsed = start.elapsed().as_millis();
                        info!(%cache_key, elapsed_ms = elapsed, "❌ Tile missing on disk (Z 0–8)");
                        TILE_CACHE.insert(cache_key.clone(), Bytes::from_static(b"")).await;
                        return Ok(
                            with_cors_headers(Response::builder(), req.headers().get("origin").and_then(|v| v.to_str().ok()))
                                .status(StatusCode::NOT_FOUND)
                                .body(full_body("Tile not found on volume"))
                                .unwrap(),
                        );
                    }
                }
            }
        }
    }

    // ==== (C) In-memory cache for any tile (e.g. Z9+ Sentinel-2) ====
    if let Some(cached_bytes) = TILE_CACHE.get(&cache_key).await {
        let elapsed = start.elapsed().as_millis();
        info!(%cache_key, elapsed_ms = elapsed, "✅ Served from memory cache");
        let content_type = if ext == Some("ktx2") {
            "image/ktx2"
        } else {
            "image/jpeg"
        };
        return Ok(
            with_cors_headers(Response::builder(), req.headers().get("origin").and_then(|v| v.to_str().ok()))
                .status(StatusCode::OK)
                .header("content-type", content_type)
                .body(StreamBody::new(once(Ok(Frame::data(cached_bytes)))).boxed())
                .unwrap(),
        );
    }

    // ==== (D) Fetch Sentinel-2 JPEG (z9+) from upstream ====
    if mode.is_none() && (ext.is_none() || ext == Some("jpg")) {
        let upstream_path = format!("{}/{}/{}", z, y, x); // flip x <-> y
        let upstream_url = format!(
            "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/GoogleMapsCompatible/{}.jpg",
            upstream_path
        );

        match REQWEST_CLIENT.get(&upstream_url).send().await {
            Ok(resp) if resp.status().is_success() => {
                let status = resp.status();
                let content_type = resp
                    .headers()
                    .get("content-type")
                    .cloned()
                    .unwrap_or_else(|| "image/jpeg".parse().unwrap());

                let collected = match resp.bytes().await {
                    Ok(b) => b,
                    Err(e) => {
                        error!("Failed to read bytes: {}", e);
                        return Ok(
                            with_cors_headers(Response::builder(), req.headers().get("origin").and_then(|v| v.to_str().ok()))
                                .status(StatusCode::BAD_GATEWAY)
                                .body(full_body("Failed to read tile response"))
                                .unwrap(),
                        );
                    }
                };

                // Cache if appropriate
                if !use_disk_cache || z > 8 {
                    TILE_CACHE.insert(cache_key.clone(), collected.clone()).await;
                }

                let elapsed = start.elapsed().as_millis();
                info!(%cache_key, elapsed_ms = elapsed, "🌐 Fetched from upstream");
                let body = StreamBody::new(once(Ok(Frame::data(collected)))).boxed();

                return Ok(
                    with_cors_headers(Response::builder(), req.headers().get("origin").and_then(|v| v.to_str().ok()))
                        .status(status)
                        .header("content-type", content_type)
                        .body(body)
                        .unwrap(),
                );
            }
            Ok(resp) => {
                let status = resp.status();
                return Ok(
                    with_cors_headers(Response::builder(), req.headers().get("origin").and_then(|v| v.to_str().ok()))
                        .status(status)
                        .body(full_body(format!("Upstream error: {}", status)))
                        .unwrap(),
                );
            }
            Err(err) => {
                error!("Error fetching tile from upstream: {}", err);
                return Ok(
                    with_cors_headers(Response::builder(), req.headers().get("origin").and_then(|v| v.to_str().ok()))
                        .status(StatusCode::BAD_GATEWAY)
                        .body(full_body("Failed to fetch tile"))
                        .unwrap(),
                );
            }
        }
    }

    // ==== (E) 404 Fallback ====
    let elapsed = start.elapsed().as_millis();
    info!(%cache_key, elapsed_ms = elapsed, "❌ Tile not found (final fallback)");
    Ok(
        with_cors_headers(Response::builder(), req.headers().get("origin").and_then(|v| v.to_str().ok()))
            .status(StatusCode::NOT_FOUND)
            .body(full_body("Tile not found"))
            .unwrap(),
    )
}

fn full_body<T: Into<Bytes>>(bytes: T) -> BoxBody<Bytes, std::io::Error> {
    BoxBody::new(Full::new(bytes.into()).map_err(|_: Infallible| {
        std::io::Error::new(std::io::ErrorKind::Other, "infallible error")
    }))
}

fn with_cors_headers(
    builder: hyper::http::response::Builder,
    origin: Option<&str>,
) -> hyper::http::response::Builder {
    const ALLOWED_ORIGINS: &[&str] = &[
        "https://orbitalone.space",
        "https://orbitalone-frontend.vercel.app",
        "http://localhost:5173",
        "http://localhost:5174",
    ];

    if let Some(origin_value) = origin {
        if ALLOWED_ORIGINS.contains(&origin_value) {
            return builder.header("access-control-allow-origin", origin_value);
        }
    }

    builder
}
