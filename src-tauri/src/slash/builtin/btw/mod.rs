pub mod handler;

use super::{BuiltinCommandHandler, BuiltinCommandPackage};

pub fn package() -> BuiltinCommandPackage {
    BuiltinCommandPackage {
        id: "btw",
        handler: handler::execute as BuiltinCommandHandler,
    }
}
