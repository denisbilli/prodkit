//! An asynchronous runtime, published to crates.io.

pub mod task;

pub fn block_on<F: std::future::Future>(future: F) -> F::Output {
    task::run(future)
}
