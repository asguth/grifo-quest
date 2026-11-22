//! Enums que viram texto (banco, JSON do front, prompts): a string de cada variante é escrita uma vez só.

/// Declara um enum `Copy` com `Serialize`/`Deserialize`/`specta::Type` usando exatamente as strings
/// dadas, mais `as_str`, `parse` e `ALL`.
macro_rules! wire_enum {
    ($(#[$meta:meta])* pub enum $name:ident { $($(#[$vmeta:meta])* $variant:ident = $text:literal),+ $(,)? }) => {
        $(#[$meta])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
        pub enum $name {
            $($(#[$vmeta])* #[serde(rename = $text)] $variant),+
        }

        #[allow(dead_code)]
        impl $name {
            pub const ALL: &'static [$name] = &[$($name::$variant),+];

            pub fn as_str(self) -> &'static str {
                match self {
                    $($name::$variant => $text),+
                }
            }

            pub fn parse(s: &str) -> Option<Self> {
                match s {
                    $($text => Some($name::$variant),)+
                    _ => None,
                }
            }
        }
    };
}
