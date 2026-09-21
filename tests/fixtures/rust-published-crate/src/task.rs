use std::future::Future;

pub fn run<F: Future>(_future: F) -> F::Output {
    unimplemented!("the fixture only needs the shape")
}
