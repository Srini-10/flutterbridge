/// Base URL of the fixture's data source.
///
/// A plain top-level `const` on purpose: it is the simplest thing the extractor can fold into a
/// constant (normalization pass N6), and it keeps the one network call in the app trivially
/// interceptable by the verification harness later.
const String apiBaseUrl = 'https://jsonplaceholder.typicode.com';
